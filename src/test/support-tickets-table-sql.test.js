// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appToRow } from '../shared/hooks/useCollectionSync.ts';
import { fromDedicatedRow, toDedicatedRow } from '../shared/adapters/dedicatedCollections.ts';
import { replayMigrations } from './support/migrationReplay.js';

// Support tickets moved from the tenant snapshot JSON into public.support_tickets (one row per ticket),
// written through apply_collection_changes like the HR and contract collections.
const FILE = '20261125090000_support_tickets_table.sql';
const MIGRATION = new URL(`../../supabase/migrations/${FILE}`, import.meta.url);
const TENANT = '00000000-0000-4000-8000-0000000000f1';
const USER = '00000000-0000-4000-8000-0000000000f2';
let db;
let skipped;

const ticket = {
  id: 'SUP-1', title: 'Kredit yoxlaması', requester: 'Admin', module: 'Kreditlər', priority: 'Yüksək', status: 'Açıq',
  owner: 'Maliyyəçi', slaHours: 4, createdAt: '24.11.2026 10:00', threadId: 'MSG-SUP-1', linkedType: 'credit',
  linkedLabel: 'KR-7', orderId: 'ORD-7', comments: [{ id: 'COM-1', text: 'Zəng edildi' }], tasks: [{ id: 'TASK-1' }],
};

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'support@example.test');
    ALTER TABLE public.tenants DISABLE TRIGGER USER;
    ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Support', 'support-tickets', '${USER}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${USER}', 'admin');
    ALTER TABLE public.tenants ENABLE TRIGGER USER;
    ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
}, 600000);
afterAll(async () => { await db?.close(); });

const rows = async () => (await db.query(
  `SELECT record_key, sort_position, title, status, sla_hours::float AS sla, opened_at, linked_label, metadata
     FROM public.support_tickets WHERE tenant_id = $1 ORDER BY sort_position`, [TENANT])).rows;

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('lets support or messages editors write and only support editors delete', async () => {
  const policies = (await db.query(`SELECT policyname, cmd, coalesce(qual, '') || coalesce(with_check, '') AS expr
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_tickets' ORDER BY policyname`)).rows;
  expect(policies.map((p) => [p.policyname, p.cmd])).toEqual([
    ['support_tickets_delete', 'DELETE'], ['support_tickets_insert', 'INSERT'],
    ['support_tickets_read', 'SELECT'], ['support_tickets_update', 'UPDATE'],
  ]);
  const expr = Object.fromEntries(policies.map((p) => [p.cmd, p.expr]));
  expect(expr.SELECT).toMatch(/'support'.*'view'.*'messages'.*'view'/s);
  expect(expr.INSERT).toMatch(/'support'.*'edit'.*'messages'.*'edit'/s);
  expect(expr.DELETE).toContain("'support'");
  expect(expr.DELETE).not.toContain("'messages'");
});

it('copies tickets from existing snapshots, keeping the app record key and fields', async () => {
  await db.query(`INSERT INTO public.tenant_state_snapshots (tenant_id, state) VALUES ($1, $2)`,
    [TENANT, JSON.stringify({ theme: 'light', supportTickets: [ticket, { title: 'Açarsız' }] })]);
  const sql = await readFile(MIGRATION, 'utf8');
  const backfill = sql.slice(sql.indexOf('INSERT INTO public.support_tickets'), sql.indexOf('ON CONFLICT (tenant_id, record_key) DO NOTHING;') + 47);
  await db.exec(backfill);
  await db.exec(backfill);
  const copied = await rows();
  expect(copied.map((row) => row.record_key)).toEqual(['SUP-1', 'idx-1']);
  expect(copied[0]).toMatchObject({ title: 'Kredit yoxlaması', status: 'Açıq', sla: 4, opened_at: '24.11.2026 10:00', linked_label: 'KR-7' });
  expect(copied[0].metadata).toEqual({ id: 'SUP-1', orderId: 'ORD-7', comments: ticket.comments, tasks: ticket.tasks });
  // Same shape the app reads back.
  const appRow = fromDedicatedRow({ ...copied[0], tenant_id: TENANT, sla_hours: 4, priority: 'Yüksək', requester: 'Admin',
    module: 'Kreditlər', owner: 'Maliyyəçi', thread_id: 'MSG-SUP-1', linked_type: 'credit' }, 'supportTickets');
  expect(appRow.data).toEqual(ticket);
  await db.query(`DELETE FROM public.support_tickets WHERE tenant_id = $1`, [TENANT]);
});

it('saves ticket rows through apply_collection_changes', async () => {
  const row = toDedicatedRow(appToRow({ ...ticket, status: 'Bağlı' }, 0, TENANT, 'supportTickets'));
  await db.query(`SELECT public.apply_collection_changes($1, $2)`,
    [TENANT, JSON.stringify([{ table: 'support_tickets', operation: 'upsert', row }])]);
  expect((await rows())[0]).toMatchObject({ record_key: 'SUP-1', status: 'Bağlı' });
  await db.query(`SELECT public.apply_collection_changes($1, $2)`,
    [TENANT, JSON.stringify([{ table: 'support_tickets', operation: 'delete', row: { record_key: 'SUP-1' } }])]);
  expect(await rows()).toEqual([]);
});

it('ignores supportTickets in snapshot patches from old tabs and saves the rest', async () => {
  const { rows: [{ r }] } = await db.query(`SELECT public.save_tenant_state_patch($1, $2) AS r`,
    [TENANT, JSON.stringify({ supportTickets: [{ id: 'OLD' }], notifications: [{ id: 'C1' }] })]);
  expect(r).toEqual({ saved: ['notifications'], denied: [], ignored: ['supportTickets'] });
  const { rows: [{ state }] } = await db.query(`SELECT state FROM public.tenant_state_snapshots WHERE tenant_id = $1`, [TENANT]);
  expect(state.notifications).toEqual([{ id: 'C1' }]);
  expect(state.supportTickets).toEqual([ticket, { title: 'Açarsız' }]);
});
