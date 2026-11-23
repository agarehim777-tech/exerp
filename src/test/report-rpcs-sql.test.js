// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// The reports page calls these RPCs (src/shared/hooks/useReportTotals.ts). They existed only in
// Lovable's drizzle/migrations, so a database built from supabase/migrations answered PGRST202.
// plpgsql checks columns only when a function runs, so each one is called here, as a tenant admin.

const FILE = '20261112100000_report_rpcs.sql';
const TENANT = '00000000-0000-4000-8000-0000000000f1';
const ADMIN = '00000000-0000-4000-8000-0000000000f2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000f3';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.test'), ('${OUTSIDER}', 'outsider@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Reports', 'reports', '${ADMIN}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${ADMIN}', 'admin');
    SET session_replication_role = origin;
  `);
}, 240000);
afterAll(async () => { await db?.close(); });

const asUser = (id) => db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [id]);
const call = async (sql, params) => (await db.query(sql, params)).rows[0].result;

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('runs every report RPC the reports page calls, with the arguments it sends', async () => {
  await asUser(ADMIN);
  const totals = await call(`SELECT public.report_totals($1, NULL, NULL) AS result`, [TENANT]);
  expect(totals).toMatchObject({ revenue: 0, order_count: 0, operating_expense: 0, production_count: 0 });
  const trend = await call(`SELECT public.report_monthly_trend($1, current_date, 6) AS result`, [TENANT]);
  expect(trend).toHaveLength(6);
  expect(await call(`SELECT public.report_risk_rows($1, 8) AS result`, [TENANT])).toEqual([]);
  const summary = await call(`SELECT public.report_module_summary($1, NULL, NULL) AS result`, [TENANT]);
  expect(summary).toEqual(expect.any(Object));
});

it('refuses a user who is not a member of the tenant', async () => {
  await asUser(OUTSIDER);
  await expect(db.query(`SELECT public.report_totals($1) AS result`, [TENANT])).rejects.toThrow('permission_denied');
  await expect(db.query(`SELECT public.report_module_summary($1) AS result`, [TENANT])).rejects.toThrow('permission_denied');
});

it('report_totals counts the booked delivery cost and estimates undelivered orders', async () => {
  const P = '00000000-0000-4000-8000-0000000000a1';
  const O1 = '00000000-0000-4000-8000-0000000000b1';
  const O2 = '00000000-0000-4000-8000-0000000000b2';
  const O3 = '00000000-0000-4000-8000-0000000000b3';
  const JE = '00000000-0000-4000-8000-0000000000c1';
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.products (id, tenant_id, sku, name, cost_price) VALUES ('${P}', '${TENANT}', 'RPT-1', 'Report product', 30);
    INSERT INTO public.orders (id, tenant_id, order_no, order_date, status, total) VALUES
      ('${O1}', '${TENANT}', 'RPT-O1', current_date, 'delivered', 200),
      ('${O2}', '${TENANT}', 'RPT-O2', current_date, 'confirmed', 100),
      ('${O3}', '${TENANT}', 'RPT-O3', current_date, 'cancelled', 500);
    INSERT INTO public.order_items (tenant_id, order_id, product_id, qty, unit_price) VALUES
      ('${TENANT}', '${O1}', '${P}', 2, 100), ('${TENANT}', '${O2}', '${P}', 1, 100), ('${TENANT}', '${O3}', '${P}', 5, 100);
    INSERT INTO public.journal_entries (id, tenant_id, entry_date, reference) VALUES ('${JE}', '${TENANT}', current_date, 'RPT');
    INSERT INTO public.order_accounting_events (tenant_id, order_id, event_type, journal_entry_id, amount, cogs) VALUES
      ('${TENANT}', '${O1}', 'delivery', '${JE}', 200, 55);
    SET session_replication_role = origin;
  `);
  await asUser(ADMIN);
  const totals = await call(`SELECT public.report_totals($1, NULL, NULL) AS result`, [TENANT]);
  // Delivered: the booked 55 (not 2 x 30). Undelivered: 1 x 30 estimated. Cancelled: ignored.
  expect(totals).toMatchObject({ revenue: 300, sales_cost: 85, sales_cost_estimated: 30 });
});

// Codex review of 8f96db2: a warehouse filter fell back to client rows priced at today's cost, and a
// cancelled production batch kept counting next to its corrected replacement.
it('report_totals answers for one warehouse and leaves cancelled production out', async () => {
  const P = '00000000-0000-4000-8000-0000000000a1';
  const W1 = '00000000-0000-4000-8000-0000000000d1';
  const W2 = '00000000-0000-4000-8000-0000000000d2';
  const O1 = '00000000-0000-4000-8000-0000000000b1';
  const O2 = '00000000-0000-4000-8000-0000000000b2';
  const JE = '00000000-0000-4000-8000-0000000000c1';
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.warehouses (id, tenant_id, code, name, created_by) VALUES
      ('${W1}', '${TENANT}', 'W1', 'Mərkəz', '${ADMIN}'), ('${W2}', '${TENANT}', 'W2', 'Filial', '${ADMIN}');
    INSERT INTO public.deliveries (tenant_id, order_id, warehouse_id, delivery_no, status, created_by)
      VALUES ('${TENANT}', '${O1}', '${W1}', 'DLV-1', 'delivered', '${ADMIN}');
    INSERT INTO public.sales_cost_allocations (tenant_id, order_id, order_item_id, warehouse_id, product_id, quantity, unit_cost, total_cost)
      SELECT '${TENANT}', '${O1}', i.id, '${W1}', '${P}', 2, 27.5, 55 FROM public.order_items i WHERE i.order_id = '${O1}';
    INSERT INTO public.stock_reservations (tenant_id, order_id, warehouse_id, product_id, quantity, status, created_by)
      VALUES ('${TENANT}', '${O2}', '${W2}', '${P}', 1, 'active', '${ADMIN}');
    INSERT INTO public.production_batches (tenant_id, batch_no, warehouse_id, product_id, quantity, total_cost, unit_cost,
        valuation_method, journal_entry_id, created_by, completed_at, reversed_at) VALUES
      ('${TENANT}', 'PROD-OK', '${W1}', '${P}', 1, 40, 40, 'fifo', '${JE}', '${ADMIN}', now(), NULL),
      ('${TENANT}', 'PROD-CANCELLED', '${W1}', '${P}', 1, 70, 70, 'fifo', '${JE}', '${ADMIN}', now(), now());
    SET session_replication_role = origin;
  `);
  await asUser(ADMIN);
  const all = await call(`SELECT public.report_totals($1, NULL, NULL) AS result`, [TENANT]);
  expect(all).toMatchObject({ revenue: 300, production_cost: 40, production_count: 1 });
  const w1 = await call(`SELECT public.report_totals($1, NULL, NULL, $2) AS result`, [TENANT, W1]);
  // Only the delivered order of W1, at the cost W1 booked; W1's live production batch.
  expect(w1).toMatchObject({ revenue: 200, order_count: 1, sales_cost: 55, sales_cost_estimated: 0, production_cost: 40 });
  const w2 = await call(`SELECT public.report_totals($1, NULL, NULL, $2) AS result`, [TENANT, W2]);
  expect(w2).toMatchObject({ revenue: 100, order_count: 1, sales_cost: 30, sales_cost_estimated: 30, production_count: 0 });
  const summary = await call(`SELECT public.report_module_summary($1, NULL, NULL) AS result`, [TENANT]);
  expect(summary.production).toMatchObject({ cost: 40, count: 1 });
});
