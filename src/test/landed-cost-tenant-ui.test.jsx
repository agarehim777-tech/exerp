import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ filters: [], selects: [], error: null, list: vi.fn() }));
vi.mock('../modules/procurement/landedCostService.js', () => ({
  listShipments: mocks.list, getCostingLines: vi.fn(), recalculateShipment: vi.fn(), receiveShipment: vi.fn(),
  removeShipmentCost: vi.fn(), removeShipmentLine: vi.fn(), saveShipment: vi.fn(), saveShipmentCost: vi.fn(),
  saveShipmentLine: vi.fn(), updateShipmentWarehouse: vi.fn(),
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: table => {
  const chain = {
    select: columns => { mocks.selects.push({table,columns}); return chain; },
    eq: (column,value) => { mocks.filters.push({table,column,value}); return chain; },
    order: () => chain,
    then: resolve => Promise.resolve({data: table === 'warehouses' ? [{id:'warehouse',name:'QA Warehouse'}] : [], error: mocks.error }).then(resolve),
  };
  return chain;
} } }));
import LandedCostPanel from '../modules/procurement/LandedCostPanel.jsx';
beforeEach(() => {
  mocks.filters = []; mocks.selects = []; mocks.error = null;
  mocks.list.mockResolvedValue([{id:'shipment',shipment_no:'SHP-QA',status:'draft',lines:[],costs:[]}]);
});
it('scopes purchase lines through the tenant parent and gives the warehouse picker an exact accessible name', async () => {
  render(<LandedCostPanel tenantId="tenant-a" />);
  fireEvent.click(await screen.findByRole('button', {name:/SHP-QA/}));
  expect(screen.getByRole('combobox', {name:'Qəbul anbarı',exact:true})).toBeVisible();
  expect(screen.getByRole('option', {name:'QA Warehouse'})).toBeVisible();
  expect(mocks.selects.find(row=>row.table==='purchase_order_lines').columns).toContain('purchase_orders!inner');
  expect(mocks.filters).toContainEqual({table:'purchase_order_lines',column:'po.tenant_id',value:'tenant-a'});
  expect(mocks.filters).toContainEqual({table:'warehouses',column:'tenant_id',value:'tenant-a'});
});
it('shows a failed query instead of pretending there are no warehouses or purchase orders', async () => {
  mocks.error = new Error('Warehouse access denied');
  render(<LandedCostPanel tenantId="tenant-a" />);
  await waitFor(()=>expect(screen.getByText('Warehouse access denied')).toBeVisible());
  expect(screen.queryByRole('button', {name:/SHP-QA/})).not.toBeInTheDocument();
});
