import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SalesOrdersPage from '../modules/sales/SalesOrdersPage.jsx';

vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: 'tenant', activeMembership: { role: 'admin' } }) }));
vi.mock('../shared/hooks/useOrders.js', () => ({ useOrders: () => { throw new Error('Duplicate sales reader'); } }));
vi.mock('../shared/hooks/useCustomers.js', () => ({ useCustomers: () => { throw new Error('Duplicate customer reader'); } }));
vi.mock('../shared/hooks/useProducts.js', () => ({ useProducts: () => { throw new Error('Duplicate product reader'); } }));
vi.mock('../shared/hooks/useCashbook.js', () => ({ useCashbook: () => ({ accounts: [] }) }));
vi.mock('../modules/sales/OrderDrawer.jsx', () => ({ default: ({ order }) => <div role="dialog">{order.order_no}</div> }));

it('shows a server-confirmed sale and refreshed payment directly from the creation repository', () => {
  const repository = { orders: [], loading: false, error: null, hasMore: false };
  const view = render(<SalesOrdersPage repository={repository} />);
  expect(screen.queryByText('SF-NEW')).toBeNull();
  const order = { id: 'order', order_no: 'SF-NEW', total: 1200, paid_amount: 0, currency: 'AZN',
    order_date: '2026-10-08', status: 'confirmed', customer: { name: 'Buyer' } };
  view.rerender(<SalesOrdersPage repository={{ ...repository, orders: [order] }} />);
  fireEvent.change(screen.getByPlaceholderText('Axtar...'), { target: { value: 'SF-NEW' } });
  expect(screen.getByText('SF-NEW')).toBeVisible();
  view.rerender(<SalesOrdersPage repository={{ ...repository, orders: [{ ...order, paid_amount: 200 }] }} />);
  expect(screen.getByText('200.00 AZN')).toBeVisible();
  view.rerender(<SalesOrdersPage repository={{ ...repository, orders: [] }} />);
  expect(screen.queryByText('SF-NEW')).toBeNull();
});
