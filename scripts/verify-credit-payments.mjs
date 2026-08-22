/**
 * End-to-end yoxlama:
 *  A) Taksit ödənişi → kassa mədaxili, qalıq borc və audit yazısı
 *  B) Ödəniş verilməyəndə gecikmə statusu və borcun yenilənməsi
 *  C) Ayın sonuna düşən başlanğıc tarixi ilə 12 aylıq cədvəl
 *
 * İstifadə: node scripts/verify-credit-payments.mjs
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
const headers = { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" };

async function rpc(name, args = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST", headers, body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${name} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function insert(table, row) {
  const res = await fetch(`${BASE}/rest/v1/${table}?select=*`, {
    method: "POST", headers: { ...headers, prefer: "return=representation" }, body: JSON.stringify(row),
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
  results.push({ label, ok: Boolean(condition) });
  console.log(`${condition ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const stamp = Date.now().toString(36);
const today = new Date().toISOString().slice(0, 10);
const TERM = 12;
let tenantId = null;

function addMonthsClamped(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

async function bootstrapCredit({ suffix, principal, initial, startDate }) {
  const warehouse = await insert("warehouses", { tenant_id: tenantId, code: `CP-${suffix}`, name: `Anbar ${suffix}` });
  const product = await insert("products", {
    tenant_id: tenantId, sku: `CP-SKU-${suffix}`, name: `Kredit Məhsulu ${suffix}`, price: principal, vat_rate: 0,
  });
  const customer = await insert("customers", { tenant_id: tenantId, name: `Kredit Müştəri ${suffix}` });
  await insert("stock_movements", {
    tenant_id: tenantId, warehouse_id: warehouse.id, product_id: product.id, sku: product.sku,
    move_type: "in", qty: 5, unit_cost: principal / 2, doc_no: `CP-IN-${suffix}`,
  });
  const order = await rpc("create_sales_order_atomic", {
    _tenant_id: tenantId,
    _request_key: `credit-payment-${suffix}`,
    _order_no: `CP-${suffix}`,
    _customer_id: customer.id,
    _order_date: today,
    _currency: "AZN",
    _notes: "E2E kredit ödəniş testi",
    _items: [{
      line_no: 1, product_id: product.id, warehouse_id: warehouse.id,
      description: product.name, qty: 1, unit_price: principal, vat_rate: 0,
    }],
    _credit: { contract_no: `KR-${suffix}`, principal, initial_payment: initial, term_months: TERM },
  });
  const orderId = order?.order_id || order?.id || order;
  let creditId = order?.credit_id || null;
  if (!creditId) {
    const [row] = await select("credit_contracts", `select=id&tenant_id=eq.${tenantId}&contract_no=eq.KR-${suffix}`);
    creditId = row?.id;
  }
  await rpc("start_credit_contract", { _tenant_id: tenantId, _credit_id: creditId, _start_date: startDate });
  return { creditId, orderId };
}

async function outstandingOf(creditId) {
  const rows = await select(
    "credit_installments",
    `select=principal_due,principal_paid,penalty_due,penalty_paid&credit_id=eq.${creditId}`,
  );
  return rows.reduce(
    (sum, r) => sum + (Number(r.principal_due) - Number(r.principal_paid)) + (Number(r.penalty_due) - Number(r.penalty_paid)),
    0,
  );
}

try {
  tenantId = await rpc("create_tenant", { _name: `E2E Kredit Ödəniş ${stamp}`, _slug: `e2e-credit-pay-${stamp}` });
  check("Müvəqqəti test şirkəti yaradıldı", Boolean(tenantId));
  await rpc("seed_default_coa", { _tenant: tenantId });
  const cashAccount = await insert("cash_accounts", {
    tenant_id: tenantId, name: "Əsas kassa", type: "cash", currency: "AZN",
    account_no: `MAIN-${String(tenantId).slice(0, 8).toUpperCase()}`,
  });

  // ---------- A) Taksit ödənişi ----------
  const past = addMonthsClamped(today, -3);
  const a = await bootstrapCredit({ suffix: `a${stamp}`, principal: 1200, initial: 200, startDate: past });
  const financed = 1000;
  const outstandingBefore = await outstandingOf(a.creditId);
  check("Başlanğıc qalıq borc maliyyələşən məbləğə bərabərdir", Math.round(outstandingBefore) === financed, `${outstandingBefore}`);

  const [firstInstallment] = await select(
    "credit_installments", `select=principal_due&credit_id=eq.${a.creditId}&order=installment_no&limit=1`,
  );
  const payAmount = Number(firstInstallment.principal_due);
  const paymentId = await rpc("post_credit_payment", {
    _tenant_id: tenantId, _credit_id: a.creditId, _receipt_no: `KRD-${stamp}-1`,
    _amount: payAmount, _penalty_amount: 0, _cash_account_id: cashAccount.id,
    _payment_method: "cash", _note: "E2E taksit ödənişi",
  });
  check("Taksit ödənişi qeydə alındı", Boolean(paymentId));

  const [paid] = await select(
    "credit_installments", `select=status,principal_paid,paid_at&credit_id=eq.${a.creditId}&order=installment_no&limit=1`,
  );
  check("Ödənilən taksit 'paid' statusuna keçdi", paid.status === "paid" && Number(paid.principal_paid) === payAmount, `status=${paid.status}`);

  const outstandingAfter = await outstandingOf(a.creditId);
  check(
    "Qalıq borc ödəniş qədər azaldı",
    Math.round((outstandingBefore - outstandingAfter) * 100) === Math.round(payAmount * 100),
    `${outstandingBefore} → ${outstandingAfter}`,
  );

  const cashRows = await select(
    "cash_transactions",
    `select=amount,direction,category,reference_id,account_id&tenant_id=eq.${tenantId}&category=eq.credit_payment`,
  );
  const cashRow = cashRows.find((r) => r.reference_id === paymentId);
  check("Ödəniş kassaya mədaxil kimi düşdü", cashRow && cashRow.direction === "in" && Number(cashRow.amount) === payAmount,
    JSON.stringify(cashRows.map((r) => `${r.direction}:${r.amount}`)));
  check("Kassa mədaxili düzgün hesaba yazıldı", cashRow?.account_id === cashAccount.id);

  const [orderAfterPay] = await select("orders", `select=paid_amount,payment_status,total&id=eq.${a.orderId}`);
  check(
    "Sifarişin ödənilmiş məbləği ilkin ödəniş + taksit qədərdir",
    Number(orderAfterPay.paid_amount) === 200 + payAmount,
    `paid_amount=${orderAfterPay.paid_amount}`,
  );
  check("Sifariş 'qismən ödənilmiş' statusundadır", orderAfterPay.payment_status === "partial", orderAfterPay.payment_status);

  const audit = await select(
    "audit_events", `select=action,payload&tenant_id=eq.${tenantId}&module=eq.credits&order=created_at`,
  );
  const payAudit = audit.find((r) => r.action === "payment" && r.payload?.payment_id === paymentId);
  check("Audit jurnalında 'payment' hadisəsi var", Boolean(payAudit), JSON.stringify(audit.map((r) => r.action)));
  check(
    "Audit yazısında qalıq borc düzgündür",
    Math.round(Number(payAudit?.payload?.outstanding || -1)) === Math.round(outstandingAfter),
    `${payAudit?.payload?.outstanding}`,
  );

  // Cəriməli ödəniş
  const penaltyPayment = await rpc("post_credit_payment", {
    _tenant_id: tenantId, _credit_id: a.creditId, _receipt_no: `KRD-${stamp}-2`,
    _amount: 105, _penalty_amount: 5, _cash_account_id: cashAccount.id,
  });
  const [penaltyRow] = await select(
    "credit_payments", `select=principal_amount,penalty_amount,unallocated_amount&id=eq.${penaltyPayment}`,
  );
  check(
    "Cərimə və əsas borc ayrı-ayrı uçota alınır",
    Number(penaltyRow.principal_amount) === 100 && Number(penaltyRow.penalty_amount) === 0
      && Number(penaltyRow.unallocated_amount) === 5,
    JSON.stringify(penaltyRow),
  );

  // Başlanmamış kreditə ödəniş qadağandır
  const draftCredit = await rpc("create_credit_contract", {
    _tenant_id: tenantId, _contract_no: `KR-DRAFT-${stamp}`, _customer_id: null, _order_id: null,
    _principal: 600, _initial_payment: 0, _term_months: 6, _start_date: null,
  }).catch(() => null);
  if (draftCredit) {
    let blocked = false;
    try {
      await rpc("post_credit_payment", {
        _tenant_id: tenantId, _credit_id: draftCredit, _receipt_no: `KRD-${stamp}-3`,
        _amount: 50, _cash_account_id: cashAccount.id,
      });
    } catch (error) {
      blocked = /credit_not_started/.test(error.message);
    }
    check("Başlanmamış kreditə ödəniş bloklanır", blocked);
  }

  // ---------- B) Gecikmə ----------
  const overdueStart = addMonthsClamped(today, -4);
  const b = await bootstrapCredit({ suffix: `b${stamp}`, principal: 1200, initial: 0, startDate: overdueStart });
  const refreshed = await rpc("refresh_credit_overdue", { _tenant_id: tenantId, _as_of: today });
  check("Gecikmə hesablanması işə düşdü", Array.isArray(refreshed) ? refreshed.length > 0 : Boolean(refreshed));

  const overdueInstallments = await select(
    "credit_installments", `select=installment_no,due_date,status&credit_id=eq.${b.creditId}&order=installment_no`,
  );
  const expectedOverdue = overdueInstallments.filter((r) => r.due_date < today).length;
  const actualOverdue = overdueInstallments.filter((r) => r.status === "overdue").length;
  check(
    "Vaxtı keçmiş taksitlər 'overdue' oldu",
    expectedOverdue > 0 && actualOverdue === expectedOverdue,
    `gözlənilən=${expectedOverdue}, faktiki=${actualOverdue}`,
  );
  check(
    "Gələcək taksitlər gecikmiş sayılmır",
    overdueInstallments.filter((r) => r.due_date >= today).every((r) => r.status !== "overdue"),
  );

  const [overdueContract] = await select(
    "credit_contracts", `select=status,collection_stage,risk_score&id=eq.${b.creditId}`,
  );
  check("Müqavilə statusu 'overdue' oldu", overdueContract.status === "overdue", overdueContract.status);
  check("Yığım mərhələsi 'current' deyil", overdueContract.collection_stage !== "current", overdueContract.collection_stage);
  check("Risk balı artdı", Number(overdueContract.risk_score) > 0, `risk=${overdueContract.risk_score}`);

  const overdueOutstanding = await outstandingOf(b.creditId);
  check("Ödənişsiz kreditdə qalıq borc tam məbləğdir", Math.round(overdueOutstanding) === 1200, `${overdueOutstanding}`);

  // ---------- C) Ay sonu başlanğıc tarixi ----------
  const c = await bootstrapCredit({ suffix: `c${stamp}`, principal: 1200, initial: 0, startDate: "2026-01-31" });
  const schedule = await select(
    "credit_installments", `select=installment_no,due_date,principal_due&credit_id=eq.${c.creditId}&order=installment_no`,
  );
  check("Ay sonu kredit üçün 12 taksit yarandı", schedule.length === TERM, `${schedule.length}`);
  const expectedDates = Array.from({ length: TERM }, (_, i) => addMonthsClamped("2026-01-31", i + 1));
  const mismatches = schedule.filter((row, i) => row.due_date !== expectedDates[i]);
  check(
    "Bütün taksit tarixləri ayın son gününə düzgün uyğunlaşdı",
    mismatches.length === 0,
    mismatches.length ? JSON.stringify(mismatches.map((m) => m.due_date)) : `${schedule[0].due_date} … ${schedule[TERM - 1].due_date}`,
  );
  check("Fevral taksiti 28-də formalaşdı", schedule[0].due_date === "2026-02-28", schedule[0].due_date);
  const uniqueDates = new Set(schedule.map((r) => r.due_date));
  check("Təkrarlanan taksit tarixi yoxdur", uniqueDates.size === TERM, `${uniqueDates.size}`);
  const scheduleTotal = schedule.reduce((sum, r) => sum + Number(r.principal_due), 0);
  check("Cədvəlin cəmi kredit məbləğinə bərabərdir", Math.round(scheduleTotal * 100) === 1200 * 100, `${scheduleTotal}`);
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
