// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

const tenant = '11111111-1111-4111-8111-111111111111';
const order = '22222222-2222-4222-8222-222222222222';
const credit = '33333333-3333-4333-8333-333333333333';
const payment = '44444444-4444-4444-8444-444444444444';
const movement = '55555555-5555-4555-8555-555555555555';
const other = '66666666-6666-4666-8666-666666666666';

it('previews linked cash, deposits and stock without changing ledger rows', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${tenant}'::uuid $$;
      CREATE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${tenant}'::uuid $$;
      CREATE TABLE orders(id uuid,tenant_id uuid,order_no text,status text);
      CREATE TABLE credit_contracts(id uuid,tenant_id uuid,order_id uuid,status text);
      CREATE TABLE credit_payments(id uuid,credit_id uuid);
      CREATE TABLE stock_reservations(tenant_id uuid,order_id uuid,status text);
      CREATE TABLE deliveries(id uuid,tenant_id uuid,order_id uuid);
      CREATE TABLE stock_movements(id uuid,tenant_id uuid,quantity numeric,movement_type text,reference_type text,reference_id uuid,reversal_of uuid);
      CREATE TABLE cash_transactions(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,direction text,amount numeric,reference_id uuid,reference text,reversal_of uuid);
      INSERT INTO orders VALUES('${order}','${tenant}','SF-TEST','delivered'),('${other}','${other}','FOREIGN','confirmed');
      INSERT INTO credit_contracts VALUES('${credit}','${tenant}','${order}','active');
      INSERT INTO credit_payments VALUES('${payment}','${credit}');
      INSERT INTO stock_reservations VALUES('${tenant}','${order}','active'),('${tenant}','${order}','released');
      INSERT INTO deliveries VALUES('${movement}','${tenant}','${order}');
      INSERT INTO stock_movements VALUES('${movement}','${tenant}',-2,'delivery','delivery','${movement}',NULL);
      INSERT INTO cash_transactions(tenant_id,direction,amount,reference_id,reference) VALUES
        ('${tenant}','in',200,'${order}',NULL),('${tenant}','in',100,'${credit}',NULL),
        ('${tenant}','in',67,'${payment}',NULL),('${tenant}','in',50,NULL,'SF-TEST'),
        ('${other}','in',999,'${order}',NULL);`);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261003053836_restore_sales_reversal_preview.sql', import.meta.url), 'utf8'));
    const preview = async () => (await db.query('SELECT public.preview_sales_order_reversal($1) result', [order])).rows[0].result;
    expect(await preview()).toMatchObject({ order_no: 'SF-TEST', credit_count: 1, payment_amount: 417,
      reservation_count: 1, stock_return_count: 1, will_reverse_cash: true, will_restore_stock: true });
    expect((await db.query('SELECT count(*)::int n FROM cash_transactions')).rows[0].n).toBe(5);
    await db.exec(`INSERT INTO cash_transactions(tenant_id,direction,amount,reversal_of)
      SELECT tenant_id,'out',amount,id FROM cash_transactions WHERE amount=200;
      INSERT INTO stock_movements VALUES('${other}','${tenant}',2,'receipt','sales_return','${order}','${movement}');
      UPDATE credit_contracts SET status='closed'; UPDATE stock_reservations SET status='released';`);
    expect(await preview()).toMatchObject({ credit_count: 0, payment_amount: 217, reservation_count: 0,
      stock_return_count: 0, will_restore_stock: false });
    await expect(db.query('SELECT public.preview_sales_order_reversal($1)', [other])).rejects.toThrow('sales_preview_permission_denied');
    await db.exec('CREATE OR REPLACE FUNCTION private.has_module_access(uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT NULL::boolean $$');
    await expect(preview()).rejects.toThrow('sales_preview_permission_denied');
    await db.exec('CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$');
    await expect(preview()).rejects.toThrow('auth_required');
    expect((await db.query("SELECT has_function_privilege('anon','public.preview_sales_order_reversal(uuid)','EXECUTE') allowed")).rows[0].allowed).toBe(false);
  } finally { await db.close(); }
}, 30000);

it('qualifies the expense account FK and creates canonical main-account codes', async () => {
  const cashbook = await readFile(new URL('../shared/hooks/useCashbook.js', import.meta.url), 'utf8');
  const orders = await readFile(new URL('../shared/hooks/useOrders.js', import.meta.url), 'utf8');
  expect(cashbook).toContain('account:cash_accounts!expenses_account_id_fkey(id,name)');
  expect(orders).toContain('tenant_id: tenantId, code, account_no: code');
});
