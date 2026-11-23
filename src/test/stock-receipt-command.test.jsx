import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStock } from '../shared/hooks/useStock.js';

const mocks = vi.hoisted(() => ({ receive: vi.fn(), manual: vi.fn(), transfer: vi.fn(), insert: vi.fn(), reads: vi.fn() }));
vi.mock('../services/coreOperations.js', () => ({
  receiveStock: mocks.receive, postManualStockMovement: mocks.manual, transferStock: mocks.transfer,
}));
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
      productId: 'product', quantity: '5', unitCost: '1200', referenceType: 'manual_receipt', note: 'WH-QA · Receipt' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reads.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('propagates a rejected receipt without a fallback write', async () => {
    const { result } = renderHook(() => useStock('tenant'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    mocks.receive.mockRejectedValueOnce(new Error('permission_denied'));
    await act(async () => {
      await expect(result.current.addMovement(payload)).rejects.toThrow('Anbar əməliyyatı üçün icazəniz yoxdur.');
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  // Məxaric/Düzəliş and transfers used to insert legacy move_type/qty rows the table no longer has.
  it('sends a manual write-off and a count correction through the server command', async () => {
    mocks.manual.mockResolvedValue('movement');
    const { result } = renderHook(() => useStock('tenant'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.addMovement({ ...payload, move_type: 'out', qty: '2' }); });
    await act(async () => { await result.current.addMovement({ ...payload, move_type: 'adjust', qty: '-1', unit_cost: '' }); });
    expect(mocks.manual.mock.calls.map(([args]) => [args.kind, args.quantity, args.documentNo])).toEqual([
      ['out', '2', 'WH-QA'], ['adjust', '-1', 'WH-QA'],
    ]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('explains a stock shortage from the server in Azerbaijani', async () => {
    mocks.manual.mockRejectedValueOnce(new Error('insufficient_stock'));
    const { result } = renderHook(() => useStock('tenant'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => {
      await expect(result.current.addMovement({ ...payload, move_type: 'out' }))
        .rejects.toThrow('Seçilmiş anbarda kifayət qədər sərbəst qalıq yoxdur.');
    });
  });
});
