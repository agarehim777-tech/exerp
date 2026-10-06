// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const warehouse = '33333333-3333-4333-8333-333333333333';
const foreign = '44444444-4444-4444-8444-444444444444';
const row = { product: 'QA Device', sku: 'QA-SKU', warehouseId: warehouse, qty: 7,
  costPrice: 600, salePrice: 900, reorderLevel: 3, serialTracked: true };

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$
      SELECT auth.uid()='${actor}' AND $1='${tenant}' $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.closed',true)='true' THEN RAISE EXCEPTION 'closed_accounting_period'; END IF; END $$;
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,
      operation text,request_hash text,status text DEFAULT 'pending',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
    CREATE TABLE products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,sku text,name text,description text,
      unit text,price numeric,currency text,is_active boolean DEFAULT true,created_by uuid,minimum_stock numeric,updated_at timestamptz,
      UNIQUE(tenant_id,sku));
    CREATE TABLE warehouses(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE stock_balances(tenant_id uuid,warehouse_id uuid,product_id uuid REFERENCES products(id),on_hand numeric,
      reserved numeric,updated_at timestamptz,PRIMARY KEY(tenant_id,warehouse_id,product_id));
    CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,warehouse_id uuid,product_id uuid,
      movement_type text,quantity numeric,unit_cost numeric,reference_type text,reference_id uuid,note text,created_by uuid);
    CREATE TABLE inventory_cost_layers(tenant_id uuid,warehouse_id uuid,product_id uuid,source_movement_id uuid,
      source_type text,source_id uuid,original_qty numeric,remaining_qty numeric,unit_cost numeric);
    CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
    INSERT INTO warehouses VALUES('${warehouse}','${tenant}',true),('${foreign}','${foreign}',true);
    SELECT set_config('test.uid','${actor}',false);
  `);
  const lifecycle = await readFile(new URL('../../supabase/migrations/20261001134507_unify_sales_delivery_reversal_commands.sql', import.meta.url), 'utf8');
  const receipt = lifecycle.slice(lifecycle.indexOf('CREATE OR REPLACE FUNCTION public.receive_stock('),
    lifecycle.indexOf('CREATE OR REPLACE FUNCTION private.guard_sales_child_lifecycle()'));
  if (!receipt) throw new Error('Actual stock receipt migration was not found');
  await db.exec(receipt);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261005120626_atomic_warehouse_csv_import.sql', import.meta.url), 'utf8'));
  return db;
}
const run = (db, key, rows = [row]) => db.query('SELECT public.import_warehouse_stock_atomic($1,$2,$3) result', [tenant,key,rows]);

it('imports persisted catalog, stock, cost layer and audit atomically; replay creates no second receipt', async () => {
  const db = await database();
  try {
    const first = await run(db,'import-1');
    expect(first.rows[0].result.row_count).toBe(1);
    expect((await run(db,'import-1')).rows).toEqual(first.rows);
    const product = (await db.query('SELECT * FROM products')).rows[0];
    expect(product).toMatchObject({ name: 'QA Device', sku: 'QA-SKU', serial_tracked: true });
    expect(Number(product.cost_price)).toBe(600);
    expect(Number(product.price)).toBe(900);
    expect(Number(product.minimum_stock)).toBe(3);
    expect(Number((await db.query('SELECT on_hand FROM stock_balances')).rows[0].on_hand)).toBe(7);
    for (const table of ['stock_movements', 'inventory_cost_layers', 'operation_requests']) {
      expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(1);
    }
    expect((await db.query("SELECT count(*)::int n FROM audit_events WHERE action='csv_import'")).rows[0].n).toBe(1);
    await expect(run(db,'import-1',[{ ...row, qty: 8 }])).rejects.toThrow('payload_mismatch');
    await run(db,'import-2',[{ ...row, costPrice: null, salePrice: null, serialTracked: null, reorderLevel: null, qty: 2 }]);
    const retained = (await db.query('SELECT * FROM products')).rows[0];
    expect(Number(retained.cost_price)).toBe(600);
    expect(Number(retained.price)).toBe(900);
    expect(retained.serial_tracked).toBe(true);
    expect(Number((await db.query('SELECT on_hand FROM stock_balances')).rows[0].on_hand)).toBe(9);
  } finally { await db.close(); }
},30000);

it('rolls back every previous row and the request after an invalid tenant, quantity or metadata value', async () => {
  const db = await database();
  try {
    for (const invalid of [{ warehouseId: foreign }, { qty: 0 }, { qty: 'NaN' }, { costPrice: -1 }, { costPrice: 'Infinity' }]) {
      await expect(run(db,'invalid-import',[row,{ ...row, sku: 'ZZ-INVALID', ...invalid }])).rejects.toThrow();
      for (const table of ['products', 'stock_balances', 'stock_movements', 'inventory_cost_layers', 'audit_events', 'operation_requests']) {
        expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
      }
    }
    await db.exec("SELECT set_config('test.closed','true',false)");
    await expect(run(db,'closed-import')).rejects.toThrow('closed_accounting_period');
    expect((await db.query('SELECT count(*)::int n FROM operation_requests')).rows[0].n).toBe(0);
  } finally { await db.close(); }
},30000);

it('rejects viewers before validation, denies anonymous execution and cannot merge a foreign product', async () => {
  const db = await database();
  try {
    await db.exec(`SELECT set_config('test.uid','${foreign}',false)`);
    await expect(run(db,'',[])).rejects.toThrow('permission_denied');
    await db.exec(`SELECT set_config('test.uid','${actor}',false)`);
    expect((await db.query("SELECT has_function_privilege('anon','public.import_warehouse_stock_atomic(uuid,text,jsonb)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
    await db.exec(`INSERT INTO products(tenant_id,sku,name,currency) VALUES('${foreign}','QA-SKU','Foreign','AZN')`);
    await run(db,'tenant-only');
    expect((await db.query('SELECT count(*)::int n FROM products')).rows[0].n).toBe(2);
    expect((await db.query('SELECT tenant_id FROM stock_movements')).rows[0].tenant_id).toBe(tenant);
  } finally { await db.close(); }
},30000);
