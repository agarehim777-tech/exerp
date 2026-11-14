// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// These functions failed on every call (supabase db lint, 2026-11-14): two wrote the removed
// stock_movements.move_type/qty columns and production's reverse_cash_transaction cast to a type that
// does not exist. plpgsql only checks such statements when they run, so each one is called here.

const TENANT = '00000000-0000-4000-8000-0000000000a1';
const ADMIN = '00000000-0000-4000-8000-0000000000a2';
const WAREHOUSE = '00000000-0000-4000-8000-0000000000a3';
const PRODUCT = '00000000-0000-4000-8000-0000000000a4';
const ACCOUNT = '00000000-0000-4000-8000-0000000000a5';

let db;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const seed = (sql) => db.exec(`SET session_replication_role = replica; ${sql}; SET session_replication_role = origin;`);

beforeAll(async () => {
  ({ db } = await replayMigrations());
  await seed(`
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'calls@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Calls', 'calls', '${ADMIN}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${ADMIN}', 'admin');
    INSERT INTO public.warehouses (id, tenant_id, code, name, is_active, created_by) VALUES ('${WAREHOUSE}', '${TENANT}', 'W1', 'Main', true, '${ADMIN}');
    INSERT INTO public.products (id, tenant_id, sku, name, created_by) VALUES ('${PRODUCT}', '${TENANT}', 'SKU-1', 'Phone', '${ADMIN}');
    INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id, on_hand, reserved, problem_qty, avg_cost)
      VALUES ('${TENANT}', '${WAREHOUSE}', '${PRODUCT}', 10, 2, 0, 50);
    INSERT INTO public.cash_accounts (id, tenant_id, code, name, currency, opening_balance)
      VALUES ('${ACCOUNT}', '${TENANT}', 'K1', 'Kassa', 'AZN', 0)`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [ADMIN]);
}, 240000);
afterAll(async () => { await db?.close(); });

it('deletes an unshipped sale and releases its reservation', async () => {
  const order = crypto.randomUUID();
  await seed(`
    INSERT INTO public.orders (id, tenant_id, order_no, status, created_by, paid_amount)
      VALUES ('${order}', '${TENANT}', 'SO-DEL-1', 'confirmed', '${ADMIN}', 0);
    INSERT INTO public.stock_reservations (tenant_id, warehouse_id, product_id, order_id, quantity, status, created_by)
      VALUES ('${TENANT}', '${WAREHOUSE}', '${PRODUCT}', '${order}', 2, 'active', '${ADMIN}')`);
  await db.query('SELECT public.delete_sales_order_safe($1)', [order]);
  expect((await one('SELECT count(*)::int AS n FROM public.orders WHERE id = $1', [order])).n).toBe(0);
  expect(Number((await one(`SELECT reserved FROM public.stock_balances WHERE product_id = $1`, [PRODUCT])).reserved)).toBe(0);
  const release = await one(`SELECT movement_type, quantity::float8 AS q FROM public.stock_movements
    WHERE tenant_id = $1 AND reference_type = 'stock_reservation' ORDER BY created_at DESC LIMIT 1`, [TENANT]);
  expect(release).toEqual({ movement_type: 'release', q: -2 });
});

it('completes a customer return back into sellable stock', async () => {
  const ret = crypto.randomUUID();
  await seed(`
    INSERT INTO public.inventory_returns (id, tenant_id, return_no, return_type, status, warehouse_id, created_by)
      VALUES ('${ret}', '${TENANT}', 'RET-1', 'customer', 'inspection', '${WAREHOUSE}', '${ADMIN}');
    INSERT INTO public.inventory_return_lines (tenant_id, return_id, product_id, quantity, condition, disposition, unit_cost)
      VALUES ('${TENANT}', '${ret}', '${PRODUCT}', 3, 'saleable', 'restock', 50)`);
  const before = Number((await one('SELECT on_hand FROM public.stock_balances WHERE product_id = $1', [PRODUCT])).on_hand);
  await db.query('SELECT public.complete_inventory_return($1)', [ret]);
  expect((await one('SELECT status FROM public.inventory_returns WHERE id = $1', [ret])).status).toBe('completed');
  expect(Number((await one('SELECT on_hand FROM public.stock_balances WHERE product_id = $1', [PRODUCT])).on_hand)).toBe(before + 3);
  const line = await one('SELECT stock_movement_id FROM public.inventory_return_lines WHERE return_id = $1', [ret]);
  expect(line.stock_movement_id).toBeTruthy();
});

it('reverses a cash transaction with the opposite direction', async () => {
  const tx = crypto.randomUUID();
  await seed(`
    INSERT INTO public.cash_transactions (id, tenant_id, account_id, transaction_no, direction, amount, category, created_by)
      VALUES ('${tx}', '${TENANT}', '${ACCOUNT}', 'KAS-TEST-1', 'in', 100, 'other_income', '${ADMIN}')`);
  const { id } = await one('SELECT public.reverse_cash_transaction($1, $2, $3) AS id', [TENANT, tx, 'Səhv daxil edilib']);
  const reversal = await one('SELECT direction, amount::float8 AS amount, reversal_of FROM public.cash_transactions WHERE id = $1', [id]);
  expect(reversal).toEqual({ direction: 'out', amount: 100, reversal_of: tx });
});

it('checks RLS helper grants without error', async () => {
  const result = (await one('SELECT public.ensure_rls_helper_grants() AS r')).r;
  expect(result).toMatchObject({ healthy: expect.any(Boolean) });
});
