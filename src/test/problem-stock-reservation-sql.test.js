// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// Quarantined (problem) stock is not sellable. Lovable's drizzle/migrations/0017 re-implemented this
// in reserve_stock and mark_sales_order_delivered, but it would also drop guards the repo has
// (order_not_reservable, scope and order-item checks), so it is deliberately not ported: the repo's
// reserve_stock (20261001134507) already reserves only on_hand - reserved - problem_qty. This test
// runs the real function on the replayed schema so that stays true.

const TENANT = '00000000-0000-4000-8000-0000000000d1';
const ADMIN = '00000000-0000-4000-8000-0000000000d2';
const WAREHOUSE = '00000000-0000-4000-8000-0000000000d3';
const PRODUCT = '00000000-0000-4000-8000-0000000000d4';

let db;

beforeAll(async () => {
  ({ db } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'stock-admin@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Stock', 'stock', '${ADMIN}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${ADMIN}', 'admin');
    INSERT INTO public.warehouses (id, tenant_id, code, name, is_active, created_by) VALUES ('${WAREHOUSE}', '${TENANT}', 'W1', 'Main', true, '${ADMIN}');
    INSERT INTO public.products (id, tenant_id, sku, name, created_by) VALUES ('${PRODUCT}', '${TENANT}', 'SKU-1', 'Phone', '${ADMIN}');
    INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id, on_hand, reserved, problem_qty)
      VALUES ('${TENANT}', '${WAREHOUSE}', '${PRODUCT}', 5, 0, 2);
    SET session_replication_role = origin;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [ADMIN]);
}, 240000);
afterAll(async () => { await db?.close(); });

async function newOrder(status = 'confirmed') {
  const id = crypto.randomUUID();
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.orders (id, tenant_id, order_no, status, created_by)
      VALUES ('${id}', '${TENANT}', 'SO-${id.slice(0, 8)}', '${status}', '${ADMIN}');
    SET session_replication_role = origin;
  `);
  return id;
}

const reserve = (orderId, quantity) => db.query(
  `SELECT public.reserve_stock($1, $2, $3, $4, NULL, $5) AS id`, [TENANT, WAREHOUSE, PRODUCT, orderId, quantity]);
const balance = async () => (await db.query(
  `SELECT on_hand::float8 AS on_hand, reserved::float8 AS reserved, problem_qty::float8 AS problem_qty
     FROM public.stock_balances WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
  [TENANT, WAREHOUSE, PRODUCT])).rows[0];

it('does not reserve quarantined units: 5 on hand with 2 problem leaves 3 sellable', async () => {
  const order = await newOrder();
  await expect(reserve(order, 4)).rejects.toThrow('insufficient_available_stock');
  await reserve(order, 3);
  expect(await balance()).toEqual({ on_hand: 5, reserved: 3, problem_qty: 2 });
  await expect(reserve(await newOrder(), 1)).rejects.toThrow('insufficient_available_stock');
});

it('keeps the guards drizzle 0017 would have dropped', async () => {
  await expect(reserve(await newOrder('cancelled'), 1)).rejects.toThrow('order_not_reservable');
  await expect(reserve(crypto.randomUUID(), 1)).rejects.toThrow('order_not_found');
});
