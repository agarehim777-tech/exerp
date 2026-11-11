// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { collectionDefinitions } from '../shared/adapters/dedicatedCollections';
import { replayMigrations } from './support/migrationReplay.js';

// The app reads and writes these tables through src/shared/adapters/dedicatedCollections.ts.
// They must come from supabase/migrations, not only from Lovable's drizzle/migrations, or a
// database built from this repo (staging, CI) fails every collection sync with PGRST205.

const FILE = '20261110120000_dedicated_collection_tables.sql';
const MIGRATION = new URL(`../../supabase/migrations/${FILE}`, import.meta.url);
const TENANT = '00000000-0000-4000-8000-0000000000c1';
const OWNER = '00000000-0000-4000-8000-0000000000c2';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
}, 240000);
afterAll(async () => { await db?.close(); });

it('applies cleanly on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

// A local Supabase in CI is built from supabase/migrations alone, so every migration must apply
// on an empty database (with versions recorded as the CLI does).
it('replays every repo migration on a fresh database without a failure', () => {
  expect(skipped).toEqual([]);
});

it('creates every table and column the app adapter writes, with RLS and module policies', async () => {
  for (const [collection, definition] of Object.entries(collectionDefinitions)) {
    const columns = (await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [definition.table],
    )).rows.map((row) => row.column_name);
    expect(columns, collection).toEqual(expect.arrayContaining(
      ['tenant_id', 'record_key', 'sort_position', 'metadata', ...Object.values(definition.fields)],
    ));
    if (collection === 'employees') continue;
    const table = (await db.query(
      `SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`, [`public.${definition.table}`],
    )).rows[0];
    expect(table.relrowsecurity, collection).toBe(true);
    const policies = (await db.query(
      `SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 ORDER BY policyname`,
      [definition.table],
    )).rows;
    expect(policies, collection).toEqual([
      { policyname: `${definition.table}_read`, cmd: 'SELECT' },
      { policyname: `${definition.table}_write`, cmd: 'ALL' },
    ]);
  }
  const conflictTarget = (await db.query(
    `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'employees_record_key'`,
  )).rows[0];
  expect(conflictTarget.indexdef).toMatch(/UNIQUE INDEX .*\(tenant_id, record_key\)/);
});

it('moves KPI payouts off the generic collection table', async () => {
  const definition = (await db.query(
    `SELECT pg_get_functiondef('public.run_kpi_period_atomic(uuid,text,jsonb)'::regprocedure) AS def`,
  )).rows[0].def;
  expect(definition).not.toContain('tenant_collection_records');
  expect(definition).toContain('FROM public.employees WHERE tenant_id=_tenant_id');
});

it('copies existing collection records and is safe to run again', async () => {
  await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [OWNER, 'owner@example.invalid']);
  await db.query('INSERT INTO public.tenants (id, name, slug, created_by) VALUES ($1, $2, $3, $4)',
    [TENANT, 'Copy test', 'copy-test', OWNER]);
  const rows = [
    ['cashEntries', 'c-1', { description: 'Opening', amount: '125.5', currency: 'AZN', accountId: 'acc-1', note: 'kept' }],
    ['departments', 'd-1', { name: 'Satış', parentDepartment: 'Baş ofis', status: 'active' }],
    ['employees', 'e-1', { name: 'Aysel', position: 'Kassir', salary: '900', extra: 1 }],
  ];
  for (const [collection, key, data] of rows) {
    await db.query(
      `INSERT INTO public.tenant_collection_records (tenant_id, collection, record_key, position, data) VALUES ($1, $2, $3, 1, $4)`,
      [TENANT, collection, key, JSON.stringify(data)],
    );
  }
  const sql = await readFile(MIGRATION, 'utf8');
  await db.exec(sql);
  await db.exec(sql);

  const entry = (await db.query('SELECT * FROM public.finance_entries WHERE tenant_id = $1', [TENANT])).rows;
  expect(entry).toHaveLength(1);
  expect(entry[0]).toMatchObject({ record_key: 'c-1', description: 'Opening', currency: 'AZN', account_id: 'acc-1', metadata: { note: 'kept' } });
  expect(Number(entry[0].amount)).toBe(125.5);
  expect((await db.query('SELECT name, parent_department FROM public.hr_departments WHERE tenant_id = $1', [TENANT])).rows)
    .toEqual([{ name: 'Satış', parent_department: 'Baş ofis' }]);
  const employee = (await db.query('SELECT full_name, position, salary, metadata FROM public.employees WHERE tenant_id = $1 AND record_key = $2', [TENANT, 'e-1'])).rows;
  expect(employee).toHaveLength(1);
  expect(employee[0]).toMatchObject({ full_name: 'Aysel', position: 'Kassir', metadata: { extra: 1 } });
  expect(Number(employee[0].salary)).toBe(900);
}, 60000);

it('leaves the generic collection table read-only for signed-in users', async () => {
  const privileges = (await db.query(`
    SELECT has_table_privilege('authenticated', 'public.tenant_collection_records', 'SELECT') AS can_read,
           has_table_privilege('authenticated', 'public.tenant_collection_records', 'INSERT') AS can_insert,
           has_table_privilege('authenticated', 'public.finance_entries', 'INSERT') AS can_insert_dedicated`)).rows[0];
  expect(privileges).toEqual({ can_read: true, can_insert: false, can_insert_dedicated: true });
});
