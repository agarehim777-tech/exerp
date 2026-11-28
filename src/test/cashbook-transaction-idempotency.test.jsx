import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// Manual cash in/out goes through post_manual_cash_transaction (cash_transactions is server-write only since
// 20261128110000). A retry (lost response, double click) sends the same transaction_no, and the server returns
// the first row instead of posting twice; server error codes reach the user in Azerbaijani.
const db = vi.hoisted(() => ({ saved: new Map(), calls: [], fail: null }));

vi.mock('../shared/hooks/useRealtimeResync.js', () => ({ useRealtimeResync: () => false }));
vi.mock('../services/readAllRows.js', () => ({ readAllRows: async () => ({ data: [], error: null }) }));
vi.mock('../integrations/supabase/client', () => ({
  supabase: {
    rpc: async (name, args) => {
      if (name !== 'post_manual_cash_transaction') return { data: { balances: [] }, error: null };
      db.calls.push(args);
      if (db.fail) return { data: null, error: { message: db.fail } };
      if (!db.saved.has(args._transaction_no)) db.saved.set(args._transaction_no, `id-${db.saved.size + 1}`);
      return { data: db.saved.get(args._transaction_no), error: null };
    },
    from: () => {
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      return builder;
    },
  },
}));

import { newTransactionNo, useCashbook } from '../shared/hooks/useCashbook.js';

beforeEach(() => { db.saved = new Map(); db.calls = []; db.fail = null; });

it('sends a retry with the same transaction number, so the server keeps one row', async () => {
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  const payload = { account_id: 'A1', direction: 'in', amount: '50', category: 'digər', transaction_no: newTransactionNo(), occurred_at: '2026-11-25' };
  await act(() => result.current.addTransaction(payload));
  await act(() => result.current.addTransaction(payload));
  expect(db.saved.size).toBe(1);
  expect(db.calls[0]).toMatchObject({ _tenant_id: 'tenant-a', _account_id: 'A1', _direction: 'in', _amount: 50,
    _category: 'digər', _transaction_no: payload.transaction_no, _occurred_at: '2026-11-25' });
  expect(db.calls[1]._transaction_no).toBe(payload.transaction_no);
});

it('generates a fresh number when the caller does not pass one', async () => {
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.addTransaction({ account_id: 'A1', direction: 'in', amount: '5', category: 'digər' }));
  await act(() => result.current.addTransaction({ account_id: 'A1', direction: 'in', amount: '5', category: 'digər' }));
  expect(db.saved.size).toBe(2);
  expect(db.calls[0]._transaction_no).toMatch(/^KAS-/);
});

it('explains a reserved system category instead of showing the error code', async () => {
  const { result } = renderHook(() => useCashbook('tenant-a'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  db.fail = 'cash_category_reserved';
  await expect(result.current.addTransaction({ account_id: 'A1', direction: 'in', amount: '5', category: 'credit_payment' }))
    .rejects.toThrow('Bu kateqoriya sistem əməliyyatları üçündür');
});
