// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const viewer = '33333333-3333-4333-8333-333333333333';
const ids = Array.from({ length: 8 }, (_, i) => `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`);
const [vendor, po, poLine, invoice, account, warehouse, raw, finished] = ids;

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE tenant_members(tenant_id uuid,user_id uuid,role text);
    CREATE TABLE role_permissions(role text,module text,can_edit boolean,can_view boolean);
    CREATE TABLE tenant_modules(tenant_id uuid,module text);
    CREATE FUNCTION private.has_module_access(t uuid,m text,a text) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM public.tenant_members tm JOIN public.role_permissions rp ON rp.role=tm.role
        WHERE tm.tenant_id=t AND tm.user_id=auth.uid() AND rp.module=m AND CASE WHEN a='edit' THEN rp.can_edit ELSE rp.can_view END) $$;
    CREATE FUNCTION public.is_tenant_member(t uuid,u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=t AND user_id=u) $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,request_hash text,status text DEFAULT 'pending',result jsonb,completed_at timestamptz, UNIQUE(tenant_id,request_key));
    CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
    CREATE TABLE vendors(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE purchase_orders(id uuid PRIMARY KEY,tenant_id uuid,vendor_id uuid,status text,currency text);
    CREATE TABLE purchase_order_lines(id uuid PRIMARY KEY,po_id uuid REFERENCES purchase_orders(id),unit_price numeric);
    CREATE TABLE goods_receipt_lines(po_line_id uuid REFERENCES purchase_order_lines(id),qty_received numeric,qty_rejected numeric);
    CREATE TABLE vendor_invoices(id uuid PRIMARY KEY,tenant_id uuid,vendor_id uuid,po_id uuid,status text,currency text,invoice_number text,updated_at timestamptz);
    CREATE TABLE vendor_invoice_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),invoice_id uuid REFERENCES vendor_invoices(id),po_line_id uuid,qty_invoiced numeric,unit_price numeric,tax_rate numeric);
    CREATE FUNCTION public.evaluate_invoice_match(i uuid,numeric,numeric) RETURNS TABLE(status text) LANGUAGE sql AS $$
      SELECT CASE WHEN l.unit_price=p.unit_price THEN 'matched' ELSE 'price_exception' END FROM public.vendor_invoice_lines l JOIN public.purchase_order_lines p ON p.id=l.po_line_id WHERE l.invoice_id=i $$;
    CREATE TABLE chart_of_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,code text,UNIQUE(tenant_id,code));
    CREATE TABLE cash_accounts(id uuid PRIMARY KEY,tenant_id uuid,currency text,type text,is_active boolean,opening_balance numeric,gl_account_id uuid);
    CREATE TABLE cash_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,account_id uuid,direction text,amount numeric,currency text,category text,reference_type text,reference_id uuid,reference text,vendor_id uuid,description text,occurred_at timestamptz,created_by uuid);
    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,entry_date date,reference text,description text,source_type text,source_id uuid,created_by uuid,posted boolean DEFAULT false);
    CREATE TABLE journal_lines(entry_id uuid REFERENCES journal_entries(id),account_id uuid,debit numeric,credit numeric,memo text,line_no int);
    CREATE TABLE procurement_receipts(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE procurement_receipt_lines(receipt_id uuid REFERENCES procurement_receipts(id),po_line_id uuid,received_qty numeric);
    CREATE FUNCTION public.enforce_balance() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE d numeric;c numeric; BEGIN
      IF NEW.posted AND NOT OLD.posted THEN SELECT sum(debit),sum(credit) INTO d,c FROM public.journal_lines WHERE entry_id=NEW.id;
      IF d<>c OR d=0 THEN RAISE EXCEPTION 'unbalanced_journal'; END IF; END IF; RETURN NEW; END $$;
    CREATE TRIGGER journal_balance BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_balance();
    CREATE FUNCTION public.gl_account_by_code(t uuid,c text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.chart_of_accounts WHERE tenant_id=t AND code=c $$;
    CREATE TABLE products(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE warehouses(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE inventory_accounting_settings(tenant_id uuid PRIMARY KEY,valuation_method text DEFAULT 'weighted_average');
    CREATE TABLE stock_balances(tenant_id uuid,warehouse_id uuid,product_id uuid,on_hand numeric,reserved numeric,problem_qty numeric DEFAULT 0,avg_cost numeric DEFAULT 0,updated_at timestamptz,PRIMARY KEY(tenant_id,warehouse_id,product_id));
    CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,warehouse_id uuid,product_id uuid,movement_type text,quantity numeric,unit_cost numeric,reference_type text,reference_id uuid,note text,created_by uuid);
    CREATE TABLE inventory_cost_layers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,warehouse_id uuid,product_id uuid,remaining_qty numeric,unit_cost numeric,received_at timestamptz DEFAULT now());
    CREATE FUNCTION public.ensure_inventory_accounts(t uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO public.chart_of_accounts(tenant_id,code) VALUES(t,'1000'),(t,'2050'),(t,'2200') ON CONFLICT DO NOTHING;
      INSERT INTO public.inventory_accounting_settings(tenant_id) VALUES(t) ON CONFLICT DO NOTHING; END $$;
    CREATE FUNCTION public.receive_stock(t uuid,w uuid,p uuid,q numeric,c numeric,rt text,ri uuid,n text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE movement uuid; BEGIN
      UPDATE public.stock_balances SET avg_cost=(on_hand*avg_cost+q*c)/(on_hand+q),on_hand=on_hand+q WHERE tenant_id=t AND warehouse_id=w AND product_id=p;
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
        VALUES(t,w,p,'receipt',q,c,rt,ri,n,auth.uid()) RETURNING id INTO movement;
      INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,remaining_qty,unit_cost) VALUES(t,w,p,q,c); RETURN movement; END $$;
    INSERT INTO tenants VALUES('${tenant}'); INSERT INTO auth.users VALUES('${actor}'),('${viewer}');
    INSERT INTO tenant_members VALUES('${tenant}','${actor}','admin'),('${tenant}','${viewer}','viewer');
    INSERT INTO role_permissions SELECT r,m,r='admin',true FROM unnest(ARRAY['admin','viewer']) r CROSS JOIN unnest(ARRAY['finance','procurement','production','warehouse','api']) m;
    SELECT set_config('test.uid','${actor}',false);
    INSERT INTO vendors VALUES('${vendor}','${tenant}');
    INSERT INTO purchase_orders VALUES('${po}','${tenant}','${vendor}','approved','AZN');
    INSERT INTO purchase_order_lines VALUES('${poLine}','${po}',50);
    INSERT INTO goods_receipt_lines VALUES('${poLine}',2,0);
    INSERT INTO vendor_invoices VALUES('${invoice}','${tenant}','${vendor}','${po}','matched','AZN','QA-INV',now());
    INSERT INTO vendor_invoice_lines(invoice_id,po_line_id,qty_invoiced,unit_price,tax_rate) VALUES('${invoice}','${poLine}',2,50,0);
    INSERT INTO cash_accounts VALUES('${account}','${tenant}','AZN','cash',true,500,null);
    INSERT INTO procurement_receipts VALUES('${po}','${tenant}');
    INSERT INTO procurement_receipt_lines VALUES('${po}','${poLine}',2);
    INSERT INTO journal_entries(tenant_id,source_type,source_id,posted) VALUES('${tenant}','procurement_receipt','${po}',true);
    INSERT INTO products VALUES('${raw}','${tenant}',true),('${finished}','${tenant}',true);
    INSERT INTO warehouses VALUES('${warehouse}','${tenant}',true);
    INSERT INTO stock_balances VALUES('${tenant}','${warehouse}','${raw}',10,0,0,25,now());
    INSERT INTO inventory_cost_layers(tenant_id,warehouse_id,product_id,remaining_qty,unit_cost) VALUES('${tenant}','${warehouse}','${raw}',10,25);
  `);
  for (const name of ['20261003135641_atomic_vendor_invoice_payment','20261003140457_viewer_write_boundary','20261003140739_atomic_material_production','20261003141250_durable_webhook_dispatch']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  return db;
}

it('atomically settles a matched vendor invoice and rejects unbacked paid status and duplicate payment', async () => {
  const db = await database();
  try {
    await expect(db.exec(`UPDATE vendor_invoices SET status='paid' WHERE id='${invoice}'`)).rejects.toThrow('requires_server_command');
    const payload = { invoice_id: invoice, account_id: account, payment_date: '2026-10-04' };
    const pay = (key, data = payload) => db.query('select public.pay_vendor_invoice_atomic($1,$2,$3) result', [tenant,key,data]);
    await db.exec("UPDATE journal_entries SET posted=false WHERE source_type='procurement_receipt'");
    await expect(pay('payment-without-posting')).rejects.toThrow('posted_inventory_receipt_required');
    await db.exec("DELETE FROM journal_entries WHERE source_type='procurement_receipt'; INSERT INTO journal_entries(tenant_id,source_type,source_id,posted) VALUES('" + tenant + "','procurement_receipt','" + po + "',true)");
    const first = await pay('payment-1');
    expect((await pay('payment-1')).rows).toEqual(first.rows);
    const cash = (await db.query('select count(*)::int n,sum(amount) amount from cash_transactions')).rows[0];
    expect(cash.n).toBe(1);
    expect(Number(cash.amount)).toBe(100);
    expect(Number((await db.query('select sum(debit-credit) balance from journal_lines')).rows[0].balance)).toBe(0);
    await expect(pay('payment-2')).rejects.toThrow('invoice_not_payable');
    await expect(pay('payment-1', { ...payload, account_id: vendor })).rejects.toThrow('payload_mismatch');
    await expect(db.exec(`UPDATE vendor_invoices SET status='matched' WHERE id='${invoice}'`)).rejects.toThrow('immutable');
    await expect(db.exec(`UPDATE vendor_invoice_lines SET unit_price=1 WHERE invoice_id='${invoice}'`)).rejects.toThrow('immutable');
    await expect(db.exec(`DELETE FROM vendor_invoice_lines WHERE invoice_id='${invoice}'`)).rejects.toThrow('immutable');
  } finally { await db.close(); }
}, 30000);

it('posts BOM material stock, finished goods, balanced costing and replay exactly once in both valuation modes', async () => {
  for (const method of ['weighted_average','fifo']) {
    const db = await database();
    try {
      await db.exec(`INSERT INTO inventory_accounting_settings VALUES('${tenant}','${method}')`);
      const payload = { product_id: finished, warehouse_id: warehouse, quantity: 2, materials: [{ product_id: raw, quantity: 4 }] };
      const post = data => db.query('select public.post_material_production($1,$2,$3) result',[tenant,'production-1',data]);
      const first = await post(payload);
      expect((await post(payload)).rows).toEqual(first.rows);
      const balances = await db.query('select product_id,on_hand from stock_balances order by product_id');
      expect(balances.rows.map(row => Number(row.on_hand))).toEqual([6,2]);
      expect(Number(first.rows[0].result.unit_cost)).toBe(50);
      expect((await db.query('select count(*)::int n from production_batches')).rows[0].n).toBe(1);
      expect(Number((await db.query('select sum(debit-credit) balance from journal_lines')).rows[0].balance)).toBe(0);
      await expect(post({ ...payload, quantity: 3 })).rejects.toThrow('payload_mismatch');
      await db.exec(`UPDATE stock_balances SET reserved=6 WHERE product_id='${raw}'`);
      await expect(db.query('select public.post_material_production($1,$2,$3)',[tenant,'production-2',payload])).rejects.toThrow('insufficient_material_stock');
      expect((await db.query('select count(*)::int n from production_batches')).rows[0].n).toBe(1);
    } finally { await db.close(); }
  }
}, 30000);

it('enforces viewer writes on tenant rows and child rows even through SECURITY DEFINER', async () => {
  const db = await database();
  try {
    await db.exec(`CREATE FUNCTION public.legacy_edit() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ UPDATE public.vendor_invoice_lines SET unit_price=1 $$;
      SELECT set_config('test.uid','${viewer}',false);`);
    await expect(db.exec(`UPDATE products SET is_active=false WHERE id='${raw}'`)).rejects.toThrow('readonly_role_write_denied');
    await expect(db.exec('SELECT public.legacy_edit()')).rejects.toThrow('readonly_role_write_denied');
    await expect(db.query('select public.prepare_webhook_audit($1,$2)',[tenant,'denied'])).rejects.toThrow('permission_denied');
    expect((await db.query('select count(*)::int n from webhook_dispatches')).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 30000);

it('does not report a simulated HTTP 200 without a durable receipt, and rotates actual signing material', async () => {
  const db = await database();
  try {
    const prepared = (await db.query('select public.prepare_webhook_audit($1,$2) result',[tenant,'http-1'])).rows[0].result;
    const claim = (await db.query('select public.claim_webhook_audit($1,$2) result',[prepared.dispatch_id,actor])).rows[0].result;
    await expect(db.query('select public.claim_webhook_audit($1,$2)',[prepared.dispatch_id,actor])).rejects.toThrow('in_progress');
    expect((await db.query('select public.finish_webhook_audit($1,$2,200,42,null) result',[prepared.dispatch_id,claim.attempt_id])).rows[0].result.delivered).toBe(false);
    await db.query('select public.record_webhook_audit_receipt($1,$2)',[prepared.dispatch_id,'hash-1']);
    await expect(db.query('select public.record_webhook_audit_receipt($1,$2)',[prepared.dispatch_id,'changed'])).rejects.toThrow('payload_mismatch');
    const retry = (await db.query('select public.claim_webhook_audit($1,$2) result',[prepared.dispatch_id,actor])).rows[0].result;
    expect((await db.query('select public.finish_webhook_audit($1,$2,200,43,null) result',[prepared.dispatch_id,retry.attempt_id])).rows[0].result.delivered).toBe(true);
    expect((await db.query('select public.claim_webhook_audit($1,$2) result',[prepared.dispatch_id,actor])).rows[0].result.delivered).toBe(true);
    await db.query('select public.rotate_webhook_audit_key($1,$2)',[tenant,prepared.endpoint_id]);
    const secret = (await db.query('select secret from private.webhook_signing_keys')).rows[0].secret;
    expect(secret).not.toBe(claim.secret);
  } finally { await db.close(); }
}, 30000);
