// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';

const tenant = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const account = '10000000-0000-0000-0000-000000000001';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${tenant}'::uuid $$;
    CREATE FUNCTION private.assert_open_accounting_period(uuid,date) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      IF $2 < '2026-01-01'::date THEN RAISE EXCEPTION 'period_locked'; END IF; END $$;
    CREATE TABLE cash_accounts(id uuid PRIMARY KEY, tenant_id uuid, currency text, opening_balance numeric, is_active boolean DEFAULT true);
    CREATE TABLE cash_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, account_id uuid REFERENCES cash_accounts,
      transaction_no text, direction text, amount numeric CHECK(amount > 0), currency text, category text, reference text,
      description text, occurred_at timestamptz, created_by uuid, reversal_of uuid REFERENCES cash_transactions);
    ALTER TABLE cash_transactions ADD COLUMN reference_type text, ADD COLUMN reference_id uuid;
    CREATE TABLE expenses(id uuid PRIMARY KEY, tenant_id uuid, expense_no text, account_id uuid REFERENCES cash_accounts,
      amount numeric, vat_amount numeric, currency text, category text, description text, expense_date date, status text, created_by uuid);
    ALTER TABLE expenses ADD COLUMN cash_account_id uuid, ADD COLUMN cash_transaction_id uuid, ADD COLUMN updated_at timestamptz;
    CREATE TABLE operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, request_key text, operation text,
      request_hash text, status text DEFAULT 'processing', result jsonb, completed_at timestamptz, UNIQUE(tenant_id, request_key));
    CREATE TABLE audit_events(id text PRIMARY KEY, tenant_id uuid, actor_id uuid, module text, action text, detail text, payload jsonb);
    INSERT INTO cash_accounts VALUES ('${account}', '${tenant}', 'AZN', 100, true);
    INSERT INTO cash_accounts VALUES ('10000000-0000-0000-0000-000000000002', '${other}', 'AZN', 9999, true);
    INSERT INTO cash_transactions(tenant_id,account_id,direction,amount,currency,category)
      SELECT '${tenant}', '${account}', 'in', 1, 'AZN', 'sale' FROM generate_series(1, 350);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20260922070837_server_cashbook_ledger.sql', import.meta.url), 'utf8'));
  const oldSummary = (await db.query('select cashbook_ledger_summary($1) as data', [tenant])).rows[0].data;
  await db.exec(await readFile(new URL('../../supabase/migrations/20261003054612_optimize_cashbook_ledger_read.sql', import.meta.url), 'utf8'));
  expect((await db.query('select cashbook_ledger_summary($1) as data', [tenant])).rows[0].data).toEqual(oldSummary);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261002122938_atomic_expense_edit.sql', import.meta.url), 'utf8'));
}, 60000);
afterAll(async () => { await db?.close(); });

const summary = async () => (await db.query('select cashbook_ledger_summary($1) as data', [tenant])).rows[0].data;
const expense = (key, overrides = {}) => db.query('select create_cash_expense_atomic($1,$2,$3::jsonb) as data', [tenant, key, JSON.stringify({ account_id: account, amount: 10, expense_date: '2026-09-23', ...overrides })]);

it('aggregates more than 300 entries and excludes the other tenant', async () => {
  const data = await summary();
  expect(data.accounts).toHaveLength(1);
  expect(data.currencies[0]).toMatchObject({ balance: 450, inflow: 350, outflow: 0 });
});
it('creates expense, cash entry and audit exactly once for repeated keys', async () => {
  const first = (await expense('same-request')).rows[0].data;
  expect((await expense('same-request')).rows[0].data).toEqual(first);
  expect((await db.query('select count(*)::int as n from expenses')).rows[0].n).toBe(1);
  expect((await db.query('select count(*)::int as n from audit_events')).rows[0].n).toBe(1);
  expect((await summary()).currencies[0].balance).toBe(440);
});
it('rejects changed payload on the same key', async () => {
  await expect(expense('same-request', { amount: 20 })).rejects.toThrow('idempotency_key_payload_mismatch');
});
it('rejects overdraft, invalid amounts, currency mismatch, locked dates and foreign accounts', async () => {
  await expect(expense('overdraft', { amount: 10000 })).rejects.toThrow('insufficient_funds');
  await expect(expense('fraction', { amount: 1.001 })).rejects.toThrow('invalid_amount');
  await expect(expense('currency', { currency: 'USD' })).rejects.toThrow('currency_mismatch');
  await expect(expense('locked', { expense_date: '2025-01-01' })).rejects.toThrow('period_locked');
  await expect(expense('foreign', { account_id: '10000000-0000-0000-0000-000000000002' })).rejects.toThrow('account_not_found');
  await expect(db.query('select cashbook_ledger_summary($1)', [other])).rejects.toThrow('permission_denied');
});
it('rolls back expense and request if ledger posting fails', async () => {
  await db.exec(`CREATE FUNCTION reject_test_cash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated_cash_failure'; END $$;
    CREATE TRIGGER reject_test_cash BEFORE INSERT ON cash_transactions FOR EACH ROW EXECUTE FUNCTION reject_test_cash();`);
  await expect(expense('rollback')).rejects.toThrow('simulated_cash_failure');
  await db.exec('DROP TRIGGER reject_test_cash ON cash_transactions');
  expect((await db.query("select count(*)::int as n from operation_requests where request_key = 'rollback'")).rows[0].n).toBe(0);
  expect((await db.query('select count(*)::int as n from expenses')).rows[0].n).toBe(1);
});
it('nets reversals even when their original is outside the visible page', async () => {
  await db.exec(`INSERT INTO cash_transactions(tenant_id,account_id,direction,amount,currency,category,reversal_of)
    SELECT tenant_id,account_id,'out',amount,currency,'transaction_reversal',id FROM cash_transactions WHERE category = 'sale' LIMIT 1;`);
  expect((await summary()).currencies[0]).toMatchObject({ balance: 439, inflow: 349, outflow: 10 });
});

it('transfers both sides once without changing external turnover', async () => {
  const destination = '10000000-0000-0000-0000-000000000003';
  await db.query('insert into cash_accounts values ($1,$2,$3,0,true)', [destination,tenant,'AZN']);
  const args = [tenant,'transfer-1',JSON.stringify({ from_account_id: account,to_account_id: destination,amount: 20,occurred_at: '2026-09-23' })];
  const first = await db.query('select transfer_cash_atomic($1,$2,$3::jsonb) as data',args);
  expect((await db.query('select transfer_cash_atomic($1,$2,$3::jsonb) as data',args)).rows).toEqual(first.rows);
  expect((await summary()).currencies[0]).toMatchObject({ balance: 439,inflow: 349,outflow: 10 });
  expect((await summary()).accounts.find(row => row.id === destination).balance).toBe(20);
  expect((await db.query("select count(*)::int as n from cash_transactions where category = 'internal_transfer'")).rows[0].n).toBe(2);
});

it('rolls back the outgoing transfer if the incoming leg fails', async () => {
  await db.exec(`CREATE FUNCTION reject_transfer_in() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.category = 'internal_transfer' AND NEW.direction = 'in' THEN RAISE EXCEPTION 'incoming_failed'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_transfer_in BEFORE INSERT ON cash_transactions FOR EACH ROW EXECUTE FUNCTION reject_transfer_in();`);
  await expect(db.query('select transfer_cash_atomic($1,$2,$3::jsonb)',[tenant,'failed-transfer',JSON.stringify({ from_account_id: account,to_account_id: '10000000-0000-0000-0000-000000000003',amount: 5,occurred_at: '2026-09-23' })])).rejects.toThrow('incoming_failed');
  await db.exec('DROP TRIGGER reject_transfer_in ON cash_transactions');
  expect((await db.query("select count(*)::int as n from cash_transactions where category = 'internal_transfer'")).rows[0].n).toBe(2);
});

it('refunds only an existing posting and never credits a second refund', async () => {
  const expenseId = (await db.query('select id from expenses limit 1')).rows[0].id;
  await db.query("update expenses set status = 'refund_pending' where id = $1", [expenseId]);
  const payload = JSON.stringify({ expense_id: expenseId,only_pending: true,reason: 'test' });
  await db.query('select refund_cash_expense_atomic($1,$2,$3::jsonb)',[tenant,'refund-1',payload]);
  await db.query('select refund_cash_expense_atomic($1,$2,$3::jsonb)',[tenant,'refund-1',payload]);
  await db.query('select refund_cash_expense_atomic($1,$2,$3::jsonb)',[tenant,'refund-new-key',payload]);
  expect((await summary()).currencies[0]).toMatchObject({ balance: 449,inflow: 349,outflow: 0 });
  expect((await db.query("select count(*)::int as n from cash_transactions where category = 'expense_reversal'")).rows[0].n).toBe(1);
  expect((await db.query('select status from expenses where id = $1',[expenseId])).rows[0].status).toBe('cancelled');
});

const editArgs = (row, overrides = {}) => ({ expense_id: row.id, account_id: row.account_id, amount: 15, vat_amount: 0,
  category: 'other', description: 'edited', expense_date: '2026-09-23', currency: 'AZN',
  expected: { amount: Number(row.amount), vat_amount: Number(row.vat_amount || 0), account_id: row.account_id,
    category: row.category, description: row.description || '', expense_date: new Date(row.expense_date).toISOString().slice(0,10) }, ...overrides });
const edit = (key, payload) => db.query('select edit_cash_expense_atomic($1,$2,$3::jsonb) as data', [tenant,key,JSON.stringify(payload)]);

it('edits both records once and rejects stale, approved, foreign and overdraft edits', async () => {
  const created = (await expense('editable')).rows[0].data;
  const row = (await db.query('select * from expenses where id=$1',[created.expense_id])).rows[0];
  const before = (await summary()).currencies[0].balance;
  const payload = editArgs(row);
  const first = await edit('edit-once',payload);
  expect((await edit('edit-once',payload)).rows).toEqual(first.rows);
  expect((await summary()).currencies[0].balance).toBe(before-5);
  expect((await db.query('select amount from cash_transactions where id=$1',[created.transaction_id])).rows[0].amount).toBe('15');
  await expect(edit('stale-edit',payload)).rejects.toThrow('expense_changed_refresh_required');
  const current = (await db.query('select * from expenses where id=$1',[row.id])).rows[0];
  await expect(edit('too-large',editArgs(current,{amount:999999}))).rejects.toThrow('insufficient_funds');
  await expect(edit('foreign-account',editArgs(current,{account_id:'10000000-0000-0000-0000-000000000002'}))).rejects.toThrow('account_not_found');
  await db.query("update expenses set status='approved' where id=$1",[row.id]);
  await expect(edit('approved-edit',editArgs(current))).rejects.toThrow('expense_not_editable');
});

it('rolls back the cash edit and request if the expense update fails', async () => {
  const created = (await expense('edit-rollback-fixture')).rows[0].data;
  const row = (await db.query('select * from expenses where id=$1',[created.expense_id])).rows[0];
  await db.exec(`CREATE FUNCTION reject_expense_edit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'expense_update_failed'; END $$;
    CREATE TRIGGER reject_expense_edit BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION reject_expense_edit();`);
  await expect(edit('edit-rollback',editArgs(row))).rejects.toThrow('expense_update_failed');
  await db.exec('DROP TRIGGER reject_expense_edit ON expenses');
  expect((await db.query('select amount from cash_transactions where id=$1',[created.transaction_id])).rows[0].amount).toBe('10');
  expect((await db.query("select count(*)::int n from operation_requests where request_key='edit-rollback'")).rows[0].n).toBe(0);
});
