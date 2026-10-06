// @vitest-environment node
import { expect, it } from 'vitest';
import { auditModulePath, createAuditBackend, findNewLinkedCreditSale } from '../../scripts/supabase-audit-backend.mjs';

const tenant = '11111111-1111-4111-8111-111111111111';
const env = { E2E_SUPABASE_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd', VITE_SUPABASE_URL: 'https://cvjctwgdyzhijhzhhjqd.supabase.co',
  E2E_TENANT_ID: tenant, E2E_OTHER_TENANT_ID: '22222222-2222-4222-8222-222222222222',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key', E2E_USER_EMAIL: 'test@example.invalid', E2E_USER_PASSWORD: 'test-only' };
const response = (value) => new Response(JSON.stringify(value), { status: 200 });

it('narrows fixture reads and paginates composite stock identities with a stable order', async () => {
  const urls = [];
  const backend = await createAuditBackend(env, async url => {
    const parsed = new URL(url); urls.push(parsed);
    const path = parsed.pathname;
    if (path.includes('/auth/')) return response({ access_token: 'test', user: { id: tenant } });
    if (path.endsWith('/tenant_members')) return response([{ user_id: tenant, role: 'admin' }]);
    if (path.endsWith('/erp_runtime_capabilities')) return response({ schema_version: 3 });
    if (path.endsWith('/stock_balances') && parsed.searchParams.get('offset') === '0') return response(Array.from({length:500},(_,i)=>({ warehouse_id: 'warehouse', product_id: String(i), on_hand: 1 })));
    return response([]);
  });
  urls.length = 0;
  await backend.readState({ scope: 'sales', customerId: 'customer', warehouseId: 'warehouse' });
  expect(urls.some(url => /cashbook|snapshot|expense|collection|purchase/.test(url.pathname))).toBe(false);
  for (const url of urls.filter(url => /customers|orders|credit_contracts/.test(url.pathname))) {
    expect(url.searchParams.get(url.pathname.endsWith('/customers') ? 'id' : 'customer_id')).toBe('eq.customer');
    expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenant}`);
  }
  const balances = urls.filter(url => url.pathname.endsWith('/stock_balances'));
  expect(balances.map(url => url.searchParams.get('offset'))).toEqual(['0','500']);
  expect(balances.every(url => url.searchParams.get('order') === 'warehouse_id.asc,product_id.asc')).toBe(true);
  expect(balances.every(url => url.searchParams.get('warehouse_id') === 'eq.warehouse')).toBe(true);
  urls.length = 0;
  await backend.readCollections(['employees','departments']);
  expect(urls[0].searchParams.get('collection')).toBe('in.(employees,departments)');
  expect(urls[0].searchParams.get('tenant_id')).toBe(`eq.${tenant}`);
  await expect(backend.readCollections(['employees)&tenant_id=eq.foreign'])).rejects.toThrow('COLLECTION');
  await expect(backend.readState({ scope: 'unknown' })).rejects.toThrow('SCOPE');
  urls.length = 0;
  await backend.readState({ scope: 'hr' });
  expect(urls.every(url => /snapshot|collection|audit_events|expenses/.test(url.pathname))).toBe(true);
});

it('bounds concurrent read requests without skipping failed reads or changing tenant filters', async () => {
  let active = 0;
  let peak = 0;
  const backend = await createAuditBackend(env, async url => {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 2));
      const path = new URL(url).pathname;
      if (path.includes('/auth/')) return response({ access_token: 'test', user: { id: tenant } });
      if (path.endsWith('/tenant_members')) return response([{ user_id: tenant, role: 'admin' }]);
      if (path.endsWith('/erp_runtime_capabilities')) return response({ schema_version: 3 });
      if (path.endsWith('/cashbook_ledger_summary')) return response({ accounts: [] });
      return response([]);
    } finally { active -= 1; }
  });
  await Promise.all([backend.readState(), backend.readState()]);
  expect(peak).toBe(4);
  expect(active).toBe(0);
});

it('waits for coherent order, credit and contract links across independent REST snapshots', () => {
  const order = {id:'order',fin:'Q123456',creditId:'credit',contractId:'IN-QA'};
  const state = {orders:[order],credits:[],contracts:[]};
  expect(findNewLinkedCreditSale(state,[],order.fin)).toBeUndefined();
  state.credits.push({id:'credit',orderId:'order'});
  state.contracts.push({id:'IN-QA',orderId:'stale-order',creditId:'credit'});
  expect(findNewLinkedCreditSale(state,[],order.fin)).toBeUndefined();
  state.contracts[0].orderId='order';
  expect(findNewLinkedCreditSale(state,[],order.fin)).toBe(order);
  expect(findNewLinkedCreditSale(state,[order],order.fin)).toBeUndefined();
  expect(findNewLinkedCreditSale(state,[],'OTHER-CUSTOMER')).toBeUndefined();
});

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

it('verifies persisted workflow report exports instead of relying only on the UI snapshot', async () => {
  const backend = await createAuditBackend(env, async url => {
    const path = new URL(url).pathname;
    if (path.includes('/auth/')) return response({ access_token: 'test', user: { id: tenant } });
    if (path.endsWith('/tenant_members')) return response([{ user_id: tenant, role: 'admin' }]);
    if (path.endsWith('/erp_runtime_capabilities')) return response({ schema_version: 3 });
    if (path.endsWith('/cashbook_ledger_summary')) return response({ accounts: [] });
    if (path.endsWith('/tenant_state_snapshots')) return response([{ state: { reportExports: [{ id: 'report', score: 0 }, { id: 'historic' }] } }]);
    if (path.endsWith('/workflow_records')) {
      expect(new URL(url).searchParams.get('module')).toBe('eq.reports');
      expect(new URL(url).searchParams.get('record_type')).toBe('eq.report_export');
      return response([{ id: 'workflow', record_no: 'report', payload: { score: 75, snapshot: { rows: 5 } } }]);
    }
    return response([]);
  });
  const state = await backend.readState();
  expect(state.reportExports).toEqual([{ id: 'report', workflowId: 'workflow', score: 75, snapshot: { rows: 5 } }, { id: 'historic' }]);
});

it('uses stable routes and reports removed modules instead of navigating by DOM index', () => {
  expect(auditModulePath(9)).toBe('/kredit');
  expect(auditModulePath(14)).toBe('/hr/emekdaslar');
  expect(auditModulePath(13)).toBe('/istehsal');
  expect(() => auditModulePath(8)).toThrow('tax');
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
    if (path.endsWith('/tenant_collection_records')) return response([{collection:'contracts',record_key:'obsolete',data:{id:'IN-QA',orderId:'old-order'}}]);
    if (path.endsWith('/orders')) return response([{id:'order',customer_id:'customer',total:1200,items:[],
      reservations:[{warehouse_id:'warehouse',status:'active'}]}]);
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
  expect(state.contracts).toHaveLength(1);
  expect(state.orders[0]).toMatchObject({warehouseId:'warehouse',contractId:'IN-QA',creditId:'credit'});
});
