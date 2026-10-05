import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: {}, failure: null, queries: [] }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from(table) {
  const query = { table, filters: [], orders: [] };
  const chain = {
    select: () => chain,
    eq: (column, value) => { query.filters.push([column, value]); return chain; },
    order: column => { query.orders.push(column); return chain; },
    range: async (start, end) => {
      mocks.queries.push({ ...query, start, end });
      if (mocks.failure === table) return { data: null, error: new Error('report read failed') };
      return { data: (mocks.rows[table] || []).slice(start, end + 1), error: null };
    },
  };
  return chain;
} } }));
import { loadReportData } from '../services/reportData.js';

beforeEach(() => { mocks.rows = {}; mocks.failure = null; mocks.queries = []; });

it('reads every page with an explicit tenant and stable ordering, including a late reversal', async () => {
  const original = '11111111-1111-4111-8111-111111111111';
  mocks.rows.cash_transactions = [
    { id: original, direction: 'in', amount: 100 },
    ...Array.from({ length: 999 }, (_, index) => ({ id: `cash-${index}`, direction: 'in', amount: 1 })),
    { id: 'reversal', category: 'transaction_reversal', reversal_of: original, direction: 'out', amount: 100 },
  ];
  mocks.rows.production_batches = [{ id: 'batch', product: { name: 'Device' }, warehouse: { name: 'Main' },
    warehouse_id: 'warehouse', quantity: '2', total_cost: '150.00', completed_at: '2026-10-05T08:00:00Z' }];
  const result = await loadReportData('tenant-a');
  expect(result.cashEntries).toHaveLength(999);
  expect(result.cashEntries.some(row => row.id === original || row.id === 'reversal')).toBe(false);
  expect(result.productionPlans[0]).toMatchObject({ product: 'Device', totalCost: 150, qty: 2, warehouseId: 'warehouse' });
  expect(mocks.queries.filter(row => row.table === 'cash_transactions').map(row => row.start)).toEqual([0, 500, 1000]);
  expect(mocks.queries.every(row => row.filters.some(([key, value]) => key === 'tenant_id' && value === 'tenant-a'))).toBe(true);
  expect(mocks.queries.every(row => row.orders.includes('id'))).toBe(true);
});

it('fails the entire report rather than treating a failed financial read as an empty result', async () => {
  mocks.failure = 'expenses';
  mocks.rows.vendors = [{ id: 'vendor' }];
  await expect(loadReportData('tenant-a')).rejects.toThrow('report read failed');
  await expect(loadReportData(null)).rejects.toThrow('REPORT_TENANT_REQUIRED');
});

it('accepts authoritative empty results and excludes rows reversed without a counterpart', async () => {
  mocks.rows.cash_transactions = [{ id: 'reversed', reversed_at: '2026-10-05', direction: 'in', amount: 100 }];
  const result = await loadReportData('tenant-a');
  expect(result.cashEntries).toEqual([]);
  expect(result.expenses).toEqual([]);
  expect(result.productionPlans).toEqual([]);
});
