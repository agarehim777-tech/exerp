import fs from 'node:fs';

const env = { ...process.env };
if (fs.existsSync('.env')) for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
  if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const email = env.E2E_TEST_USER || env.TEST_USER;
const password = env.E2E_TEST_PASS || env.TEST_PASS;
if (!base || !key || !email || !password) throw new Error('Operational audit secret-ləri natamamdır.');

const auth = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: key, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const session = await auth.json();
if (!auth.ok) throw new Error(`Operational audit login failed: ${session.error_description || session.msg}`);
const headers = { apikey: key, authorization: `Bearer ${session.access_token}` };
const membershipResponse = await fetch(`${base}/rest/v1/tenant_members?select=tenant_id&user_id=eq.${session.user.id}&limit=1`, { headers });
const memberships = await membershipResponse.json();
if (!membershipResponse.ok || !memberships[0]?.tenant_id) throw new Error('Audit istifadəçisinin şirkəti tapılmadı.');
const tenant = memberships[0].tenant_id;
const get = async (path) => {
  const response = await fetch(`${base}/rest/v1/${path}`, { headers });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};
const [orders, credits, payments, reservations, balances, invoices, deliveries, accountingEvents] = await Promise.all([
  get(`orders?select=id,order_no,status&tenant_id=eq.${tenant}`),
  get(`credit_contracts?select=id,order_id,status&tenant_id=eq.${tenant}`),
  get(`cash_transactions?select=id,category,reference_id,reference_type,reference,reversed_at,reversal_of&tenant_id=eq.${tenant}`),
  get(`stock_reservations?select=id,order_id,warehouse_id,product_id,quantity,status&tenant_id=eq.${tenant}`),
  get(`stock_balances?select=warehouse_id,product_id,reserved&tenant_id=eq.${tenant}`),
  get(`sales_invoices?select=id,invoice_no,order_id,status&tenant_id=eq.${tenant}`),
  get(`deliveries?select=id,delivery_no,order_id,status&tenant_id=eq.${tenant}`),
  get(`order_accounting_events?select=id,order_id,event_type&tenant_id=eq.${tenant}`),
]);
const { buildOperationalHealth } = await import('../src/shared/lib/operationalHealth.js');
const report = buildOperationalHealth({ orders, credits, cashTransactions: payments, reservations, balances, invoices, deliveries, accountingEvents });
console.log(JSON.stringify({ tenant, ...report.summary, issues: report.issues }, null, 2));
if (!report.summary.healthy) process.exit(1);

