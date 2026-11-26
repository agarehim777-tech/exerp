import React from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { journalTotals } from '../shared/lib/journalTotals.ts';
const state = vi.hoisted(() => ({ ranges: [], pending: [], tenant: 'A' }));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeMembership: { tenant_id: state.tenant } }) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  rpc: () => new Promise(resolve => state.pending.push(resolve)),
  from: () => {
    const q = {
      select: () => q, eq: () => q, order: () => q, gte: () => q, lte: () => q,
      limit: async count => ({ data: Array.from({ length: Math.min(count, 250) }, (_, id) => ({ id })), error: null }),
      range: async (start, end) => {
        state.ranges.push([start, end]);
        return { data: Array.from({ length: 50 }, (_, n) => ({ id: start + n })), count: 250, error: null };
      },
    };
    return q;
  },
} }));
import { useJournalEntries } from '../shared/hooks/useAccounting.js';
import { TrialBalancePanel } from '../modules/accounting/AccountingPage.jsx';
beforeEach(() => { state.ranges = []; state.pending = []; state.tenant = 'A'; });
it('balances cents without accepting a one-cent difference', () => {
  expect(journalTotals([{ debit: .1 }, { debit: .2 }, { credit: .3 }])).toEqual({ d: .3, c: .3, balanced: true });
  expect(journalTotals([{ debit: .3, credit: .31 }]).balanced).toBe(false);
  expect(journalTotals([]).balanced).toBe(false);
});
it('reaches journal entries older than the first 200', async () => {
  const { result } = renderHook(() => useJournalEntries());
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.entries).toHaveLength(250));
  expect(result.current.entries[200].id).toBe(200);
});
it('ignores late trial balance results after a date change', async () => {
  const { container } = render(<TrialBalancePanel tenantId="A" />);
  await waitFor(() => expect(state.pending).toHaveLength(1));
  fireEvent.change(container.querySelector('input[type=date]'), { target: { value: '2025-01-01' } });
  await waitFor(() => expect(state.pending).toHaveLength(2));
  await act(async () => state.pending[1]({ data: [{ code: 'NEW', name: 'Current', debit: 1, credit: 1, balance: 0 }], error: null }));
  await act(async () => state.pending[0]({ data: [{ code: 'OLD', name: 'Stale', debit: 1, credit: 1, balance: 0 }], error: null }));
  expect(screen.getByText('NEW')).toBeInTheDocument();
  expect(screen.queryByText('OLD')).not.toBeInTheDocument();
});
