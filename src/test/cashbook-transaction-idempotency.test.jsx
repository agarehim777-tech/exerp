import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// A cash transaction retried with the same transaction_no (lost response, double click) must not be written twice:
// the database rejects the second insert on UNIQUE (tenant_id, transaction_no), and the hook treats that as saved.
const db = vi.hoisted(() => ({ saved: [] }));

vi.mock('../shared/hooks/useRealtimeResync.js', () => ({ useRealtimeResync: () => false }));
vi.mock('../services/readAllRows.js', () => ({ readAllRows: async () => ({ data: [], error: null }) }));
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    rpc: async () => ({ data: { balances: [] }, error: null }),
    from: (table) => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
        insert: (row) => {
          if (table !== 'cash_transactions') return Promise.resolve({ error: null });
          if (db.saved.some((saved) => saved.transaction_no === row.transaction_no)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
          }
          db.saved.push(row);
          return Promise.resolve({ error: null });
        },
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return builder;
    },
  },
}));

import { newTransactionNo, useCashbook } from '../shared/hooks/useCashbook.js';

beforeEach(() => { db.saved = []; });

it('treats a retry with the same transaction number as already saved', async () => {
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const payload = { account_id: 'A1', direction: 'in', amount: '50', transaction_no: newTransactionNo() };
  await act(() => result.current.addTransaction(payload));
  await act(() => result.current.addTransaction(payload));
  expect(db.saved).toHaveLength(1);
});

it('generates a fresh number when the caller does not pass one', async () => {
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  db.saved.push({ transaction_no: 'KAS-FIXED' });
  // Without a caller-chosen number the hook generates a fresh one, so this insert succeeds.
  await act(() => result.current.addTransaction({ account_id: 'A1', direction: 'in', amount: '5' }));
  expect(db.saved).toHaveLength(2);
});
