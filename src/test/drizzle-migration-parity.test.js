// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Lovable writes its database changes to drizzle/migrations and applies them with its own
// connection. Every database built from this repo (the local E2E stack in CI, restore drills,
// production deploys through migrate-production) uses supabase/migrations only. A function or table
// that exists only in drizzle/ is missing there, and the app fails with PGRST202/PGRST205 (this
// happened with drizzle 0014 and 0018-0022). When this test fails, port the named drizzle file into
// a new supabase/migrations file.

const read = (dir) => readdirSync(new URL(`../../${dir}/`, import.meta.url))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({ name, sql: readFileSync(new URL(`../../${dir}/${name}`, import.meta.url), 'utf8') }));

const OBJECT = /CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
const objectsIn = (sql) => [...sql.matchAll(OBJECT)].map(([, kind, name]) => `${kind.toLowerCase()} ${name.toLowerCase()}`);

// Deliberately not ported: nothing in the app calls them (see 20261110120000).
const NOT_PORTED = new Set(['function reverse_vendor_invoice_payment', 'function reverse_procurement_receipt']);

it('defines every drizzle function and table in supabase/migrations too', () => {
  const repoMigrations = read('supabase/migrations');
  const repo = new Set(repoMigrations.flatMap(({ sql }) => objectsIn(sql)));
  // 20261110120000 creates its tables in a DO block (format('CREATE TABLE ... %I')), so a table also
  // counts as defined when a repo migration names it as public.<table> or '<table>'.
  const repoText = repoMigrations.map(({ sql }) => sql).join('\n');
  const tableNamed = (table) => new RegExp(`(public\\.${table}\\b|'${table}')`).test(repoText);
  const present = (object) => repo.has(object) || NOT_PORTED.has(object)
    || (object.startsWith('table ') && tableNamed(object.slice(6)));
  const missing = read('drizzle/migrations')
    .flatMap(({ name, sql }) => objectsIn(sql).filter((object) => !present(object)).map((object) => `${name}: ${object}`));
  expect(missing, 'Port these drizzle objects into supabase/migrations').toEqual([]);
});

it('recognises the objects it compares', () => {
  expect(objectsIn('CREATE OR REPLACE FUNCTION public.report_totals(_t uuid)')).toEqual(['function report_totals']);
  expect(objectsIn('CREATE TABLE IF NOT EXISTS public.hr_vacancies (id uuid)')).toEqual(['table hr_vacancies']);
  expect(objectsIn('create table "finance_entries" (')).toEqual(['table finance_entries']);
});
