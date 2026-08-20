/**
 * End-to-end yoxlama: sifariş → rezerv → təhvil → anbar azalması → rezervin bağlanması.
 *
 * Test tam izolyasiya olunmuş müvəqqəti şirkət (tenant) yaradır, orada bütün
 * axını icra edir və sonda şirkəti tam silir. Real şirkət məlumatlarına toxunmur.
 *
 * İstifadə:
 *   node scripts/verify-stock-lifecycle.mjs
 * Tələb olunan mühit dəyişənləri (biri):
 *   SUPABASE_ACCESS_TOKEN | LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN
 *   və ya TEST_USER + TEST_PASS
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
let tenantId = null;

try {
  tenantId = await rpc("create_tenant", { _name: `E2E Stok Test ${stamp}`, _slug: `e2e-stock-${stamp}` });
  check("Müvəqqəti test şirkəti yaradıldı", Boolean(tenantId));

  await rpc("seed_default_coa", { _tenant: tenantId });

  const warehouse = await insert("warehouses", { tenant_id: tenantId, code: `E2E-${stamp}`, name: "E2E Anbar" });
  const product = await insert("products", {
    tenant_id: tenantId,
    sku: `E2E-SKU-${stamp}`,
    name: "E2E Test Məhsulu",
    price: 100,
    vat_rate: 0,
  });
  const customer = await insert("customers", { tenant_id: tenantId, name: "E2E Test Müştəri" });

  await insert("stock_balances", {
    tenant_id: tenantId,
    warehouse_id: warehouse.id,
    product_id: product.id,
    sku: product.sku,
    on_hand: 10,
    reserved: 0,
    avg_cost: 60,
  });
  const [seeded] = await select("stock_balances", `select=on_hand,reserved&product_id=eq.${product.id}`);
  check("Başlanğıc qalıq 10, rezerv 0", Number(seeded.on_hand) === 10 && Number(seeded.reserved) === 0,
    `on_hand=${seeded.on_hand}, reserved=${seeded.reserved}`);

  // 1) Sifariş yaradılır → rezerv düşməlidir
  const order = await rpc("create_sales_order_atomic", {
    _tenant_id: tenantId,
    _request_key: `e2e-${stamp}`,
    _order_no: `E2E-${stamp}`,
    _customer_id: customer.id,
    _order_date: new Date().toISOString().slice(0, 10),
    _currency: "AZN",
    _notes: "E2E test",
    _items: [
      {
        line_no: 1,
        product_id: product.id,
        warehouse_id: warehouse.id,
        description: product.name,
        qty: 3,
        unit_price: 100,
        vat_rate: 0,
      },
    ],
    _credit: null,
  });
  const orderId = order?.order_id || order?.id || order;
  check("Sifariş yaradıldı", Boolean(orderId), String(orderId).slice(0, 8));

  const reservations = await select(
    "stock_reservations",
    `select=id,quantity,status&order_id=eq.${orderId}`,
  );
  check(
    "Sifarişdən rezerv yarandı (3 ədəd, aktiv)",
    reservations.length === 1 && Number(reservations[0].quantity) === 3 && reservations[0].status === "active",
    JSON.stringify(reservations),
  );

  const [afterReserve] = await select("stock_balances", `select=on_hand,reserved&product_id=eq.${product.id}`);
  check(
    "Rezervdən sonra qalıq 10, rezerv 3",
    Number(afterReserve.on_hand) === 10 && Number(afterReserve.reserved) === 3,
    `on_hand=${afterReserve.on_hand}, reserved=${afterReserve.reserved}`,
  );
  check(
    "Təhvil əməkdaşı üçün mövcud (sərbəst) qalıq 7-dir",
    Number(afterReserve.on_hand) - Number(afterReserve.reserved) === 7,
  );

  // 2) Təhvil → anbardan azalma + rezervin bağlanması
  await rpc("process_sales_order_status", { _order_id: orderId, _status: "delivered" });

  const [afterDelivery] = await select("stock_balances", `select=on_hand,reserved&product_id=eq.${product.id}`);
  check(
    "Təhvildən sonra anbar qalığı 7-yə düşdü",
    Number(afterDelivery.on_hand) === 7,
    `on_hand=${afterDelivery.on_hand}`,
  );
  check(
    "Təhvildən sonra rezerv 0-a düşdü",
    Number(afterDelivery.reserved) === 0,
    `reserved=${afterDelivery.reserved}`,
  );

  const closed = await select("stock_reservations", `select=status&order_id=eq.${orderId}`);
  check(
    "Rezerv avtomatik bağlandı (fulfilled)",
    closed.length === 1 && closed[0].status === "fulfilled",
    JSON.stringify(closed),
  );

  const outMoves = await select(
    "stock_movements",
    `select=move_type,qty&product_id=eq.${product.id}&move_type=eq.out`,
  );
  check(
    "Çıxış anbar hərəkəti yazıldı (3 ədəd)",
    outMoves.length === 1 && Number(outMoves[0].qty) === 3,
    JSON.stringify(outMoves),
  );

  const [deliveredOrder] = await select("orders", `select=status&id=eq.${orderId}`);
  check("Sifariş statusu 'delivered'", deliveredOrder?.status === "delivered", deliveredOrder?.status);

  // 3) Ləğv → mal anbara qayıdır
  await rpc("process_sales_order_status", { _order_id: orderId, _status: "cancelled" });
  const [afterCancel] = await select("stock_balances", `select=on_hand&product_id=eq.${product.id}`);
  check(
    "Ləğvdən sonra mal anbara qayıtdı (10)",
    Number(afterCancel.on_hand) === 10,
    `on_hand=${afterCancel.on_hand}`,
  );
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
