// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// 20261117120000_rls_member_tenant_sets.sql replaces per-row SECURITY DEFINER membership calls in
// RLS policies with a per-query set lookup. These tests pin that the rewrite is complete and that
// the new form answers exactly like the old helpers.
const tenantA = '00000000-0000-4000-8000-00000000000a';
const tenantB = '00000000-0000-4000-8000-00000000000b';
const member = '00000000-0000-4000-8000-000000000001';
const admin = '00000000-0000-4000-8000-000000000002';
const owner = '00000000-0000-4000-8000-000000000003';
const outsider = '00000000-0000-4000-8000-000000000004';
let db;

beforeAll(async () => {
  ({ db } = await replayMigrations());
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${member}', 'm@example.test'), ('${admin}', 'a@example.test'),
      ('${owner}', 'o@example.test'), ('${outsider}', 'x@example.test');
    ALTER TABLE public.tenants DISABLE TRIGGER USER;
    ALTER TABLE public.tenant_members DISABLE TRIGGER USER;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${tenantA}', 'A', 'rls-a', '${admin}'), ('${tenantB}', 'B', 'rls-b', '${owner}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
      ('${tenantA}', '${member}', 'member'), ('${tenantA}', '${admin}', 'admin'),
      ('${tenantB}', '${owner}', 'owner'), ('${tenantB}', '${member}', 'member');
    ALTER TABLE public.tenants ENABLE TRIGGER USER;
    ALTER TABLE public.tenant_members ENABLE TRIGGER USER;
  `);
}, 600000);
afterAll(async () => { await db?.close(); });

it('leaves no per-row tenant membership call in public policies', async () => {
  const { rows } = await db.query(`
    SELECT tablename, policyname FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'private\\.is_tenant_(member|admin)\\('`);
  expect(rows).toEqual([]);
  const { rows: [{ count }] } = await db.query(`
    SELECT count(*)::int AS count FROM pg_policies
     WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%member_tenant_ids()%'`);
  expect(count).toBeGreaterThan(50);
});

it.each([member, admin, owner, outsider])('answers like the old helpers for user %s', async (user) => {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false)`);
  for (const tenant of [tenantA, tenantB, null]) {
    const { rows: [row] } = await db.query(`
      SELECT private.is_tenant_member($1::uuid, $2::uuid) AS old_member,
             COALESCE(($1::uuid IN (SELECT private.member_tenant_ids())), false) AS new_member,
             private.is_tenant_admin($1::uuid, $2::uuid) AS old_admin,
             COALESCE(($1::uuid IN (SELECT private.admin_tenant_ids())), false) AS new_admin`, [tenant, user]);
    expect(row.new_member).toBe(row.old_member);
    expect(row.new_admin).toBe(row.old_admin);
  }
});

it('still isolates tenants through RLS', async () => {
  await db.exec(`
    INSERT INTO public.audit_events (id, tenant_id, actor_id, module, action)
    VALUES ('rls-a', '${tenantA}', '${admin}', 'rls', 'probe'), ('rls-b', '${tenantB}', '${owner}', 'rls', 'probe')`);
  const visible = async (user) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${user}', false); SET ROLE authenticated`);
    try {
      const { rows } = await db.query("SELECT tenant_id FROM public.audit_events WHERE action = 'probe' ORDER BY tenant_id");
      return rows.map((r) => r.tenant_id);
    } finally {
      await db.exec('RESET ROLE');
    }
  };
  expect(await visible(admin)).toEqual([tenantA]);
  expect(await visible(owner)).toEqual([tenantB]);
  expect(await visible(member)).toEqual([tenantA, tenantB]);
  expect(await visible(outsider)).toEqual([]);
});
