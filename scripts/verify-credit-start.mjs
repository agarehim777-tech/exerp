/**
 * End-to-end yoxlama: kredit müqaviləsi yaradılması → "Krediti başlat" → cədvəl, status,
 * tarix, məbləğ və balansın düzgün formalaşması.
 *
 * Test izolyasiya olunmuş müvəqqəti şirkət yaradır və sonda onu silir.
 *
 * İstifadə: node scripts/verify-credit-start.mjs
 */
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
const BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!BASE || !ANON) {
  console.error("Supabase URL / publishable key tapılmadı.");
  process.exit(1);
}

async function resolveToken() {
  const direct = env.SUPABASE_ACCESS_TOKEN || env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
  if (direct) return direct;
  if (env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON) {
    try {
      const parsed = JSON.parse(env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON);
      if (parsed?.access_token) return parsed.access_token;
    } catch {
      /* ignore */
    }
  }
  if (env.TEST_USER && env.TEST_PASS) {
    const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "content-type": "application/json" },
      body: JSON.stringify({ email: env.TEST_USER, password: env.TEST_PASS }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`login failed: ${JSON.stringify(body).slice(0, 200)}`);
    return body.access_token;
  }
  throw new Error("Autentifikasiya tokeni yoxdur (SUPABASE_ACCESS_TOKEN və ya TEST_USER/TEST_PASS).");
}

const token = await resolveToken();
const headers = {
  apikey: ANON,
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
};

async function rpc(name, args = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${name} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function insert(table, row) {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=*`, {
    method: "POST",
    headers: { ...headers, prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`insert ${table} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text)[0];
}

async function select(table, query) {
  const res = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`select ${table} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const results = [];
function check(label, condition, detail = "") {
  results.push({ label, ok: Boolean(condition), detail });
  console.log(`${condition ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const stamp = Date.now().toString(36);
const today = new Date().toISOString().slice(0, 10);
const startDate = "2026-09-15";
const PRINCIPAL = 1200;
const INITIAL = 200;
const TERM = 12;
let tenantId = null;

function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

try {
  tenantId = await rpc("create_tenant", { _name: `E2E Kredit Test ${stamp}`, _slug: `e2e-credit-${stamp}` });
  check("Müvəqqəti test şirkəti yaradıldı", Boolean(tenantId));
  await rpc("seed_default_coa", { _tenant: tenantId });

  const warehouse = await insert("warehouses", { tenant_id: tenantId, code: `EC-${stamp}`, name: "E2E Anbar" });
  const product = await insert("products", {
    tenant_id: tenantId, sku: `EC-SKU-${stamp}`, name: "E2E Kredit Məhsulu", price: PRINCIPAL, vat_rate: 0,
  });
  const customer = await insert("customers", { tenant_id: tenantId, name: "E2E Kredit Müştəri" });

  await insert("stock_movements", {
    tenant_id: tenantId, warehouse_id: warehouse.id, product_id: product.id, sku: product.sku,
    move_type: "in", qty: 5, unit_cost: 500, doc_no: `EC-IN-${stamp}`,
  });

  const order = await rpc("create_sales_order_atomic", {
    _tenant_id: tenantId,
    _request_key: `e2e-credit-${stamp}`,
    _order_no: `EC-${stamp}`,
    _customer_id: customer.id,
    _order_date: today,
    _currency: "AZN",
    _notes: "E2E kredit testi",
    _items: [{
      line_no: 1, product_id: product.id, warehouse_id: warehouse.id,
      description: product.name, qty: 1, unit_price: PRINCIPAL, vat_rate: 0,
    }],
    _credit: {
      contract_no: `KR-${stamp}`,
      principal: PRINCIPAL,
      initial_payment: INITIAL,
      term_months: TERM,
    },
  });
  const orderId = order?.order_id || order?.id || order;
  const creditIdFromOrder = order?.credit_id || null;
  check("Sifariş + kredit müqaviləsi yaradıldı", Boolean(orderId));

  const [draft] = await select(
    "credit_contracts",
    `select=id,status,start_date,principal,initial_payment,term_months,order_id&tenant_id=eq.${tenantId}`,
  );
  const creditId = creditIdFromOrder || draft?.id;
  check("Kredit ilkin olaraq 'draft' (başlanmamış)", draft?.status === "draft", `status=${draft?.status}`);
  check("Başlamamış kreditdə tarix boşdur", draft?.start_date === null, String(draft?.start_date));
  check("Kredit sifarişə bağlıdır", draft?.order_id === orderId);

  const preInstallments = await select("credit_installments", `select=id&credit_id=eq.${creditId}`);
  check("Başlamazdan əvvəl ödəniş cədvəli yaranmır", preInstallments.length === 0, `${preInstallments.length} sətir`);

  const [orderBeforeStart] = await select("orders", `select=paid_amount,total_amount&id=eq.${orderId}`);
  check(
    "İlkin ödəniş sifarişin ödənilmiş məbləğinə yazıldı",
    Number(orderBeforeStart.paid_amount) === INITIAL,
    `paid_amount=${orderBeforeStart.paid_amount}`,
  );

  const cashBefore = await select("cash_transactions", `select=amount,direction&tenant_id=eq.${tenantId}`);
  check(
    "İlkin ödəniş kassaya mədaxil kimi düşdü",
    cashBefore.some((row) => Number(row.amount) === INITIAL && row.direction === "in"),
    JSON.stringify(cashBefore.map((r) => `${r.direction}:${r.amount}`)),
  );

  // Krediti başlat
  await rpc("start_credit_contract", { _tenant_id: tenantId, _credit_id: creditId, _start_date: startDate });

  const [started] = await select(
    "credit_contracts",
    `select=status,start_date,principal,initial_payment,term_months&id=eq.${creditId}`,
  );
  check("Başladıqdan sonra status 'active'", started.status === "active", `status=${started.status}`);
  check("Başlanğıc tarixi seçilən tarixdir", started.start_date === startDate, `start_date=${started.start_date}`);

  const installments = await select(
    "credit_installments",
    `select=installment_no,due_date,principal_due,principal_paid,status&credit_id=eq.${creditId}&order=installment_no`,
  );
  check("Ödəniş cədvəli 12 aylıqdır", installments.length === TERM, `${installments.length} sətir`);

  const financed = PRINCIPAL - INITIAL;
  const total = installments.reduce((sum, row) => sum + Number(row.principal_due), 0);
  check(
    "Cədvəlin cəmi maliyyələşən məbləğə bərabərdir",
    Math.round(total * 100) === Math.round(financed * 100),
    `cəm=${total}, gözlənilən=${financed}`,
  );

  check(
    "İlk ödəniş tarixi başlanğıcdan 1 ay sonradır",
    installments[0]?.due_date === addMonths(startDate, 1),
    `${installments[0]?.due_date} (gözlənilən ${addMonths(startDate, 1)})`,
  );
  check(
    "Son ödəniş tarixi başlanğıcdan 12 ay sonradır",
    installments[TERM - 1]?.due_date === addMonths(startDate, TERM),
    `${installments[TERM - 1]?.due_date}`,
  );
  check(
    "Bütün taksitlər ödənilməmiş qalıqla açılır",
    installments.every((row) => Number(row.principal_paid || 0) === 0 && row.status !== "paid"),
  );

  const outstanding = installments.reduce(
    (sum, row) => sum + (Number(row.principal_due) - Number(row.principal_paid || 0)),
    0,
  );
  check("Kredit balansı (qalıq borc) 1000 AZN-dir", Math.round(outstanding) === financed, `qalıq=${outstanding}`);

  const [orderAfterStart] = await select("orders", `select=paid_amount,total_amount&id=eq.${orderId}`);
  check(
    "Kreditin başladılması ödənilmiş məbləği dəyişmir",
    Number(orderAfterStart.paid_amount) === INITIAL,
    `paid_amount=${orderAfterStart.paid_amount}`,
  );

  const audit = await select(
    "audit_events",
    `select=action,detail&tenant_id=eq.${tenantId}&module=eq.credits&order=created_at`,
  );
  check(
    "Audit jurnalında 'start' hadisəsi var",
    audit.some((row) => row.action === "start"),
    JSON.stringify(audit.map((r) => r.action)),
  );

  // Təkrar başlatma bloklanmalıdır
  let blocked = false;
  try {
    await rpc("start_credit_contract", { _tenant_id: tenantId, _credit_id: creditId, _start_date: startDate });
  } catch (error) {
    blocked = /credit_already_started/.test(error.message);
  }
  check("Aktiv kredit ikinci dəfə başladıla bilmir", blocked);
} catch (error) {
  check("Axın xətasız tamamlandı", false, error.message);
} finally {
  if (tenantId) {
    try {
      await rpc("platform_delete_tenant", { _tenant: tenantId });
      console.log("🧹 Test şirkəti silindi.");
    } catch (error) {
      console.warn(`⚠️ Test şirkəti silinmədi (${tenantId}): ${error.message}`);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nNəticə: ${results.length - failed.length}/${results.length} yoxlama uğurlu.`);
process.exit(failed.length ? 1 : 0);
