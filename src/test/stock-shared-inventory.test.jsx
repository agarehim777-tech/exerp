import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import StockPage from '../modules/warehouse/StockPage.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeMembership: { tenant_id: 'tenant' } }) }));
vi.mock('../shared/hooks/usePermissions.js', () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock('../shared/hooks/useProducts.js', () => ({ useProducts: () => ({ products: [] }) }));
vi.mock('../shared/hooks/useStock.js', () => ({ useStock: () => { throw new Error('Duplicate inventory reader'); } }));

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
