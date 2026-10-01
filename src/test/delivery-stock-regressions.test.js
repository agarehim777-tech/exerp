// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const otherOrder = '22222222-2222-4222-8222-222222222222';
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

it.each(['weighted_average', 'fifo'])('protects other reservations and replays delivery with %s', async (method) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION ensure_inventory_accounts(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
      CREATE FUNCTION gl_account_by_code(uuid,text) RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE TABLE orders(id uuid,tenant_id uuid,status text,order_no text,order_date date,subtotal numeric,vat_total numeric,total numeric,paid_amount numeric,updated_at timestamptz);
      CREATE TABLE order_items(id uuid,order_id uuid,product_id uuid,line_no int,qty numeric,description text);
      CREATE TABLE stock_balances(tenant_id uuid,warehouse_id uuid,product_id uuid,on_hand numeric,reserved numeric,problem_qty numeric,avg_cost numeric,updated_at timestamptz);
      CREATE TABLE stock_reservations(tenant_id uuid,warehouse_id uuid,product_id uuid,order_id uuid,quantity numeric,status text,updated_at timestamptz);
      CREATE TABLE stock_movements(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,warehouse_id uuid,product_id uuid,movement_type text,quantity numeric,unit_cost numeric,reference_type text,reference_id uuid,note text,created_by uuid);
      CREATE TABLE inventory_accounting_settings(tenant_id uuid,valuation_method text);
      CREATE TABLE inventory_cost_layers(id uuid,tenant_id uuid,warehouse_id uuid,product_id uuid,remaining_qty numeric,unit_cost numeric,received_at timestamptz);
      CREATE TABLE sales_cost_allocations(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,order_id uuid,order_item_id uuid,warehouse_id uuid,product_id uuid,cost_layer_id uuid,stock_movement_id uuid,quantity numeric,unit_cost numeric,total_cost numeric,reversed_at timestamptz);
      CREATE TABLE journal_entries(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,entry_date date,reference text,description text,source_type text,source_id uuid,created_by uuid,posted boolean);
      CREATE TABLE journal_lines(entry_id uuid,account_id uuid,debit numeric,credit numeric,memo text,line_no int);
      CREATE TABLE order_accounting_events(tenant_id uuid,order_id uuid,event_type text,journal_entry_id uuid,amount numeric,cogs numeric,created_by uuid);
      INSERT INTO orders VALUES('${tenant}','${tenant}','confirmed','TEST',current_date,100,0,100,0,now());
      INSERT INTO order_items VALUES('${tenant}','${tenant}','${tenant}',1,5,'Test');
      INSERT INTO stock_balances VALUES('${tenant}','${tenant}','${tenant}',10,8,1,25,now());
      INSERT INTO stock_reservations VALUES('${tenant}','${tenant}','${tenant}','${tenant}',4,'active',now()),
        ('${tenant}','${tenant}','${tenant}','${otherOrder}',4,'active',now());
      INSERT INTO inventory_accounting_settings VALUES('${tenant}','${method}');
      INSERT INTO inventory_cost_layers VALUES('${tenant}','${tenant}','${tenant}','${tenant}',10,25,now());`);
    const legacy = await migration('20260820113313_58b4fa73-75aa-4a18-8aaf-3049ae2b437e.sql');
    await db.exec(legacy.slice(0, legacy.indexOf('CREATE OR REPLACE FUNCTION public.receive_landed_cost_shipment')));
    for (const name of ['20260930140027_canonical_sales_delivery_columns.sql',
      '20260930140125_scope_delivery_allocation_reversal.sql', '20261001055630_protect_reserved_stock_at_delivery.sql']) {
      const sql = await migration(name);
      await db.exec(sql);
      await db.exec(sql);
    }
    const deliver = () => db.query(`SELECT process_sales_order_status('${tenant}','delivered')`);
    await deliver();
    await deliver();
    expect((await db.query('SELECT on_hand,reserved FROM stock_balances')).rows[0]).toEqual({ on_hand: '5', reserved: '4' });
    expect((await db.query("SELECT count(*)::int n FROM stock_movements WHERE movement_type='delivery'")).rows[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int n FROM journal_entries')).rows[0].n).toBe(1);
    await db.query(`SELECT process_sales_order_status('${tenant}','cancelled')`);
    await db.query(`SELECT process_sales_order_status('${tenant}','cancelled')`);
    expect((await db.query('SELECT on_hand,reserved FROM stock_balances')).rows[0]).toEqual({ on_hand: '10', reserved: '4' });
    await expect(deliver()).rejects.toThrow('cancelled_order_is_terminal');
    await db.exec(`DELETE FROM order_accounting_events; DELETE FROM sales_cost_allocations;
      UPDATE orders SET status='confirmed'; UPDATE order_items SET qty=6;
      UPDATE stock_balances SET on_hand=10,reserved=8;
      UPDATE stock_reservations SET status='active';`);
    await expect(deliver()).rejects.toThrow('Anbarda kifayət qədər məhsul yoxdur');
    expect((await db.query('SELECT on_hand FROM stock_balances')).rows[0].on_hand).toBe('10');
  } finally { await db.close(); }
}, 30000);
