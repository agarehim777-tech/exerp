// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const migration = new URL('../../supabase/migrations/20261119130000_canonical_expense_statuses.sql', import.meta.url);
const ids = Array.from({ length: 8 }, (_, i) => `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`);

async function database({ withCheck }) {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.expenses(id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      status text NOT NULL ${withCheck ? "CHECK (status IN ('draft','pending','approved','paid','rejected','cancelled'))" : ''});
    CREATE TABLE public.kpi_periods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, expense_id uuid, status text);
    -- Same rule as private.guard_paid_kpi_expense: a paid KPI expense's status is locked.
    CREATE FUNCTION public.guard_paid_kpi_expense() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM public.kpi_periods p WHERE p.tenant_id=OLD.tenant_id AND p.expense_id=OLD.id AND p.status='paid')
        AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'paid_kpi_expense_is_locked'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER guard_paid_kpi_expense BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_paid_kpi_expense();
  `);
  return db;
}

const statuses = async (db) => Object.fromEntries((await db.query('SELECT id, status FROM public.expenses ORDER BY id')).rows.map((row) => [row.id, row.status]));

it('rewrites every legacy label to its canonical code and leaves other rows alone', async () => {
  const db = await database({ withCheck: false });
  const rows = [
    [ids[0], 'Təsdiq gözləyir'], [ids[1], 'Təsdiq edildi'], [ids[2], 'Qəbul edildi'], [ids[3], 'Ləğv edildi'],
    [ids[4], 'İmtina edildi'], [ids[5], 'paid'], [ids[6], 'Naməlum'],
  ];
  for (const [id, status] of rows) await db.query('INSERT INTO public.expenses VALUES ($1, $2, $3)', [id, tenant, status]);
  await db.exec(await readFile(migration, 'utf8'));
  expect(await statuses(db)).toEqual({
    [ids[0]]: 'pending', [ids[1]]: 'approved', [ids[2]]: 'paid', [ids[3]]: 'cancelled',
    [ids[4]]: 'rejected', [ids[5]]: 'paid', [ids[6]]: 'Naməlum',
  });
}, 30000);

it('skips an expense locked by a paid KPI period instead of failing the migration', async () => {
  const db = await database({ withCheck: false });
  await db.query('INSERT INTO public.expenses VALUES ($1, $2, $3), ($4, $2, $5)', [ids[0], tenant, 'Qəbul edildi', ids[1], 'Təsdiq gözləyir']);
  await db.query("INSERT INTO public.kpi_periods(tenant_id, expense_id, status) VALUES ($1, $2, 'paid')", [tenant, ids[0]]);
  await db.exec(await readFile(migration, 'utf8'));
  expect(await statuses(db)).toEqual({ [ids[0]]: 'Qəbul edildi', [ids[1]]: 'pending' });
}, 30000);

it('changes nothing where the canonical status CHECK already holds', async () => {
  const db = await database({ withCheck: true });
  await db.query("INSERT INTO public.expenses VALUES ($1, $2, 'pending'), ($3, $2, 'paid')", [ids[0], tenant, ids[1]]);
  await db.exec(await readFile(migration, 'utf8'));
  expect(await statuses(db)).toEqual({ [ids[0]]: 'pending', [ids[1]]: 'paid' });
}, 30000);
