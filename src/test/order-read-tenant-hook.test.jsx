import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), byId: vi.fn(), create: vi.fn(), relations: vi.fn(), resync: vi.fn() }));
vi.mock('../services/orderRead.js', () => ({ readOrderPage: mocks.read, readOrderById: mocks.byId, readOrderRelations: mocks.relations }));
vi.mock('../services/coreOperations', async importOriginal => ({ ...(await importOriginal()), createSalesOrderComplete: mocks.create }));
vi.mock('../shared/hooks/useRealtimeResync', () => ({ useRealtimeResync: mocks.resync }));
import { useOrders } from '../shared/hooks/useOrders.js';

beforeEach(() => {
  mocks.read.mockReset();
  mocks.byId.mockReset();
  mocks.create.mockReset();
  mocks.resync.mockReset();
  mocks.relations.mockReset().mockResolvedValue({ credits: [], bonuses: [], deliveries: [], deliveryError: null });
});
afterEach(cleanup);

it('hydrates the committed order without waiting for a full portfolio refresh', async () => {
  mocks.read.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise(() => {}));
  mocks.create.mockResolvedValue({ order_id: 'new-order', credit_id: 'new-credit' });
  mocks.byId.mockResolvedValue({ id: 'new-order', total: 1200, paid_amount: 0 });
  const { result } = renderHook(() => useOrders('A'));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  mocks.relations.mockResolvedValue({ credits: [{ id: 'new-credit', order_id: 'new-order' }], bonuses: [], deliveries: [] });
  let saved;
  await act(async () => { saved = await result.current.create({ request_key: 'request-1', customer_id: 'buyer', items: [] }); });
  expect(saved).toEqual({ id: 'new-order', creditId: 'new-credit' });
  expect(mocks.byId.mock.calls[0].slice(0, 2)).toEqual(['A', 'new-order']);
  expect(mocks.relations.mock.calls.at(-1).slice(0, 2)).toEqual(['A', ['new-order']]);
  expect(result.current.orders[0]).toMatchObject({ id: 'new-order', total: 1200, credit: { id: 'new-credit' } });
});

it('refreshes canonical credit links when contracts or payments change', async () => {
  mocks.read.mockResolvedValue([{ id: 'order-1' }]);
  mocks.relations.mockResolvedValue({ credits: [{ id: 'credit-1', order_id: 'order-1', initial_payment: 0 }], bonuses: [], deliveries: [] });
  const { result } = renderHook(() => useOrders('A'));
  await waitFor(() => expect(result.current.orders[0]?.credit.initial_payment).toBe(0));
  const [tenant, tables, refresh] = mocks.resync.mock.calls.at(-1);
  expect(tenant).toBe('A');
  expect(tables).toEqual(expect.arrayContaining(['credit_contracts', 'credit_installments', 'credit_payments']));
  mocks.relations.mockResolvedValue({ credits: [{ id: 'credit-1', order_id: 'order-1', initial_payment: 200 }], bonuses: [], deliveries: [] });
  await act(async () => refresh());
  expect(result.current.orders[0].credit.initial_payment).toBe(200);
});
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
