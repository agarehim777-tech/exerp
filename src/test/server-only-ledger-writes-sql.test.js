// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// 20261128110000: ledger tables (stock, credits, cash, orders, reservations, deliveries) are written only by
// server commands. A signed-in user, even a company admin, gets "permission denied" on a direct REST write;
// the commands that replaced the app's last direct writes work.
const FILE = '20261128110000_server_only_ledger_writes.sql';
const T = '00000000-0000-4000-8000-0000000000b1';
const U = '00000000-0000-4000-8000-0000000000b2';
const W = '00000000-0000-4000-8000-0000000000b3';
const P = '00000000-0000-4000-8000-0000000000b4';
const C = '00000000-0000-4000-8000-0000000000b5';
const C2 = '00000000-0000-4000-8000-0000000000b9';
const A = '00000000-0000-4000-8000-0000000000b6';
const O = '00000000-0000-4000-8000-0000000000b7';
const K = '00000000-0000-4000-8000-0000000000b8';
let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  const tables = ['tenants', 'tenant_members', 'warehouses', 'products', 'stock_balances', 'customers', 'cash_accounts', 'orders', 'credit_contracts'];
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [U]);
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${U}', 'ledger@example.test');
    ${tables.map((t) => `ALTER TABLE public.${t} DISABLE TRIGGER USER;`).join('\n')}
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${T}', 'Ledger', 'ledger', '${U}');
    INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES ('${T}', '${U}', 'admin');
    INSERT INTO public.warehouses (id, tenant_id, code, name) VALUES ('${W}', '${T}', 'W1', 'Baş anbar');
    INSERT INTO public.products (id, tenant_id, name, sku) VALUES ('${P}', '${T}', 'Telefon', 'TEL-1');
    INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id) VALUES ('${T}', '${W}', '${P}');
    INSERT INTO public.customers (id, tenant_id, name) VALUES ('${C}', '${T}', 'Əli'), ('${C2}', '${T}', 'Vəli');
    INSERT INTO public.cash_accounts (id, tenant_id, code, name, currency, is_active) VALUES ('${A}', '${T}', 'K1', 'Kassa', 'AZN', true);
    INSERT INTO public.orders (id, tenant_id, order_no, customer_id, order_date, created_by) VALUES ('${O}', '${T}', 'SO-1', '${C}', '2026-11-20', '${U}');
    INSERT INTO public.credit_contracts (id, tenant_id, contract_no, principal, term_months, status, customer_id)
      VALUES ('${K}', '${T}', 'K-1', 600, 6, 'active', '${C}');
    ${tables.map((t) => `ALTER TABLE public.${t} ENABLE TRIGGER USER;`).join('\n')}
  `);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [U]);
  await db.exec('SET ROLE authenticated');
}, 600000);
afterAll(async () => { await db?.close(); });

it('applies on the replayed repo schema', () => {
  expect(skipped).toEqual([]);
});

it('refuses direct writes to every ledger table, even for a company admin', async () => {
  const attempts = [
    `UPDATE public.stock_balances SET on_hand = 999 WHERE tenant_id = '${T}'`,
    `DELETE FROM public.stock_balances WHERE tenant_id = '${T}'`,
    `INSERT INTO public.stock_movements (tenant_id, warehouse_id, product_id, movement_type, quantity) VALUES ('${T}', '${W}', '${P}', 'in', 5)`,
    `INSERT INTO public.stock_reservations (tenant_id, order_id, warehouse_id, product_id, quantity) VALUES ('${T}', '${O}', '${W}', '${P}', 1)`,
    `INSERT INTO public.deliveries (tenant_id, order_id, warehouse_id, delivery_no) VALUES ('${T}', '${O}', '${W}', 'D-1')`,
    `UPDATE public.orders SET total = 0, paid_amount = 999 WHERE id = '${O}'`,
    `DELETE FROM public.order_items WHERE tenant_id = '${T}'`,
    `UPDATE public.credit_contracts SET principal = 1 WHERE id = '${K}'`,
    `DELETE FROM public.credit_installments WHERE tenant_id = '${T}'`,
    `UPDATE public.credit_payments SET amount = 1 WHERE tenant_id = '${T}'`,
    `INSERT INTO public.cash_transactions (tenant_id, account_id, transaction_no, direction, amount, category) VALUES ('${T}', '${A}', 'X-1', 'in', 5, 'digər')`,
  ];
  for (const sql of attempts) await expect(db.query(sql), sql).rejects.toThrow(/permission denied/);
});

it('keeps the reorder point editable and nothing else on a balance', async () => {
  await db.query(`UPDATE public.stock_balances SET minimum_level = 4 WHERE tenant_id = $1`, [T]);
  expect((await db.query(`SELECT minimum_level::int m FROM public.stock_balances WHERE tenant_id = $1`, [T])).rows[0].m).toBe(4);
});

it('posts manual cash through the command, idempotent by transaction number', async () => {
  const post = (no, amount, category = 'digər') => db.query(
    `SELECT public.post_manual_cash_transaction($1, $2, $3, 'in', $4, $5, 'Qeyd', $6, NULL, '2026-11-25') id`,
    [T, no, A, amount, category, C]).then((r) => r.rows[0].id);
  const first = await post('KM-1', 50.004);
  expect(await post('KM-1', 50)).toBe(first);
  await expect(post('KM-1', 70)).rejects.toThrow('cash_transaction_no_taken');
  await expect(post('KM-2', 10, 'credit_payment')).rejects.toThrow('cash_category_reserved');
  await expect(post('KM-3', -1)).rejects.toThrow('cash_amount_invalid');
  const row = (await db.query(`SELECT amount::text, counterparty, currency, category FROM public.cash_transactions WHERE id = $1`, [first])).rows[0];
  expect(row).toEqual({ amount: '50.00', counterparty: 'Əli', currency: 'AZN', category: 'digər' });
});

it('edits an order header through the command and keeps a credit sale on its customer', async () => {
  await db.query(`SELECT public.update_sales_order_header($1, $2, $3, '2026-11-21', '  Yeni qeyd ')`, [T, O, C2]);
  expect((await db.query(`SELECT customer_id, to_char(order_date, 'YYYY-MM-DD') d, notes FROM public.orders WHERE id = $1`, [O])).rows[0])
    .toEqual({ customer_id: C2, d: '2026-11-21', notes: 'Yeni qeyd' });
  await db.exec('RESET ROLE');
  await db.exec(`ALTER TABLE public.credit_contracts DISABLE TRIGGER USER;
    UPDATE public.credit_contracts SET order_id = '${O}' WHERE id = '${K}';
    ALTER TABLE public.credit_contracts ENABLE TRIGGER USER;`);
  await db.exec('SET ROLE authenticated');
  await expect(db.query(`SELECT public.update_sales_order_header($1, $2, $3, NULL, NULL)`, [T, O, C]))
    .rejects.toThrow('order_customer_locked');
});

it('changes the credit collection stage with its history in one command', async () => {
  await expect(db.query(`SELECT public.set_credit_collection_stage($1, $2, 'nowhere')`, [T, K])).rejects.toThrow('credit_collection_stage_invalid');
  await db.query(`SELECT public.set_credit_collection_stage($1, $2, 'reminder', 'Zəng edildi')`, [T, K]);
  await db.exec('RESET ROLE');
  const stage = (await db.query(`SELECT collection_stage FROM public.credit_contracts WHERE id = $1`, [K])).rows[0].collection_stage;
  const history = (await db.query(`SELECT (SELECT count(*)::int FROM public.credit_adjustments WHERE credit_id = $1) a,
    (SELECT count(*)::int FROM public.credit_collection_events WHERE credit_id = $1) e`, [K])).rows[0];
  await db.exec('SET ROLE authenticated');
  expect(stage).toBe('reminder');
  expect(history).toEqual({ a: 1, e: 1 });
});

it('lets only signed-in users with the module run the commands', async () => {
  const fns = ['post_manual_cash_transaction(uuid,text,uuid,text,numeric,text,text,uuid,text,date)',
    'update_sales_order_header(uuid,uuid,uuid,date,text)', 'set_credit_collection_stage(uuid,uuid,text,text)'];
  await db.exec('RESET ROLE');
  for (const fn of fns) {
    const { rows } = await db.query(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') a,
      has_function_privilege('anon', 'public.${fn}', 'EXECUTE') n`);
    expect(rows[0], fn).toEqual({ a: true, n: false });
  }
  await db.exec('SET ROLE authenticated');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, ['00000000-0000-4000-8000-0000000000ff']);
  await expect(db.query(`SELECT public.set_credit_collection_stage($1, $2, 'legal')`, [T, K])).rejects.toThrow('permission_denied');
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [U]);
});
