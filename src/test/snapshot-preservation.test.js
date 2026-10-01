// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('preserves whole legacy snapshots without modifying the source or duplicating archives', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE tenant_state_snapshots(tenant_id uuid,state jsonb,schema_version int,updated_at timestamptz);
      INSERT INTO tenant_state_snapshots VALUES ('11111111-1111-4111-8111-111111111111',
        '{"unmappedCollection":[{"value":123}]}',3,now());`);
    const sql = await readFile(new URL('../../supabase/migrations/20261001060540_preserve_legacy_snapshots_before_cutover.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    expect((await db.query('SELECT count(*)::int n FROM private.legacy_snapshot_archive')).rows[0].n).toBe(1);
    expect((await db.query('SELECT a.snapshot=to_jsonb(s) equal FROM tenant_state_snapshots s JOIN private.legacy_snapshot_archive a USING(tenant_id)')).rows[0].equal).toBe(true);
    await db.exec("UPDATE tenant_state_snapshots SET state=state||'{\"newCollection\":[]}'::jsonb");
    await db.exec(sql);
    expect((await db.query('SELECT count(*)::int n FROM private.legacy_snapshot_archive')).rows[0].n).toBe(2);
    expect((await db.query("SELECT has_table_privilege('authenticated','private.legacy_snapshot_archive','SELECT') allowed")).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 30000);
