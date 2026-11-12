// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// The reports page calls these RPCs (src/shared/hooks/useReportTotals.ts). They existed only in
// Lovable's drizzle/migrations, so a database built from supabase/migrations answered PGRST202.
// plpgsql checks columns only when a function runs, so each one is called here, as a tenant admin.

const FILE = '20261112100000_report_rpcs.sql';
const TENANT = '00000000-0000-4000-8000-0000000000f1';
const ADMIN = '00000000-0000-4000-8000-0000000000f2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000f3';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.test'), ('${OUTSIDER}', 'outsider@example.test');
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Reports', 'reports', '${ADMIN}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${ADMIN}', 'admin');
    SET session_replication_role = origin;
  `);
}, 240000);
afterAll(async () => { await db?.close(); });

const asUser = (id) => db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [id]);
const call = async (sql, params) => (await db.query(sql, params)).rows[0].result;

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('runs every report RPC the reports page calls, with the arguments it sends', async () => {
  await asUser(ADMIN);
  const totals = await call(`SELECT public.report_totals($1, NULL, NULL) AS result`, [TENANT]);
  expect(totals).toMatchObject({ revenue: 0, order_count: 0, operating_expense: 0, production_count: 0 });
  const trend = await call(`SELECT public.report_monthly_trend($1, current_date, 6) AS result`, [TENANT]);
  expect(trend).toHaveLength(6);
  expect(await call(`SELECT public.report_risk_rows($1, 8) AS result`, [TENANT])).toEqual([]);
  const summary = await call(`SELECT public.report_module_summary($1, NULL, NULL) AS result`, [TENANT]);
  expect(summary).toEqual(expect.any(Object));
});

it('refuses a user who is not a member of the tenant', async () => {
  await asUser(OUTSIDER);
  await expect(db.query(`SELECT public.report_totals($1) AS result`, [TENANT])).rejects.toThrow('permission_denied');
  await expect(db.query(`SELECT public.report_module_summary($1) AS result`, [TENANT])).rejects.toThrow('permission_denied');
});
