// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { BASELINE_CUSTOMER, COPIED_SETTINGS, rotateAuditTenant, rotationSummary } from '../../scripts/rotate-audit-tenant.mjs';

const oldTenant = '11111111-1111-4111-8111-111111111111';
const otherTenant = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const newTenant = '44444444-4444-4444-8444-444444444444';
const env = { E2E_SUPABASE_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd', VITE_SUPABASE_URL: 'https://cvjctwgdyzhijhzhhjqd.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', E2E_TENANT_ID: oldTenant, E2E_OTHER_TENANT_ID: otherTenant,
  SUPABASE_ACCESS_TOKEN: 'test-pat', E2E_TEST_USER: 'e2e@example.invalid', E2E_TEST_PASS: 'test-only' };

// Routes requests by method and path so each test only describes the data it cares about.
function staging({ role = 'admin', memberships = { [oldTenant]: role }, customers = {}, fail = {} } = {}) {
  const calls = [];
  const settings = {
    tenant_modules: [{ tenant_id: oldTenant, module: 'sales' }],
    customer_level_settings: [{ tenant_id: oldTenant, silver_min: 1000, gold_min: 5000, platinum_min: 15000, updated_at: 'x' }],
    expense_categories: [{ id: 'e1', tenant_id: oldTenant, name: 'Ofis', created_at: 'x' },
      { id: 'e2', tenant_id: oldTenant, name: 'QA Expense 1a2b', created_at: 'x' }],
  };
  const fetcher = vi.fn(async (target, options = {}) => {
    const url = new URL(target);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path: url.pathname, query: url.search, body, headers: options.headers });
    const respond = (value, status = 200) => new Response(value === undefined ? null : JSON.stringify(value), { status });
    if (fail[`${method} ${url.pathname}`]) return new Response('rejected', { status: fail[`${method} ${url.pathname}`] });
    if (url.pathname === '/auth/v1/token') return respond({ access_token: 'user-token', user: { id: user } });
    if (url.hostname === 'api.supabase.com') return respond([{ type: 'secret', api_key: 'test-server-key' }]);
    const table = url.pathname.replace('/rest/v1/', '');
    if (method !== 'GET') return respond(undefined, 201);
    const tenantFilter = url.searchParams.get('tenant_id')?.replace('eq.', '');
    if (table === 'tenants') return respond([{ id: oldTenant, name: 'E2E Audit', max_users: 10, plan_name: 'starter' }]);
    if (table === 'tenant_members') return respond(memberships[tenantFilter] ? [{ role: memberships[tenantFilter] }] : []);
    if (table === 'profiles') return respond([{ active_tenant_id: oldTenant }]);
    if (table === 'customers') return respond(customers[tenantFilter] || []);
    return respond(settings[table] || []);
  });
  return { fetcher, calls };
}

it('plans without writing anything and skips audit fixtures', async () => {
  const { fetcher, calls } = staging();
  const result = await rotateAuditTenant(env, { fetcher });
  expect(result).toMatchObject({ mode: 'plan', oldTenantId: oldTenant, role: 'admin',
    settings: { tenant_modules: 1, customer_level_settings: 1, expense_categories: 1 } });
  expect(Object.keys(result.settings)).toEqual(COPIED_SETTINGS);
  expect(calls.filter((call) => call.method !== 'GET' && call.path !== '/auth/v1/token')).toEqual([]);
});

it('creates a fresh tenant with the same role, copied settings and app seeders', async () => {
  const { fetcher, calls } = staging();
  const mask = vi.fn();
  const result = await rotateAuditTenant({ ...env, ROTATION_MODE: 'apply', ROTATION_CONFIRMATION: 'ROTATE' },
    { fetcher, mask, newId: newTenant, now: new Date('2026-10-30T08:00:00Z') });
  const writes = calls.filter((call) => call.method === 'POST' && call.path.startsWith('/rest/v1/'));
  expect(writes[0]).toMatchObject({ path: '/rest/v1/tenants', body: { id: newTenant, created_by: user,
    slug: 'e2e-audit-20261030-444444', max_users: 10, plan_name: 'starter' } });
  expect(writes[1]).toMatchObject({ path: '/rest/v1/tenant_members', body: { tenant_id: newTenant, user_id: user, role: 'admin' } });
  expect(writes.find((call) => call.path === '/rest/v1/expense_categories').body)
    .toEqual([{ tenant_id: newTenant, name: 'Ofis' }]);
  expect(writes.find((call) => call.path === '/rest/v1/customer_level_settings').body)
    .toEqual([{ tenant_id: newTenant, silver_min: 1000, gold_min: 5000, platinum_min: 15000 }]);
  const seeders = writes.filter((call) => call.path.startsWith('/rest/v1/rpc/'));
  expect(seeders.map((call) => call.path)).toEqual(['/rest/v1/rpc/seed_default_crm_pipeline']);
  expect(seeders.every((call) => call.headers.authorization === 'Bearer user-token')).toBe(true);
  const baseline = writes.find((call) => call.path === '/rest/v1/customers');
  expect(baseline).toMatchObject({ body: { tenant_id: newTenant, name: BASELINE_CUSTOMER } });
  expect(baseline.headers.authorization).toBe('Bearer user-token');
  expect(calls.some((call) => call.method === 'DELETE' || call.method === 'PATCH')).toBe(false);
  expect(result).toMatchObject({ newTenantId: newTenant,
    seeded: { seed_default_crm_pipeline: 'ok', baselineCustomer: 'created' } });
  expect(mask).toHaveBeenCalledWith('test-server-key');
  expect(mask).toHaveBeenCalledWith('user-token');
  expect(rotationSummary(result)).toContain(`E2E_TENANT_ID to ${newTenant}`);
});

it('removes the half-created tenant when copying settings fails', async () => {
  const { fetcher, calls } = staging({ fail: { 'POST /rest/v1/customer_level_settings': 409 } });
  await expect(rotateAuditTenant({ ...env, ROTATION_MODE: 'apply', ROTATION_CONFIRMATION: 'ROTATE' }, { fetcher, newId: newTenant }))
    .rejects.toThrow('ROTATION_APPLY_ROLLED_BACK');
  expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/rest/v1/tenants', query: `?id=eq.${newTenant}` });
});

it('switches the active tenant only to a tenant the user belongs to', async () => {
  const { fetcher, calls } = staging({ memberships: { [oldTenant]: 'admin', [newTenant]: 'admin' } });
  const activate = { ...env, ROTATION_MODE: 'activate', ROTATION_CONFIRMATION: 'ROTATE', ROTATION_TARGET_TENANT_ID: newTenant };
  expect(await rotateAuditTenant(activate, { fetcher }))
    .toMatchObject({ previousActiveTenantId: oldTenant, activeTenantId: newTenant, baselineCustomer: 'created' });
  expect(calls.at(-1)).toMatchObject({ method: 'PATCH', path: '/rest/v1/profiles', body: { active_tenant_id: newTenant } });

  const { fetcher: seededTenant, calls: seededCalls } = staging({
    memberships: { [oldTenant]: 'admin', [newTenant]: 'admin' }, customers: { [newTenant]: [{ id: 'c1' }] } });
  expect(await rotateAuditTenant(activate, { fetcher: seededTenant })).toMatchObject({ baselineCustomer: 'present' });
  expect(seededCalls.some((call) => call.method === 'POST' && call.path === '/rest/v1/customers')).toBe(false);

  const { fetcher: strangers } = staging();
  await expect(rotateAuditTenant(activate, { fetcher: strangers })).rejects.toThrow('NOT_A_MEMBERSHIP');
  await expect(rotateAuditTenant({ ...activate, ROTATION_TARGET_TENANT_ID: otherTenant }, { fetcher }))
    .rejects.toThrow('ISOLATION_TENANT');
});

it('refuses production, unconfirmed writes and owner identities before touching staging', async () => {
  const fetcher = vi.fn();
  await expect(rotateAuditTenant({ ...env, E2E_SUPABASE_PROJECT_REF: 'tcqdhwtnjrwpfdxoijmv' }, { fetcher }))
    .rejects.toThrow('non-production');
  await expect(rotateAuditTenant({ ...env, ROTATION_MODE: 'apply' }, { fetcher })).rejects.toThrow('CONFIRMATION_REQUIRED');
  await expect(rotateAuditTenant({ ...env, ROTATION_MODE: 'drop' }, { fetcher })).rejects.toThrow('MODE_INVALID');
  expect(fetcher).not.toHaveBeenCalled();
  const { fetcher: owner, calls } = staging({ role: 'owner' });
  await expect(rotateAuditTenant({ ...env, ROTATION_MODE: 'apply', ROTATION_CONFIRMATION: 'ROTATE' }, { fetcher: owner }))
    .rejects.toThrow('ROLE_UNSUPPORTED');
  expect(calls.some((call) => call.method === 'POST' && call.path === '/rest/v1/tenants')).toBe(false);
});
