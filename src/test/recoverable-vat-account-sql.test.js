// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

// Taxed vendor invoice payment needs account 1400 "Əvəzləşdirilən ƏDV"; the browser cannot seed it, so the
// server must: for existing tenants (backfill), new tenants (trigger) and through ensure_inventory_accounts.
const existing = '11111111-1111-4111-8111-111111111111';
const fresh = '22222222-2222-4222-8222-222222222222';
const member = '33333333-3333-4333-8333-333333333333';
const migration = new URL('../../supabase/migrations/20261119120000_seed_recoverable_vat_account.sql', import.meta.url);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');
    CREATE TABLE public.tenants(id uuid PRIMARY KEY, name text);
    CREATE TABLE public.tenant_members(tenant_id uuid, user_id uuid);
    CREATE FUNCTION public.is_tenant_member(t uuid, u uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=t AND user_id=u) $$;
    CREATE TABLE public.chart_of_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
      code text NOT NULL, name text NOT NULL, type public.account_type NOT NULL, currency text NOT NULL DEFAULT 'AZN',
      is_active boolean NOT NULL DEFAULT true, UNIQUE(tenant_id, code));
    CREATE TABLE public.inventory_accounting_settings(tenant_id uuid PRIMARY KEY);
    INSERT INTO public.tenants VALUES ('${existing}', 'Mövcud');
    INSERT INTO public.chart_of_accounts(tenant_id, code, name, type) VALUES ('${existing}', '1000', 'Kassa', 'asset');
  `);
  await db.exec(await readFile(migration, 'utf8'));
  return db;
}

const accounts = async (db, tenant) => (await db.query(
  `SELECT code, name, type::text, currency, is_active FROM public.chart_of_accounts WHERE tenant_id=$1 ORDER BY code`, [tenant])).rows;

it('backfills 1400 for existing tenants as an active AZN asset', async () => {
  const db = await database();
  expect(await accounts(db, existing)).toEqual([
    { code: '1000', name: 'Kassa', type: 'asset', currency: 'AZN', is_active: true },
    { code: '1400', name: 'Əvəzləşdirilən ƏDV', type: 'asset', currency: 'AZN', is_active: true },
  ]);
}, 30000);

it('seeds 1400 when a tenant is created and does not duplicate it', async () => {
  const db = await database();
  await db.exec(`INSERT INTO public.tenants VALUES ('${fresh}', 'Yeni')`);
  expect((await accounts(db, fresh)).map((row) => row.code)).toEqual(['1400']);
  await db.exec(`SET test.uid = '${member}'; INSERT INTO public.tenant_members VALUES ('${fresh}', '${member}');`);
  await db.exec(`SELECT public.ensure_inventory_accounts('${fresh}')`);
  expect((await accounts(db, fresh)).map((row) => row.code)).toEqual(['1000', '1010', '1200', '1400', '2050', '2100', '2200', '2300', '4000', '5000']);
}, 30000);

it('keeps ensure_inventory_accounts member-only and not executable by browser roles', async () => {
  const db = await database();
  await db.exec(`SET test.uid = '${member}'`);
  await expect(db.exec(`SELECT public.ensure_inventory_accounts('${existing}')`)).rejects.toThrow('permission_denied');
  const grants = (await db.query(`SELECT has_function_privilege('authenticated', 'public.ensure_inventory_accounts(uuid)', 'EXECUTE') AS auth,
    has_function_privilege('anon', 'public.ensure_inventory_accounts(uuid)', 'EXECUTE') AS anon`)).rows[0];
  expect(grants).toEqual({ auth: false, anon: false });
}, 30000);
