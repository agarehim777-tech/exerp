import { renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

// PostgREST caps every response at 1000 rows and gives no error. These tenant-wide lists grow with
// every order, shipment, credit, serial unit or task, so each must page past the cap.
const TOTAL = 1200;
const MAX_ROWS = 1000;
const rowsFor = table => Array.from({ length: TOTAL }, (_, i) => ({ id: table + '-' + i }));
const tables = Object.fromEntries(['inventory_units', 'credit_contracts', 'procurement_shipments', 'sales_shipments', 'crm_tasks'].map(t => [t, rowsFor(t)]));

vi.mock('../integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
    channel: () => channel,
    removeChannel: () => {},
    from: table => {
      let from = 0, to = Infinity;
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain,
        range: (start, end) => { from = start; to = end; return chain; },
        then: resolve => Promise.resolve({ data: (tables[table] || []).slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }).then(resolve),
      };
      return chain;
    },
  } };
});

import { listCreditPortfolio, listInventoryUnits } from '../services/enterpriseWorkflows.js';
import { listShipments } from '../modules/procurement/landedCostService.js';
import { useShipments } from '../shared/hooks/useShipments.js';
import { useTasks } from '../shared/hooks/useTasks.js';

it('reads every serial unit past the 1000-row cap', async () => {
  expect(await listInventoryUnits({ tenantId: 'tenant-a', status: 'in_stock' })).toHaveLength(TOTAL);
});

it('reads the whole credit portfolio past the 1000-row cap', async () => {
  expect(await listCreditPortfolio({ tenantId: 'tenant-a' })).toHaveLength(TOTAL);
});

it('reads every procurement shipment past the 1000-row cap', async () => {
  expect(await listShipments('tenant-a')).toHaveLength(TOTAL);
});

it('loads every sales shipment past the 1000-row cap', async () => {
  const { result } = renderHook(() => useShipments('tenant-a'));
  await waitFor(() => expect(result.current.shipments).toHaveLength(TOTAL));
});

it('loads every CRM task past the 1000-row cap', async () => {
  const { result } = renderHook(() => useTasks('tenant-a'));
  await waitFor(() => expect(result.current.items).toHaveLength(TOTAL));
});
