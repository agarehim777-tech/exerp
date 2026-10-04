// @vitest-environment node
import { expect, it } from 'vitest';
import { verifyRestrictedRoleAudit } from '../../scripts/supabase-audit-backend.mjs';

const tenant = '11111111-1111-4111-8111-111111111111';
const viewer = '22222222-2222-4222-8222-222222222222';
const env = { E2E_SUPABASE_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd', VITE_SUPABASE_URL: 'https://cvjctwgdyzhijhzhhjqd.supabase.co',
  E2E_TENANT_ID: tenant, E2E_OTHER_TENANT_ID: viewer, VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public',
  E2E_READONLY_USER: 'viewer@example.invalid', E2E_READONLY_PASS: 'test-only' };
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const fetcher = (override = {}) => async (url, options) => {
  const path = new URL(url).pathname;
  if (path.includes('/auth/')) return response({ access_token: 'viewer-session', user: { id: override.userId || viewer } });
  expect(options.headers.authorization).toBe('Bearer viewer-session');
  if (path.endsWith('/tenant_members')) return response([{ user_id: viewer, role: override.role || 'viewer' }]);
  if (path.endsWith('/create_sales_order_complete')) return response({ code: 'P0001', message: override.message || 'permission_denied' }, override.status || 400);
  if (path.endsWith('/customers') && options.method === 'POST') return response({ code: '42501', message: 'readonly_role_write_denied' }, override.directStatus || 403);
  return response(override.foreignRows || []);
};

it('uses a distinct real session and requires authorization denial plus tenant isolation', async () => {
  const evidence = await verifyRestrictedRoleAudit(env, tenant, fetcher());
  expect(evidence).toEqual({ userId: viewer, role: 'viewer', tenantId: tenant, commandDenied: true, directWriteDenied: true, foreignRows: 0 });
  expect(JSON.stringify(evidence)).not.toContain('viewer-session');
});

it('does not skip missing credentials or accept the primary/elevated identity', async () => {
  await expect(verifyRestrictedRoleAudit({ ...env, E2E_READONLY_PASS: '' }, tenant)).rejects.toThrow('AUDIT_ROLE_ACCOUNT_REQUIRED');
  await expect(verifyRestrictedRoleAudit(env, tenant, fetcher({ userId: tenant }))).rejects.toThrow('DISTINCT_IDENTITY');
  await expect(verifyRestrictedRoleAudit(env, tenant, fetcher({ role: 'admin' }))).rejects.toThrow('RESTRICTED_MEMBERSHIP');
});

it('does not mistake validation failure, successful writes or foreign rows for permission enforcement', async () => {
  await expect(verifyRestrictedRoleAudit(env, tenant, fetcher({ message: 'invalid_order' }))).rejects.toThrow('NOT_DENIED_BY_AUTHORIZATION');
  await expect(verifyRestrictedRoleAudit(env, tenant, fetcher({ status: 200 }))).rejects.toThrow('NOT_DENIED_BY_AUTHORIZATION');
  await expect(verifyRestrictedRoleAudit(env, tenant, fetcher({ directStatus: 200 }))).rejects.toThrow('DIRECT_WRITE_NOT_DENIED');
  await expect(verifyRestrictedRoleAudit(env, tenant, fetcher({ foreignRows: [{ id: viewer }] }))).rejects.toThrow('FOREIGN_TENANT_VISIBLE');
});
