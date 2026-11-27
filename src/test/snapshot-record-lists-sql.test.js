// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appToRow } from '../shared/hooks/useCollectionSync.ts';
import { collectionDefinitions, fromDedicatedRow, toDedicatedRow } from '../shared/adapters/dedicatedCollections.ts';
import { snapshotBackedCollections } from '../shared/state/tenantPersistence.js';
import { replayMigrations } from './support/migrationReplay.js';

// The remaining snapshot record lists moved into their own tables (one row per record, the record in metadata).
const FILE = '20261127090000_snapshot_record_lists.sql';
const MIGRATION = new URL(`../../supabase/migrations/${FILE}`, import.meta.url);
const LISTS = {
  notifications: ['notification_records', 'notifications'],
  notificationSendLog: ['notification_send_log', 'notifications'],
  projects: ['project_records', 'projects'],
  productionPlans: ['production_plan_records', 'production'],
  knowledgeBase: ['knowledge_base_articles', 'help'],
  taxCalendar: ['tax_calendar_entries', 'tax'],
  currencyRates: ['currency_rate_records', 'accounting'],
  apiWebhookLogs: ['api_webhook_logs', 'api'],
  reportExports: ['report_export_records', 'reports'],
  receivableClosures: ['receivable_closure_records', 'receivables'],
};
const TENANT = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000b2';
let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'lists@example.test');
    ALTER TABLE public.tenants DISABLE TRIGGER USER;
    ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Lists', 'record-lists', '${USER}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${USER}', 'admin');
    ALTER TABLE public.tenants ENABLE TRIGGER USER;
    ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
}, 600000);
afterAll(async () => { await db?.close(); });

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('maps every moved list in the app to its table and keeps it out of the snapshot', () => {
  for (const [key, [table]] of Object.entries(LISTS)) {
    expect(collectionDefinitions[key]?.table, key).toBe(table);
    expect(snapshotBackedCollections, key).toContain(key);
  }
});

it('guards each table with view/edit on its owning module', async () => {
  for (const [key, [table, module]] of Object.entries(LISTS)) {
    const policies = (await db.query(`SELECT policyname, cmd, coalesce(qual, '') || coalesce(with_check, '') AS expr
      FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 ORDER BY policyname`, [table])).rows;
    expect(policies.map((p) => [p.policyname, p.cmd]), key).toEqual([[`${table}_read`, 'SELECT'], [`${table}_write`, 'ALL']]);
    expect(policies[0].expr, key).toContain(`'${module}'`);
    expect(policies[1].expr, key).toMatch(new RegExp(`'${module}'.*'edit'`));
  }
});

it('copies records from existing snapshots with the app record keys and reads them back unchanged', async () => {
  const projects = [{ id: 'PRJ-1', name: 'Anbar', budget: 1000 }, { name: 'Açarsız' }];
  const rates = [{ code: 'USD', rate: 1.7 }];
  await db.query(`INSERT INTO public.tenant_state_snapshots (tenant_id, state) VALUES ($1, $2)`,
    [TENANT, JSON.stringify({ projects, currencyRates: rates })]);
  const sql = await readFile(MIGRATION, 'utf8');
  const start = sql.indexOf('INSERT INTO public.project_records');
  const backfill = sql.slice(start, sql.indexOf('ON CONFLICT (tenant_id, record_key) DO NOTHING;', start) + 47);
  await db.exec(backfill);
  await db.exec(backfill);
  const rows = (await db.query(`SELECT * FROM public.project_records WHERE tenant_id = $1 ORDER BY sort_position`, [TENANT])).rows;
  expect(rows.map((row) => row.record_key)).toEqual(['PRJ-1', 'idx-1']);
  expect(fromDedicatedRow(rows[0], 'projects').data).toEqual(projects[0]);
  const rateStart = sql.indexOf('INSERT INTO public.currency_rate_records');
  await db.exec(sql.slice(rateStart, sql.indexOf('ON CONFLICT (tenant_id, record_key) DO NOTHING;', rateStart) + 47));
  expect((await db.query(`SELECT record_key FROM public.currency_rate_records WHERE tenant_id = $1`, [TENANT])).rows)
    .toEqual([{ record_key: 'USD' }]);
});

it('saves rows through apply_collection_changes and ignores the old snapshot keys', async () => {
  const row = toDedicatedRow(appToRow({ id: 'KB-1', title: 'Qaimə necə çap olunur?' }, 0, TENANT, 'knowledgeBase'));
  await db.query(`SELECT public.apply_collection_changes($1, $2)`,
    [TENANT, JSON.stringify([{ table: 'knowledge_base_articles', operation: 'upsert', row }])]);
  expect((await db.query(`SELECT metadata FROM public.knowledge_base_articles WHERE tenant_id = $1`, [TENANT])).rows)
    .toEqual([{ metadata: { id: 'KB-1', title: 'Qaimə necə çap olunur?' } }]);
  const { rows: [{ r }] } = await db.query(`SELECT public.save_tenant_state_patch($1, $2) AS r`,
    [TENANT, JSON.stringify({ projects: [{ id: 'OLD' }], reportExports: [], notificationRules: [{ id: 'R1' }] })]);
  expect(r).toEqual({ saved: ['notificationRules'], denied: [], ignored: ['projects', 'reportExports'] });
});
