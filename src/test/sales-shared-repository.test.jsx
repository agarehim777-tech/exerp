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

it('bounds rendered rows while searching the complete loaded registry', () => {
  const orders = Array.from({ length: 203 }, (_, index) => ({ id: `order-${index}`, order_no: `SF-${index}`,
    total: 1200, paid_amount: 0, currency: 'AZN', order_date: '2026-10-09', status: 'confirmed', customer: { name: `Buyer ${index}` } }));
  const view = render(<SalesOrdersPage repository={{ orders, loading: false, hasMore: false }} />);
  expect(view.container.querySelectorAll('tbody tr')).toHaveLength(50);
  expect(screen.getByRole('navigation', { name: 'Satış reyestri səhifələri' })).toHaveTextContent('203 sifariş');
  for (let index = 0; index < 4; index++) fireEvent.click(screen.getByRole('button', { name: 'Növbəti səhifə' }));
  expect(view.container.querySelectorAll('tbody tr')).toHaveLength(3);
  expect(screen.getByText('SF-202')).toBeVisible();
  fireEvent.change(screen.getByPlaceholderText('Axtar...'), { target: { value: 'SF-175' } });
  expect(view.container.querySelectorAll('tbody tr')).toHaveLength(1);
  fireEvent.click(screen.getByText('SF-175'));
  expect(screen.getByRole('dialog')).toHaveTextContent('SF-175');
});
