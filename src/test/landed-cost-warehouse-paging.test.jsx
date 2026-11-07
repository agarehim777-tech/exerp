import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

// PostgREST caps every response at 1000 rows. The landed cost "Qəbul anbarı" picker must still
// offer warehouses past that cap, otherwise a shipment cannot be received into a newer warehouse.
const TOTAL = 1200;
const MAX_ROWS = 1000;
const warehouses = Array.from({ length: TOTAL }, (_, i) => ({ id: 'w' + i, name: 'Warehouse ' + String(i).padStart(4, '0') }));

vi.mock('../modules/procurement/landedCostService.js', () => ({
  listShipments: vi.fn().mockResolvedValue([{ id: 'shipment', shipment_no: 'SHP-QA', status: 'draft', lines: [], costs: [] }]),
  getCostingLines: vi.fn(), recalculateShipment: vi.fn(), receiveShipment: vi.fn(),
  removeShipmentCost: vi.fn(), removeShipmentLine: vi.fn(), saveShipment: vi.fn(), saveShipmentCost: vi.fn(),
  saveShipmentLine: vi.fn(), updateShipmentWarehouse: vi.fn(),
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: table => {
  let from = 0, to = Infinity;
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain,
    range: (start, end) => { from = start; to = end; return chain; },
    then: resolve => {
      const rows = table === 'warehouses' ? warehouses.slice(from, Math.min(to + 1, from + MAX_ROWS)) : [];
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return chain;
} } }));

import LandedCostPanel from '../modules/procurement/LandedCostPanel.jsx';

afterEach(cleanup);

it('offers every active warehouse as receiving warehouse, past the 1000-row response cap', async () => {
  render(<LandedCostPanel tenantId="tenant-a" />);
  fireEvent.click(await screen.findByRole('button', { name: /SHP-QA/ }));
  const select = screen.getByRole('combobox', { name: 'Qəbul anbarı', exact: true });
  await waitFor(() => expect(select.querySelector('option[value="w' + (TOTAL - 1) + '"]')).not.toBeNull());
  expect(select.querySelectorAll('option[value^="w"]').length).toBe(TOTAL);
});
