import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Since 20261128110000 orders and credit contracts are server-write only: the app edits an order header and a
// credit collection stage only through their commands, never with a direct table update.
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('../services/orderRead.js', () => ({ readOrderPage: async () => [], readOrderById: async () => null,
  readOrderRelations: async () => ({ credits: [], bonuses: [], deliveries: [], deliveryError: null }), readOpeningCredits: async () => [] }));
vi.mock('../shared/hooks/useRealtimeResync', () => ({ useRealtimeResync: () => false }));
import { useOrders } from '../shared/hooks/useOrders.js';
import { updateCreditCollection } from '../services/enterpriseWorkflows.js';

beforeEach(() => { mocks.rpc.mockReset().mockResolvedValue({ data: null, error: null }); mocks.from.mockReset(); });
afterEach(cleanup);

it('edits the order header through its command and sends a status change to the status command', async () => {
  const { result } = renderHook(() => useOrders('T'));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await act(() => result.current.updateHeader('O-1', { customer_id: 'C-2', order_date: '2026-11-21', notes: 'Qeyd', status: 'confirmed' }));
  expect(mocks.rpc.mock.calls).toEqual([
    ['update_sales_order_header', { _tenant_id: 'T', _order_id: 'O-1', _customer_id: 'C-2', _order_date: '2026-11-21', _notes: 'Qeyd' }],
    ['process_sales_order_status', { _order_id: 'O-1', _status: 'confirmed' }],
  ]);
  mocks.rpc.mockClear();
  await act(() => result.current.updateHeader('O-1', { notes: null }));
  expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['update_sales_order_header']);
  expect(mocks.from).not.toHaveBeenCalledWith('orders');
});

it('stops before the status change when the header command fails', async () => {
  const { result } = renderHook(() => useOrders('T'));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'order_customer_locked' } });
  await expect(result.current.updateHeader('O-1', { customer_id: 'C-9', status: 'cancelled' })).rejects.toMatchObject({ message: 'order_customer_locked' });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('changes a credit collection stage with one command', async () => {
  const updated = await updateCreditCollection({ tenantId: 'T', credit: { id: 'K-1', collection_stage: 'current' }, stage: 'reminder', reason: 'Zəng' });
  expect(mocks.rpc).toHaveBeenCalledWith('set_credit_collection_stage', { _tenant_id: 'T', _credit_id: 'K-1', _stage: 'reminder', _reason: 'Zəng' });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(updated).toMatchObject({ id: 'K-1', collection_stage: 'reminder' });
});
