import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../integrations/supabase/client', () => ({ supabase: { rpc } }));
import { useReportModules, useReportSeries, useReportTotals } from '../shared/hooks/useReportTotals.ts';

afterEach(cleanup);
beforeEach(() => { rpc.mockReset(); });

const hooks = [
  { name: 'totals', use: useReportTotals },
  { name: 'modules', use: useReportModules },
  { name: 'series', use: (tenant: string, _period: string, date: string) => useReportSeries(tenant, date) },
];

it.each(hooks)('$name hides old data on the very first render of a new tenant', async ({ use }) => {
  rpc.mockResolvedValue({ data: { revenue: 75 }, error: null });
  const renders: unknown[] = [];
  const { result, rerender } = renderHook(({ tenant }) => {
    const value = use(tenant, 'Bu ay', '2026-11-14');
    renders.push(value);
    return value;
  }, { initialProps: { tenant: 'a' } });
  await waitFor(() => expect(result.current).not.toBeNull());
  rpc.mockImplementation(() => new Promise(() => {}));
  renders.length = 0;
  rerender({ tenant: 'b' });
  expect(renders[0]).toBeNull();
  expect(result.current).toBeNull();
});

it('totals ignore a response from the first tenant visit after A -> B -> A', async () => {
  const pending: Array<(value: unknown) => void> = [];
  rpc.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const { result, rerender } = renderHook(({ tenant }) => useReportTotals(tenant, 'Bu ay', '2026-11-14'), {
    initialProps: { tenant: 'a' },
  });
  rerender({ tenant: 'b' });
  rerender({ tenant: 'a' });
  await act(async () => { pending[2]({ data: { revenue: 30 }, error: null }); });
  expect(result.current?.revenue).toBe(30);
  await act(async () => {
    pending[0]({ data: { revenue: 10 }, error: null });
    pending[1]({ data: { revenue: 20 }, error: null });
  });
  expect(result.current?.revenue).toBe(30);
});

it.each(hooks)('$name handles rejected RPC promises without publishing stale data', async ({ use }) => {
  rpc.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => use('a', 'Bu ay', '2026-11-14'));
  await act(async () => {});
  expect(result.current).toBeNull();
});
