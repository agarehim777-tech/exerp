// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

// Runs the real post_material_production and reverse_material_production SQL against a minimal schema.
const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const viewer = '33333333-3333-4333-8333-333333333333';
const warehouse = '44444444-4444-4444-8444-000000000001';
const raw = '44444444-4444-4444-8444-000000000002';
const finished = '44444444-4444-4444-8444-000000000003';

async function database(method) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE tenant_members(tenant_id uuid,user_id uuid,role text);
    CREATE TABLE role_permissions(role text,module text,can_edit boolean,can_view boolean);
    CREATE FUNCTION private.has_module_access(t uuid,m text,a text) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM public.tenant_members tm JOIN public.role_permissions rp ON rp.role=tm.role
        WHERE tm.tenant_id=t AND tm.user_id=auth.uid() AND rp.module=m AND CASE WHEN a='edit' THEN rp.can_edit ELSE rp.can_view END) $$;
    CREATE FUNCTION public.is_tenant_member(t uuid,u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=t AND user_id=u) $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,request_hash text,status text DEFAULT 'pending',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
    CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
    CREATE TABLE chart_of_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,code text,UNIQUE(tenant_id,code));
    CREATE TABLE journal_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,entry_date date,reference text,description text,source_type text,source_id uuid,created_by uuid,posted boolean DEFAULT false);
    CREATE TABLE journal_lines(entry_id uuid REFERENCES journal_entries(id),account_id uuid,debit numeric,credit numeric,memo text,line_no int);
    CREATE FUNCTION public.gl_account_by_code(t uuid,c text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM public.chart_of_accounts WHERE tenant_id=t AND code=c $$;
    CREATE TABLE products(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE warehouses(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean);
    CREATE TABLE inventory_accounting_settings(tenant_id uuid PRIMARY KEY,valuation_method text DEFAULT 'weighted_average');
    CREATE TABLE stock_balances(tenant_id uuid,warehouse_id uuid,product_id uuid,on_hand numeric,reserved numeric,problem_qty numeric DEFAULT 0,avg_cost numeric DEFAULT 0,updated_at timestamptz,PRIMARY KEY(tenant_id,warehouse_id,product_id));
    CREATE TABLE stock_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,warehouse_id uuid,product_id uuid,movement_type text,quantity numeric,unit_cost numeric,reference_type text,reference_id uuid,note text,created_by uuid,created_at timestamptz DEFAULT clock_timestamp(),reversal_of uuid);
    CREATE TABLE inventory_cost_layers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,warehouse_id uuid,product_id uuid,source_movement_id uuid,source_type text,source_id uuid,original_qty numeric,remaining_qty numeric,unit_cost numeric,received_at timestamptz DEFAULT clock_timestamp());
    CREATE FUNCTION public.ensure_inventory_accounts(t uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO public.chart_of_accounts(tenant_id,code) VALUES(t,'2050') ON CONFLICT DO NOTHING;
      INSERT INTO public.inventory_accounting_settings(tenant_id) VALUES(t) ON CONFLICT DO NOTHING; END $$;
    -- Mirrors the production receive_stock: balance, receipt movement and a cost layer that names its source.
    CREATE FUNCTION public.receive_stock(t uuid,w uuid,p uuid,q numeric,c numeric,rt text,ri uuid,n text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE movement uuid; BEGIN
      INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved) VALUES(t,w,p,q,0)
        ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET on_hand=public.stock_balances.on_hand+excluded.on_hand;
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
        VALUES(t,w,p,'receipt',q,c,rt,ri,n,auth.uid()) RETURNING id INTO movement;
      INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,original_qty,remaining_qty,unit_cost)
        VALUES(t,w,p,movement,coalesce(rt,'manual_receipt'),ri,q,q,c); RETURN movement; END $$;
    INSERT INTO tenants VALUES('${tenant}'); INSERT INTO auth.users VALUES('${actor}'),('${viewer}');
    INSERT INTO tenant_members VALUES('${tenant}','${actor}','admin'),('${tenant}','${viewer}','viewer');
    INSERT INTO role_permissions SELECT r,m,r='admin',true FROM unnest(ARRAY['admin','viewer']) r CROSS JOIN unnest(ARRAY['production','warehouse']) m;
    SELECT set_config('test.uid','${actor}',false);
    INSERT INTO products VALUES('${raw}','${tenant}',true),('${finished}','${tenant}',true);
    INSERT INTO warehouses VALUES('${warehouse}','${tenant}',true);
    INSERT INTO inventory_accounting_settings VALUES('${tenant}','${method}');
    INSERT INTO stock_balances VALUES('${tenant}','${warehouse}','${raw}',10,0,0,25,now());
    INSERT INTO inventory_cost_layers(tenant_id,warehouse_id,product_id,source_type,original_qty,remaining_qty,unit_cost) VALUES('${tenant}','${warehouse}','${raw}','opening',10,10,25);
  `);
  for (const name of ['20261003140457_viewer_write_boundary', '20261003140739_atomic_material_production', '20261121100000_reverse_material_production']) {
    await db.exec(await readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
  }
  return db;
}

const onHand = async (db, product) => Number((await db.query(`select on_hand from stock_balances where product_id='${product}'`)).rows[0].on_hand);
const post = (db) => db.query('select public.post_material_production($1,$2,$3) result', [tenant, 'production-1',
  { product_id: finished, warehouse_id: warehouse, quantity: 2, materials: [{ product_id: raw, quantity: 4 }] }]);
const reverse = (db, batch, reason = 'Səhv miqdar') => db.query('select public.reverse_material_production($1,$2,$3) result', [tenant, batch, reason]);

for (const method of ['weighted_average', 'fifo']) {
  it(`${method}: reversing a batch returns materials, removes the output and balances the journal once`, async () => {
    const db = await database(method);
    try {
      const batch = (await post(db)).rows[0].result.batch_id;
      expect([await onHand(db, raw), await onHand(db, finished)]).toEqual([6, 2]);

      const first = (await reverse(db, batch)).rows[0].result;
      expect([await onHand(db, raw), await onHand(db, finished)]).toEqual([10, 0]);
      expect(Number((await db.query('select sum(debit-credit) d from journal_lines')).rows[0].d)).toBe(0);
      const row = (await db.query(`select reversed_at, reversal_reason, reversal_journal_entry_id from production_batches where id='${batch}'`)).rows[0];
      expect(row.reversed_at).not.toBeNull();
      expect(row.reversal_reason).toBe('Səhv miqdar');
      expect(row.reversal_journal_entry_id).toBe(first.journal_entry_id);
      // The output layer is used up and the material comes back as its own layer at the consumed cost.
      expect(Number((await db.query(`select remaining_qty from inventory_cost_layers where source_type='production_batch'`)).rows[0].remaining_qty)).toBe(0);
      const back = (await db.query(`select remaining_qty, unit_cost from inventory_cost_layers where source_type='production_reversal'`)).rows[0];
      expect([Number(back.remaining_qty), Number(back.unit_cost)]).toEqual([4, 25]);
      expect((await db.query(`select count(*)::int n from stock_movements where reference_type='production_reversal' and reversal_of is not null`)).rows[0].n).toBe(2);

      // A second call returns the first result instead of moving stock again.
      expect((await reverse(db, batch)).rows[0].result).toMatchObject({ batch_id: batch, already_reversed: true });
      expect([await onHand(db, raw), await onHand(db, finished)]).toEqual([10, 0]);
    } finally { await db.close(); }
  }, 30000);
}

it('refuses to reverse a batch whose finished goods are reserved or already used', async () => {
  const db = await database('fifo');
  try {
    const batch = (await post(db)).rows[0].result.batch_id;
    await db.exec(`UPDATE stock_balances SET reserved=1 WHERE product_id='${finished}'`);
    await expect(reverse(db, batch)).rejects.toThrow('production_output_already_used');
    await db.exec(`UPDATE stock_balances SET reserved=0 WHERE product_id='${finished}'; UPDATE inventory_cost_layers SET remaining_qty=1 WHERE source_type='production_batch'`);
    await expect(reverse(db, batch)).rejects.toThrow('production_output_already_used');
    expect((await db.query(`select reversed_at from production_batches where id='${batch}'`)).rows[0].reversed_at).toBeNull();
    expect(await onHand(db, raw)).toBe(6);
  } finally { await db.close(); }
}, 30000);

it('requires a reason and edit rights', async () => {
  const db = await database('weighted_average');
  try {
    const batch = (await post(db)).rows[0].result.batch_id;
    await expect(reverse(db, batch, ' ')).rejects.toThrow('production_reversal_reason_required');
    await db.exec(`SELECT set_config('test.uid','${viewer}',false)`);
    await expect(reverse(db, batch)).rejects.toThrow('permission_denied');
  } finally { await db.close(); }
}, 30000);
