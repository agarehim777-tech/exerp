import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [], requests: [], error: null, afterRead: null, cap: 100 }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: table => {
  const request = { table, filters: [], ids: [] };
  const chain = {
    select: (_, options) => { request.options = options; return chain; },
    eq: (key, value) => { request.filters.push([key, value]); return chain; },
    in: (_, ids) => { request.ids = ids; return chain; },
    order: () => chain,
    gt: (_, id) => { request.after = id; return chain; },
    range: () => chain,
    then: resolve => {
      mocks.requests.push(request);
      const rows = mocks.rows.filter(row => request.filters.every(([key, value]) => row[key] === value)
        && request.ids.includes(row.product_id) && (!request.after || row.product_id > request.after))
        .sort((a, b) => a.product_id.localeCompare(b.product_id));
      mocks.afterRead?.();
      return Promise.resolve({ data: rows.slice(0, mocks.cap), count: rows.length, error: mocks.error }).then(resolve);
    },
  };
  return chain;
} } }));
import { readSaleStockShortages } from '../services/inventoryRead.js';

const products = [{ id: 'p1', name: 'Device', sku: 'SKU-1', qty: 0 }];
const read = (lines = [{ product: 'Device', qty: 1 }], current) => readSaleStockShortages('tenant', 'warehouse', lines, products, current);
beforeEach(() => {
  mocks.rows = [{ tenant_id: 'tenant', warehouse_id: 'warehouse', product_id: 'p1', on_hand: 5, reserved: 0, problem_qty: 0 }];
  mocks.requests = []; mocks.error = null; mocks.afterRead = null; mocks.cap = 100;
});

it('uses fresh tenant/warehouse stock instead of stale catalog or browser quantities', async () => {
  expect(await read()).toEqual([]);
  expect(mocks.requests[0].filters).toEqual([['tenant_id', 'tenant'], ['warehouse_id', 'warehouse']]);
  expect(mocks.requests[0].ids).toEqual(['p1']);
});

it('preserves real shortage confirmation and sums duplicate lines before subtracting reservations and problem stock', async () => {
  mocks.rows[0].reserved = 2; mocks.rows[0].problem_qty = 1;
  expect(await read([{ product: 'Device', qty: 2 }, { product: 'SKU-1', qty: 2 }]))
    .toEqual([{ product: 'SKU-1', shortage: 2 }]);
});

it('does not use another tenant or warehouse balance to cover a shortage', async () => {
  mocks.rows[0].on_hand = 0;
  mocks.rows.push({ ...mocks.rows[0], tenant_id: 'other', on_hand: 100 }, { ...mocks.rows[0], warehouse_id: 'other', on_hand: 100 });
  expect(await read()).toEqual([{ product: 'Device', shortage: 1 }]);
});

it('resolves SKU before a colliding name, matching the sales command product lookup', async () => {
  expect(await readSaleStockShortages('tenant', 'warehouse', [{ product: 'SKU-1', qty: 1 }],
    [...products, { id: 'other-product', name: 'SKU-1', sku: 'OTHER' }])).toEqual([]);
  expect(mocks.requests[0].ids).toEqual(['p1']);
});

it('fails closed on read errors, unresolved products and invalid quantities', async () => {
  mocks.error = new Error('Read failed');
  await expect(read()).rejects.toThrow('Read failed');
  await expect(read([{ product: 'Unknown', qty: 1 }])).rejects.toThrow('SALES_PRODUCT_NOT_FOUND');
  await expect(read([{ product: 'Device', qty: NaN }])).rejects.toThrow('SALES_QUANTITY_INVALID');
});

it('discards a response after the tenant visit changes', async () => {
  let current = true; mocks.afterRead = () => { current = false; };
  expect(await read(undefined, () => current)).toBeNull();
});

it('reads all selected balances even when the API caps a page below the requested size', async () => {
  mocks.cap = 1;
  mocks.rows.push({ ...mocks.rows[0], product_id: 'p2' });
  expect(await readSaleStockShortages('tenant', 'warehouse', [{ product: 'Device', qty: 1 }, { product: 'Second', qty: 1 }],
    [...products, { id: 'p2', name: 'Second', sku: 'SKU-2' }])).toEqual([]);
  expect(mocks.requests).toHaveLength(2);
  expect(mocks.requests[1].after).toBe('p1');
});
