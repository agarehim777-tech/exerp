import { assertE2eTarget } from '../tests/e2e-target.mjs';
import { dbCustomerToLegacy, dbProductToLegacy, dbOrderToLegacy } from '../src/shared/adapters/erpShape.js';
import { moduleRoutes } from '../src/config/routes.js';

const historicalModules = { 1: 'crm', 2: 'sales', 3: 'stock', 4: 'deliveries', 5: 'cashbook',
  6: 'ar-invoices', 7: 'accounting', 8: 'tax', 9: 'credits', 10: 'receivables', 11: 'vendors',
  12: 'projects', 13: 'production', 14: 'hr', 15: 'kpi', 17: 'reports', 18: 'support',
  19: 'help', 20: 'onboarding', 21: 'messages', 22: 'notifications', 23: 'api', 24: 'settings' };

export function auditModulePath(index) {
  const module = historicalModules[index];
  if (!module || !moduleRoutes[module]) {
    const error = new Error(`Audit module has no supported application route: ${module ?? index}`);
    error.code = 'AUDIT_MODULE_UNAVAILABLE';
    throw error;
  }
  return moduleRoutes[module];
}

export function findNewLinkedCreditSale(state, previousOrders, expectedFin) {
  const previousIds = new Set(previousOrders.map(order => order.id));
  return state.orders.find(order => !previousIds.has(order.id) && (!expectedFin || order.fin === expectedFin)
    && order.creditId && order.contractId
    && state.credits.some(credit => credit.id === order.creditId && credit.orderId === order.id)
    && state.contracts.some(contract => contract.id === order.contractId && contract.orderId === order.id && contract.creditId === order.creditId));
}

export async function verifyRestrictedRoleAudit(env, primaryUserId, fetcher = fetch) {
  const tenantId = assertE2eTarget(env);
  const email = env.E2E_READONLY_USER;
  const password = env.E2E_READONLY_PASS;
  if (!email || !password) throw new Error('AUDIT_ROLE_ACCOUNT_REQUIRED: configure E2E_READONLY_USER and E2E_READONLY_PASS in staging secrets');
  const url = env.VITE_SUPABASE_URL.replace(/\/$/, '');
  const apikey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const login = await fetcher(`${url}/auth/v1/token?grant_type=password`, { method: 'POST',
    signal: AbortSignal.timeout(15000), headers: { apikey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }) });
  if (!login.ok) throw new Error(`ROLE_AUDIT_LOGIN_FAILED: ${login.status}`);
  const session = await login.json();
  if (!session.access_token || !session.user?.id || session.user.id === primaryUserId) throw new Error('ROLE_AUDIT_REQUIRES_DISTINCT_IDENTITY');
  const headers = { apikey, 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` };
  const membershipResponse = await fetcher(`${url}/rest/v1/tenant_members?select=user_id,role&tenant_id=eq.${tenantId}&user_id=eq.${session.user.id}`, { headers, signal: AbortSignal.timeout(15000) });
  if (!membershipResponse.ok) throw new Error(`ROLE_AUDIT_MEMBERSHIP_FAILED: ${membershipResponse.status}`);
  const members = await membershipResponse.json();
  if (members.length !== 1 || members[0].role !== 'viewer') throw new Error('ROLE_AUDIT_REQUIRES_RESTRICTED_MEMBERSHIP');
  // Authorization must reject before validation or any operation-request insert.
  const command = await fetcher(`${url}/rest/v1/rpc/create_sales_order_complete`, { method: 'POST', headers,
    signal: AbortSignal.timeout(15000), body: JSON.stringify({ _tenant_id: tenantId,
      _request_key: `role-denial:${crypto.randomUUID()}`, _order_no: 'QA-ROLE-DENIAL',
      _customer_id: null, _order_date: null, _currency: 'AZN', _notes: null, _items: [] }) });
  const denial = await command.json();
  if (command.ok || denial.code !== 'P0001' || denial.message !== 'permission_denied') throw new Error('ROLE_AUDIT_COMMAND_NOT_DENIED_BY_AUTHORIZATION');
  const directWrite = await fetcher(`${url}/rest/v1/customers`, { method: 'POST', headers,
    signal: AbortSignal.timeout(15000), body: JSON.stringify({ tenant_id: tenantId, name: 'QA readonly denial' }) });
  const directDenial = await directWrite.json();
  if (directWrite.ok || directDenial.code !== '42501') throw new Error('ROLE_AUDIT_DIRECT_WRITE_NOT_DENIED');
  const foreign = await fetcher(`${url}/rest/v1/customers?select=id&tenant_id=eq.${env.E2E_OTHER_TENANT_ID}&limit=1`, { headers, signal: AbortSignal.timeout(15000) });
  if (!foreign.ok || (await foreign.json()).length !== 0) throw new Error('ROLE_AUDIT_FOREIGN_TENANT_VISIBLE');
  return { userId: session.user.id, role: members[0].role, tenantId, commandDenied: true, directWriteDenied: true, foreignRows: 0 };
}

export async function createAuditBackend(env, fetcher = fetch) {
  const tenantId = assertE2eTarget(env);
  const url = env.VITE_SUPABASE_URL.replace(/\/$/, '');
  const apikey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = env.E2E_USER_EMAIL || env.E2E_TEST_USER;
  const password = env.E2E_USER_PASSWORD || env.E2E_TEST_PASS;
  if (!apikey || !email || !password) throw new Error('Authenticated Supabase audit credentials are required');
  let activeRequests = 0;
  const waitingRequests = [];
  const request = async (path, { method = 'GET', data, token } = {}) => {
    if (activeRequests >= 4) await new Promise(resolve => waitingRequests.push(resolve));
    else activeRequests += 1;
    try {
      const response = await fetcher(`${url}/${path}`, { method, signal: AbortSignal.timeout(15000),
        headers: { apikey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${await response.text()}`);
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } finally {
      const next = waitingRequests.shift();
      if (next) next();
      else activeRequests -= 1;
    }
  };
  const session = await request('auth/v1/token?grant_type=password', { method: 'POST', data: { email, password } });
  const token = session.access_token;
  const read = async (table, select = '*', filter = '', tenantColumn = 'tenant_id') => {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await request(`rest/v1/${table}?select=${encodeURIComponent(select)}&${tenantColumn}=eq.${tenantId}&limit=500&offset=${offset}${filter}`, { token });
      result.push(...rows);
      if (rows.length < 500) return result;
    }
  };
  const membership = await read('tenant_members', 'user_id,role', `&user_id=eq.${session.user.id}`);
  if (membership.length !== 1 || ['owner', 'super_admin', 'platform_admin'].includes(membership[0].role)) {
    throw new Error('Audit requires a restricted user in the selected test tenant');
  }
  const capabilities = await request('rest/v1/rpc/erp_runtime_capabilities', { method: 'POST', data: {}, token });
  if (Number(capabilities?.schema_version) < 3) throw new Error('ERP_SCHEMA_MIGRATION_REQUIRED');
  return {
    tenantId,
    readCanonical: read,
    command: (name, data) => request(`rest/v1/rpc/${name}`, { method: 'POST', data, token }),
    invokeEdge: (name, data) => request(`functions/v1/${name}`, { method: 'POST', data, token }),
    storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
    session,
    async readState() {
      const [snapshots, collections, customers, products, orders, credits, installments, payments, warehouses,
        balances, accounts, accountMetadata, cash, expenses, vendors, invoices, bonuses, audit, purchaseOrders, purchaseOrderLines, reportExports] = await Promise.all([
        read('tenant_state_snapshots'), read('tenant_collection_records', '*', '&order=collection.asc,position.asc,record_key.asc'),
        read('customers'), read('products'), read('orders', '*,customer:customers(*),items:order_items(*),delivery:deliveries(*),reservations:stock_reservations(warehouse_id,order_item_id,status)', '&status=neq.cancelled'),
        read('credit_contracts'), read('credit_installments'), read('credit_payments'), read('warehouses'), read('stock_balances'),
        request('rest/v1/rpc/cashbook_ledger_summary', { method: 'POST', data: { _tenant_id: tenantId }, token }),
        read('cash_accounts'),
        read('cash_transactions'), read('expenses'), read('vendors'), read('sales_invoices'), read('order_bonus_assignments'), read('audit_events'),
        read('purchase_orders'), read('purchase_order_lines', '*,purchase_orders!inner(tenant_id)', '', 'purchase_orders.tenant_id'),
        read('workflow_records', '*', '&module=eq.reports&record_type=eq.report_export&order=created_at.desc,id.desc'),
      ]);
      const state = { ...(snapshots[0]?.state ?? {}) };
      for (const name of ['employees', 'departments', 'leaveRequests', 'vacancies', 'contracts']) {
        state[name] = collections.filter((r) => r.collection === name).map((r) => ({ ...r.data, id: r.data?.id ?? r.record_key }));
      }
      const productById = new Map(products.map((p) => [p.id, p]));
      const customerById = new Map(customers.map((c) => [c.id, c]));
      const creditByOrder = new Map(credits.map((c) => [c.order_id, c]));
      state.customers = customers.map(dbCustomerToLegacy);
      state.products = products.map(dbProductToLegacy);
      state.orders = orders.map((order) => ({ ...dbOrderToLegacy({ ...order, credit: creditByOrder.get(order.id),
        bonus_assignments: bonuses.filter((b) => b.order_id === order.id && !b.effective_to) }),
        fin: dbCustomerToLegacy(customerById.get(order.customer_id))?.fin ?? '' }));
      state.warehouses = warehouses.map((w) => ({ ...w, status: w.is_active ? 'Aktiv' : 'Passiv' }));
      state.warehouseStock = {};
      for (const balance of balances) {
        const rows = state.warehouseStock[balance.warehouse_id] ??= [];
        rows.push({ id: `${balance.warehouse_id}-${balance.product_id}`, productId: balance.product_id,
          product: productById.get(balance.product_id)?.name, total: Number(balance.on_hand), reserved: Number(balance.reserved),
          problemQty: Number(balance.problem_qty), costPrice: Number(balance.avg_cost) });
      }
      state.stock = Object.values(state.warehouseStock).flat();
      state.credits = credits.map((credit) => ({ ...credit, id: credit.id, orderId: credit.order_id,
        contractId: credit.contract_no, customer: customerById.get(credit.customer_id)?.name,
        amount: Number(credit.principal), total: Number(credit.principal),
        balance: Math.max(0, Number(credit.principal) - Number(credit.initial_payment) -
          payments.filter((p) => p.credit_id === credit.id && !p.reversed_at)
            .reduce((sum, p) => sum + Number(p.principal_amount || 0), 0)),
        fin: dbCustomerToLegacy(customerById.get(credit.customer_id))?.fin ?? '',
        initialPayment: Number(credit.required_initial), initialPaid: Number(credit.initial_payment),
        months: credit.term_months, startDate: credit.start_date,
        payments: payments.filter((p) => p.credit_id === credit.id && !p.reversed_at),
        installments: installments.filter(i => i.credit_id === credit.id).sort((a, b) => a.installment_no - b.installment_no)
          .map(i => ({ ...i, month: i.installment_no, due: i.due_date,
            amount: Math.max(0, Number(i.principal_due) - Number(i.principal_paid)) })),
        paidMonths: installments.filter(i => i.credit_id === credit.id && Number(i.principal_due) <= Number(i.principal_paid)).length,
        schedule: installments.filter((i) => i.credit_id === credit.id) }));
      const canonicalContracts = credits.map((c) => ({ id: c.contract_no, orderId: c.order_id, creditId: c.id, status: c.status,
        fin: dbCustomerToLegacy(customerById.get(c.customer_id))?.fin ?? '' }));
      const canonicalContractIds = new Set(canonicalContracts.map(c => c.id));
      state.contracts = [...canonicalContracts, ...state.contracts.filter(c => !canonicalContractIds.has(c.id))];
      const accountById = new Map(accountMetadata.map(a => [a.id, a]));
      state.financeAccounts = (accounts.accounts ?? []).map(a => ({ ...accountById.get(a.id), ...a,
        openingBalance: Number(accountById.get(a.id)?.opening_balance), currentBalance: Number(a.balance) }));
      state.cashEntries = cash.map((tx) => ({ ...tx, amount: Number(tx.amount), date: tx.occurred_at?.slice(0, 10),
        principal: Number(payments.find(p => p.id === tx.reference_id)?.principal_amount || 0),
        penalty: Number(payments.find(p => p.id === tx.reference_id)?.penalty_amount || 0),
        orderId: orders.find((o) => o.id === tx.reference_id)?.id ?? null,
        creditId: credits.find((c) => c.id === tx.reference_id)?.id ?? payments.find((p) => p.id === tx.reference_id)?.credit_id ?? null }));
      state.expenses = expenses.map((e) => ({ ...e, amount: Number(e.amount), date: e.expense_date }));
      state.vendors = vendors; state.invoices = invoices;
      state.purchaseOrders = purchaseOrders;
      state.purchaseOrderLines = purchaseOrderLines;
      const savedExports = reportExports.map(row => ({ ...row.payload, id: row.record_no, workflowId: row.id }));
      const savedExportIds = new Set(savedExports.map(row => row.id));
      state.reportExports = [...savedExports, ...(state.reportExports || []).filter(row => !savedExportIds.has(row.id))];
      state.auditLog = [...(state.auditLog ?? []), ...audit];
      return state;
    },
  };
}
