// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appToRow } from '../shared/hooks/useCollectionSync.ts';
import { toDedicatedRow } from '../shared/adapters/dedicatedCollections.ts';
import { replayMigrations } from './support/migrationReplay.js';

// Two browsers appending to the same conversation or ticket each upsert the whole row; the update trigger
// merges the message/comment lists by id so the earlier save is not overwritten.
const FILE = '20261127100000_thread_append_merge.sql';
const TENANT = '00000000-0000-4000-8000-0000000000b1';
const USER = '00000000-0000-4000-8000-0000000000b2';
let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${USER}', 'merge@example.test');
    ALTER TABLE public.tenants DISABLE TRIGGER USER;
    ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Merge', 'thread-merge', '${USER}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${TENANT}', '${USER}', 'admin');
    ALTER TABLE public.tenants ENABLE TRIGGER USER;
    ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [USER]);
}, 600000);
afterAll(async () => { await db?.close(); });

const save = (table, collection, record) => db.query(`SELECT public.apply_collection_changes($1, $2)`, [TENANT, JSON.stringify([
  { table, operation: 'upsert', row: toDedicatedRow(appToRow(record, 0, TENANT, collection)) },
])]);
const stored = async (table, key) => (await db.query(
  `SELECT metadata FROM public.${table} WHERE tenant_id = $1 AND record_key = $2`, [TENANT, key])).rows[0].metadata;

const m = (id, text, extra = {}) => ({ id, from: 'Admin', text, time: '27.11.2026 10:00', ...extra });

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('keeps both messages when two people write in the same conversation', async () => {
  const thread = { id: 'MSG-T', title: 'Komanda', messages: [m('M1', 'Salam')] };
  await save('message_threads', 'conversations', thread);
  // Both browsers start from [M1]; A sends M2, then B (still without M2) sends M3.
  await save('message_threads', 'conversations', { ...thread, messages: [m('M1', 'Salam'), m('M2', 'A yazdı')] });
  await save('message_threads', 'conversations', { ...thread, messages: [m('M1', 'Salam'), m('M3', 'B yazdı')] });
  expect((await stored('message_threads', 'MSG-T')).messages.map((x) => x.id)).toEqual(['M1', 'M2', 'M3']);
});

it('takes the incoming version of a message that is sent again (read flag)', async () => {
  const current = (await stored('message_threads', 'MSG-T')).messages;
  await save('message_threads', 'conversations', { id: 'MSG-T', title: 'Komanda',
    messages: current.map((x) => ({ ...x, readAt: '27.11.2026' })) });
  const after = (await stored('message_threads', 'MSG-T')).messages;
  expect(after.map((x) => x.id)).toEqual(['M1', 'M2', 'M3']);
  expect(after.every((x) => x.readAt === '27.11.2026')).toBe(true);
});

it('keeps both comments when two people comment on the same ticket', async () => {
  const c = (id, text) => ({ id, author: 'Admin', text, at: '27.11.2026 10:00' });
  const ticket = { id: 'SUP-T', title: 'Yoxlama', comments: [c('COM-1', 'Açıldı')] };
  await save('support_tickets', 'supportTickets', ticket);
  await save('support_tickets', 'supportTickets', { ...ticket, status: 'İcrada', comments: [c('COM-1', 'Açıldı'), c('COM-2', 'A')] });
  await save('support_tickets', 'supportTickets', { ...ticket, comments: [c('COM-1', 'Açıldı'), c('COM-3', 'B')] });
  expect((await stored('support_tickets', 'SUP-T')).comments.map((x) => x.id)).toEqual(['COM-1', 'COM-2', 'COM-3']);
});

it('merges entries without an id by content and leaves other fields to the incoming row', async () => {
  const merged = (await db.query(`SELECT private.merge_appended_entries($1::jsonb, $2::jsonb) AS v`, [
    JSON.stringify([{ text: 'a' }, { commentId: 'C1', text: 'b' }]),
    JSON.stringify([{ text: 'a' }, { commentId: 'C1', text: 'b2' }, { text: 'c' }]),
  ])).rows[0].v;
  expect(merged).toEqual([{ text: 'a' }, { commentId: 'C1', text: 'b2' }, { text: 'c' }]);
  const empty = (await db.query(`SELECT private.merge_appended_entries('null'::jsonb, '[]'::jsonb) AS v`)).rows[0].v;
  expect(empty).toEqual([]);
});
