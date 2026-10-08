import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StockPage from '../modules/warehouse/StockPage.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeMembership: { tenant_id: 'tenant' } }) }));
vi.mock('../shared/hooks/usePermissions.js', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('../shared/hooks/useProducts.js', () => ({ useProducts: () => { throw new Error('Duplicate product reader'); } }));
vi.mock('../shared/hooks/useStock.js', () => ({ useStock: () => { throw new Error('Duplicate inventory reader'); } }));
afterEach(cleanup);

it('uses the shared inventory and exposes newly refreshed warehouses in movement selectors', () => {
  const inventory = { warehouses: [], balances: [], movements: [], movementsTotal: 0,
    movementsPage: 0, movementsPageCount: 1, movementsPageSize: 50, loading: false };
  const view = render(<StockPage inventory={inventory} />);
  fireEvent.click(view.getByRole('button', { name: 'Hərəkətlər', exact: true }));
  expect(view.queryByRole('option', { name: 'New warehouse' })).toBeNull();
  view.rerender(<StockPage inventory={{ ...inventory, warehouses: [{ id: 'warehouse', name: 'New warehouse' }] }} />);
  const option = view.getByRole('option', { name: 'New warehouse' });
  expect(option).toHaveValue('warehouse');
  expect(view.getByRole('button', { name: '+ Qeyd et' })).toBeEnabled();
});

it('exposes freshly created products from the shared catalog without a realtime round trip', () => {
  const inventory = { warehouses: [{ id: 'warehouse', name: 'Warehouse' }], balances: [], movements: [], movementsTotal: 0,
    movementsPage: 0, movementsPageCount: 1, movementsPageSize: 50, loading: false };
  const view = render(<StockPage inventory={inventory} products={[]} />);
  fireEvent.click(view.getByRole('button', { name: 'Hərəkətlər', exact: true }));
  view.rerender(<StockPage inventory={inventory} products={[{ id: 'product', name: 'New Device', sku: 'NEW-SKU' }]} />);
  fireEvent.change(view.getByPlaceholderText('Məhsul adı və ya SKU yazın'), { target: { value: 'NEW-SKU' } });
  const option = view.getByRole('button', { name: 'New Device NEW-SKU' });
  fireEvent.click(option);
  expect(view.getByPlaceholderText('Məhsul adı və ya SKU yazın')).toHaveValue('New Device');
});

it('bounds canonical warehouse and balance rendering while retaining complete totals and selectors', () => {
  const warehouses = Array.from({ length: 603 }, (_, index) => ({ id: `w${index}`, name: `Warehouse ${index}`, code: `W${index}` }));
  const balances = warehouses.map((warehouse, index) => ({ warehouse_id: warehouse.id, product_id: `p${index}`,
    warehouse, product: { name: `Product ${index}` }, qty: 2, avg_cost: 1, reserved: 0, problem_qty: 0 }));
  const inventory = { warehouses, balances, movements: [], movementsTotal: 0,
    movementsPage: 0, movementsPageCount: 1, movementsPageSize: 50, loading: false };
  const view = render(<StockPage inventory={inventory} />);
  expect(within(view.container.querySelector('tbody')).getAllByRole('row')).toHaveLength(50);
  fireEvent.click(view.getByRole('button', { name: '+ Yeni anbar' }));
  expect(view.getByPlaceholderText('Kod')).toBeVisible();
  fireEvent.change(view.getByRole('searchbox', { name: 'Anbar axtarışı' }), { target: { value: 'W602' } });
  expect(within(view.container.querySelector('tbody')).getAllByRole('row')).toHaveLength(1);
  expect(view.getByText('Warehouse 602')).toBeVisible();
  fireEvent.click(view.getByRole('button', { name: 'Anbarlar üzrə qalıqlar' }));
  expect(within(view.container.querySelector('tbody')).getAllByRole('row')).toHaveLength(50);
  expect(view.getByText('1.206')).toBeVisible();
  fireEvent.click(within(view.getByRole('navigation', { name: 'Qalıq səhifələri' })).getByRole('button', { name: 'Növbəti səhifə' }));
  expect(view.getByText('Product 50')).toBeVisible();
  fireEvent.click(view.getByRole('button', { name: 'Hərəkətlər', exact: true }));
  expect(view.getByRole('option', { name: 'Warehouse 602', exact: true })).toHaveValue('w602');
});
