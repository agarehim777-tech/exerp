// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db;
const tenant = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION public.is_tenant_member(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1=$2 $$;
    CREATE TYPE public.account_type AS ENUM ('asset','revenue');
    CREATE TABLE chart_of_accounts(id uuid PRIMARY KEY,tenant_id uuid,code text,name text,type account_type);
    CREATE TABLE journal_entries(id integer PRIMARY KEY,tenant_id uuid,entry_date date,posted boolean);
    CREATE TABLE journal_lines(account_id uuid,entry_id integer,debit numeric,credit numeric);
    INSERT INTO chart_of_accounts VALUES('${tenant}','${tenant}','100','Cash','asset');
    INSERT INTO journal_entries VALUES(1,'${tenant}','2026-11-05',true),(2,'${tenant}','2026-10-05',true),
      (3,'${tenant}','2026-11-06',false),(4,'${other}','2026-11-05',true);
    INSERT INTO journal_lines VALUES('${tenant}',1,10,0),('${tenant}',2,100,0),('${tenant}',3,1000,0),('${tenant}',4,10000,0);
    CREATE TABLE hr_departments(tenant_id uuid,record_key text,name text,sort_position integer,metadata jsonb,PRIMARY KEY(tenant_id,record_key));
    ALTER TABLE hr_departments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY tenant_only ON hr_departments TO authenticated USING(tenant_id=auth.uid()) WITH CHECK(tenant_id=auth.uid());
    GRANT SELECT,INSERT,UPDATE,DELETE ON hr_departments TO authenticated;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261110134149_report_and_collection_consistency.sql', import.meta.url), 'utf8'));
  await db.exec('SET ROLE authenticated');
}, 30000);
afterAll(async () => { await db?.close(); });
const upsert = (key, name) => ({ table: 'hr_departments', operation: 'upsert', row: { record_key: key, name } });
const apply = (changes, id = tenant) => db.query('SELECT apply_collection_changes($1,$2)', [id, JSON.stringify(changes)]);
it('excludes unposted, out-of-period and foreign-tenant journal lines', async () => {
  const result = await db.query("SELECT * FROM trial_balance($1,'2026-11-01','2026-11-10')", [tenant]);
  expect(Number(result.rows[0].debit)).toBe(10);
  expect((await db.query("SELECT * FROM trial_balance($1,'2026-11-01','2026-11-10')", [other])).rows).toEqual([]);
});
it('applies a batch atomically and makes retries idempotent', async () => {
  await apply([upsert('a','First'), upsert('b','Second')]);
  await apply([upsert('a','First'), upsert('b','Second')]);
  expect((await db.query('SELECT * FROM hr_departments')).rows).toHaveLength(2);
  await expect(apply([upsert('c','Temporary'), { ...upsert('d','Invalid'), table: 'cash_transactions' }])).rejects.toThrow('COLLECTION_TABLE_INVALID');
  expect((await db.query("SELECT * FROM hr_departments WHERE record_key='c'")).rows).toHaveLength(0);
  await apply([{ table: 'hr_departments', operation: 'delete', row: { record_key: 'b' } }, upsert('a','Updated')]);
  expect((await db.query('SELECT name FROM hr_departments')).rows).toEqual([{ name: 'Updated' }]);
});
it('preserves RLS, rejects tenant spoofing and does not bypass readonly roles', async () => {
  await expect(apply([upsert('foreign','No')], other)).rejects.toThrow(/row-level security/);
  await expect(apply([{ ...upsert('spoof','No'), row: { record_key:'spoof', name:'No', tenant_id: other } }])).rejects.toThrow('COLLECTION_TENANT_MISMATCH');
  await db.exec('RESET ROLE; REVOKE INSERT ON hr_departments FROM authenticated; SET ROLE authenticated');
  await expect(apply([upsert('readonly','No')])).rejects.toThrow(/permission denied/);
});
