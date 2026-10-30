import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertE2eTarget } from '../tests/e2e-target.mjs';
import { stagingAdminHeaders } from './staging-admin-key.mjs';

// Replaces the staging audit tenant, whose accumulated fixtures slow every audit run, with a fresh one.
//   plan     (default) read-only: shows what apply would copy
//   apply    creates the new tenant; the old tenant and the user's active tenant are left untouched
//   activate points the E2E user's active tenant at ROTATION_TARGET_TENANT_ID (also the rollback)
// apply and activate require ROTATION_CONFIRMATION=ROTATE. Nothing here deletes the old tenant.

// Flat per-tenant settings whose only reference is the tenant itself.
export const COPIED_SETTINGS = ['tenant_modules', 'tenant_limits', 'customer_level_settings',
  'inventory_accounting_settings', 'currencies', 'exchange_rates', 'expense_categories'];
// The CRM pipeline comes from the app's own seeder, run as the E2E user. Ledger accounts need no
// seeding: the sales and purchasing commands create them through ensure_inventory_accounts.
export const SEEDERS = ['seed_default_crm_pipeline'];
// tenant-isolation and the lifecycle specs read "any customer" of the tenant before creating their own data.
export const BASELINE_CUSTOMER = 'E2E Baseline Customer';
const SERVER_COLUMNS = ['id', 'created_at', 'updated_at', 'updated_by'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isAuditFixture = (table, row) => table === 'expense_categories' && /^QA\b/.test(row.name || '');

export async function rotateAuditTenant(env, { fetcher = fetch, mask = () => {}, now = new Date(), newId = randomUUID() } = {}) {
  const mode = env.ROTATION_MODE || 'plan';
  if (!['plan', 'apply', 'activate'].includes(mode)) throw new Error('ROTATION_MODE_INVALID');
  const oldTenantId = assertE2eTarget(env);
  if (mode !== 'plan' && env.ROTATION_CONFIRMATION !== 'ROTATE') throw new Error('ROTATION_CONFIRMATION_REQUIRED');
  if (!env.E2E_TEST_USER || !env.E2E_TEST_PASS || !env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('ROTATION_E2E_USER_REQUIRED');

  const url = new URL(env.VITE_SUPABASE_URL).origin;
  const request = async (target, options = {}) => {
    const response = await fetcher(target, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) {
      const path = new URL(target).pathname;
      throw new Error(`ROTATION_REQUEST_FAILED: ${options.method || 'GET'} ${path}: ${(await response.text()).slice(0, 200)} HTTP ${response.status}`);
    }
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };

  const publicHeaders = { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' };
  const session = await request(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: publicHeaders,
    body: JSON.stringify({ email: env.E2E_TEST_USER, password: env.E2E_TEST_PASS }) });
  if (!session?.access_token || !session.user?.id) throw new Error('ROTATION_E2E_LOGIN_FAILED');
  mask(session.access_token);
  const userId = session.user.id;
  const asUser = { ...publicHeaders, authorization: `Bearer ${session.access_token}` };

  const admin = await stagingAdminHeaders(env, request, mask);
  const rest = (path, { method = 'GET', data, prefer } = {}) => request(`${url}/rest/v1/${path}`, {
    method, headers: { ...admin, ...(prefer ? { prefer } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const membership = async (tenantId) => (await rest(`tenant_members?select=role&tenant_id=eq.${tenantId}&user_id=eq.${userId}`))[0];
  // Written as the E2E user so RLS and the customer audit trigger see a real member.
  const ensureBaselineCustomer = async (tenantId) => {
    const existing = await request(`${url}/rest/v1/customers?select=id&tenant_id=eq.${tenantId}&limit=1`, { headers: asUser });
    if (existing.length) return 'present';
    await request(`${url}/rest/v1/customers`, { method: 'POST', headers: { ...asUser, prefer: 'return=minimal' },
      body: JSON.stringify({ tenant_id: tenantId, name: BASELINE_CUSTOMER }) });
    return 'created';
  };

  if (mode === 'activate') {
    const target = env.ROTATION_TARGET_TENANT_ID;
    if (!UUID.test(target || '')) throw new Error('ROTATION_TARGET_REQUIRED');
    if (target === env.E2E_OTHER_TENANT_ID) throw new Error('ROTATION_TARGET_IS_ISOLATION_TENANT');
    if (!(await membership(target))) throw new Error('ROTATION_TARGET_NOT_A_MEMBERSHIP');
    const baselineCustomer = await ensureBaselineCustomer(target);
    const [profile] = await rest(`profiles?select=active_tenant_id&id=eq.${userId}`);
    await rest(`profiles?id=eq.${userId}`, { method: 'PATCH', data: { active_tenant_id: target }, prefer: 'return=minimal' });
    return { mode, userId, previousActiveTenantId: profile?.active_tenant_id ?? null, activeTenantId: target, baselineCustomer };
  }

  const [oldTenant] = await rest(`tenants?select=id,name,max_users,plan_name&id=eq.${oldTenantId}`);
  if (!oldTenant) throw new Error('ROTATION_OLD_TENANT_NOT_FOUND');
  const role = (await membership(oldTenantId))?.role;
  // The business-flow audit refuses owners; keep the restricted role the user already has.
  if (!role || ['owner', 'super_admin', 'platform_admin'].includes(role)) throw new Error('ROTATION_E2E_ROLE_UNSUPPORTED');
  const settings = {};
  for (const table of COPIED_SETTINGS) {
    settings[table] = (await rest(`${table}?select=*&tenant_id=eq.${oldTenantId}`)).filter((row) => !isAuditFixture(table, row));
  }
  const counts = Object.fromEntries(Object.entries(settings).map(([table, rows]) => [table, rows.length]));
  if (mode === 'plan') {
    return { mode, oldTenantId, oldTenantName: oldTenant.name, userId, role, settings: counts, seeders: SEEDERS };
  }

  const day = now.toISOString().slice(0, 10);
  const tenant = { id: newId, name: `E2E Audit ${day}`, slug: `e2e-audit-${day.replaceAll('-', '')}-${newId.slice(0, 6)}`,
    created_by: userId, max_users: oldTenant.max_users, plan_name: oldTenant.plan_name,
    notes: `Fresh audit tenant replacing ${oldTenantId} (scripts/rotate-audit-tenant.mjs)` };
  await rest('tenants', { method: 'POST', data: tenant, prefer: 'return=minimal' });
  try {
    await rest('tenant_members', { method: 'POST', data: { tenant_id: newId, user_id: userId, role }, prefer: 'return=minimal' });
    for (const [table, rows] of Object.entries(settings)) {
      if (!rows.length) continue;
      const copies = rows.map((row) => ({ ...Object.fromEntries(Object.entries(row).filter(([key]) => !SERVER_COLUMNS.includes(key))),
        tenant_id: newId }));
      await rest(table, { method: 'POST', data: copies, prefer: 'return=minimal' });
    }
  } catch (error) {
    // Only settings exist yet, so the tenant row's CASCADE removes everything this run created.
    await rest(`tenants?id=eq.${newId}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {});
    throw new Error(`ROTATION_APPLY_ROLLED_BACK: ${error.message}`);
  }

  const seeded = {};
  for (const seeder of SEEDERS) {
    try {
      await request(`${url}/rest/v1/rpc/${seeder}`, { method: 'POST', headers: asUser, body: JSON.stringify({ _tenant: newId }) });
      seeded[seeder] = 'ok';
    } catch (error) {
      seeded[seeder] = error.message;
    }
  }
  seeded.baselineCustomer = await ensureBaselineCustomer(newId);
  return { mode, oldTenantId, newTenantId: newId, slug: tenant.slug, userId, role, copied: counts, seeded,
    next: [`Set the staging variable E2E_TENANT_ID to ${newId}`,
      `Run this workflow with mode=activate and target ${newId}`,
      `Roll back by setting E2E_TENANT_ID to ${oldTenantId} and activating ${oldTenantId}`] };
}

export function rotationSummary(result) {
  const lines = [`## Audit tenant rotation: ${result.mode}`, '', '```json', JSON.stringify(result, null, 2), '```'];
  if (result.next) lines.push('', '### Next steps', ...result.next.map((step) => `- ${step}`));
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await rotateAuditTenant(process.env, { mask: (value) => process.stdout.write(`::add-mask::${value}\n`) });
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, rotationSummary(result));
}
