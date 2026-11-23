// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// Mühasibat → "Standart hesablar" calls seed_default_coa, which no migration created before 20261122100000.
const FILE = '20261122100000_seed_default_coa.sql';
const TENANT = '00000000-0000-4000-8000-0000000000c1';
const ADMIN = '00000000-0000-4000-8000-0000000000c2';
const MEMBER = '00000000-0000-4000-8000-0000000000c3';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.test'), ('${MEMBER}', 'member@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'COA', 'coa', '${ADMIN}');
    SET session_replication_role = origin;
    -- Membership as the write policy sees it: admins may write the chart, members may only read.
    CREATE OR REPLACE FUNCTION private.admin_tenant_ids() RETURNS SETOF uuid LANGUAGE sql STABLE
      AS $$ SELECT '${TENANT}'::uuid WHERE auth.uid() = '${ADMIN}'::uuid $$;
    CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid) RETURNS boolean LANGUAGE sql STABLE
      AS $$ SELECT _user IN ('${ADMIN}'::uuid, '${MEMBER}'::uuid) $$;
  `);
}, 240000);
afterAll(async () => { await db?.close(); });

const as = (user) => db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user]);
const codes = async () => (await db.query(
  `SELECT code FROM public.chart_of_accounts WHERE tenant_id = $1 ORDER BY code`, [TENANT])).rows.map((row) => row.code);

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('adds the standard chart once and keeps existing accounts', async () => {
  await as(ADMIN);
  const before = (await codes()).length;
  const { rows: [{ added }] } = await db.query(`SELECT public.seed_default_coa($1) AS added`, [TENANT]);
  const after = await codes();
  expect(added).toBe(after.length - before);
  expect(after).toEqual(expect.arrayContaining(['1000', '1200', '1400', '2050', '3000', '4000', '5000', '6000']));
  const { rows: [{ again }] } = await db.query(`SELECT public.seed_default_coa($1) AS again`, [TENANT]);
  expect(again).toBe(0);
});

it('refuses users who are not tenant admins', async () => {
  await as(MEMBER);
  await expect(db.query(`SELECT public.seed_default_coa($1)`, [TENANT])).rejects.toThrow('permission_denied');
});
