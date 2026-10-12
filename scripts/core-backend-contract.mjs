export const coreTables = [
  'tenant_state_snapshots', 'audit_events', 'credit_contracts', 'credit_installments',
  'credit_payments', 'warehouses', 'stock_balances', 'stock_reservations', 'deliveries',
  'stock_movements', 'cash_accounts', 'cash_transactions', 'expenses', 'operation_requests',
  'accounting_period_locks', 'tenant_collection_records', 'receivable_settlements',
  'kpi_periods', 'vendor_invoice_payments',
];

const tenant = '00000000-0000-0000-0000-000000000000';
const command = { _tenant_id: tenant, _request_key: 'anonymous-contract-probe', _payload: {} };
export const coreRpcProbes = [
  ['cashbook_ledger_summary', { _tenant_id: tenant }],
  ['create_cash_expense_atomic', command], ['transfer_cash_atomic', command],
  ['refund_cash_expense_atomic', command], ['pay_vendor_invoice_atomic', command],
  ['post_material_production', command], ['create_sales_invoice_atomic', command],
  ['settle_receivable_atomic', command], ['run_kpi_period_atomic', command],
  ['receivable_ledger_snapshot', { _tenant_id: tenant }],
  ['import_warehouse_stock_atomic', { _tenant_id: tenant, _request_key: command._request_key, _rows: [] }],
];

const protectedTables = new Set(['tenant_collection_records', 'receivable_settlements', 'kpi_periods', 'vendor_invoice_payments']);

export async function checkCoreBackend(baseUrl, apiKey, probe, { expectedProjectRef } = {}) {
  if (!baseUrl || !apiKey) throw new Error('ERP_BACKEND_CONFIG_REQUIRED');
  const target = new URL(baseUrl);
  if (expectedProjectRef && (target.protocol !== 'https:' || target.port || target.username || target.password
    || target.hostname !== `${expectedProjectRef}.supabase.co`)) {
    throw new Error('ERP_BACKEND_PROJECT_MISMATCH');
  }
  const checks = await Promise.all(coreTables.map(async table => {
    try {
      const response = await probe(new URL(`/rest/v1/${table}?select=*&limit=0`, target).href, { headers: { apikey: apiKey } });
      const statuses = table === 'operation_requests' ? [401, 403]
        : protectedTables.has(table) ? [200, 206, 401, 403] : [200, 206];
      return { table, status: response.status, ok: statuses.includes(response.status),
        ...(response.ok ? {} : { reason: (await response.text()).slice(0, 180) }) };
    } catch (error) {
      return { table, ok: false, status: 0, reason: `network_unavailable: ${error.cause?.code || error.message}` };
    }
  }));
  for (const [rpc, payload] of coreRpcProbes) {
    try {
      // No bearer session: commands must reject before validation or writes.
      const response = await probe(new URL(`/rest/v1/rpc/${rpc}`, target).href, {
        method: 'POST', headers: { apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      checks.push({ rpc, status: response.status, ok: [401, 403].includes(response.status) });
    } catch (error) {
      checks.push({ rpc, ok: false, reason: error.message });
    }
  }
  const missing = checks.filter(check => !check.ok);
  return { ok: missing.length === 0, checks,
    ...(missing.length ? { code: missing.some(check => check.status === 404) ? 'ERP_SCHEMA_MIGRATION_REQUIRED' : 'ERP_BACKEND_CONTRACT_FAILED' } : {}) };
}
