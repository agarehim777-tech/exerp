import { beforeEach, expect, it, vi } from 'vitest';

// Regressiya: kredit/sifariş səhifəsi "column stock_reservations_1.order_item_id does not exist"
// xətası ilə düşmüşdü — sorğu bazada mövcud olmayan sütun istəyirdi.
const mocks = vi.hoisted(() => ({ selects: [] }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: () => {
  const chain = {
    select: (columns, options) => { mocks.selects.push(columns); chain.options = options; return chain; },
    eq: () => chain,
    neq: () => chain,
    order: () => chain,
    range: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: resolve => Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
  };
  return chain;
} } }));

import { readOrderPage, readOrderById } from '../services/orderRead.js';

// Canlı bazadakı stock_reservations sütunları (information_schema-dan yoxlanılıb).
const LIVE_RESERVATION_COLUMNS = new Set([
  'id', 'tenant_id', 'warehouse_id', 'product_id', 'order_id',
  'quantity', 'status', 'created_at', 'updated_at', 'created_by',
]);

function reservationEmbeds() {
  return mocks.selects
    .map(columns => String(columns).match(/stock_reservations\(([^)]*)\)/)?.[1])
    .filter(Boolean);
}

beforeEach(() => { mocks.selects = []; });

it('order page query only requests stock_reservations columns that exist in the live schema', async () => {
  await readOrderPage('tenant', 10, () => true);
  const embeds = reservationEmbeds();
  expect(embeds.length).toBeGreaterThan(0);
  for (const embed of embeds) {
    const requested = embed.split(',').map(column => column.trim());
    expect(requested).not.toContain('order_item_id');
    for (const column of requested) expect(LIVE_RESERVATION_COLUMNS.has(column)).toBe(true);
  }
});

it('single order query only requests stock_reservations columns that exist in the live schema', async () => {
  await readOrderById('tenant', 'order-1', () => true);
  const embeds = reservationEmbeds();
  expect(embeds.length).toBeGreaterThan(0);
  for (const embed of embeds) {
    const requested = embed.split(',').map(column => column.trim());
    expect(requested).not.toContain('order_item_id');
    for (const column of requested) expect(LIVE_RESERVATION_COLUMNS.has(column)).toBe(true);
  }
});
