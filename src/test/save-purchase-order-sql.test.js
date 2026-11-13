// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// save_purchase_order writes a PO header and its lines in one transaction, so a failing line never
// leaves a PO without lines (create) or wipes the lines of an existing PO (edit).

const FILE = '20261113090000_save_purchase_order_atomic.sql';
const TENANT = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000b2';
const VENDOR = '00000000-0000-4000-8000-0000000000b3';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'po@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'PO', 'po', '${USER}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${USER}', 'admin');
    INSERT INTO public.vendors (id, tenant_id, name) VALUES ('${VENDOR}', '${TENANT}', 'Vendor');
    SET session_replication_role = origin;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
}, 240000);
afterAll(async () => { await db?.close(); });

const header = (poNumber) => ({ vendor_id: VENDOR, po_number: poNumber, order_date: '2026-11-13', currency: 'AZN', exchange_rate: 1 });
const line = (sku, qty, price = 10) => ({ product_sku: sku, qty_ordered: qty, unit_price: price, unit: 'ədəd' });
const save = async (poId, head, lines) => (await db.query(
  'SELECT public.save_purchase_order($1, $2, $3::jsonb, $4::jsonb) AS result',
  [TENANT, poId, JSON.stringify(head), JSON.stringify(lines)])).rows[0].result;
const linesOf = async (poId) => (await db.query(
  'SELECT product_sku, qty_ordered::float8 AS qty FROM public.purchase_order_lines WHERE po_id = $1 ORDER BY line_no', [poId])).rows;
const countPos = async (poNumber) => Number((await db.query(
  'SELECT count(*) FROM public.purchase_orders WHERE tenant_id = $1 AND po_number = $2', [TENANT, poNumber])).rows[0].count);

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('creates the header and every line together, as a draft', async () => {
  const { po_id: poId, lines_replaced: replaced } = await save(null, header('PO-ATOMIC-1'), [line('A', 2), line('B', 3)]);
  expect(replaced).toBe(true);
  expect(await linesOf(poId)).toEqual([{ product_sku: 'A', qty: 2 }, { product_sku: 'B', qty: 3 }]);
  const po = (await db.query('SELECT status::text AS status, created_by FROM public.purchase_orders WHERE id = $1', [poId])).rows[0];
  expect(po).toEqual({ status: 'draft', created_by: USER });
});

it('leaves no header behind when a line is invalid on create', async () => {
  await expect(save(null, header('PO-ATOMIC-2'), [line('A', 2), line('B', 0)])).rejects.toThrow();
  expect(await countPos('PO-ATOMIC-2')).toBe(0);
});

it('keeps the old lines when replacing them fails on edit', async () => {
  const { po_id: poId } = await save(null, header('PO-ATOMIC-3'), [line('A', 2)]);
  await expect(save(poId, header('PO-ATOMIC-3-RENAMED'), [line('C', -1)])).rejects.toThrow();
  expect(await linesOf(poId)).toEqual([{ product_sku: 'A', qty: 2 }]);
  expect(await countPos('PO-ATOMIC-3')).toBe(1);
  await save(poId, header('PO-ATOMIC-3-RENAMED'), [line('C', 5)]);
  expect(await linesOf(poId)).toEqual([{ product_sku: 'C', qty: 5 }]);
  expect(await countPos('PO-ATOMIC-3-RENAMED')).toBe(1);
});

it('rejects an empty PO and an unknown PO id', async () => {
  await expect(save(null, header('PO-ATOMIC-4'), [])).rejects.toThrow('po_lines_required');
  await expect(save(crypto.randomUUID(), header('PO-ATOMIC-5'), [line('A', 1)])).rejects.toThrow('po_not_found');
});
