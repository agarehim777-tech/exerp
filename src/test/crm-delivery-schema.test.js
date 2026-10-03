// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('restores CRM relations with tenant foreign keys and view/edit permissions', async () => {
  const db = new PGlite();
  const own = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${own}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$
        SELECT $1='${own}'::uuid AND $2='crm' AND ($3='view' OR current_setting('test.edit',true)='true') $$;
      GRANT USAGE ON SCHEMA auth,private TO authenticated;
      CREATE TABLE tenants(id uuid PRIMARY KEY);
      CREATE TABLE customers(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE products(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid);
      CREATE TABLE deliveries(id uuid PRIMARY KEY);
      INSERT INTO tenants VALUES('${own}'),('${other}');
      INSERT INTO auth.users VALUES('${own}');
      INSERT INTO customers VALUES('${own}','${own}'),('${other}','${other}');
      INSERT INTO products VALUES('${own}','${own}'),('${other}','${other}');
      INSERT INTO orders VALUES('${own}','${own}'),('${other}','${other}');`);
    const migration = await readFile(new URL('../../supabase/migrations/20261003064212_restore_crm_delivery_read_contracts.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.query('INSERT INTO customer_documents(tenant_id,customer_id,title,file_path,file_name) VALUES($1,$1,$2,$2,$2)', [other, 'foreign']);
    await db.exec("SET ROLE authenticated; SET test.edit='true'");
    await db.query('INSERT INTO customer_documents(tenant_id,customer_id,title,file_path,file_name) VALUES($1,$1,$2,$2,$2)', [own, 'own']);
    await expect(db.query('INSERT INTO customer_documents(tenant_id,customer_id,title,file_path,file_name) VALUES($1,$2,$3,$3,$3)', [own, other, 'cross-tenant']))
      .rejects.toThrow('foreign key constraint');
    await expect(db.query('INSERT INTO customer_service_cases(tenant_id,customer_id,product_id,case_no,subject) VALUES($1,$1,$2,$3,$3)', [own, other, 'cross-product']))
      .rejects.toThrow('foreign key constraint');
    await db.exec("SET test.edit='false'");
    expect((await db.query('SELECT title FROM customer_documents')).rows).toEqual([{ title: 'own' }]);
    expect((await db.query("UPDATE customer_documents SET title='changed' RETURNING title")).rows).toEqual([]);
    await expect(db.query('INSERT INTO customer_documents(tenant_id,customer_id,title,file_path,file_name) VALUES($1,$1,$2,$2,$2)', [own, 'denied']))
      .rejects.toThrow('row-level security');
    await db.exec('RESET ROLE');
    expect((await db.query("SELECT has_table_privilege('anon','public.customer_documents','SELECT') allowed")).rows[0].allowed).toBe(false);
    expect((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='deliveries' AND column_name IN('acceptance_name','acceptance_document_no','acceptance_signature','accepted_at','acceptance_note','warehouse_employee_name')")).rows[0].n).toBe(6);
  } finally { await db.close(); }
}, 30000);
