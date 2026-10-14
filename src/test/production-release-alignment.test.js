// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const sql = await readFile(new URL('../../supabase/migrations/20261014075609_production_release_capability_alignment.sql', import.meta.url), 'utf8');
const schema = await readFile(new URL('./fixtures/production-pre-alignment.sql', import.meta.url), 'utf8');

async function baseline() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.is_tenant_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`);
  await db.exec(schema);
  await db.exec(`INSERT INTO cash_transactions(id,amount) VALUES(gen_random_uuid(),42);
    INSERT INTO stock_balances(tenant_id,warehouse_id,product_id,on_hand)
      VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),7);`);
  return db;
}

it('upgrades the production catalog atomically, preserves ledger/stock and supports replay', async () => {
  const db = await baseline();
  try {
    await db.exec('BEGIN');
    await db.exec(sql);
    await db.exec('COMMIT');
    await db.exec('BEGIN');
    await db.exec(sql);
    await db.exec('COMMIT');
    expect((await db.query('SELECT amount FROM cash_transactions')).rows).toEqual([{ amount: '42.00' }]);
    expect(Number((await db.query('SELECT on_hand FROM stock_balances')).rows[0].on_hand)).toBe(7);
    expect((await db.query("SELECT count(*)::int AS count FROM pg_class WHERE relname IN ('kpi_periods','receivable_settlements','production_batches','production_batch_materials','vendor_invoice_payments','tenant_collection_records') AND relrowsecurity")).rows[0].count).toBe(6);
    for (const name of ['pay_vendor_invoice_atomic','post_material_production','create_sales_invoice_atomic','settle_receivable_atomic','run_kpi_period_atomic']) {
      await expect(db.query(`SELECT public.${name}(NULL,'probe','{}'::jsonb)`)).rejects.toThrow(/permission_denied/);
    }
    await expect(db.query("SELECT public.import_warehouse_stock_atomic(NULL,'probe','[]'::jsonb)")).rejects.toThrow(/permission_denied/);
    await expect(db.query('SELECT public.receivable_ledger_snapshot(NULL)')).rejects.toThrow(/permission_denied/);
  } finally { await db.close(); }
}, 60000);

it('fails before changing schema if legacy collections would become hidden', async () => {
  const db = await baseline();
  try {
    await db.exec(`INSERT INTO tenants(id) VALUES('00000000-0000-0000-0000-000000000001');
      INSERT INTO tenant_state_snapshots(tenant_id,state) VALUES('00000000-0000-0000-0000-000000000001','{"employees":[{"id":"legacy"}]}');`);
    await db.exec('BEGIN');
    await expect(db.exec(sql)).rejects.toThrow(/ERP_SNAPSHOT_COLLECTION_MIGRATION_REQUIRED/);
    await db.exec('ROLLBACK');
    expect((await db.query("SELECT to_regclass('public.tenant_collection_records') AS relation")).rows[0].relation).toBeNull();
    expect((await db.query('SELECT amount FROM cash_transactions')).rows).toEqual([{ amount: '42.00' }]);
  } finally { await db.close(); }
}, 60000);
