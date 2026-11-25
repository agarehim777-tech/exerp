// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// save_tenant_state_patch merges only the changed snapshot keys and checks each key against its
// module's edit permission. Before, the whole snapshot row needed settings edit, so a 'member'
// (edits messages, support data, projects, ... but not settings) lost every ticket or message
// after a reload, and users in different modules overwrote each other.
const FILE = '20261124090000_tenant_state_patch.sql';
const TENANT = '00000000-0000-4000-8000-0000000000e1';
const OTHER = '00000000-0000-4000-8000-0000000000e2';
const MEMBER = '00000000-0000-4000-8000-0000000000e3';
const ADMIN = '00000000-0000-4000-8000-0000000000e4';
const OUTSIDER = '00000000-0000-4000-8000-0000000000e5';
let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${MEMBER}', 'member@example.test'), ('${ADMIN}', 'admin@example.test'), ('${OUTSIDER}', 'out@example.test');
    ALTER TABLE public.tenants DISABLE TRIGGER USER;
    ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES
      ('${TENANT}', 'Snap', 'snap', '${ADMIN}'), ('${OTHER}', 'Other', 'snap-other', '${OUTSIDER}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
      ('${TENANT}', '${MEMBER}', 'member'), ('${TENANT}', '${ADMIN}', 'admin'), ('${OTHER}', '${OUTSIDER}', 'owner');
    ALTER TABLE public.tenants ENABLE TRIGGER USER;
    ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
  `);
}, 600000);
afterAll(async () => { await db?.close(); });

const as = (user) => db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user]);
const patch = async (user, value, tenant = TENANT) => {
  await as(user);
  const { rows: [{ r }] } = await db.query(`SELECT public.save_tenant_state_patch($1, $2, 3) AS r`, [tenant, JSON.stringify(value)]);
  return r;
};
const snapshot = async () => (await db.query(`SELECT state FROM public.tenant_state_snapshots WHERE tenant_id = $1`, [TENANT])).rows[0]?.state;

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('lets a member save keys of modules they can edit and skips settings', async () => {
  const result = await patch(MEMBER, {
    conversations: [{ id: 'C1' }], projects: [{ id: 'P1' }], auditLog: [{ id: 'A1' }],
    kpiTargets: [{ id: 'K1' }], settings: { company: 'x' },
  });
  expect(result.saved.sort()).toEqual(['auditLog', 'conversations', 'projects']);
  // The default member role edits messages and projects, but not the kpi or settings modules.
  expect(result.denied.sort()).toEqual(['kpiTargets', 'settings']);
  expect(await snapshot()).toEqual({ conversations: [{ id: 'C1' }], projects: [{ id: 'P1' }], auditLog: [{ id: 'A1' }] });
});

it('merges keys so users working in different modules keep each other\'s changes', async () => {
  await patch(ADMIN, { settings: { company: 'Snap MMC' }, kpiTargets: [{ id: 'K1' }] });
  await patch(MEMBER, { conversations: [{ id: 'C1' }, { id: 'C2' }] });
  expect(await snapshot()).toEqual({
    conversations: [{ id: 'C1' }, { id: 'C2' }], projects: [{ id: 'P1' }], auditLog: [{ id: 'A1' }],
    settings: { company: 'Snap MMC' }, kpiTargets: [{ id: 'K1' }],
  });
});

it('refuses non-members, operational collections and a non-object patch', async () => {
  await expect(patch(OUTSIDER, { conversations: [] })).rejects.toThrow('permission_denied');
  await expect(patch(ADMIN, { orders: [{ id: 'O1' }] })).rejects.toThrow('tenant_state_key_not_allowed');
  await as(ADMIN);
  await expect(db.query(`SELECT public.save_tenant_state_patch($1, '[]'::jsonb)`, [TENANT])).rejects.toThrow('tenant_state_patch_invalid');
});

it('maps unknown keys to settings', async () => {
  const result = await patch(MEMBER, { somethingNew: 1 });
  expect(result).toEqual({ saved: [], denied: ['somethingNew'], ignored: [] });
});
