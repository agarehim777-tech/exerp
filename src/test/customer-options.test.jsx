import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useCustomers } from '../shared/hooks/useCustomers';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), select: vi.fn(), range: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: mocks }));
vi.mock('../shared/hooks/useRealtimeResync', () => ({ useRealtimeResync: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation(() => {
    const query = { select: mocks.select.mockImplementation(() => query),
      eq: () => query, order: () => query, range: mocks.range };
    return query;
  });
});

it('loads invoice options without waiting for CRM metrics and retains access to older customers', async () => {
  const rows = Array.from({ length: 120 }, (_, id) => ({ id: String(id), name: `Customer ${id}` }));
  mocks.range.mockImplementation(async (start, end) => ({ data: rows.slice(start, end + 1), count: rows.length }));
  const { result } = renderHook(() => useCustomers('tenant-a', { optionsOnly: true }));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(mocks.select).toHaveBeenCalledWith('id,name', { count: 'exact' });
  expect(mocks.range).toHaveBeenCalledWith(0, 50);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.from.mock.calls.every(([table]) => table === 'customers')).toBe(true);
  expect(result.current.customers).toEqual(rows.slice(0, 50));
  expect(result.current.hasMore).toBe(true);
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.customers).toHaveLength(100));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.customers).toHaveLength(120));
  expect(result.current.hasMore).toBe(false);
});

it('exposes lookup errors and clears previous tenant options immediately', async () => {
  mocks.range.mockResolvedValue({ data: [{ id: 'old', name: 'Old' }], count: 1 });
  const { result, rerender } = renderHook(({ tenant }) => useCustomers(tenant, { optionsOnly: true }),
    { initialProps: { tenant: 'A' } });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  mocks.range.mockResolvedValue({ error: { message: 'Read failed' } });
  rerender({ tenant: 'B' });
  expect(result.current.customers).toEqual([]);
  await waitFor(() => expect(result.current.error?.message).toBe('Read failed'));
  expect(result.current.loaded).toBe(false);
});
