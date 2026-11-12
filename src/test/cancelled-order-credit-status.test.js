// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { replayMigrations } from './support/migrationReplay.js';

// A credit on a cancelled sale must end 'cancelled' (what reverse_sales_order sets and what
// receivable settlement checks), not 'closed', which means "fully repaid". Two older triggers
// rewrote it to 'closed'; 20261112090000 fixes them.

const FILE = '20261112090000_cancelled_order_credit_status.sql';
const TENANT = '00000000-0000-4000-8000-0000000000e1';
const CUSTOMER = '00000000-0000-4000-8000-0000000000e2';
const USER = '00000000-0000-4000-8000-0000000000e3';

let db;
let skipped;

beforeAll(async () => {
  ({ db, skipped } = await replayMigrations());
  // Fixture rows only; triggers and FK checks are off while seeding.
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.tenants (id, name, slug, created_by) VALUES ('${TENANT}', 'Credit status', 'credit-status', gen_random_uuid());
    INSERT INTO public.customers (id, tenant_id, name, created_by) VALUES ('${CUSTOMER}', '${TENANT}', 'Customer', '${USER}');
    SET session_replication_role = origin;
  `);
}, 240000);
afterAll(async () => { await db?.close(); });

async function seedSale(orderStatus, creditStatus) {
  const orderId = crypto.randomUUID();
  const creditId = crypto.randomUUID();
  await db.exec(`
    SET session_replication_role = replica;
    INSERT INTO public.orders (id, tenant_id, order_no, customer_id, status, created_by)
      VALUES ('${orderId}', '${TENANT}', 'SO-${orderId.slice(0, 8)}', '${CUSTOMER}', '${orderStatus}', '${USER}');
    INSERT INTO public.credit_contracts (id, tenant_id, contract_no, customer_id, order_id, principal, term_months, status, created_by)
      VALUES ('${creditId}', '${TENANT}', 'CR-${creditId.slice(0, 8)}', '${CUSTOMER}', '${orderId}', 1000, 12, '${creditStatus}', '${USER}');
    SET session_replication_role = origin;
  `);
  return { orderId, creditId };
}

const creditStatus = async (creditId) =>
  (await db.query('SELECT status::text AS status FROM public.credit_contracts WHERE id = $1', [creditId])).rows[0].status;

it('applies on the replayed repo schema', () => {
  expect(skipped.map((row) => row.file)).not.toContain(FILE);
});

it('keeps the credit cancelled when the reversal cancels the credit and then the order', async () => {
  const { orderId, creditId } = await seedSale('confirmed', 'active');
  // Same order of steps as reverse_sales_order.
  await db.query(`UPDATE public.credit_contracts SET status = 'cancelled' WHERE id = $1`, [creditId]);
  await db.query(`UPDATE public.orders SET status = 'cancelled' WHERE id = $1`, [orderId]);
  expect(await creditStatus(creditId)).toBe('cancelled');
});

it('turns a later close of a credit on a cancelled sale into cancelled', async () => {
  const { creditId } = await seedSale('cancelled', 'cancelled');
  await db.query(`UPDATE public.credit_contracts SET status = 'closed' WHERE id = $1`, [creditId]);
  expect(await creditStatus(creditId)).toBe('cancelled');
});

it('leaves credits on active sales alone', async () => {
  const { creditId } = await seedSale('confirmed', 'active');
  await db.query(`UPDATE public.credit_contracts SET status = 'closed' WHERE id = $1`, [creditId]);
  expect(await creditStatus(creditId)).toBe('closed');
});
