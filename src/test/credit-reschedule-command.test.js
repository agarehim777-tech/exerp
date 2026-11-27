// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

// Changing a credit payment date is saved on credit_installments (20261127110000); before, it only went into
// the retired browser credits list and was lost on the next read.
const tenant = '11111111-1111-4111-8111-111111111111';
const credit = '33333333-3333-4333-8333-333333333333';

it('moves one open installment of an active credit and keeps the schedule in order', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid AND $2='credits' AND $3='edit' $$;
      CREATE TABLE credit_contracts(id uuid,tenant_id uuid,status text);
      CREATE TABLE credit_installments(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,credit_id uuid,installment_no integer,
        due_date date,principal_paid numeric DEFAULT 0,status text DEFAULT 'pending');
      INSERT INTO credit_contracts VALUES('${credit}','${tenant}','active');
      INSERT INTO credit_installments(tenant_id,credit_id,installment_no,due_date,principal_paid,status) VALUES
        ('${tenant}','${credit}',1,'2026-10-01',100,'paid'),
        ('${tenant}','${credit}',2,'2026-11-01',0,'overdue'),
        ('${tenant}','${credit}',3,'2026-12-01',0,'pending');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261127110000_reschedule_credit_installment.sql', import.meta.url), 'utf8'));
    const move = (no, date, tenantId = tenant) =>
      db.query(`SELECT reschedule_credit_installment($1,'${credit}',$2,$3::date)`, [tenantId, no, date]);
    const schedule = async () => (await db.query(
      `SELECT installment_no, to_char(due_date,'YYYY-MM-DD') due, status FROM credit_installments ORDER BY installment_no`)).rows;

    // Out of order with the next installment.
    await expect(move(2, '2026-12-01')).rejects.toThrow('credit_due_date_out_of_order');
    await move(2, '2026-11-20');
    expect((await schedule())[1]).toEqual({ installment_no: 2, due: '2026-11-20', status: 'overdue' });
    await move(2, '2026-11-25');
    await expect(move(2, '2026-10-01')).rejects.toThrow('credit_due_date_out_of_order');
    await expect(move(1, '2026-09-20')).rejects.toThrow('credit_installment_closed');
    await expect(move(9, '2027-01-01')).rejects.toThrow('credit_installment_not_found');
    await expect(move(3, '2026-12-05', '22222222-2222-4222-8222-222222222222')).rejects.toThrow('permission_denied');
    await db.exec(`UPDATE credit_contracts SET status='draft'`);
    await expect(move(3, '2026-12-05')).rejects.toThrow('credit_not_active');
    expect((await schedule()).map((row) => row.due)).toEqual(['2026-10-01', '2026-11-25', '2026-12-01']);
  } finally { await db.close(); }
}, 30000);

it('reopens an overdue installment moved to a future date', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE credit_contracts(id uuid,tenant_id uuid,status text);
      CREATE TABLE credit_installments(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,credit_id uuid,installment_no integer,
        due_date date,principal_paid numeric DEFAULT 0,status text DEFAULT 'pending');
      INSERT INTO credit_contracts VALUES('${credit}','${tenant}','overdue');
      INSERT INTO credit_installments(tenant_id,credit_id,installment_no,due_date,principal_paid,status) VALUES
        ('${tenant}','${credit}',1,'2020-01-01',5,'overdue');`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261127110000_reschedule_credit_installment.sql', import.meta.url), 'utf8'));
    await db.query(`SELECT reschedule_credit_installment('${tenant}','${credit}',1,'2099-01-01')`);
    expect((await db.query('SELECT status FROM credit_installments')).rows[0].status).toBe('partial');
  } finally { await db.close(); }
}, 30000);
