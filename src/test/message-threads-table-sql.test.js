// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appToRow } from '../shared/hooks/useCollectionSync.ts';
import { fromDedicatedRow, toDedicatedRow } from '../shared/adapters/dedicatedCollections.ts';
import { replayMigrations } from './support/migrationReplay.js';

// Message conversations moved from the tenant snapshot JSON into public.message_threads (one row per thread),
// written through apply_collection_changes like support tickets.
const FILE = '20261126090000_message_threads_table.sql';
const MIGRATION = new URL(`../../supabase/migrations/${FILE}`, import.meta.url);
const TENANT = '00000000-0000-4000-8000-0000000000a1';
const USER = '00000000-0000-4000-8000-0000000000a2';
let db;
let skipped;

const thread = {
  id: 'MSG-1', type: 'task', title: 'KR-7', person: 'KR-7', status: 'Aktiv', team: 'Kreditlər', ticketId: 'SUP-1',
  unread: 2, time: '25.11.2026 09:00', archived: false, participants: ['Admin', 'Maliyyəçi'],
  messages: [{ id: 'M1', from: 'Admin', text: 'Salam', time: '25.11.2026 09:00' }],
};

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'messages@example.test');
    ALTER TABLE public.tenants DISABLE TRIGGER USER;
    ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Messages', 'message-threads', '${USER}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${USER}', 'admin');
    ALTER TABLE public.tenants ENABLE TRIGGER USER;
    ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
}, 600000);
afterAll(async () => { await db?.close(); });

const rows = async () => (await db.query(
  `SELECT tenant_id, record_key, sort_position, type, title, person, status, team, ticket_id, unread::float AS unread, last_at, metadata
     FROM public.message_threads WHERE tenant_id = $1 ORDER BY sort_position`, [TENANT])).rows;

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('lets messages or support editors write and only messages editors delete', async () => {
  const policies = (await db.query(`SELECT policyname, cmd, coalesce(qual, '') || coalesce(with_check, '') AS expr
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'message_threads' ORDER BY policyname`)).rows;
  expect(policies.map((p) => [p.policyname, p.cmd])).toEqual([
    ['message_threads_delete', 'DELETE'], ['message_threads_insert', 'INSERT'],
    ['message_threads_read', 'SELECT'], ['message_threads_update', 'UPDATE'],
  ]);
  const expr = Object.fromEntries(policies.map((p) => [p.cmd, p.expr]));
  expect(expr.SELECT).toMatch(/'messages'.*'view'.*'support'.*'view'/s);
  expect(expr.UPDATE).toMatch(/'messages'.*'edit'.*'support'.*'edit'/s);
  expect(expr.DELETE).toContain("'messages'");
  expect(expr.DELETE).not.toContain("'support'");
});

it('copies conversations from existing snapshots, keeping the app record key and fields', async () => {
  await db.query(`INSERT INTO public.tenant_state_snapshots (tenant_id, state) VALUES ($1, $2)`,
    [TENANT, JSON.stringify({ theme: 'light', conversations: [thread, { title: 'Açarsız' }] })]);
  const sql = await readFile(MIGRATION, 'utf8');
  const backfill = sql.slice(sql.indexOf('INSERT INTO public.message_threads'), sql.indexOf('ON CONFLICT (tenant_id, record_key) DO NOTHING;') + 47);
  await db.exec(backfill);
  await db.exec(backfill);
  const copied = await rows();
  expect(copied.map((row) => row.record_key)).toEqual(['MSG-1', 'idx-1']);
  expect(copied[0]).toMatchObject({ type: 'task', title: 'KR-7', ticket_id: 'SUP-1', unread: 2, last_at: '25.11.2026 09:00' });
  expect(copied[0].metadata).toEqual({ id: 'MSG-1', archived: false, participants: thread.participants, messages: thread.messages });
  // The app reads the row back into the same thread object.
  expect(fromDedicatedRow({ ...copied[0], unread: 2 }, 'conversations').data).toEqual(thread);
  await db.query(`DELETE FROM public.message_threads WHERE tenant_id = $1`, [TENANT]);
});

it('saves thread rows through apply_collection_changes together with ticket rows', async () => {
  const row = toDedicatedRow(appToRow({ ...thread, unread: 0 }, 0, TENANT, 'conversations'));
  const ticketRow = toDedicatedRow(appToRow({ id: 'SUP-1', title: 'Yoxlama' }, 0, TENANT, 'supportTickets'));
  await db.query(`SELECT public.apply_collection_changes($1, $2)`, [TENANT, JSON.stringify([
    { table: 'message_threads', operation: 'upsert', row },
    { table: 'support_tickets', operation: 'upsert', row: ticketRow },
  ])]);
  expect((await rows())[0]).toMatchObject({ record_key: 'MSG-1', unread: 0 });
  await db.query(`SELECT public.apply_collection_changes($1, $2)`,
    [TENANT, JSON.stringify([{ table: 'message_threads', operation: 'delete', row: { record_key: 'MSG-1' } }])]);
  expect(await rows()).toEqual([]);
});

it('ignores conversations in snapshot patches from old tabs and saves the rest', async () => {
  const { rows: [{ r }] } = await db.query(`SELECT public.save_tenant_state_patch($1, $2) AS r`,
    [TENANT, JSON.stringify({ conversations: [{ id: 'OLD' }], notificationRules: [{ id: 'N1' }] })]);
  expect(r).toEqual({ saved: ['notificationRules'], denied: [], ignored: ['conversations'] });
  const { rows: [{ state }] } = await db.query(`SELECT state FROM public.tenant_state_snapshots WHERE tenant_id = $1`, [TENANT]);
  expect(state.conversations).toEqual([thread, { title: 'Açarsız' }]);
});
