// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { applyCreditPrincipalPayment } from '../shared/lib/credit.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const credit = '22222222-2222-4222-8222-222222222222';
const account = '33333333-3333-4333-8333-333333333333';
const order = '44444444-4444-4444-8444-444444444444';

it('preserves cents in the credit payment preview and allocation', () => {
  const result = applyCreditPrincipalPayment({ total: 1000, balance: 1000, months: 12,
    installments: [{ amount: 83.33, due: '2026-10-10' }, { amount: 83.33, due: '2026-11-10' }] }, 133.33);
  expect(result.appliedPrincipal).toBe(133.33);
  expect(result.nextBalance).toBe(866.67);
  expect(result.extraPrincipal).toBe(50);
  expect(result.installments.map(row => row.amount)).toEqual([0, 33.33]);
});

it('posts principal and manual late fees atomically, with tenant and replay guards', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
      CREATE TABLE operation_requests(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,
        request_hash text,status text DEFAULT 'processing',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
      CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid,status text,currency text);
      CREATE TABLE credit_contracts(id uuid PRIMARY KEY,tenant_id uuid,order_id uuid,customer_id uuid,contract_no text,status text,
        collection_stage text DEFAULT 'current',closed_at timestamptz,updated_at timestamptz);
      CREATE TABLE cash_accounts(id uuid PRIMARY KEY,tenant_id uuid,is_active boolean,currency text,created_at timestamptz DEFAULT now());
      CREATE TABLE credit_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,credit_id uuid,
        installment_no int,principal_due numeric,principal_paid numeric DEFAULT 0,penalty_due numeric DEFAULT 0,
        penalty_paid numeric DEFAULT 0,status text DEFAULT 'pending',due_date date DEFAULT current_date+30,paid_at timestamptz);
      CREATE TABLE credit_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,credit_id uuid,
        receipt_no text,amount numeric,principal_amount numeric,penalty_amount numeric,unallocated_amount numeric,
        payment_method text,note text,UNIQUE(tenant_id,receipt_no),
        CHECK(amount=principal_amount+penalty_amount+unallocated_amount));
      CREATE TABLE credit_payment_allocations(tenant_id uuid,payment_id uuid,installment_id uuid,principal_amount numeric,penalty_amount numeric);
      CREATE TABLE cash_transactions(tenant_id uuid,account_id uuid,direction text,amount numeric,category text,description text,
        reference_type text,reference_id uuid,reference text,currency text,customer_id uuid);
      CREATE TABLE audit_events(id text,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
      INSERT INTO orders VALUES('${order}','${tenant}','confirmed','AZN');
      INSERT INTO credit_contracts(id,tenant_id,order_id,contract_no,status) VALUES('${credit}','${tenant}','${order}','TEST','active');
      INSERT INTO cash_accounts VALUES('${account}','${tenant}',true,'AZN',now());
      INSERT INTO credit_installments(tenant_id,credit_id,installment_no,principal_due) VALUES
        ('${tenant}','${credit}',1,83.33),('${tenant}','${credit}',2,916.67);`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261003071002_guarded_credit_payment_receipts.sql', import.meta.url), 'utf8'));
    const call = (receipt = 'receipt-1', amount = 150.33, penalty = 17, cash = account) => db.query(
      `SELECT public.post_credit_payment('${tenant}','${credit}',$1,$2,$3,$4,'cash',NULL) id`, [receipt, amount, penalty, cash]);
    const result = await call();
    expect((await call()).rows).toEqual(result.rows);
    expect((await db.query('SELECT amount,principal_amount,penalty_amount,unallocated_amount FROM credit_payments')).rows)
      .toEqual([{ amount: '150.33', principal_amount: '133.33', penalty_amount: '17.00', unallocated_amount: '0' }]);
    expect((await db.query('SELECT principal_paid,penalty_paid FROM credit_installments ORDER BY installment_no')).rows)
      .toEqual([{ principal_paid: '83.33', penalty_paid: '0' }, { principal_paid: '50.00', penalty_paid: '0' }]);
    expect((await db.query('SELECT amount,currency FROM cash_transactions')).rows).toEqual([{ amount: '150.33', currency: 'AZN' }]);
    await expect(call('receipt-1', 160.33)).rejects.toThrow('idempotency_key_payload_mismatch');
    await expect(call('bad-account', 10, 0, order)).rejects.toThrow('cash_account_not_found');
    await expect(call('overpayment', 900, 0)).rejects.toThrow('credit_payment_exceeds_balance');
    await db.exec(`UPDATE orders SET status='cancelled'`);
    await expect(call('cancelled', 10, 0)).rejects.toThrow('order_not_active');
    expect((await call()).rows).toEqual(result.rows);
    await db.exec(`UPDATE orders SET status='confirmed'; UPDATE credit_contracts SET status='draft'`);
    await expect(call('draft', 10, 0)).rejects.toThrow('credit_not_started');
    await db.exec(`UPDATE credit_contracts SET status='active';
      CREATE FUNCTION reject_cash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cash_write_failed'; END $$;
      CREATE TRIGGER reject_cash BEFORE INSERT ON cash_transactions FOR EACH ROW EXECUTE FUNCTION reject_cash();`);
    await expect(call('failed-cash', 10, 0)).rejects.toThrow('cash_write_failed');
    expect((await db.query('SELECT count(*)::int n FROM credit_payments')).rows[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int n FROM operation_requests')).rows[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int n FROM audit_events')).rows[0].n).toBe(1);
    await db.exec(`CREATE OR REPLACE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT NULL::boolean $$;`);
    await expect(call('null-permission', 10, 0)).rejects.toThrow('permission_denied');
    await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;`);
    await expect(call('anonymous', 10, 0)).rejects.toThrow('permission_denied');
  } finally { await db.close(); }
}, 30000);
