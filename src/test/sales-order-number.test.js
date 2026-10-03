// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it('assigns standard sale numbers from all tenant history rather than an active browser list', async () => {
  const db = new PGlite();
  const tenant = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE orders(tenant_id uuid,order_no text,status text, UNIQUE(tenant_id,order_no));
      INSERT INTO orders VALUES ('${tenant}','SF-1029','cancelled'),('${other}','SF-9000','confirmed');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261003062046_serialize_sales_order_numbers.sql', import.meta.url), 'utf8'));
    const insert = number => db.query('INSERT INTO orders VALUES ($1,$2,$3) RETURNING order_no', [tenant, number, 'draft']);
    expect((await insert('SF-1029')).rows[0].order_no).toBe('SF-1030');
    expect((await insert('SF-1029')).rows[0].order_no).toBe('SF-1031');
    expect((await insert('QA-MANUAL')).rows[0].order_no).toBe('QA-MANUAL');
    await expect(insert('QA-MANUAL')).rejects.toThrow('unique constraint');
    const next = await Promise.all([insert('SF-1030'), insert('SF-1030')]);
    expect(next.map(r => r.rows[0].order_no)).toEqual(['SF-1032', 'SF-1033']);
    expect((await db.query(`SELECT has_function_privilege('anon','private.assign_sales_order_number()','EXECUTE') allowed`)).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 30000);
