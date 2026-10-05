// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const id = n => '11111111-1111-4111-8111-' + String(n).padStart(12, '0');
const [tenant, actor, warehouse, product, po, poLine, shipment, shipmentLine] = Array.from({ length: 8 }, (_, i) => id(i + 1));
async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.edit',true)='true' $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.closed',true)='true' THEN RAISE EXCEPTION 'accounting_period_locked'; END IF; END $$;
    CREATE TABLE procurement_shipments(id uuid PRIMARY KEY,tenant_id uuid,status text,costing_approved_at timestamptz,costing_version int,
      shipment_no text,warehouse_id uuid,received_at timestamptz,received_by uuid,updated_at timestamptz);
    CREATE TABLE procurement_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,receipt_no text,shipment_id uuid UNIQUE,
      warehouse_id uuid,receipt_date date,created_by uuid);
    CREATE TABLE warehouses(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE products(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE purchase_orders(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE purchase_order_lines(id uuid PRIMARY KEY,po_id uuid,product_id uuid);
    CREATE TABLE procurement_shipment_lines(id uuid PRIMARY KEY,tenant_id uuid,shipment_id uuid,po_line_id uuid,received_qty numeric,lot_no text);
    CREATE TABLE procurement_landed_cost_lines(tenant_id uuid,shipment_id uuid,shipment_line_id uuid,costing_version int,is_approved boolean,unit_landed_cost numeric,landed_total numeric);
    CREATE TABLE stock_balances(tenant_id uuid,warehouse_id uuid,product_id uuid,on_hand numeric,PRIMARY KEY(tenant_id,warehouse_id,product_id));
    CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),quantity numeric);
    CREATE TABLE inventory_cost_layers(tenant_id uuid,warehouse_id uuid,product_id uuid,source_movement_id uuid,source_type text,source_id uuid,
      received_at timestamptz,original_qty numeric,remaining_qty numeric,unit_cost numeric);
    CREATE TABLE procurement_receipt_lines(receipt_id uuid,shipment_line_id uuid,product_id uuid,po_line_id uuid,lot_no text,
      received_qty numeric,unit_landed_cost numeric,landed_total numeric,stock_movement_id uuid);
    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,entry_date date,reference text,description text,
      source_type text,source_id uuid,created_by uuid,posted boolean DEFAULT false);
    CREATE TABLE journal_lines(entry_id uuid,account_id uuid,debit numeric,credit numeric,memo text,line_no int);
    CREATE FUNCTION public.ensure_inventory_accounts(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION public.gl_account_by_code(uuid,text) RETURNS uuid LANGUAGE sql AS $$ SELECT $1 $$;
    CREATE FUNCTION public.receive_stock(t uuid,w uuid,p uuid,q numeric,c numeric,rt text,ri uuid,n text) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE movement uuid; BEGIN
      INSERT INTO public.stock_balances VALUES(t,w,p,q) ON CONFLICT(tenant_id,warehouse_id,product_id)
        DO UPDATE SET on_hand=public.stock_balances.on_hand+excluded.on_hand;
      INSERT INTO public.stock_movements(quantity) VALUES(q) RETURNING id INTO movement; RETURN movement; END $$;
    SELECT set_config('test.uid','${actor}',false),set_config('test.edit','true',false);
    INSERT INTO procurement_shipments(id,tenant_id,status,costing_approved_at,costing_version,shipment_no)
      VALUES('${shipment}','${tenant}','costed',now(),1,'QA-SHP');
    INSERT INTO warehouses VALUES('${warehouse}','${tenant}',true);
    INSERT INTO products VALUES('${product}','${tenant}');
    INSERT INTO purchase_orders VALUES('${po}','${tenant}');
    INSERT INTO purchase_order_lines VALUES('${poLine}','${po}','${product}');
    INSERT INTO procurement_shipment_lines VALUES('${shipmentLine}','${tenant}','${shipment}','${poLine}',2,null);
    INSERT INTO procurement_landed_cost_lines VALUES('${tenant}','${shipment}','${shipmentLine}',1,true,50,100);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261004123501_restore_purchase_receipt_posting.sql', import.meta.url), 'utf8'));
  return db;
}
const receive = db => db.query('select public.receive_landed_cost_shipment($1,$2,$3) receipt', [shipment, warehouse, '2026-10-04']);

it('posts inventory, dated valuation and balanced payables once; replay does not post twice', async () => {
  const db = await database();
  try {
    const first = await receive(db);
    expect((await receive(db)).rows).toEqual(first.rows);
    expect(Number((await db.query('select on_hand from stock_balances')).rows[0].on_hand)).toBe(2);
    expect((await db.query('select count(*)::int n from inventory_cost_layers')).rows[0].n).toBe(1);
    expect((await db.query('select count(*)::int n from journal_entries where posted')).rows[0].n).toBe(1);
    const money = (await db.query('select sum(debit) debit,sum(credit) credit from journal_lines')).rows[0];
    expect(Number(money.debit)).toBe(100); expect(Number(money.credit)).toBe(100);
    await expect(db.query('select public.receive_landed_cost_shipment($1,$2,$3)', [shipment, warehouse, '2026-10-05']))
      .rejects.toThrow('receipt_replay_payload_mismatch');
    await db.exec('DELETE FROM journal_entries');
    await expect(receive(db)).rejects.toThrow('existing_receipt_posting_missing');
  } finally { await db.close(); }
}, 30000);

it('rejects a closed receipt date without leaving stock or receipts', async () => {
  const db = await database();
  try {
    await db.exec("SELECT set_config('test.closed','true',false)");
    await expect(receive(db)).rejects.toThrow('accounting_period_locked');
    expect((await db.query('select count(*)::int n from stock_balances')).rows[0].n).toBe(0);
    expect((await db.query('select count(*)::int n from procurement_receipts')).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 30000);

it('rejects foreign cost lines and missing edit authorization before posting', async () => {
  const db = await database();
  try {
    await db.exec("SELECT set_config('test.edit','false',false)");
    await expect(receive(db)).rejects.toThrow('permission_denied');
    await db.exec(`SELECT set_config('test.edit','true',false); UPDATE procurement_landed_cost_lines SET tenant_id='${id(99)}'`);
    await expect(receive(db)).rejects.toThrow('invalid_receipt_line');
    expect((await db.query('select count(*)::int n from journal_entries')).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 30000);
