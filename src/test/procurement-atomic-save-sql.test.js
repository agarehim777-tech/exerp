// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// save_goods_receipt / save_vendor_invoice keep header and lines in one transaction. Before, the page
// replaced lines in separate requests, so a failed insert left a GRN or invoice without lines.
const FILE = '20261123090000_save_receipt_invoice_atomic.sql';
const TENANT = '00000000-0000-4000-8000-0000000000d1';
const USER = '00000000-0000-4000-8000-0000000000d2';
const VENDOR = '00000000-0000-4000-8000-0000000000d3';
const PO = '00000000-0000-4000-8000-0000000000d4';
const LINE1 = '00000000-0000-4000-8000-0000000000d5';
const LINE2 = '00000000-0000-4000-8000-0000000000d6';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'buyer@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Buy', 'buy', '${USER}');
    INSERT INTO public.vendors (id, tenant_id, name) VALUES ('${VENDOR}', '${TENANT}', 'Zavod');
    INSERT INTO public.purchase_orders (id, tenant_id, vendor_id, po_number, status, created_by)
      VALUES ('${PO}', '${TENANT}', '${VENDOR}', 'PO-1', 'approved', '${USER}');
    INSERT INTO public.purchase_order_lines (id, po_id, line_no, product_sku, qty_ordered, unit_price)
      VALUES ('${LINE1}', '${PO}', 1, 'SKU-1', 10, 5), ('${LINE2}', '${PO}', 2, 'SKU-2', 4, 8);
    SET session_replication_role = origin;
    -- The buyer is a procurement member; the guards and the landed-cost sync check it.
    CREATE OR REPLACE FUNCTION private.has_module_access(_tenant uuid, _module text, _action text DEFAULT 'view')
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
    CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
}, 240000);
afterAll(async () => { await db?.close(); });

const poStatus = async () => (await db.query(`SELECT status::text AS s FROM public.purchase_orders WHERE id = $1`, [PO])).rows[0].s;
const grnLines = async (grn) => (await db.query(
  `SELECT po_line_id, qty_received::float AS q FROM public.goods_receipt_lines WHERE grn_id = $1 ORDER BY po_line_id`, [grn])).rows;
const saveGrn = (grn, lines, number = 'GRN-1') => db.query(`SELECT public.save_goods_receipt($1, $2, $3, $4) AS r`,
  [TENANT, grn, JSON.stringify({ po_id: PO, grn_number: number, receipt_date: '2026-11-23' }), JSON.stringify(lines)]);

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('creates a GRN with its lines and sets the PO status', async () => {
  const { rows: [{ r }] } = await saveGrn(null, [{ po_line_id: LINE1, qty_received: 4, qty_rejected: 0 }]);
  expect(r.po_status).toBe('partial');
  expect(await grnLines(r.grn_id)).toEqual([{ po_line_id: LINE1, q: 4 }]);
  globalThis.grn = r.grn_id;
});

it('replaces the lines on edit and marks the PO received when everything arrived', async () => {
  const { rows: [{ r }] } = await saveGrn(globalThis.grn, [
    { po_line_id: LINE1, qty_received: 10, qty_rejected: 0 }, { po_line_id: LINE2, qty_received: 4, qty_rejected: 0 },
  ], 'GRN-1A');
  expect(r.po_status).toBe('received');
  expect(await grnLines(globalThis.grn)).toEqual([{ po_line_id: LINE1, q: 10 }, { po_line_id: LINE2, q: 4 }]);
});

it('keeps the old header and lines when a new line is rejected', async () => {
  // qty_received must be > 0: the whole save rolls back, the GRN keeps its previous lines and number.
  await expect(saveGrn(globalThis.grn, [{ po_line_id: LINE1, qty_received: 0 }], 'GRN-BROKEN')).rejects.toThrow();
  expect(await grnLines(globalThis.grn)).toEqual([{ po_line_id: LINE1, q: 10 }, { po_line_id: LINE2, q: 4 }]);
  const { rows: [{ n }] } = await db.query(`SELECT grn_number AS n FROM public.goods_receipts WHERE id = $1`, [globalThis.grn]);
  expect(n).toBe('GRN-1A');
  expect(await poStatus()).toBe('received');
});

it('saves a vendor invoice with its lines and rolls back a broken edit', async () => {
  const header = { vendor_id: VENDOR, po_id: PO, invoice_number: 'INV-1', currency: 'AZN' };
  const { rows: [{ r }] } = await db.query(`SELECT public.save_vendor_invoice($1, NULL, $2, $3) AS r`,
    [TENANT, JSON.stringify(header), JSON.stringify([{ po_line_id: LINE1, qty_invoiced: 10, unit_price: 5, tax_rate: 18 }])]);
  const lines = async () => (await db.query(
    `SELECT qty_invoiced::float AS q FROM public.vendor_invoice_lines WHERE invoice_id = $1`, [r.invoice_id])).rows;
  expect(await lines()).toEqual([{ q: 10 }]);
  const { rows: [{ status, created_by: createdBy }] } = await db.query(
    `SELECT status::text AS status, created_by FROM public.vendor_invoices WHERE id = $1`, [r.invoice_id]);
  expect([status, createdBy]).toEqual(['draft', USER]);
  await expect(db.query(`SELECT public.save_vendor_invoice($1, $2, $3, $4)`, [TENANT, r.invoice_id,
    JSON.stringify({ ...header, invoice_number: 'INV-1B' }), JSON.stringify([{ po_line_id: LINE1, qty_invoiced: -1, unit_price: 5 }])]))
    .rejects.toThrow();
  expect(await lines()).toEqual([{ q: 10 }]);
});

it('refuses an empty line list', async () => {
  await expect(saveGrn(null, [], 'GRN-2')).rejects.toThrow('grn_lines_required');
});

// The shipment guard counted the upserted shipment line twice, so one GRN that received a whole PO with
// several lines failed with "Göndərilən miqdar sifariş qalığından artıq ola bilməz".
it('receives a whole multi-line PO in one GRN', async () => {
  const po = '00000000-0000-4000-8000-0000000000d7';
  const [a, b] = ['00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000d9'];
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.purchase_orders (id, tenant_id, vendor_id, po_number, status, created_by)
      VALUES ('${po}', '${TENANT}', '${VENDOR}', 'PO-2', 'approved', '${USER}');
    INSERT INTO public.purchase_order_lines (id, po_id, line_no, product_sku, qty_ordered, unit_price)
      VALUES ('${a}', '${po}', 1, 'SKU-A', 6, 5), ('${b}', '${po}', 2, 'SKU-B', 3, 8);
    SET session_replication_role = origin;
  `);
  const { rows: [{ r }] } = await db.query(`SELECT public.save_goods_receipt($1, NULL, $2, $3) AS r`, [TENANT,
    JSON.stringify({ po_id: po, grn_number: 'GRN-PO2' }),
    JSON.stringify([{ po_line_id: a, qty_received: 6 }, { po_line_id: b, qty_received: 3 }])]);
  expect(r.po_status).toBe('received');
  const { rows } = await db.query(
    `SELECT shipped_qty::float AS q FROM public.procurement_shipment_lines WHERE po_line_id IN ($1, $2) ORDER BY q`, [a, b]);
  expect(rows).toEqual([{ q: 3 }, { q: 6 }]);
});
