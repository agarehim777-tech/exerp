// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, expect, it } from 'vitest';

const tenant = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const account = '10000000-0000-0000-0000-000000000001';
const order = '20000000-0000-0000-0000-000000000001';
const credit = '30000000-0000-0000-0000-000000000001';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE TABLE tenants(id uuid PRIMARY KEY);
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO tenants VALUES ('${tenant}'),('${other}');
    INSERT INTO auth.users VALUES ('${tenant}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
    CREATE TABLE cash_accounts(id uuid PRIMARY KEY,tenant_id uuid,currency text,opening_balance numeric,is_active boolean DEFAULT true);
    CREATE TABLE cash_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,account_id uuid,
      transaction_no text,direction text,amount numeric,currency text,category text,reference text,description text,
      occurred_at timestamptz,created_by uuid,reversal_of uuid);
    CREATE TABLE expenses(id uuid PRIMARY KEY,tenant_id uuid,expense_no text,account_id uuid,amount numeric,vat_amount numeric,
      currency text,category text,description text,expense_date date,status text,created_by uuid);
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,request_key text,operation text,
      request_hash text,status text DEFAULT 'processing',result jsonb,completed_at timestamptz,UNIQUE(tenant_id,request_key));
    CREATE TABLE audit_events(id text PRIMARY KEY,tenant_id uuid,actor_id uuid,module text,action text,detail text,payload jsonb);
    CREATE TABLE tenant_collection_records(tenant_id uuid,collection text,record_key text,data jsonb);
    CREATE TABLE orders(id uuid PRIMARY KEY,tenant_id uuid,status text,currency text,total numeric,paid_amount numeric);
    CREATE TABLE credit_contracts(id uuid PRIMARY KEY,tenant_id uuid,order_id uuid,status text);
    CREATE TABLE credit_installments(tenant_id uuid,credit_id uuid,principal_due numeric,principal_paid numeric,penalty_due numeric,penalty_paid numeric,status text);
    CREATE TABLE vendor_invoices(id uuid PRIMARY KEY,tenant_id uuid);
    INSERT INTO cash_accounts VALUES ('${account}','${tenant}','AZN',1000,true),
      ('10000000-0000-0000-0000-000000000002','${other}','AZN',10000,true);
    INSERT INTO tenant_collection_records VALUES ('${tenant}','employees','employee-a','{"id":"employee-a"}');
    INSERT INTO orders VALUES ('${order}','${tenant}','confirmed','AZN',500,100);
    INSERT INTO credit_contracts VALUES ('${credit}','${tenant}','${order}','active');
    INSERT INTO credit_installments VALUES ('${tenant}','${credit}',400,0,10,0,'pending');
    -- The integration audit exercises the real delegates; these stubs verify wrapper allocation and rollback.
    CREATE FUNCTION post_credit_payment(uuid,uuid,text,numeric,numeric,uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$
      DECLARE result uuid:=gen_random_uuid(); BEGIN
      UPDATE public.credit_installments SET principal_paid=principal_due,penalty_paid=penalty_due WHERE tenant_id=$1 AND credit_id=$2;
      INSERT INTO public.cash_transactions(id,tenant_id,account_id,direction,amount,currency,category) VALUES(result,$1,$6,'in',$4,'AZN','credit_payment');
      RETURN result; END $$;
    CREATE FUNCTION register_order_payment(uuid,numeric,uuid) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
      UPDATE public.orders SET paid_amount=paid_amount+$2 WHERE id=$1; RETURN gen_random_uuid(); END $$;
    CREATE FUNCTION pay_vendor_invoice_atomic(uuid,text,jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'test_invoice_not_matched'; END $$;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20260922070837_server_cashbook_ledger.sql', import.meta.url), 'utf8'));
  await db.exec(`
    ALTER TABLE cash_accounts ADD COLUMN name text DEFAULT 'Test cash', ADD COLUMN created_at timestamptz DEFAULT now();
    ALTER TABLE orders ADD COLUMN order_no text DEFAULT 'SF-TEST', ADD COLUMN customer_id uuid DEFAULT '${tenant}', ADD COLUMN order_date date DEFAULT current_date;
    ALTER TABLE credit_contracts ADD COLUMN contract_no text DEFAULT 'IN-TEST', ADD COLUMN customer_id uuid DEFAULT '${tenant}',
      ADD COLUMN principal numeric DEFAULT 500, ADD COLUMN initial_payment numeric DEFAULT 100;
    ALTER TABLE credit_installments ADD COLUMN due_date date DEFAULT current_date;
    CREATE TABLE customers(id uuid PRIMARY KEY,tenant_id uuid,name text);
    INSERT INTO customers VALUES ('${tenant}','${tenant}','Test customer');
    CREATE TABLE vendors(id uuid PRIMARY KEY,tenant_id uuid,name text);
    CREATE TABLE purchase_orders(id uuid PRIMARY KEY,tenant_id uuid,status text);
    ALTER TABLE vendor_invoices ADD COLUMN vendor_id uuid, ADD COLUMN po_id uuid, ADD COLUMN invoice_number text,
      ADD COLUMN invoice_date date, ADD COLUMN due_date date, ADD COLUMN currency text, ADD COLUMN status text;
    CREATE TABLE vendor_invoice_lines(invoice_id uuid,qty_invoiced numeric,unit_price numeric,tax_rate numeric);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261010062858_server_receivable_kpi_settlement.sql', import.meta.url), 'utf8'));
}, 60000);
afterAll(async () => db?.close());
const command = async (name, key, payload, target = tenant) => (await db.query(`select ${name}($1,$2,$3::jsonb) as result`,
  [target,key,JSON.stringify(payload)])).rows[0].result;
const snapshot = amount => ({ payoutAmount: amount, companyScore: 98, payoutRows: [{ employeeId: 'employee-a', payoutAmount: amount }] });

it('closes, approves and pays the frozen period with one real expense and cash posting', async () => {
  const closed = await command('run_kpi_period_atomic','kpi-close',{ action: 'close',period: '2026-01',snapshot: snapshot(100) });
  expect(closed.status).toBe('closed');
  await command('run_kpi_period_atomic','kpi-approve',{ action: 'approve',period: '2026-01' });
  const payload = { action: 'payout',period: '2026-01',account_id: account };
  const paid = await command('run_kpi_period_atomic','kpi-paid',payload);
  expect(paid).toMatchObject({ status: 'paid',payout_amount: 100 });
  expect(await command('run_kpi_period_atomic','kpi-paid',payload)).toEqual(paid);
  expect((await db.query("select count(*)::int n from cash_transactions where direction='out'")).rows[0].n).toBe(1);
  expect((await db.query('select status from expenses where id=$1',[paid.expense_id])).rows[0].status).toBe('approved');
  await expect(db.query('update expenses set amount=1 where id=$1',[paid.expense_id])).rejects.toThrow('paid_kpi_expense_is_locked');
  const posting = (await db.query("select id from cash_transactions where reference=$1",['EXPENSE:' + paid.expense_id])).rows[0];
  await expect(db.query('delete from cash_transactions where id=$1',[posting.id])).rejects.toThrow('paid_kpi_cash_is_locked');
  await expect(db.query("insert into cash_transactions(tenant_id,account_id,direction,amount,reversal_of) values($1,$2,'in',100,$3)",
    [tenant,account,posting.id])).rejects.toThrow('paid_kpi_cash_is_locked');
  await expect(command('run_kpi_period_atomic','kpi-paid-twice',payload)).rejects.toThrow('kpi_period_not_approved');
  await expect(command('run_kpi_period_atomic','kpi-close-again',{ action: 'close',period: '2026-01',snapshot: snapshot(200) })).rejects.toThrow('kpi_period_already_closed');
});
it('reads the canonical debt registry without duplicate linked orders or foreign accounts', async () => {
  const ledger = (await db.query('select receivable_ledger_snapshot($1) as result',[tenant])).rows[0].result;
  expect(ledger.items).toHaveLength(1);
  expect(ledger.items[0]).toMatchObject({ source_type: 'credit',source_id: credit,amount: 410,can_settle: true });
  expect(ledger.accounts).toHaveLength(1);
  expect(ledger.accounts[0].id).toBe(account);
  await expect(db.query('select receivable_ledger_snapshot($1)',[other])).rejects.toThrow('permission_denied');
});
it('rejects foreign or duplicate employees, fractional amounts, mismatched totals and out-of-order actions', async () => {
  await expect(command('run_kpi_period_atomic','foreign',{ action: 'close',period: '2026-02',snapshot: { payoutAmount: 100,payoutRows: [{ employeeId: 'foreign',payoutAmount: 100 }] } })).rejects.toThrow('invalid_kpi_employee_scope');
  await expect(command('run_kpi_period_atomic','duplicate',{ action: 'close',period: '2026-02',snapshot: { payoutAmount: 200,payoutRows: [...snapshot(100).payoutRows,...snapshot(100).payoutRows] } })).rejects.toThrow('invalid_kpi_employee_scope');
  await expect(command('run_kpi_period_atomic','fraction',{ action: 'close',period: '2026-02',snapshot: snapshot(1.001) })).rejects.toThrow('invalid_kpi_amount');
  await expect(command('run_kpi_period_atomic','total',{ action: 'close',period: '2026-02',snapshot: { ...snapshot(100),payoutAmount: 200 } })).rejects.toThrow('kpi_total_mismatch');
  await expect(command('run_kpi_period_atomic','unordered',{ action: 'payout',period: '2026-02',account_id: account })).rejects.toThrow('kpi_period_not_approved');
  await expect(command('run_kpi_period_atomic','future',{ action: 'close',period: '2099-01',snapshot: snapshot(100) })).rejects.toThrow('invalid_kpi_request');
});
it('rolls back a failed payout and allows the same request to retry without losing approval', async () => {
  await command('run_kpi_period_atomic','rollback-close',{ action: 'close',period: '2026-03',snapshot: snapshot(10000) });
  await command('run_kpi_period_atomic','rollback-approve',{ action: 'approve',period: '2026-03' });
  const payload = { action: 'payout',period: '2026-03',account_id: account };
  await expect(command('run_kpi_period_atomic','rollback-payout',payload)).rejects.toThrow('insufficient_funds');
  expect((await db.query("select status from kpi_periods where period='2026-03-01'")).rows[0].status).toBe('approved');
  expect((await db.query("select count(*)::int n from operation_requests where request_key='rollback-payout'")).rows[0].n).toBe(0);
  await db.query('update cash_accounts set opening_balance=20000 where id=$1',[account]);
  expect((await command('run_kpi_period_atomic','rollback-payout',payload)).status).toBe('paid');
});
it('settles exact server principal and penalties once and preserves a structured credit link', async () => {
  const payload = { source_type: 'credit',source_id: credit,account_id: account,amount: 1 };
  const result = await command('settle_receivable_atomic','settle-credit',payload);
  expect(result).toMatchObject({ amount: 410,principal: 400,penalty: 10 });
  expect(await command('settle_receivable_atomic','settle-credit',payload)).toEqual(result);
  await expect(command('settle_receivable_atomic','settle-credit-again',payload)).rejects.toThrow('receivable_already_settled');
  expect((await db.query('select credit_id,amount from receivable_settlements')).rows[0]).toMatchObject({ credit_id: credit,amount: '410.00' });
});
it('denies foreign tenants/accounts, linked-credit bypass and invoice failures without partial settlement', async () => {
  await expect(command('settle_receivable_atomic','scope',{ source_type: 'credit',source_id: credit,account_id: account },other)).rejects.toThrow('permission_denied');
  await expect(command('settle_receivable_atomic','account',{ source_type: 'order',source_id: order,account_id: '10000000-0000-0000-0000-000000000002' })).rejects.toThrow('account_not_found');
  await expect(command('settle_receivable_atomic','bypass',{ source_type: 'order',source_id: order,account_id: account })).rejects.toThrow('settle_linked_credit_instead');
  await expect(command('settle_receivable_atomic','invoice',{ source_type: 'vendor_invoice',source_id: order,account_id: account })).rejects.toThrow('test_invoice_not_matched');
  expect((await db.query("select count(*)::int n from operation_requests where request_key in ('scope','account','bypass','invoice')")).rows[0].n).toBe(0);
});
it('rejects mismatched replay payloads and exposes only read privileges on financial records', async () => {
  await expect(command('run_kpi_period_atomic','kpi-paid',{ action: 'payout',period: '2026-01',account_id: null })).rejects.toThrow('idempotency_key_payload_mismatch');
  const privileges = (await db.query(`select has_table_privilege('authenticated','kpi_periods','INSERT') as write,
    has_table_privilege('authenticated','receivable_settlements','SELECT') as read,
    has_function_privilege('anon','run_kpi_period_atomic(uuid,text,jsonb)','EXECUTE') as anonymous`)).rows[0];
  expect(privileges).toEqual({ write: false,read: true,anonymous: false });
});
