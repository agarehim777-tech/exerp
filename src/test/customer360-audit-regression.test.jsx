import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ fail: '', chunks: [] }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  rpc: async () => ({ data: { customer: { id: 'customer' }, orders_total: 1, activities: [] }, error: null }),
  from: table => {
    let start = 0, end = 999;
    const q = {
      select: () => q, eq: () => q, order: () => q,
      in: (_column, ids) => { state.chunks.push(ids.length); return q; },
      range: (a, b) => { start = a; end = b; return q; },
      then: resolve => {
        if (state.fail === table) return Promise.resolve({ data: null, error: { message: `${table} unavailable` } }).then(resolve);
        const rows = table === 'orders' ? Array.from({ length: 1001 }, (_, n) => ({
          id: `order-${n}`, status: 'confirmed', total: 10, paid_amount: 2, order_date: '2026-01-01',
        })) : [];
        return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve);
      },
    };
    return q;
  },
} }));
import { useCustomer360 } from '../shared/hooks/useCustomer360.js';
beforeEach(() => { state.fail = ''; state.chunks = []; });
it('includes all 1001 orders and chunks item queries', async () => {
  const { result } = renderHook(() => useCustomer360('customer'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.data).toMatchObject({ orders_count: 1001, orders_total: 10010, orders_paid: 2002, orders_outstanding: 8008 });
  expect(Math.max(...state.chunks)).toBeLessThanOrEqual(100);
});
it.each(['credit_contracts', 'customer_documents', 'customer_service_cases', 'order_items'])('surfaces %s errors instead of empty financial data', async table => {
  state.fail = table;
  const { result } = renderHook(() => useCustomer360('customer'));
  await waitFor(() => expect(result.current.error?.message).toBe(`${table} unavailable`));
  expect(result.current.data).toBeNull();
});
