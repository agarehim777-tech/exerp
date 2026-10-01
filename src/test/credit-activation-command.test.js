// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
it('requires the deposit, rejects cancelled sales, and replays activation without rebuilding installments', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
      CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE TABLE orders(id uuid,tenant_id uuid,status text,paid_amount numeric);
      CREATE TABLE credit_contracts(id uuid,tenant_id uuid,order_id uuid,contract_no text,principal numeric,
        initial_payment numeric,required_initial numeric,term_months integer,start_date date,status text,updated_at timestamptz);
      CREATE TABLE credit_installments(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,credit_id uuid,installment_no integer,due_date date,principal_due numeric);
      CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
      INSERT INTO orders VALUES('${tenant}','${tenant}','confirmed',200);
      INSERT INTO credit_contracts VALUES('${tenant}','${tenant}','${tenant}','CREDIT',20000,200,2000,12,NULL,'draft',now());`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261001065418_restore_guarded_credit_activation_rpc.sql', import.meta.url), 'utf8'));
    const start = (date = '2026-10-01') => db.query(`SELECT start_credit_contract('${tenant}','${tenant}',$1::date)`, [date]);
    await expect(start()).rejects.toThrow('credit_initial_payment_incomplete');
    expect((await db.query('SELECT count(*)::int n FROM credit_installments')).rows[0].n).toBe(0);
    await db.exec('UPDATE credit_contracts SET initial_payment=2000');
    await expect(start()).rejects.toThrow('credit_deposit_order_mismatch');
    await db.exec('UPDATE orders SET paid_amount=2000');
    await start();
    const schedule = (await db.query('SELECT * FROM credit_installments ORDER BY installment_no')).rows;
    expect(schedule).toHaveLength(12);
    expect(schedule.reduce((sum, row) => sum + Number(row.principal_due), 0)).toBe(18000);
    await start();
    expect((await db.query('SELECT * FROM credit_installments ORDER BY installment_no')).rows).toEqual(schedule);
    expect((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n).toBe(1);
    await expect(start('2026-10-02')).rejects.toThrow('credit_already_started');
    await db.exec("UPDATE orders SET status='cancelled'");
    await expect(start()).rejects.toThrow('credit_order_cancelled');
    await expect(db.query("SELECT start_credit_contract('22222222-2222-4222-8222-222222222222',$1,current_date)", [tenant]))
      .rejects.toThrow('permission_denied');
  } finally { await db.close(); }
}, 30000);
