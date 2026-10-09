// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('allocates credit numbers from all tenant history without trusting browser projections', async () => {
  const db = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE credit_contracts(tenant_id uuid,contract_no text,status text,UNIQUE(tenant_id,contract_no));
      INSERT INTO credit_contracts VALUES ('${tenant}','İN-1224','cancelled'),('${other}','İN-9000','active');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261009125327_serialize_credit_contract_numbers.sql', import.meta.url), 'utf8'));
    const insert = number => db.query('INSERT INTO credit_contracts VALUES ($1,$2,$3) RETURNING contract_no', [tenant, number, 'draft']);
    expect((await insert('İN-1224')).rows[0].contract_no).toBe('İN-1225');
    expect((await insert('İN-1224')).rows[0].contract_no).toBe('İN-1226');
    expect((await insert('QA-MANUAL')).rows[0].contract_no).toBe('QA-MANUAL');
    await expect(insert('QA-MANUAL')).rejects.toThrow('unique constraint');
    await db.exec('BEGIN');
    expect((await insert('İN-1001')).rows[0].contract_no).toBe('İN-1227');
    await db.exec('ROLLBACK');
    expect((await insert('İN-1001')).rows[0].contract_no).toBe('İN-1227');
    expect((await db.query('INSERT INTO credit_contracts VALUES ($1,$2,$3) RETURNING contract_no', [other, 'İN-1001', 'draft'])).rows[0].contract_no).toBe('İN-9001');
    await expect(db.query("INSERT INTO credit_contracts VALUES (NULL,'İN-1001','draft')")).rejects.toThrow('tenant_required');
    for (const role of ['anon', 'authenticated']) {
      expect((await db.query(`SELECT has_function_privilege('${role}','private.assign_credit_contract_number()','EXECUTE') allowed`)).rows[0].allowed).toBe(false);
    }
  } finally { await db.close(); }
}, 30000);
