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
    if (path.endsWith('/cashbook_ledger_summary')) return response({ accounts: [{ id: tenant, balance: 99 }] });
    if (path.endsWith('/cash_accounts')) return response([{ id: tenant, name: 'QA Cash', opening_balance: 250, balance: 777 }]);
    if (path.endsWith('/tenant_state_snapshots')) return response([{ state: { orders: [{ id: 'deleted-sale' }], products: [{ id: 'stale' }] } }]);
    return response([]);
  });
  const state = await backend.readState();
  expect(state.orders).toEqual([]); expect(state.products).toEqual([]);
  expect(state.financeAccounts[0].currentBalance).toBe(99);
  expect(state.financeAccounts[0]).toMatchObject({ name: 'QA Cash', openingBalance: 250 });
  for (const url of urls.filter((url) => url.includes('/rest/v1/') && !url.includes('/rpc/'))) {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/purchase_order_lines')) {
      expect(parsed.searchParams.get('purchase_orders.tenant_id')).toBe(`eq.${tenant}`);
      expect(parsed.searchParams.get('select')).toContain('purchase_orders!inner(tenant_id)');
      expect(parsed.searchParams.has('tenant_id')).toBe(false);
    } else expect(parsed.searchParams.get('tenant_id')).toBe(`eq.${tenant}`);
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

it('reads actual deposit and unreversed principal without subtracting penalties or reversed receipts', async () => {
  const backend = await createAuditBackend(env, async url => {
    const path = new URL(url).pathname;
    if (path.includes('/auth/')) return response({ access_token: 'test', user: { id: tenant } });
    if (path.endsWith('/tenant_members')) return response([{ user_id: tenant, role: 'admin' }]);
    if (path.endsWith('/erp_runtime_capabilities')) return response({ schema_version: 3 });
    if (path.endsWith('/cashbook_ledger_summary')) return response({ accounts: [] });
    if (path.endsWith('/customers')) return response([{ id: 'customer', name: 'QA', tax_id: 'Q123456' }]);
    if (path.endsWith('/credit_contracts')) return response([{ id: 'credit', customer_id: 'customer', principal: 1200,
      initial_payment: 200, required_initial: 200, contract_no: 'IN-QA', order_id: 'order' }]);
    if (path.endsWith('/credit_payments')) return response([
      { credit_id: 'credit', principal_amount: 100, penalty_amount: 17 },
      { credit_id: 'credit', principal_amount: 500, reversed_at: '2026-10-01' },
    ]);
    return response([]);
  });
  const state = await backend.readState();
  expect(state.credits[0]).toMatchObject({ balance: 900, initialPaid: 200, fin: 'Q123456', contractId: 'IN-QA' });
  expect(state.contracts[0]).toMatchObject({ fin: 'Q123456', creditId: 'credit', orderId: 'order' });
});
