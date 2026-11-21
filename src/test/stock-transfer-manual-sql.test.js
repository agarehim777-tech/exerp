// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// transfer_stock and post_manual_stock_movement on the fully replayed schema. The Anbar page used to
// insert legacy-column rows (move_type/qty) that the table no longer has, so these flows always failed.
const FILE = '20261122090000_stock_transfer_manual_commands.sql';
const TENANT = '00000000-0000-4000-8000-0000000000f1';
const USER = '00000000-0000-4000-8000-0000000000f2';
const MAIN = '00000000-0000-4000-8000-0000000000f3';
const SHOP = '00000000-0000-4000-8000-0000000000f4';
const PRODUCT = '00000000-0000-4000-8000-0000000000f5';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'stock@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Stock', 'stock', '${USER}');
    INSERT INTO public.warehouses (id, tenant_id, code, name, is_active, created_by) VALUES
      ('${MAIN}', '${TENANT}', 'MAIN', 'Əsas anbar', true, '${USER}'), ('${SHOP}', '${TENANT}', 'SHOP', 'Mağaza', true, '${USER}');
    INSERT INTO public.products (id, tenant_id, name, sku, price, created_by) VALUES ('${PRODUCT}', '${TENANT}', 'Kabel', 'KBL-1', 10, '${USER}');
    SET session_replication_role = origin;
    -- Permission is tested through this switch; the real check needs the whole membership model.
    CREATE OR REPLACE FUNCTION private.has_module_access(_tenant uuid, _module text, _action text DEFAULT 'view')
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.allow', true) = 'on' $$;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
  await db.query(`SELECT set_config('test.allow', 'on', false)`);
  // Two receipts at different costs: 10 x 2.00 then 10 x 4.00 (FIFO layers).
  await db.query(`SELECT public.receive_stock($1, $2, $3, 10, 2, NULL, NULL, 'Mədaxil 1')`, [TENANT, MAIN, PRODUCT]);
  await db.query(`SELECT public.receive_stock($1, $2, $3, 10, 4, NULL, NULL, 'Mədaxil 2')`, [TENANT, MAIN, PRODUCT]);
}, 240000);
afterAll(async () => { await db?.close(); });

const balance = async (warehouse) => (await db.query(
  `SELECT on_hand::float AS on_hand, avg_cost::float AS avg_cost FROM public.stock_balances
    WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`, [TENANT, warehouse, PRODUCT])).rows[0];
const layers = async (warehouse) => (await db.query(
  `SELECT remaining_qty::float AS qty, unit_cost::float AS cost FROM public.inventory_cost_layers
    WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND remaining_qty > 0 ORDER BY received_at, id`,
  [TENANT, warehouse, PRODUCT])).rows;
const sqlError = async (promise) => { try { await promise; return null; } catch (error) { return error.message; } };

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('moves stock between warehouses at FIFO cost and keeps layers and balances in step', async () => {
  const { rows: [{ result }] } = await db.query(
    `SELECT public.transfer_stock($1, $2, $3, $4, 12, 'Mağazaya') AS result`, [TENANT, MAIN, SHOP, PRODUCT]);
  // 10 x 2.00 + 2 x 4.00 = 28.00 for 12 units.
  expect(result.quantity).toBe(12);
  expect(Number(result.unit_cost)).toBeCloseTo(28 / 12, 5);
  expect(await balance(MAIN)).toMatchObject({ on_hand: 8 });
  expect(await layers(MAIN)).toEqual([{ qty: 8, cost: 4 }]);
  const shop = await balance(SHOP);
  expect(shop.on_hand).toBe(12);
  expect(shop.avg_cost).toBeCloseTo(28 / 12, 2);
  expect(await layers(SHOP)).toHaveLength(1);
  const { rows } = await db.query(
    `SELECT movement_type, quantity::float AS quantity FROM public.stock_movements
      WHERE reference_type = 'stock_transfer' ORDER BY movement_type`);
  expect(rows).toEqual([{ movement_type: 'transfer_in', quantity: 12 }, { movement_type: 'transfer_out', quantity: -12 }]);
});

it('refuses a transfer larger than the available stock or to the same warehouse', async () => {
  expect(await sqlError(db.query(`SELECT public.transfer_stock($1, $2, $3, $4, 9)`, [TENANT, MAIN, SHOP, PRODUCT])))
    .toContain('insufficient_stock');
  expect(await sqlError(db.query(`SELECT public.transfer_stock($1, $2, $2, $3, 1)`, [TENANT, MAIN, PRODUCT])))
    .toContain('invalid_stock_transfer');
  expect(await balance(MAIN)).toMatchObject({ on_hand: 8 });
});

it('writes stock off at layer cost', async () => {
  await db.query(`SELECT public.post_manual_stock_movement($1, $2, $3, 'out', 3, NULL, 'AKT-1', 'Zədələnib')`, [TENANT, MAIN, PRODUCT]);
  expect(await balance(MAIN)).toMatchObject({ on_hand: 5 });
  expect(await layers(MAIN)).toEqual([{ qty: 5, cost: 4 }]);
  const { rows: [row] } = await db.query(
    `SELECT movement_type, quantity::float AS quantity, unit_cost::float AS unit_cost, note FROM public.stock_movements
      WHERE reference_type = 'manual_write_off'`);
  expect(row).toEqual({ movement_type: 'write_off', quantity: -3, unit_cost: 4, note: 'AKT-1 · Zədələnib' });
});

it('corrects a count up at the given cost and down like a write-off', async () => {
  await db.query(`SELECT public.post_manual_stock_movement($1, $2, $3, 'adjust', 5, 6)`, [TENANT, MAIN, PRODUCT]);
  const up = await balance(MAIN);
  expect(up.on_hand).toBe(10);
  // avg_cost is the moving average (3.00 after the two receipts; outflows keep it), FIFO lives in the layers.
  expect(up.avg_cost).toBeCloseTo((5 * 3 + 5 * 6) / 10, 4);
  await db.query(`SELECT public.post_manual_stock_movement($1, $2, $3, 'adjust', -6)`, [TENANT, MAIN, PRODUCT]);
  expect(await balance(MAIN)).toMatchObject({ on_hand: 4 });
  expect(await layers(MAIN)).toEqual([{ qty: 4, cost: 6 }]);
});

it('rejects bad input and users without warehouse edit access', async () => {
  expect(await sqlError(db.query(`SELECT public.post_manual_stock_movement($1, $2, $3, 'out', -1)`, [TENANT, MAIN, PRODUCT])))
    .toContain('invalid_stock_quantity');
  expect(await sqlError(db.query(`SELECT public.post_manual_stock_movement($1, $2, $3, 'out', 100)`, [TENANT, MAIN, PRODUCT])))
    .toContain('insufficient_stock');
  await db.query(`SELECT set_config('test.allow', 'off', false)`);
  try {
    expect(await sqlError(db.query(`SELECT public.transfer_stock($1, $2, $3, $4, 1)`, [TENANT, MAIN, SHOP, PRODUCT])))
      .toContain('permission_denied');
    expect(await sqlError(db.query(`SELECT public.post_manual_stock_movement($1, $2, $3, 'out', 1)`, [TENANT, MAIN, PRODUCT])))
      .toContain('permission_denied');
  } finally {
    await db.query(`SELECT set_config('test.allow', 'on', false)`);
  }
  expect(await balance(MAIN)).toMatchObject({ on_hand: 4 });
});
