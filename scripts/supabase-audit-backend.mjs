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

export async function createAuditBackend(env, fetcher = fetch) {
  const tenantId = assertE2eTarget(env);
  const url = env.VITE_SUPABASE_URL.replace(/\/$/, '');
  const apikey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = env.E2E_USER_EMAIL || env.E2E_TEST_USER;
  const password = env.E2E_USER_PASSWORD || env.E2E_TEST_PASS;
  if (!apikey || !email || !password) throw new Error('Authenticated Supabase audit credentials are required');
  const request = async (path, { method = 'GET', data, token } = {}) => {
    const response = await fetcher(`${url}/${path}`, { method, signal: AbortSignal.timeout(15000),
      headers: { apikey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: ${response.status} ${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const session = await request('auth/v1/token?grant_type=password', { method: 'POST', data: { email, password } });
  const token = session.access_token;
  const read = async (table, select = '*', filter = '') => {
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const rows = await request(`rest/v1/${table}?select=${encodeURIComponent(select)}&tenant_id=eq.${tenantId}&limit=500&offset=${offset}${filter}`, { token });
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
    storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
    session,
    async readState() {
      const [snapshots, collections, customers, products, orders, credits, installments, payments, warehouses,
        balances, accounts, cash, expenses, vendors, invoices, bonuses, audit] = await Promise.all([
        read('tenant_state_snapshots'), read('tenant_collection_records', '*', '&order=collection.asc,position.asc,record_key.asc'),
        read('customers'), read('products'), read('orders', '*,customer:customers(*),items:order_items(*),delivery:deliveries(*)', '&status=neq.cancelled'),
        read('credit_contracts'), read('credit_installments'), read('credit_payments'), read('warehouses'), read('stock_balances'),
        request('rest/v1/rpc/cashbook_ledger_summary', { method: 'POST', data: { _tenant_id: tenantId }, token }),
        read('cash_transactions'), read('expenses'), read('vendors'), read('sales_invoices'), read('order_bonus_assignments'), read('audit_events'),
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
      state.orders = orders.map((order) => dbOrderToLegacy({ ...order, credit: creditByOrder.get(order.id),
        bonus_assignments: bonuses.filter((b) => b.order_id === order.id && !b.effective_to) }));
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
        amount: Number(credit.principal), initialPayment: Number(credit.required_initial), initialPaid: Number(credit.initial_payment),
        months: credit.term_months, startDate: credit.start_date,
        payments: payments.filter((p) => p.credit_id === credit.id && !p.reversed_at),
        schedule: installments.filter((i) => i.credit_id === credit.id) }));
      state.contracts.push(...credits.map((c) => ({ id: c.contract_no, orderId: c.order_id, creditId: c.id, status: c.status })));
      state.financeAccounts = (accounts.accounts ?? []).map((a) => ({ ...a, openingBalance: Number(a.opening_balance), currentBalance: Number(a.balance) }));
      state.cashEntries = cash.map((tx) => ({ ...tx, amount: Number(tx.amount), date: tx.occurred_at?.slice(0, 10),
        orderId: orders.find((o) => o.id === tx.reference_id)?.id ?? null,
        creditId: credits.find((c) => c.id === tx.reference_id)?.id ?? payments.find((p) => p.id === tx.reference_id)?.credit_id ?? null }));
      state.expenses = expenses.map((e) => ({ ...e, amount: Number(e.amount), date: e.expense_date }));
      state.vendors = vendors; state.invoices = invoices;
      state.auditLog = [...(state.auditLog ?? []), ...audit];
      return state;
    },
  };
}
