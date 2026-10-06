// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const customer = '33333333-3333-4333-8333-333333333333';
const account = '44444444-4444-4444-8444-444444444444';
const foreign = '55555555-5555-4555-8555-555555555555';
const order = '66666666-6666-4666-8666-666666666666';
const line = { description: 'Service', qty: '3', unit_price: '10.01', discount_pct: '10', vat_rate: '18' };
const payload = { customer_id: customer, invoice_date: '2026-10-06', lines: [line] };

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$
      SELECT auth.uid()='${actor}' AND $1='${tenant}' $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.closed',true)='true' THEN RAISE EXCEPTION 'accounting_period_locked'; END IF; END $$;
    CREATE TYPE sales_invoice_status AS ENUM('draft','issued','partial','paid','overdue','cancelled');
    CREATE TABLE customers(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE products(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid,customer_id uuid,status text,currency text,
      total numeric,vat_total numeric,paid_amount numeric DEFAULT 0);
    CREATE TABLE cash_accounts(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean,currency text,type text,gl_account_id uuid);
    CREATE TABLE chart_of_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,code text);
    CREATE FUNCTION public.gl_account_by_code(uuid,text) RETURNS uuid LANGUAGE sql AS $$
      SELECT id FROM public.chart_of_accounts WHERE tenant_id=$1 AND code=$2 $$;
  `);
  await db.exec(`
    CREATE TABLE sales_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,invoice_no text,
      customer_id uuid REFERENCES customers(id),order_id uuid REFERENCES orders(id),invoice_date date,due_date date,currency text,
      notes text,created_by uuid,subtotal numeric DEFAULT 0,vat_total numeric DEFAULT 0,total numeric DEFAULT 0,
      paid_amount numeric DEFAULT 0,status sales_invoice_status DEFAULT 'draft',posted boolean DEFAULT false,
      journal_entry_id uuid,updated_at timestamptz,UNIQUE(tenant_id,invoice_no));
    CREATE FUNCTION public.generate_doc_number(uuid,text,text,text) RETURNS text LANGUAGE sql AS $$
      SELECT 'INV-2026-'||lpad((count(*)+1)::text,4,'0') FROM public.sales_invoices WHERE tenant_id=$1 $$;
    CREATE TABLE sales_invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,invoice_id uuid REFERENCES sales_invoices(id),
      product_id uuid,line_no integer,description text,qty numeric(18,3),unit_price numeric(18,2),discount_pct numeric(6,2),vat_rate numeric(6,2),line_total numeric(18,2));
    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,entry_date date,reference text,
      description text,source_type text,source_id uuid,created_by uuid,posted boolean DEFAULT false);
    CREATE TABLE journal_lines(entry_id uuid REFERENCES journal_entries(id),account_id uuid REFERENCES chart_of_accounts(id),
      debit numeric,credit numeric,memo text,line_no integer);
    CREATE TABLE cash_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,account_id uuid,
      direction text,amount numeric,currency text,category text,reference_type text,reference_id uuid,reference text,
      customer_id uuid,description text,occurred_at timestamptz,created_by uuid,reversal_of uuid UNIQUE REFERENCES cash_transactions(id));
    CREATE TABLE invoice_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,invoice_id uuid REFERENCES sales_invoices(id),
      account_id uuid,amount numeric,currency text,method text,reference text,paid_at date,created_by uuid);
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,
      operation text,request_hash text,status text DEFAULT 'processing',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
    CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
    CREATE TABLE order_accounting_events(tenant_id uuid,order_id uuid,event_type text,journal_entry_id uuid);
    INSERT INTO customers VALUES('${customer}','${tenant}'),('${foreign}','${foreign}');
    INSERT INTO cash_accounts VALUES('${account}','${tenant}',true,'AZN','cash',null),('${foreign}','${foreign}',true,'AZN','cash',null);
    INSERT INTO chart_of_accounts(tenant_id,code) SELECT '${tenant}',unnest(ARRAY['1200','4000','2100','1000','1010']);
    INSERT INTO orders VALUES('${order}','${tenant}','${customer}','confirmed','AZN',31.90,4.87,10);
    GRANT INSERT,UPDATE,DELETE ON sales_invoices,sales_invoice_lines,invoice_payments TO authenticated;
    SELECT set_config('test.uid','${actor}',false);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006062828_atomic_sales_invoice_commands.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006131851_enforce_sales_invoice_decimal_scale.sql',import.meta.url),'utf8'));
  await db.exec('CREATE TRIGGER invoice_payment_sync AFTER INSERT OR UPDATE OR DELETE ON invoice_payments FOR EACH ROW EXECUTE FUNCTION sync_invoice_payment()');
  return db;
}

const create = async (db,key='invoice-1',data=payload) => (await db.query(
  'SELECT public.create_sales_invoice_atomic($1,$2,$3) result',[tenant,key,data])).rows[0].result;
const pay = async (db,id,key='payment-1',data={}) => (await db.query(
  'SELECT public.record_invoice_payment_atomic($1,$2,$3) result',
  [tenant,key,{ invoice_id:id,amount:'15.10',account_id:account,paid_at:'2026-10-06',...data }])).rows[0].result;
async function balanced(db) {
  expect((await db.query('SELECT entry_id FROM journal_lines GROUP BY entry_id HAVING sum(debit)<>sum(credit)')).rows).toEqual([]);
}

it('uses server decimal totals and rolls back the entire invoice on any bad child, tenant or period',async () => {
  const db = await database();
  try {
    for (const patch of [{ qty:'NaN' },{ unit_price:'Infinity' },{ discount_pct:'101' },{ vat_rate:'-1' },{ product_id:foreign },
      { qty:'1.0001' },{ unit_price:'10.005' },{ discount_pct:'0.001' },{ vat_rate:'18.001' }]) {
      await expect(create(db,'invalid',{...payload,lines:[line,{...line,...patch}]})).rejects.toThrow();
      for (const table of ['sales_invoices','sales_invoice_lines','operation_requests','audit_events']) {
        expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
      }
    }
    await expect(create(db,'foreign',{...payload,customer_id:foreign})).rejects.toThrow('customer_not_found');
    await db.exec("SELECT set_config('test.closed','true',false)");
    await expect(create(db)).rejects.toThrow('accounting_period_locked');
    await db.exec("SELECT set_config('test.closed','false',false)");
    const first = await create(db);
    expect(Number(first.total)).toBe(31.90);
    expect(Number(first.vat_total)).toBe(4.87);
    expect(await create(db)).toEqual(first);
    await expect(create(db,'invoice-1',{...payload,notes:'changed'})).rejects.toThrow('payload_mismatch');
    expect((await db.query('SELECT count(*)::int n FROM sales_invoice_lines')).rows[0].n).toBe(1);
  } finally { await db.close(); }
},30000);

it('posts one balanced journal and atomic cash receipt; retries and cash reversal never duplicate or lose debt',async () => {
  const db = await database();
  try {
    const inv = await create(db);
    await expect(pay(db,inv.invoice_id)).rejects.toThrow('invoice_posting_required');
    const post = (await db.query('SELECT post_invoice_to_gl($1) id',[inv.invoice_id])).rows[0].id;
    expect((await db.query('SELECT post_invoice_to_gl($1) id',[inv.invoice_id])).rows[0].id).toBe(post);
    await expect(pay(db,inv.invoice_id,'foreign',{ account_id:foreign })).rejects.toThrow('account_not_found');
    await db.exec("DELETE FROM chart_of_accounts WHERE code='1000'");
    await expect(pay(db,inv.invoice_id)).rejects.toThrow('chart_of_accounts_incomplete');
    expect((await db.query('SELECT count(*)::int n FROM invoice_payments')).rows[0].n).toBe(0);
    expect(Number((await db.query('SELECT paid_amount FROM sales_invoices')).rows[0].paid_amount)).toBe(0);
    await db.exec(`INSERT INTO chart_of_accounts(tenant_id,code) VALUES('${tenant}','1000')`);
    const payment = await pay(db,inv.invoice_id);
    expect(await pay(db,inv.invoice_id)).toEqual(payment);
    expect((await db.query('SELECT post_payment_to_gl($1) id',[payment.payment_id])).rows[0].id).toBe(payment.journal_entry_id);
    expect((await db.query('SELECT count(*)::int n FROM cash_transactions')).rows[0].n).toBe(1);
    await expect(db.query('UPDATE cash_transactions SET amount=1 WHERE id=$1',[payment.transaction_id])).rejects.toThrow('invoice_cash_is_immutable');
    await expect(db.query('DELETE FROM cash_transactions WHERE id=$1',[payment.transaction_id])).rejects.toThrow('invoice_cash_is_immutable');
    await expect(db.query(`INSERT INTO cash_transactions(tenant_id,account_id,direction,amount,currency,category,occurred_at,reversal_of,created_by)
      SELECT tenant_id,account_id,'out',1,currency,'transaction_reversal',now(),id,'${actor}' FROM cash_transactions WHERE id=$1`,[payment.transaction_id]))
      .rejects.toThrow('invoice_cash_reversal_mismatch');
    await expect(pay(db,inv.invoice_id,'overpay',{ amount:'21' })).rejects.toThrow('invalid_amount');
    await balanced(db);
    await db.query(`INSERT INTO cash_transactions(tenant_id,account_id,direction,amount,currency,category,occurred_at,reversal_of,created_by)
      SELECT tenant_id,account_id,'out',amount,currency,'transaction_reversal',now(),id,'${actor}' FROM cash_transactions WHERE id=$1`,[payment.transaction_id]);
    expect(Number((await db.query('SELECT paid_amount FROM sales_invoices')).rows[0].paid_amount)).toBe(0);
    expect((await db.query('SELECT reversed_at IS NOT NULL reversed FROM invoice_payments')).rows[0].reversed).toBe(true);
    await expect(db.query('SELECT post_payment_to_gl($1)',[payment.payment_id])).rejects.toThrow('cancelled_invoice_is_terminal');
    await balanced(db);
    await db.query('SELECT cancel_sales_invoice($1)',[inv.invoice_id]);
    await db.query('SELECT cancel_sales_invoice($1)',[inv.invoice_id]);
    expect((await db.query("SELECT count(*)::int n FROM journal_entries WHERE source_type='sales_invoice_cancellation'")).rows[0].n).toBe(1);
    await balanced(db);
  } finally { await db.close(); }
},30000);

it('cancels invoice, receipts and journals together, but does not duplicate a delivered sale journal or credit payment',async () => {
  const db = await database();
  try {
    const inv = await create(db);
    await db.query('SELECT post_invoice_to_gl($1)',[inv.invoice_id]);
    await pay(db,inv.invoice_id);
    await db.query('SELECT cancel_sales_invoice($1)',[inv.invoice_id]);
    expect(Number((await db.query("SELECT sum(CASE WHEN direction='in' THEN amount ELSE -amount END) n FROM cash_transactions")).rows[0].n)).toBe(0);
    expect((await db.query('SELECT sum(debit-credit) n FROM journal_lines GROUP BY account_id HAVING sum(debit-credit)<>0')).rows).toEqual([]);
    await expect(pay(db,inv.invoice_id,'cancelled')).rejects.toThrow('cancelled_invoice_is_terminal');
    const linked = await create(db,'linked',{ ...payload,order_id:order });
    expect(Number((await db.query('SELECT paid_amount FROM sales_invoices WHERE id=$1',[linked.invoice_id])).rows[0].paid_amount)).toBe(10);
    await expect(db.query('SELECT post_invoice_to_gl($1)',[linked.invoice_id])).rejects.toThrow('invoice_order_delivery_required');
    const deliveryJournal = (await db.query("INSERT INTO journal_entries(tenant_id,source_type,source_id,posted) VALUES($1,'order_delivery',$2,true) RETURNING id",[tenant,order])).rows[0].id;
    await db.query('INSERT INTO order_accounting_events VALUES($1,$2,$3,$4)',[tenant,order,'delivery',deliveryJournal]);
    expect((await db.query('SELECT post_invoice_to_gl($1) id',[linked.invoice_id])).rows[0].id).toBe(deliveryJournal);
    await expect(pay(db,linked.invoice_id,'linked-pay')).rejects.toThrow('invoice_payment_use_sales_lifecycle');
    await db.exec(`UPDATE orders SET paid_amount=20 WHERE id='${order}'`);
    expect(Number((await db.query('SELECT paid_amount FROM sales_invoices WHERE id=$1',[linked.invoice_id])).rows[0].paid_amount)).toBe(20);
    await expect(db.query('SELECT cancel_sales_invoice($1)',[linked.invoice_id])).rejects.toThrow('cancel_linked_order_first');
    await expect(create(db,'duplicate',{...payload,order_id:order})).rejects.toThrow('order_already_invoiced');
    await balanced(db);
  } finally { await db.close(); }
},30000);

it('checks module authorization before replay, denies anon, and closes browser write bypasses',async () => {
  const db = await database();
  try {
    const inv = await create(db);
    await db.exec(`SELECT set_config('test.uid','${foreign}',false)`);
    await expect(create(db)).rejects.toThrow('permission_denied');
    await expect(db.query('SELECT post_invoice_to_gl($1)',[inv.invoice_id])).rejects.toThrow('permission_denied');
    for (const signature of ['create_sales_invoice_atomic(uuid,text,jsonb)','record_invoice_payment_atomic(uuid,text,jsonb)',
      'post_invoice_to_gl(uuid)','post_payment_to_gl(uuid)','cancel_sales_invoice(uuid)']) {
      expect((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') allowed",[signature])).rows[0].allowed).toBe(false);
    }
    for (const table of ['sales_invoices','sales_invoice_lines','invoice_payments']) {
      expect((await db.query("SELECT has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE') allowed",[table])).rows[0].allowed).toBe(false);
    }
  } finally { await db.close(); }
},30000);
