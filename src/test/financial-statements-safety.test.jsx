import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), read: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc, from: () => { const q = { select: () => q, eq: () => q, order: () => q }; return q; },
} }));
vi.mock('../services/readAllRows', () => ({ readAllRows: mocks.read }));
vi.mock('../shared/hooks/useRealtimeResync', () => ({ useRealtimeResync: () => false }));
import { inRange, useFinancialStatements } from '../shared/hooks/useFinancialStatements';
const range = { from: '2026-11-01', to: '2026-11-10' };
const journal = amount => ({ data: [{ code: '400', type: 'revenue', debit: 0, credit: amount }], error: null });
beforeEach(() => { mocks.rpc.mockReset().mockResolvedValue(journal(10)); mocks.read.mockReset().mockResolvedValue({ data: [], error: null }); });
afterEach(cleanup);
it('includes the whole final local day', () => {
  expect(inRange(new Date(2026, 10, 10, 23, 59).toISOString(), range)).toBe(true);
  expect(inRange(new Date(2026, 10, 11, 0, 0).toISOString(), range)).toBe(false);
  expect(inRange('invalid', range)).toBe(false);
});
it('hides all financial output on a source failure and allows retry', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  const { result } = renderHook(() => useFinancialStatements('a', range));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.ready).toBe(false);
  expect(result.current.profitAndLoss).toBeNull();
  await act(async () => result.current.reload());
  expect(result.current.profitAndLoss.totalRevenue).toBe(10);
});
it('rejects late results after tenant or date range changes', async () => {
  let finish;
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ tenant }) => useFinancialStatements(tenant, range), { initialProps: { tenant: 'a' } });
  rerender({ tenant: 'b' });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => finish(journal(999)));
  expect(result.current.profitAndLoss.totalRevenue).toBe(10);
  let old;
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { old = resolve; }));
  let pending;
  act(() => { pending = result.current.reload(); });
  act(() => result.current.setRange({ from: '2026-10-01', to: '2026-10-31' }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { old(journal(888)); await pending; });
  expect(result.current.profitAndLoss.totalRevenue).toBe(10);
});
