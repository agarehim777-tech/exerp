import fs from "node:fs";
import path from "node:path";

function readEnvironment() {
  const values = { ...process.env };
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return values;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match || values[match[1]]) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}

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
];

const checks = await Promise.all(
  tables.map(async (table) => {
    try {
      const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=0`, {
        headers: { apikey: apiKey },
      });
      const body = response.ok ? "" : await response.text();
      return {
        table,
        ok: response.ok || response.status === 401 || response.status === 403,
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
console.log(JSON.stringify({ ok: missing.length === 0, checks }, null, 2));
if (missing.length > 0) process.exit(1);
