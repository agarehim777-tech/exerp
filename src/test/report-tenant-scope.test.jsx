import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../services/reportData.js', () => ({ loadReportData: mocks.load, reportTables: [],
  emptyReportData: { expenses: [], cashEntries: [], vendors: [], purchaseOrders: [], invoices: [], productionPlans: [] } }));
vi.mock('../shared/hooks/useRealtimeResync.js', () => ({ useRealtimeResync: () => false }));
import { useLiveReportData } from '../shared/hooks/useLiveReportData.js';

const rows = name => ({ expenses: [{ id: name }], cashEntries: [], vendors: [], purchaseOrders: [], invoices: [], productionPlans: [] });
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => { mocks.load.mockReset(); });
afterEach(cleanup);

it('hides old tenant rows immediately and ignores an old request across A -> B -> A', async () => {
  const requests = [pending(), pending(), pending()];
  requests.forEach(request => mocks.load.mockReturnValueOnce(request.promise));
  const { result, rerender } = renderHook(({ tenant }) => useLiveReportData(tenant), { initialProps: { tenant: 'a' } });
  rerender({ tenant: 'b' });
  rerender({ tenant: 'a' });
  await act(async () => { requests[2].resolve(rows('fresh-a')); });
  expect(result.current.expenses).toEqual([{ id: 'fresh-a' }]);
  await act(async () => { requests[0].resolve(rows('old-a')); requests[1].resolve(rows('b')); });
  expect(result.current.expenses).toEqual([{ id: 'fresh-a' }]);
  rerender({ tenant: null });
  expect(result.current.expenses).toEqual([]);
  expect(result.current.loaded).toBe(false);
});

it('rejects an older refresh response and retains acknowledged rows on error until a successful empty refresh', async () => {
  mocks.load.mockResolvedValueOnce(rows('original'));
  const { result } = renderHook(() => useLiveReportData('a'));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const old = pending(), fresh = pending();
  mocks.load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  let first, second;
  act(() => { first = result.current.refresh(); second = result.current.refresh(); });
  await act(async () => { fresh.resolve(rows('fresh')); await second; old.resolve(rows('stale')); await first; });
  expect(result.current.expenses).toEqual([{ id: 'fresh' }]);
  mocks.load.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.expenses).toEqual([{ id: 'fresh' }]);
  expect(result.current.error.message).toBe('offline');
  expect(result.current.loading).toBe(false);
  mocks.load.mockResolvedValueOnce({ ...rows('ignored'), expenses: [] });
  await act(async () => { await result.current.refresh(); });
  expect(result.current.expenses).toEqual([]);
  expect(result.current.error).toBeNull();
});

it('does not mark the initial failed load as successful', async () => {
  mocks.load.mockRejectedValue(new Error('missing schema'));
  const { result } = renderHook(() => useLiveReportData('a'));
  await waitFor(() => expect(result.current.error?.message).toBe('missing schema'));
  expect(result.current.loaded).toBe(false);
  expect(result.current.loading).toBe(false);
});
