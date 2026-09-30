// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

it('preserves the JSON reversal contract when the older void wrapper is replayed', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
      INSERT INTO supabase_migrations.schema_migrations VALUES ('20260827120000');
      CREATE FUNCTION public.reverse_sales_order(uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"canonical":true}'::jsonb $$;`);
    await db.exec(await migration('20260901105847_6a8cb38a-a749-420c-a91a-ec4de23a69d3.sql'));
    expect((await db.query('SELECT reverse_sales_order(NULL,NULL) AS result')).rows[0].result).toEqual({ canonical: true });
  } finally {
    await db.close();
  }
}, 30000);

it.each([false, true])('grants the optional COA seeder only when present: %s', async (present) => {
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE authenticated; CREATE ROLE anon;');
    for (const signature of ['generate_doc_number(uuid,text,text,text)', 'post_invoice_to_gl(uuid)',
      'post_payment_to_gl(uuid)', 'apply_invoice_match(uuid,numeric,numeric)',
      'seed_default_crm_pipeline(uuid)', 'platform_bootstrap_admin()', 'backfill_sales_bonus_for_order(uuid)',
      ...(present ? ['seed_default_coa(uuid)'] : [])]) {
      await db.exec(`CREATE FUNCTION public.${signature} RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
    }
    await db.exec(await migration('20260817073055_b774c1eb-fae7-4225-8193-a831d7c3af42.sql'));
    if (present) {
      expect((await db.query("SELECT has_function_privilege('authenticated','public.seed_default_coa(uuid)','EXECUTE') AS allowed")).rows[0].allowed).toBe(true);
    }
    expect((await db.query("SELECT has_function_privilege('anon','public.backfill_sales_bonus_for_order(uuid)','EXECUTE') AS allowed")).rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);

it('does not install dual-schema synchronization on canonical stock movements', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE stock_movements (movement_type text, quantity numeric); INSERT INTO stock_movements VALUES ('receipt',5);");
    await db.exec(await migration('20260823104500_sync_stock_movement_dual_schema.sql'));
    expect((await db.query('SELECT * FROM stock_movements')).rows).toEqual([{ movement_type: 'receipt', quantity: '5' }]);
    expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgname='sync_stock_movement_legacy_columns'")).rows).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 30000);

it.each(['canonical', 'legacy'])('upgrades %s stock columns without losing quantities', async (schema) => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE products (id integer PRIMARY KEY);');
    if (schema === 'canonical') {
      await db.exec(`CREATE TABLE stock_movements (movement_type text, quantity numeric, reference_type text, reference_id uuid);
        INSERT INTO stock_movements VALUES ('receipt', 5, NULL, NULL);
        CREATE TABLE stock_balances (on_hand numeric, minimum_level numeric);
        INSERT INTO stock_balances VALUES (5, 2);`);
    } else {
      await db.exec(`CREATE TABLE stock_movements (move_type text, qty numeric, doc_no text, reference text);
        INSERT INTO stock_movements VALUES ('in', 5, NULL, NULL);
        CREATE TABLE stock_balances (qty numeric, reorder_point numeric);
        INSERT INTO stock_balances VALUES (5, 2);`);
    }
    const sql = await migration('20260817064729_ebb9cc0d-8d80-47fc-a61d-7afc60c44357.sql');
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query('SELECT on_hand, minimum_level FROM stock_balances')).rows)
      .toEqual([{ on_hand: '5', minimum_level: '2' }]);
    expect(Number((await db.query('SELECT quantity FROM stock_movements')).rows[0].quantity)).toBe(5);
    await db.exec(await migration('20260817070739_7a534b39-05d8-4b13-8e1a-f22fe5204775.sql'));
    const { rows } = await db.query("SELECT tgname FROM pg_trigger WHERE tgname='sync_stock_movement_legacy_columns'");
    expect(rows).toHaveLength(schema === 'legacy' ? 1 : 0);
  } finally {
    await db.close();
  }
}, 30000);

it('keeps canonical inventory functions when the legacy variant is replayed', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
      INSERT INTO supabase_migrations.schema_migrations VALUES ('20260810150000');
      CREATE FUNCTION process_sales_order_status(uuid,text) RETURNS text LANGUAGE sql AS $$ SELECT 'canonical'::text $$;`);
    await db.exec(await migration('20260811052426_fba52af1-e221-4f6d-b491-31ba6ec8985f.sql'));
    expect((await db.query("SELECT process_sales_order_status(NULL, NULL) AS implementation")).rows[0].implementation).toBe('canonical');
  } finally {
    await db.close();
  }
}, 30000);

it('skips the enum-based duplicate cash backfill only after all canonical steps', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
      INSERT INTO supabase_migrations.schema_migrations VALUES
        ('20260809170000'), ('20260809173000'), ('20260809180000');`);
    const sql = await migration('20260810055002_129c535a-8168-4c5b-a772-d57235213fa7.sql');
    await db.exec(sql);
    await db.exec("DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260809180000'");
    await expect(db.exec(sql)).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);

it('retains procurement data and applies grants on the duplicate migration path', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE service_role; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
      INSERT INTO supabase_migrations.schema_migrations VALUES ('20260809210000');
      CREATE FUNCTION public.recalculate_shipment_landed_cost(uuid,boolean) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE FUNCTION public.receive_landed_cost_shipment(uuid,uuid,date) RETURNS void LANGUAGE sql AS $$ SELECT $$;`);
    for (const table of ['procurement_shipments', 'procurement_shipment_lines', 'procurement_shipment_costs',
      'procurement_cost_allocations', 'procurement_landed_cost_lines', 'procurement_receipts', 'procurement_receipt_lines']) {
      await db.exec(`CREATE TABLE ${table} (id integer); INSERT INTO ${table} VALUES (1);`);
    }
    await db.exec(await migration('20260810055227_6843acc2-8221-4073-8aa8-5626628f6e1e.sql'));
    expect((await db.query('SELECT * FROM procurement_shipments')).rows).toEqual([{ id: 1 }]);
    expect((await db.query("SELECT has_table_privilege('service_role', 'procurement_shipments', 'INSERT') AS allowed")).rows[0].allowed).toBe(true);
    expect((await db.query("SELECT has_function_privilege('anon', 'public.recalculate_shipment_landed_cost(uuid,boolean)', 'EXECUTE') AS allowed")).rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);

it('replays credit workflow policies without removing tenant restrictions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION private.is_tenant_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;`);
    for (const table of ['credit_restructures', 'credit_adjustments', 'finance_cost_centers', 'finance_budgets', 'reconciliation_lines']) {
      await db.exec(`CREATE TABLE ${table} (tenant_id uuid)`);
    }
    const sql = await migration('20260805133000_credit_crm_finance_workflows.sql');
    const start = sql.indexOf('DO $$ DECLARE item RECORD; BEGIN');
    const end = sql.indexOf('END $$;', start) + 'END $$;'.length;
    expect(start).toBeGreaterThan(-1);
    await db.exec(sql.slice(start, end));
    await db.exec(sql.slice(start, end));
    const { rows } = await db.query("SELECT cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'");
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.qual).toContain(row.cmd === 'SELECT' ? 'is_tenant_member' : 'has_module_access');
      if (row.cmd === 'ALL') expect(row.with_check).toContain('has_module_access');
    }
  } finally {
    await db.close();
  }
}, 30000);

it('does not overlay legacy warehouse definitions on the canonical ledger', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE stock_movements (movement_type text); INSERT INTO stock_movements VALUES ('receipt');");
    await db.exec(await migration('20260730125048_418763f8-2aa8-4448-877c-d092c2e999d2.sql'));
    expect((await db.query('SELECT * FROM stock_movements')).rows).toEqual([{ movement_type: 'receipt' }]);
    expect((await db.query("SELECT to_regclass('public.sales_invoices') AS invoices")).rows[0].invoices).toBeNull();
  } finally {
    await db.close();
  }
}, 30000);

it('adds workflow columns before credit indexes and preserves existing contracts', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE credit_contracts (id integer PRIMARY KEY); INSERT INTO credit_contracts VALUES (1);');
    const sql = await migration('20260805100838_e0ec8ca1-093e-4f29-8170-b8314fefabdc.sql');
    const start = sql.indexOf('ALTER TABLE public.credit_contracts');
    const end = sql.indexOf(';', start) + 1;
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeLessThan(sql.indexOf('CREATE INDEX IF NOT EXISTS credit_collection_idx'));
    const upgrade = sql.slice(start, end);
    await db.exec(upgrade);
    await db.exec(upgrade);
    expect((await db.query('SELECT id, risk_score, collection_stage FROM credit_contracts')).rows)
      .toEqual([{ id: 1, risk_score: 0, collection_stage: 'current' }]);
    await expect(db.exec('UPDATE credit_contracts SET risk_score = 101')).rejects.toThrow();
  } finally {
    await db.close();
  }
}, 30000);
