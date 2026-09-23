import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useExpensesSync } from '../shared/hooks/useExpensesSync';
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, order: () => query, range: mocks.load, upsert: mocks.save };
  return query;
} } }));
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue({ data: [], error: null });
  mocks.save.mockReset();
});
afterEach(() => vi.useRealTimers());

it('does not resurrect legacy expenses when the database returns no rows', async () => {
  const { result } = renderHook(() => {
    const [state, setState] = useState({ expenses: [{ id: 'deleted', amount: 100 }] });
    const sync = useExpensesSync({ tenantId: 'A', ready: true, expenses: state.expenses, setState });
    return { state, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  expect(result.current.state.expenses).toEqual([]);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('retains failed writes for retry without resetting currency or VAT', async () => {
  mocks.save.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValue({ error: null });
  const { result } = renderHook(() => {
    const [state, setState] = useState({ expenses: [] });
    const sync = useExpensesSync({ tenantId: 'A', ready: true, expenses: state.expenses, setState });
    return { state, setState, sync };
  });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  vi.useFakeTimers();
  act(() => result.current.setState({ expenses: [{ id: 'exp', amount: 100, currency: 'USD', vat_amount: 18, date: '2026-09-23' }] }));
  await act(async () => vi.advanceTimersByTimeAsync(450));
  expect(result.current.sync.phase).toBe('error');
  await act(async () => result.current.sync.retry());
  expect(result.current.sync.phase).toBe('saved');
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls[1][0][0]).toMatchObject({ currency: 'USD', vat_amount: 18, tenant_id: 'A' });
  await act(async () => result.current.sync.retry());
  expect(mocks.save).toHaveBeenCalledTimes(2);
});

it('ignores a late expense load after switching tenants', async () => {
  let finish;
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue({ data: [], error: null });
  const { result, rerender } = renderHook(({ tenantId }) => {
    const [state, setState] = useState({ expenses: [] });
    const sync = useExpensesSync({ tenantId, ready: true, expenses: state.expenses, setState });
    return { state, sync };
  }, { initialProps: { tenantId: 'A' } });
  rerender({ tenantId: 'B' });
  await waitFor(() => expect(result.current.sync.phase).toBe('saved'));
  await act(async () => finish({ data: [{ id: 'old-a', amount: 10 }], error: null }));
  expect(result.current.state.expenses).toEqual([]);
});
