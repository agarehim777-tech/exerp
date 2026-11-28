// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, it } from 'vitest';

// 20261128100000: opening balances (customers, vendors, cash accounts, active credits) for a company moving
// from another system. Credits are opening balances without an order and keep the old payment progress.
const tenant = '11111111-1111-4111-8111-111111111111';
let db;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE allowed(module text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '22222222-2222-4222-8222-222222222222'::uuid $$;
    CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql
      AS $$ SELECT $1='${tenant}'::uuid AND $3='edit' AND EXISTS(SELECT 1 FROM public.allowed WHERE module=$2) $$;
    INSERT INTO allowed VALUES ('crm'),('vendors'),('finance'),('credits');
    CREATE TABLE public.operation_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, request_key text,
      operation text, request_hash text, status text DEFAULT 'processing', result jsonb, completed_at timestamptz,
      UNIQUE(tenant_id, request_key));
    CREATE TABLE public.audit_events(id text, tenant_id uuid, actor_id uuid, module text, action text, detail text, payload jsonb);
    CREATE TABLE public.customers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, name text, fin text, tax_id text,
      phone text, email text, address text, notes text, segment text, created_by uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE public.vendors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, name text, tax_id text, phone text,
      email text, address text, is_active boolean);
    CREATE TABLE public.cash_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, code text, name text, type text,
      currency text, account_no text, opening_balance numeric, is_active boolean, UNIQUE(tenant_id, code));
    CREATE TABLE public.credit_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, customer_id uuid, order_id uuid,
      contract_no text, principal numeric, initial_payment numeric, required_initial numeric, term_months integer, start_date date,
      status text, created_by uuid);
    CREATE TABLE public.credit_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, credit_id uuid,
      installment_no integer, due_date date, principal_due numeric, principal_paid numeric, status text, paid_at timestamptz);
    INSERT INTO public.customers(tenant_id,name,fin) VALUES ('${tenant}','Mövcud Müştəri','OLD1234');`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261128100000_opening_balance_import.sql', import.meta.url), 'utf8'));
});
afterEach(async () => { await db.close(); });

const run = (kind, key, rows, tenantId = tenant) =>
  db.query('SELECT public.import_opening_balances($1,$2,$3,$4::jsonb) r', [tenantId, kind, key, JSON.stringify(rows)])
    .then((res) => res.rows[0].r);

it('imports customers, skips ones already in the system and rejects bad rows by line', async () => {
  await expect(run('customers', 'c0', [{ line: 2, name: 'A', fin: 'X1' }])).rejects.toThrow('line 2: FIN invalid');
  await expect(run('customers', 'c1', [{ line: 2, name: 'A', fin: 'AAA1111' }, { line: 3, name: 'B', fin: 'aaa1111' }]))
    .rejects.toThrow('line 3: FIN repeated in file');
  const result = await run('customers', 'c2', [
    { line: 2, name: 'Əli Məmmədov', fin: '5abc123', phone: '+994501112233' },
    { line: 3, name: 'Köhnə', fin: 'old1234' },
    { line: 4, name: 'Bakı MMC', taxId: '1234567891' },
  ]);
  expect(result).toMatchObject({ kind: 'customers', row_count: 3, created: 2, skipped: 1 });
  const rows = (await db.query(`SELECT name, fin, tax_id, segment FROM customers ORDER BY name`)).rows;
  expect(rows).toContainEqual({ name: 'Əli Məmmədov', fin: '5ABC123', tax_id: null, segment: 'individual' });
  expect(rows).toContainEqual({ name: 'Bakı MMC', fin: null, tax_id: '1234567891', segment: 'business' });
  // Same key and payload: first result, nothing imported twice.
  expect(await run('customers', 'c2', [
    { line: 2, name: 'Əli Məmmədov', fin: '5abc123', phone: '+994501112233' },
    { line: 3, name: 'Köhnə', fin: 'old1234' },
    { line: 4, name: 'Bakı MMC', taxId: '1234567891' },
  ])).toMatchObject({ created: 2 });
  expect((await db.query('SELECT count(*)::int n FROM customers')).rows[0].n).toBe(3);
  await expect(run('customers', 'c2', [{ name: 'Başqa' }])).rejects.toThrow('idempotency_key_payload_mismatch');
}, 30000);

it('imports vendors and cash accounts with opening balances', async () => {
  expect(await run('vendors', 'v1', [{ name: 'Təchizat MMC', taxId: '999' }, { name: 'Digər' }])).toMatchObject({ created: 2 });
  expect(await run('vendors', 'v2', [{ name: 'təchizat mmc' }])).toMatchObject({ created: 0, skipped: 1 });
  await expect(run('cash_accounts', 'k0', [{ line: 2, code: 'B1', name: 'Bank', type: 'card' }])).rejects.toThrow('line 2: type must be cash or bank');
  await expect(run('cash_accounts', 'k1', [{ line: 5, code: 'B1', name: 'Bank', openingBalance: '-3' }])).rejects.toThrow('line 5: opening balance must be zero or more');
  expect(await run('cash_accounts', 'k2', [{ code: 'kassa-2', name: 'Filial kassası', openingBalance: '1250.5' },
    { code: 'BANK-1', name: 'Kapital Bank', type: 'bank', currency: 'usd', accountNo: 'AZ00' }])).toMatchObject({ created: 2 });
  expect((await db.query(`SELECT code, type, currency, opening_balance::text b FROM cash_accounts ORDER BY code`)).rows).toEqual([
    { code: 'BANK-1', type: 'bank', currency: 'USD', b: '0' },
    { code: 'KASSA-2', type: 'cash', currency: 'AZN', b: '1250.50' },
  ]);
  await expect(run('cash_accounts', 'k3', [{ line: 2, code: 'Kassa-2', name: 'Təkrar' }])).rejects.toThrow('line 2: account code already exists');
}, 30000);

it('rebuilds an active credit schedule and allocates the principal paid in the old system', async () => {
  await expect(run('credits', 'k0', [{ line: 2, contractNo: 'A-1', fin: 'NOPE123', financed: 600, termMonths: 6, firstDueDate: '2026-01-10' }]))
    .rejects.toThrow('line 2: customer not found');
  await expect(run('credits', 'k1', [{ line: 3, contractNo: 'A-1', fin: 'OLD1234', financed: 600, paidPrincipal: 600, termMonths: 6, firstDueDate: '2026-01-10' }]))
    .rejects.toThrow('line 3: credit already fully paid');
  // Dates relative to this month: the first three instalments are in the past, the last ones in the future.
  const now = new Date();
  const month = (offset) => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 10));
    return d.toISOString().slice(0, 10);
  };
  const result = await run('credits', 'k2', [
    { line: 2, contractNo: 'İN-1050', fin: 'old1234', initialPayment: 100, financed: 1000, paidPrincipal: 450, termMonths: 6, firstDueDate: month(-3) },
  ]);
  expect(result).toMatchObject({ kind: 'credits', created: 1 });
  const contract = (await db.query(`SELECT contract_no, order_id, principal::text, initial_payment::text, term_months, to_char(start_date,'YYYY-MM-DD') start, status FROM credit_contracts`)).rows[0];
  expect(contract).toEqual({ contract_no: 'K-İN-1050', order_id: null, principal: '1100.00', initial_payment: '100.00', term_months: 6, start: month(-4), status: 'overdue' });
  const schedule = (await db.query(`SELECT installment_no n, to_char(due_date,'YYYY-MM-DD') due, principal_due::text d, principal_paid::text p, status
    FROM credit_installments ORDER BY installment_no`)).rows;
  // 1000 / 6 -> 167 x 5 + 165; 450 paid covers two instalments and part of the third.
  expect(schedule.map((r) => [r.due, Number(r.d), Number(r.p)])).toEqual([
    [month(-3), 167, 167], [month(-2), 167, 167], [month(-1), 167, 116],
    [month(0), 167, 0], [month(1), 167, 0], [month(2), 165, 0],
  ]);
  expect(schedule.map((r) => r.status)).toEqual(expect.arrayContaining(['paid']));
  expect(schedule.slice(0, 2).every((r) => r.status === 'paid')).toBe(true);
  expect(schedule[2].status).toBe('overdue');
  expect(schedule.slice(4).map((r) => r.status)).toEqual(['pending', 'pending']);
  await expect(run('credits', 'k3', [{ line: 2, contractNo: 'İN-1050', fin: 'OLD1234', financed: 10, termMonths: 1, firstDueDate: '2030-01-01' }]))
    .rejects.toThrow('line 2: contract already exists');
}, 30000);

it('checks the module permission of each kind and rejects unknown kinds', async () => {
  await db.exec(`DELETE FROM allowed WHERE module='credits'`);
  await expect(run('credits', 'p1', [{ contractNo: 'X' }])).rejects.toThrow('permission_denied');
  await expect(run('customers', 'p2', [{ name: 'A' }], '33333333-3333-4333-8333-333333333333')).rejects.toThrow('permission_denied');
  await expect(run('orders', 'p3', [{ name: 'A' }])).rejects.toThrow('opening_import_kind_invalid');
  await expect(run('customers', 'p4', [])).rejects.toThrow('invalid_import_request');
}, 30000);
