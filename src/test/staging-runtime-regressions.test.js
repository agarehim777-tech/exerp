// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

it.each([false, true])('creates and reuses main cash accounts with code column=%s', async (canonical) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION public.is_tenant_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
      CREATE TABLE public.cash_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,
        ${canonical ? 'code text NOT NULL UNIQUE,' : ''} account_no text,name text,type text,currency text,
        opening_balance numeric,is_active boolean,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`);
    await db.exec(await migration('20260929115603_fix_main_cash_account_schema_compatibility.sql'));
    const first = (await db.query(`SELECT private.ensure_main_cash_account('${tenant}','AZN') id`)).rows[0].id;
    expect((await db.query(`SELECT private.ensure_main_cash_account('${tenant}','AZN') id`)).rows[0].id).toBe(first);
    await db.exec('UPDATE cash_accounts SET is_active=false');
    expect((await db.query(`SELECT private.ensure_main_cash_account('${tenant}','AZN') id`)).rows[0].id).toBe(first);
    expect((await db.query(`SELECT private.ensure_main_cash_account('${tenant}','USD') id`)).rows[0].id).not.toBe(first);
    expect((await db.query('SELECT count(*)::int n FROM cash_accounts')).rows[0].n).toBe(2);
    await expect(db.query("SELECT private.ensure_main_cash_account('22222222-2222-4222-8222-222222222222','AZN')")).rejects.toThrow('permission_denied');
  } finally { await db.close(); }
}, 30000);

it('covers payment and bonus side effects with the complete sale idempotency key', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE operation_requests(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,request_hash text,
        status text DEFAULT 'pending',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
      CREATE TABLE cash_accounts(id uuid,tenant_id uuid,is_active boolean);
      CREATE TABLE payments(id uuid DEFAULT gen_random_uuid(),amount numeric);
      CREATE TABLE bonuses(value jsonb);
      CREATE FUNCTION private.ensure_main_cash_account(uuid,text) RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION public.create_sales_order_atomic(uuid,text,text,uuid,date,text,text,jsonb,jsonb) RETURNS jsonb LANGUAGE sql
        AS $$ SELECT jsonb_build_object('order_id','${tenant}') $$;
      CREATE FUNCTION public.set_order_bonus_assignments(uuid,date,jsonb,text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.bonuses VALUES ($3) $$;
      CREATE FUNCTION public.register_order_payment(uuid,numeric,uuid) RETURNS uuid LANGUAGE sql AS $$ INSERT INTO public.payments(amount) VALUES ($2) RETURNING id $$;`);
    await db.exec(await migration('20260929115729_make_complete_sale_idempotent.sql'));
    const call = (amount, key = 'retry') => db.query(`SELECT public.create_sales_order_complete(
      '${tenant}',$1,'SALE','${tenant}',current_date,'AZN','test','[]',NULL,'[{"employee":"test"}]',$2,NULL) result`, [key, amount]);
    const result = await call(25);
    expect((await call(25)).rows).toEqual(result.rows);
    expect((await db.query('SELECT count(*)::int n,sum(amount) total FROM payments')).rows[0]).toEqual({ n: 1, total: '25.00' });
    expect((await db.query('SELECT count(*)::int n FROM bonuses')).rows[0].n).toBe(1);
    await expect(call(30)).rejects.toThrow('idempotency_key_payload_mismatch');
    await db.exec(`CREATE OR REPLACE FUNCTION public.register_order_payment(uuid,numeric,uuid) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'payment_failure'; END $$;`);
    await expect(call(25,'failed')).rejects.toThrow('payment_failure');
    expect((await db.query("SELECT count(*)::int n FROM operation_requests WHERE request_key='failed'")).rows[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int n FROM bonuses')).rows[0].n).toBe(1);
  } finally { await db.close(); }
}, 30000);
