import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), relations: vi.fn() }));
vi.mock('../services/orderRead.js', () => ({ readOrderPage: mocks.read, readOrderRelations: mocks.relations }));
vi.mock('../shared/hooks/useRealtimeResync', () => ({ useRealtimeResync: () => false }));
import { useOrders } from '../shared/hooks/useOrders.js';

beforeEach(() => {
  mocks.read.mockReset();
  mocks.relations.mockReset().mockResolvedValue({ credits: [], bonuses: [], deliveries: [], deliveryError: null });
});
afterEach(cleanup);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

it('ignores an earlier A response after A-to-B-to-A and clears rows for empty or absent tenants', async () => {
  const old = deferred();
  mocks.read.mockImplementationOnce(() => old.promise).mockResolvedValue([]);
  const { result, rerender } = renderHook(({ tenant }) => useOrders(tenant), { initialProps: { tenant: 'A' } });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
  rerender({ tenant: 'B' });
  await waitFor(() => expect(result.current.loaded).toBe(true));
  rerender({ tenant: 'A' });
  await waitFor(() => expect(mocks.read).toHaveBeenCalledTimes(3));
  await act(async () => old.resolve([{ id: 'old-A' }]));
  expect(result.current.orders).toEqual([]);
  expect(result.current.loading).toBe(false);
  rerender({ tenant: null });
  expect(result.current.orders).toEqual([]);
  expect(result.current.loaded).toBe(false);
});

it('hides financial rows and releases loading after a failed refresh', async () => {
  mocks.read.mockResolvedValue([{ id: 'order-1' }]);
  const { result } = renderHook(() => useOrders('A'));
  await waitFor(() => expect(result.current.orders).toHaveLength(1));
  mocks.relations.mockRejectedValue(new Error('credits unavailable'));
  await act(async () => result.current.refresh());
  expect(result.current.error.message).toBe('credits unavailable');
  expect(result.current.orders).toEqual([]);
  expect(result.current.loaded).toBe(false);
  expect(result.current.loading).toBe(false);
});
