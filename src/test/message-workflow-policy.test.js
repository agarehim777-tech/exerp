// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const foreign = '22222222-2222-4222-8222-222222222222';

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA private;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$
      SELECT $1='${tenant}' AND $2=current_setting('test.module') AND current_setting('test.edit')='true' $$;
    CREATE TABLE workflow_records(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,module text,record_type text,title text);
    CREATE TABLE workflow_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,workflow_id uuid REFERENCES workflow_records(id));
    CREATE TABLE workflow_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,workflow_id uuid REFERENCES workflow_records(id));
    GRANT USAGE ON SCHEMA private TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON workflow_records,workflow_lines,workflow_approvals TO authenticated;
    ALTER TABLE workflow_records ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workflow_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE workflow_approvals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workflow_records_tenant_select ON workflow_records FOR SELECT TO authenticated USING(tenant_id='${tenant}');
    CREATE POLICY workflow_lines_tenant_select ON workflow_lines FOR SELECT TO authenticated USING(tenant_id='${tenant}');
    CREATE POLICY workflow_approvals_tenant_select ON workflow_approvals FOR SELECT TO authenticated USING(tenant_id='${tenant}');
    CREATE POLICY workflow_records_tenant_write ON workflow_records FOR ALL TO authenticated USING(private.has_module_access(tenant_id,module,'edit'));
    CREATE POLICY workflow_lines_tenant_write ON workflow_lines FOR ALL TO authenticated USING(false);
    CREATE POLICY workflow_approvals_tenant_write ON workflow_approvals FOR ALL TO authenticated USING(false);
    SELECT set_config('test.module','messages',false),set_config('test.edit','true',false);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261006131651_align_message_workflow_authorization.sql',import.meta.url),'utf8'));
  await db.exec('SET ROLE authenticated');
  return db;
}

it('authorizes only known thread types with messages permission, including tenant-scoped children', async () => {
  const db = await database();
  try {
    for (const type of ['direct_thread','group_thread']) {
      const id = (await db.query('INSERT INTO workflow_records(tenant_id,module,record_type) VALUES($1,$2,$3) RETURNING id',
        [tenant,'communications',type])).rows[0].id;
      for (const table of ['workflow_lines','workflow_approvals']) {
        await db.query(`INSERT INTO ${table}(tenant_id,workflow_id) VALUES($1,$2)`,[tenant,id]);
        await expect(db.query(`INSERT INTO ${table}(tenant_id,workflow_id) VALUES($1,$2)`,[foreign,id])).rejects.toThrow('row-level security');
      }
      await expect(db.query("UPDATE workflow_records SET record_type='provider_secret' WHERE id=$1",[id])).rejects.toThrow('row-level security');
      await expect(db.query("UPDATE workflow_records SET tenant_id=$1 WHERE id=$2",[foreign,id])).rejects.toThrow('row-level security');
    }
    for (const [scope,module,type] of [[foreign,'communications','direct_thread'],[tenant,'communications','provider_secret'],[tenant,'hr','direct_thread']]) {
      await expect(db.query('INSERT INTO workflow_records(tenant_id,module,record_type) VALUES($1,$2,$3)',[scope,module,type]))
        .rejects.toThrow('row-level security');
    }
  } finally { await db.close(); }
},30000);

it('preserves other module permissions and rejects read-only thread writes', async () => {
  const db = await database();
  try {
    const id = (await db.query("INSERT INTO workflow_records(tenant_id,module,record_type) VALUES($1,'communications','direct_thread') RETURNING id",[tenant])).rows[0].id;
    await db.exec("SELECT set_config('test.edit','false',false)");
    await expect(db.query("INSERT INTO workflow_records(tenant_id,module,record_type) VALUES($1,'communications','direct_thread')",[tenant]))
      .rejects.toThrow('row-level security');
    expect((await db.query("UPDATE workflow_records SET title='forbidden' WHERE id=$1 RETURNING id",[id])).rows).toEqual([]);
    await expect(db.query('INSERT INTO workflow_lines(tenant_id,workflow_id) VALUES($1,$2)',[tenant,id])).rejects.toThrow('row-level security');
    await db.exec("SELECT set_config('test.edit','true',false),set_config('test.module','procurement',false)");
    await db.query("INSERT INTO workflow_records(tenant_id,module,record_type) VALUES($1,'procurement','purchase_order')",[tenant]);
    await expect(db.query("INSERT INTO workflow_records(tenant_id,module,record_type) VALUES($1,'communications','direct_thread')",[tenant]))
      .rejects.toThrow('row-level security');
  } finally { await db.close(); }
},30000);
