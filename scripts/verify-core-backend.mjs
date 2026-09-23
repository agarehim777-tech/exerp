import { readEnvironment } from "./read-environment.mjs";

const env = readEnvironment();
const baseUrl = env.VITE_SUPABASE_URL;
const apiKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!baseUrl || !apiKey) {
  console.error("Supabase URL və publishable key tapılmadı.");
  process.exit(1);
}

const tables = [
  "tenant_state_snapshots",
  "audit_events",
  "credit_contracts",
  "credit_installments",
  "credit_payments",
  "warehouses",
  "stock_balances",
  "stock_reservations",
  "deliveries",
  "stock_movements",
  "cash_accounts",
  "cash_transactions",
  "expenses",
  "operation_requests",
  "accounting_period_locks",
];

const expectedStatuses = {
  operation_requests: [401, 403],
};

const checks = await Promise.all(
  tables.map(async (table) => {
    try {
      const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=0`, {
        headers: { apikey: apiKey },
      });
      const body = response.ok ? "" : await response.text();
      return {
        table,
        ok: (expectedStatuses[table] || [200, 206]).includes(response.status),
        status: response.status,
        reason: body.slice(0, 180),
      };
    } catch (error) {
      return {
        table,
        ok: false,
        status: 0,
        reason: `network_unavailable: ${error.cause?.code || error.message}`,
      };
    }
  }),
);

const missing = checks.filter((check) => !check.ok);
for (const [name, payload] of [
  ['cashbook_ledger_summary', { _tenant_id: '00000000-0000-0000-0000-000000000000' }],
  ['create_cash_expense_atomic', { _tenant_id: '00000000-0000-0000-0000-000000000000', _request_key: 'anonymous-contract-probe', _payload: {} }],
  ['transfer_cash_atomic', { _tenant_id: '00000000-0000-0000-0000-000000000000', _request_key: 'anonymous-contract-probe', _payload: {} }],
  ['refund_cash_expense_atomic', { _tenant_id: '00000000-0000-0000-0000-000000000000', _request_key: 'anonymous-contract-probe', _payload: {} }],
]) {
  try {
    // No bearer session: a deployed financial RPC must deny this probe before writing anything.
    const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const check = { rpc: name, status: response.status, ok: [401, 403].includes(response.status) };
    checks.push(check);
    if (!check.ok) missing.push(check);
  } catch (error) {
    const check = { rpc: name, ok: false, reason: error.message };
    checks.push(check);
    missing.push(check);
  }
}
console.log(JSON.stringify({ ok: missing.length === 0, checks }, null, 2));
if (missing.length > 0) process.exit(1);
