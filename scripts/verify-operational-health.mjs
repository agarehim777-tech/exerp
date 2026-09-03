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
const [orders, credits, payments, reservations] = await Promise.all([
  get(`orders?select=id,status&tenant_id=eq.${tenant}`),
  get(`credit_contracts?select=id,order_id,status&tenant_id=eq.${tenant}`),
  get(`cash_transactions?select=id,reference_id,reference_type,reversed_at&tenant_id=eq.${tenant}`),
  get(`stock_reservations?select=id,order_id,status&tenant_id=eq.${tenant}`),
]);
const byId = new Map(orders.map((row) => [row.id, row]));
const orphanCredits = credits.filter((row) => !byId.has(row.order_id) || (byId.get(row.order_id)?.status === 'cancelled' && !['closed','cancelled'].includes(row.status)));
const orphanPayments = payments.filter((row) => ['sales_order','sales_payment'].includes(row.reference_type) && !row.reversed_at && (!byId.has(row.reference_id) || byId.get(row.reference_id)?.status === 'cancelled'));
const orphanReservations = reservations.filter((row) => row.status === 'active' && (!byId.has(row.order_id) || byId.get(row.order_id)?.status === 'cancelled'));
console.log(JSON.stringify({ tenant, checked_at: new Date().toISOString(), orphanCredits: orphanCredits.length, orphanPayments: orphanPayments.length, orphanReservations: orphanReservations.length }, null, 2));
if (orphanCredits.length || orphanPayments.length || orphanReservations.length) process.exit(1);


