// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { defaultRoles } from '../services/permissions.js';

// 20261128090000: ordinary members (and every default app role) can open support tickets.
it('gives the member role edit on the support module and leaves viewer read-only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE app_role AS ENUM ('owner','admin','member','viewer');
      CREATE TABLE public.role_permissions(role app_role, module text, can_view boolean, can_edit boolean, UNIQUE(role, module));
      INSERT INTO public.role_permissions VALUES ('member','support',true,false),('viewer','support',true,false),('member','settings',true,false);`);
    const sql = await readFile(new URL('../../supabase/migrations/20261128090000_member_support_tickets.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // re-runnable
    const rows = (await db.query(`SELECT role::text, module, can_view, can_edit FROM public.role_permissions ORDER BY role, module`)).rows;
    expect(rows).toEqual([
      { role: 'member', module: 'settings', can_view: true, can_edit: false },
      { role: 'member', module: 'support', can_view: true, can_edit: true },
      { role: 'viewer', module: 'support', can_view: true, can_edit: false },
    ]);
  } finally { await db.close(); }
}, 30000);

it('lets every default app role manage support tickets', () => {
  for (const role of defaultRoles) expect(role.permissions, role.name).toContain('support.manage');
});
