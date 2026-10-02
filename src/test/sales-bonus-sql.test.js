// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';

const tenant = '00000000-0000-0000-0000-000000000001';
const order = '10000000-0000-0000-0000-000000000001';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
    CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid);
    CREATE TABLE order_bonus_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,order_id uuid,
      seller_name text NOT NULL,rate numeric CHECK(rate>=0),position bigint,effective_from date,effective_to date,reason text);
    CREATE TABLE sales_bonus_entries(assignment_id uuid);
    CREATE FUNCTION backfill_sales_bonus_for_order(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    INSERT INTO orders VALUES('${order}','${tenant}');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002134036_allow_zero_sales_bonus.sql',import.meta.url),'utf8'));
},60000);
afterAll(async () => db?.close());
const assign = rows => db.query('select set_order_bonus_assignments($1,$2,$3::jsonb)',[order,'2026-10-02',JSON.stringify(rows)]);

it('retains the primary salesperson when no commission is assigned', async () => {
  await assign([{seller_name:'QA Seller',rate:0}]);
  const rows = (await db.query('select seller_name,rate,position from order_bonus_assignments')).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({seller_name:'QA Seller',rate:'0',position:1});
});
it('rejects blank sellers, negative, non-finite and excessive total commissions', async () => {
  for (const row of [{rate:0},{seller_name:' ',rate:0},{seller_name:'QA',rate:-1},{seller_name:'QA',rate:'NaN'},{seller_name:'QA',rate:3.01}]) {
    await expect(assign([row])).rejects.toThrow('Satıcı və bonus');
  }
  await expect(assign([{seller_name:'A',rate:2},{seller_name:'B',rate:2}])).rejects.toThrow('Ümumi bonus');
  expect((await db.query('select count(*)::int n from order_bonus_assignments')).rows[0].n).toBe(1);
});
it('allows zero and positive assignments within the unchanged three percent cap', async () => {
  await assign([{seller_name:'Primary',rate:0},{seller_name:'Support',rate:3}]);
  expect((await db.query('select sum(rate)::text total from order_bonus_assignments')).rows[0].total).toBe('3');
});
