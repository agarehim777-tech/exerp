import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ calls: [], fail: '', cap: 100 }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: table => {
  const call = { table, filters: [], order: [] };
  const query = {
    select: (columns, options) => { call.columns = columns; call.count = options?.count; return query; },
    eq: (...args) => { call.filters.push(args); return query; },
    neq: (...args) => { call.filters.push(args); return query; },
    in: (...args) => { call.filters.push(args); return query; },
    is: (...args) => { call.filters.push(args); return query; },
    order: (column, options) => { call.order.push([column, options]); return query; },
    range: (start, end) => {
      mocks.calls.push({ ...call, start, end });
      if (mocks.fail === table) return Promise.resolve({ error: { message: `${table} failed` } });
      return Promise.resolve({ count: 225,
        data: Array.from({ length: Math.max(0, Math.min(mocks.cap, end - start + 1, 225 - start)) }, (_, i) =>
          ({ id: `${table}-${start + i}`, order_id: `order-${start + i}` })),
      });
    },
  };
  return query;
} } }));
import { readOrderPage, readOrderRelations } from '../services/orderRead.js';
beforeEach(() => { mocks.calls = []; mocks.fail = ''; });

it('keeps newest same-day sales visible and reads through a lower API row cap', async () => {
  const rows = await readOrderPage('tenant-a', 201, () => true);
  expect(rows).toHaveLength(201);
  expect(mocks.calls.map(call => call.start)).toEqual([0, 100, 200]);
  for (const call of mocks.calls) {
    expect(call.count).toBe('exact');
    expect(call.filters).toEqual([['tenant_id', 'tenant-a'], ['status', 'cancelled']]);
    expect(call.order).toEqual([['order_date', { ascending: false }], ['created_at', { ascending: false }], ['id', undefined]]);
  }
});

it('reads every linked credit, bonus and delivery with tenant and parent filters', async () => {
  const ids = ['order-1', 'order-2'];
  const related = await readOrderRelations('tenant-a', ids, () => true);
  expect(related.credits).toHaveLength(225);
  expect(related.bonuses).toHaveLength(225);
  expect(related.deliveries).toHaveLength(225);
  expect(related.deliveryError).toBeNull();
  expect(mocks.calls.find(call => call.table === 'credit_contracts').columns)
    .toContain('installments:credit_installments(id,installment_no,due_date,principal_due,principal_paid,status)');
  for (const call of mocks.calls) {
    expect(call.filters).toContainEqual(['tenant_id', 'tenant-a']);
    expect(call.filters).toContainEqual(['order_id', ids]);
    expect(call.order.map(row => row[0])).toContain('id');
  }
  expect(mocks.calls.filter(call => call.table === 'order_bonus_assignments').every(call =>
    call.filters.some(([column, value]) => column === 'effective_to' && value === null))).toBe(true);
});

it('never silently omits financial links but allows unavailable supplementary delivery history', async () => {
  mocks.fail = 'credit_contracts';
  await expect(readOrderRelations('tenant-a', ['order-1'], () => true)).rejects.toMatchObject({ message: 'credit_contracts failed' });
  mocks.fail = 'deliveries';
  const related = await readOrderRelations('tenant-a', ['order-1'], () => true);
  expect(related.credits).toHaveLength(225);
  expect(related.deliveries).toEqual([]);
  expect(related.deliveryError).toMatchObject({ message: 'deliveries failed' });
});

it('does not return old-tenant or partially read data after invalidation or failure', async () => {
  let current = true;
  const pending = readOrderPage('tenant-a', 201, () => current);
  current = false;
  expect(await pending).toBeNull();
  mocks.fail = 'orders';
  await expect(readOrderPage('tenant-a', 201, () => true)).rejects.toMatchObject({ message: 'orders failed' });
  mocks.calls = [];
  expect(await readOrderRelations('tenant-a', [], () => true)).toEqual({ credits: [], bonuses: [], deliveries: [], deliveryError: null });
  expect(mocks.calls).toEqual([]);
});
