import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WarehouseBalanceTable } from '../shared/lib/appDomain.jsx';

afterEach(cleanup);
const rows = Array.from({ length: 503 }, (_, index) => ({ key: String(index), productId: String(index),
  product: `Product ${index}`, total: 1, stockValue: 2, salesValue: 3, status: 'Normal' }));

it('bounds rendered stock rows while retaining totals for the complete filtered dataset', () => {
  const open = vi.fn();
  const view = render(<WarehouseBalanceTable rows={rows} view="warehouses" onOpenProduct={open} />);
  const body = view.container.querySelector('tbody');
  expect(within(body).getAllByRole('row')).toHaveLength(50);
  expect(view.container.querySelector('tfoot')).toHaveTextContent('503');
  expect(view.container.querySelector('tfoot')).toHaveTextContent('1.006');
  expect(view.getByRole('button', { name: 'Əvvəlki səhifə' })).toBeDisabled();
  fireEvent.click(view.getByRole('button', { name: 'Növbəti səhifə' }));
  expect(within(body).queryByText('Product 0')).toBeNull();
  fireEvent.click(within(body).getByRole('button', { name: 'Product 50' }));
  expect(open).toHaveBeenCalledWith('50');
  for (let page = 1; page < 10; page += 1) fireEvent.click(view.getByRole('button', { name: 'Növbəti səhifə' }));
  expect(within(body).getAllByRole('row')).toHaveLength(3);
  expect(view.getByRole('button', { name: 'Növbəti səhifə' })).toBeDisabled();
  view.rerender(<WarehouseBalanceTable rows={rows.slice(0, 2)} view="warehouses" />);
  expect(within(body).getAllByRole('row')).toHaveLength(2);
  expect(within(body).getByText('Product 0')).toBeVisible();
  expect(view.queryByRole('navigation')).toBeNull();
});
