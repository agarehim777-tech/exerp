import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ rows: { cash_transactions: 0, expenses: 0 }, limits: [] }));

vi.mock('../shared/hooks/useRealtimeResync.js', () => ({ useRealtimeResync: () => false }));
vi.mock('../services/readAllRows.js', () => ({ readAllRows: async () => ({ data: [], error: null }) }));
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    rpc: async () => ({ data: { balances: [] }, error: null }),
    from: (table) => {
      let limit = Infinity;
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder,
        limit: (value) => { limit = value; db.limits.push([table, value]); return builder; },
        then: (resolve, reject) => {
          const total = db.rows[table] ?? 0;
          const count = Math.min(total, limit);
          const data = Array.from({ length: count }, (_, i) => ({ id: `${table}-${i}`, status: 'pending' }));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  },
}));

import { CASH_PAGE, useCashbook } from '../shared/hooks/useCashbook.js';

beforeEach(() => {
  db.rows = { cash_transactions: 0, expenses: 0 };
  db.limits = [];
});

const lastLimit = (table) => db.limits.filter(([name]) => name === table).at(-1)?.[1];

it('loads the newest page and offers more only when a list is full', async () => {
  db.rows = { cash_transactions: CASH_PAGE + 20, expenses: 5 };
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.transactions).toHaveLength(CASH_PAGE));
  expect(result.current.expenses).toHaveLength(5);
  expect(result.current.transactionsHasMore).toBe(true);
  expect(result.current.expensesHasMore).toBe(false);
});

it('raises the limit on load more and keeps it for later reloads', async () => {
  db.rows = { cash_transactions: CASH_PAGE + 20, expenses: CASH_PAGE * 2 + 1 };
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.transactions).toHaveLength(CASH_PAGE));

  act(() => result.current.loadMoreTransactions());
  await waitFor(() => expect(result.current.transactions).toHaveLength(CASH_PAGE + 20));
  expect(result.current.transactionsHasMore).toBe(false);
  expect(lastLimit('cash_transactions')).toBe(CASH_PAGE * 2);
  expect(lastLimit('expenses')).toBe(CASH_PAGE);

  act(() => result.current.loadMoreExpenses());
  await waitFor(() => expect(result.current.expenses).toHaveLength(CASH_PAGE * 2));
  expect(result.current.expensesHasMore).toBe(true);

  await act(() => result.current.refresh());
  expect(lastLimit('cash_transactions')).toBe(CASH_PAGE * 2);
  expect(lastLimit('expenses')).toBe(CASH_PAGE * 2);
  expect(result.current.transactions).toHaveLength(CASH_PAGE + 20);
});

it('starts again from one page for another tenant', async () => {
  db.rows = { cash_transactions: CASH_PAGE + 20, expenses: 0 };
  const { result, rerender } = renderHook(({ tenant }) => useCashbook(tenant), { initialProps: { tenant: 'tenant-a' } });
  await waitFor(() => expect(result.current.transactions).toHaveLength(CASH_PAGE));
  act(() => result.current.loadMoreTransactions());
  await waitFor(() => expect(result.current.transactions).toHaveLength(CASH_PAGE + 20));
  rerender({ tenant: 'tenant-b' });
  await waitFor(() => expect(lastLimit('cash_transactions')).toBe(CASH_PAGE));
  await waitFor(() => expect(result.current.transactions).toHaveLength(CASH_PAGE));
});
