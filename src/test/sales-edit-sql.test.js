// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';

const tenant = '00000000-0000-0000-0000-000000000001';
const order = '10000000-0000-0000-0000-000000000001';
const line = '20000000-0000-0000-0000-000000000001';
const stamp = '2026-10-02T00:00:00Z';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TABLE customers(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid,customer_id uuid,order_no text,order_date date,status text,currency text,
      paid_amount numeric,subtotal numeric,vat_total numeric,tax_total numeric,discount_total numeric,total numeric,notes text,updated_at timestamptz);
    CREATE TABLE order_items(id uuid PRIMARY KEY,tenant_id uuid,order_id uuid,product_id uuid,qty numeric,unit_price numeric,
      discount_pct numeric,vat_rate numeric,tax_rate numeric,line_total numeric,description text);
    CREATE TABLE stock_reservations(order_item_id uuid REFERENCES order_items(id),quantity numeric);
    CREATE TABLE deliveries(tenant_id uuid,order_id uuid,status text);
    CREATE TABLE sales_invoices(tenant_id uuid,order_id uuid,status text);
    CREATE TABLE credit_contracts(id uuid PRIMARY KEY,tenant_id uuid,order_id uuid,status text,initial_payment numeric,required_initial numeric,principal numeric,customer_id uuid);
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,request_hash text,
      status text DEFAULT 'pending',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
    CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
    INSERT INTO customers VALUES('${tenant}','${tenant}');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002140459_atomic_sales_price_edit.sql',import.meta.url),'utf8'));
},60000);
beforeEach(async () => {
  await db.exec(`TRUNCATE stock_reservations,order_items,orders,credit_contracts,operation_requests,audit_events,deliveries,sales_invoices;
    INSERT INTO orders(id,tenant_id,customer_id,order_no,order_date,status,currency,paid_amount,total,updated_at)
      VALUES('${order}','${tenant}','${tenant}','QA','2026-10-02','confirmed','AZN',0,1200,'${stamp}');
    INSERT INTO order_items VALUES('${line}','${tenant}','${order}',NULL,1,1200,0,0,0,1200,'QA line');
    INSERT INTO stock_reservations VALUES('${line}',1);
    INSERT INTO credit_contracts VALUES('${order}','${tenant}','${order}','draft',0,200,1200,'${tenant}');`);
});
afterAll(async () => db?.close());
const payload = () => ({customer_id:tenant,order_date:'2026-10-02',currency:'AZN',notes:'edit',expected_updated_at:stamp,
  items:[{id:line,product_id:null,qty:1,unit_price:1300,discount_pct:0,vat_rate:0,description:'QA line'}]});
const edit = (value=payload(),key='edit',scope=tenant) => db.query('select edit_sales_order_atomic($1,$2,$3,$4::jsonb) result',[scope,key,order,JSON.stringify(value)]);
const current = async () => (await db.query(`select o.total,c.principal,c.required_initial from orders o join credit_contracts c on c.order_id=o.id`)).rows[0];

it('updates pending principal atomically while preserving reservation line IDs and deposit targets', async () => {
  const value=payload();
  const result=await edit(value);
  expect(await current()).toMatchObject({total:'1300.00',principal:'1300.00',required_initial:'200'});
  expect((await db.query('select order_item_id from stock_reservations')).rows[0].order_item_id).toBe(line);
  expect(await edit(value)).toEqual(result);
  expect((await db.query('select count(*)::int n from audit_events')).rows[0].n).toBe(1);
  value.items[0].unit_price=1400;
  await expect(edit(value)).rejects.toThrow('idempotency_key_payload_mismatch');
});
it('calculates decimal net, tax and discount on the server', async () => {
  await db.exec('update credit_contracts set required_initial=0');
  const value=payload(); Object.assign(value.items[0],{unit_price:100.05,discount_pct:10,vat_rate:18});
  await edit(value);
  expect(await current()).toMatchObject({total:'106.26',principal:'106.26'});
});
it('blocks stale, foreign-tenant and duplicate-line requests', async () => {
  await expect(edit({...payload(),expected_updated_at:'2026-10-01'})).rejects.toThrow('stale_sales_edit');
  await expect(edit(payload(),'foreign','00000000-0000-0000-0000-000000000002')).rejects.toThrow('permission_denied');
  const value=payload(); value.items.push(value.items[0]);
  await expect(edit(value)).rejects.toThrow('sales_lines_edit_requires_reversal');
  expect((await current()).total).toBe('1200');
});
it('does not mutate active credit, collected sales or posted invoices', async () => {
  await db.exec("update credit_contracts set status='active'");
  await expect(edit()).rejects.toThrow('active_credit_edit_requires_reversal');
  await db.exec("update credit_contracts set status='pending'; update orders set paid_amount=50");
  await expect(edit()).rejects.toThrow('posted_sales_edit_requires_reversal');
  await db.exec(`update orders set paid_amount=0; insert into sales_invoices values('${tenant}','${order}','draft')`);
  await expect(edit()).rejects.toThrow('posted_sales_edit_requires_reversal');
  expect((await current()).total).toBe('1200');
});
it('rolls back line edits and request records when total falls below planned deposit', async () => {
  const value=payload(); value.items[0].unit_price=100;
  await expect(edit(value)).rejects.toThrow('sales_total_below_deposit_target');
  expect((await db.query('select unit_price from order_items')).rows[0].unit_price).toBe('1200');
  expect((await db.query('select count(*)::int n from operation_requests')).rows[0].n).toBe(0);
});
it('rejects non-finite prices and stock quantity changes without losing reservations', async () => {
  const value=payload(); value.items[0].unit_price='NaN';
  await expect(edit(value)).rejects.toThrow('invalid_sales_price');
  value.items[0].unit_price=1300; value.items[0].qty=2;
  await expect(edit(value)).rejects.toThrow('sales_lines_edit_requires_reversal');
  expect((await db.query('select quantity from stock_reservations')).rows[0].quantity).toBe('1');
});
