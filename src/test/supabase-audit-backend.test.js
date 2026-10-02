// @vitest-environment node
import { expect, it } from 'vitest';
import { auditModulePath, createAuditBackend } from '../../scripts/supabase-audit-backend.mjs';

const tenant = '11111111-1111-4111-8111-111111111111';
const env = { E2E_SUPABASE_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd', VITE_SUPABASE_URL: 'https://cvjctwgdyzhijhzhhjqd.supabase.co',
  E2E_TENANT_ID: tenant, E2E_OTHER_TENANT_ID: '22222222-2222-4222-8222-222222222222',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key', E2E_USER_EMAIL: 'test@example.invalid', E2E_USER_PASSWORD: 'test-only' };
const response = (value) => new Response(JSON.stringify(value), { status: 200 });

it('uses canonical tenant-scoped rows even when a snapshot contains obsolete business state', async () => {
  const urls = [];
  const backend = await createAuditBackend(env, async (url) => {
    urls.push(url);
    const path = new URL(url).pathname;
    if (path.includes('/auth/')) return response({ access_token: 'test-session', user: { id: tenant } });
    if (path.endsWith('/tenant_members')) return response([{ user_id: tenant, role: 'admin' }]);
    if (path.endsWith('/erp_runtime_capabilities')) return response({ schema_version: 3 });
    if (path.endsWith('/cashbook_ledger_summary')) return response({ accounts: [{ id: tenant, opening_balance: 10, balance: 99 }] });
    if (path.endsWith('/tenant_state_snapshots')) return response([{ state: { orders: [{ id: 'deleted-sale' }], products: [{ id: 'stale' }] } }]);
    return response([]);
  });
  const state = await backend.readState();
  expect(state.orders).toEqual([]); expect(state.products).toEqual([]);
  expect(state.financeAccounts[0].currentBalance).toBe(99);
  for (const url of urls.filter((url) => url.includes('/rest/v1/') && !url.includes('/rpc/'))) {
    expect(new URL(url).searchParams.get('tenant_id')).toBe(`eq.${tenant}`);
  }
});

it('rejects production and elevated audit accounts', async () => {
  await expect(createAuditBackend({ ...env, E2E_SUPABASE_PROJECT_REF: 'tcqdhwtnjrwpfdxoijmv' })).rejects.toThrow('non-production');
  await expect(createAuditBackend(env, async (url) => response(url.includes('/auth/')
    ? { access_token: 'test', user: { id: tenant } } : [{ user_id: tenant, role: 'owner' }]))).rejects.toThrow('restricted');
});

it('uses stable routes and reports removed modules instead of navigating by DOM index', () => {
  expect(auditModulePath(9)).toBe('/kredit');
  expect(auditModulePath(14)).toBe('/hr/emekdaslar');
  expect(() => auditModulePath(13)).toThrow('production');
});

it('preserves the server error status and detail instead of masking it with a fetch API error', async () => {
  await expect(createAuditBackend(env, async () => new Response('invalid_credentials', { status: 401 })))
    .rejects.toThrow('POST auth/v1/token: 401 invalid_credentials');
});
