import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
import { importWarehouseStockAtomic } from '../services/warehouseImport.js';
import { dbProductToLegacy } from '../shared/adapters/erpShape.js';

beforeEach(() => mocks.rpc.mockReset());
it('uses the caller receipt for retry and requires the complete server acknowledgement', async () => {
  const rows = [{ product: 'Device', warehouseId: 'warehouse', qty: 7 }];
  mocks.rpc.mockResolvedValue({ data: { request_id: 'request', row_count: 1 }, error: null });
  await importWarehouseStockAtomic('tenant', rows, 'receipt');
  await importWarehouseStockAtomic('tenant', rows, 'receipt');
  expect(mocks.rpc.mock.calls[0]).toEqual(['import_warehouse_stock_atomic', {
    _tenant_id: 'tenant', _request_key: 'receipt', _rows: rows,
  }]);
  expect(mocks.rpc.mock.calls[1]).toEqual(mocks.rpc.mock.calls[0]);
  mocks.rpc.mockResolvedValueOnce({ data: { row_count: 0 }, error: null });
  await expect(importWarehouseStockAtomic('tenant', rows, 'receipt')).rejects.toThrow('server');
});
it('propagates the database failure and never sends an incomplete import', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('invalid_stock_scope') });
  await expect(importWarehouseStockAtomic('tenant', [{ qty: 1 }], 'receipt')).rejects.toThrow('invalid_stock_scope');
  mocks.rpc.mockClear();
  for (const args of [[null, [{}], 'key'], ['tenant', [], 'key'], ['tenant', [{}], '']]) {
    await expect(importWarehouseStockAtomic(...args)).rejects.toThrow();
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('shows persisted product cost and serial metadata rather than browser-only defaults', () => {
  expect(dbProductToLegacy({ id: 'p', name: 'Device', cost_price: '600.25', serial_tracked: true }))
    .toMatchObject({ costPrice: 600.25, serialTracked: true });
  expect(dbProductToLegacy({ id: 'p', name: 'Device' })).toMatchObject({ costPrice: 0, serialTracked: false });
});
