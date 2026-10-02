import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStock } from '../shared/hooks/useStock.js';

const mocks = vi.hoisted(() => ({ receive: vi.fn(), insert: vi.fn(), reads: vi.fn() }));
vi.mock('../services/coreOperations.js', () => ({ receiveStock: mocks.receive }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  from: (table) => {
    mocks.reads(table);
    const query = { select: () => query, eq: () => query, order: () => query, range: () => query,
      insert: mocks.insert, then: (resolve, reject) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject) };
    return query;
  },
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
} }));

const payload = { warehouse_id: 'warehouse', product_id: 'product', move_type: 'in', qty: '5',
  unit_cost: '1200', doc_no: 'WH-QA', note: 'Receipt', sku: 'SKU-QA' };

describe('manual stock receipt command', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.receive.mockResolvedValue('movement'); });

  it('uses the canonical RPC and refreshes the balance without a legacy insert', async () => {
    const { result } = renderHook(() => useStock('tenant'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const readsBefore = mocks.reads.mock.calls.length;
    await act(async () => { await result.current.addMovement(payload); });
    expect(mocks.receive).toHaveBeenCalledExactlyOnceWith({ tenantId: 'tenant', warehouseId: 'warehouse',
      productId: 'product', quantity: '5', unitCost: '1200', referenceType: 'WH-QA', note: 'Receipt' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reads.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('propagates a rejected receipt without a fallback write', async () => {
    const { result } = renderHook(() => useStock('tenant'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    mocks.receive.mockRejectedValueOnce(new Error('permission_denied'));
    await act(async () => {
      await expect(result.current.addMovement(payload)).rejects.toThrow('permission_denied');
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
