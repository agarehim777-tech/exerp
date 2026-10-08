import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SalesOrderModal } from '../modules/sales/components/SalesOrderModals.jsx';

function prepare(onCreate) {
  const onClose = vi.fn();
  render(<SalesOrderModal type="sales" onClose={onClose} onCreate={onCreate} orderOptions={{
    customers: [{ id: 'customer', name: 'Buyer', fin: 'FIN1234' }],
    products: [{ id: 'product', name: 'Device', sku: 'SKU1', salePrice: 1200, status: 'Aktiv' }],
    stock: [{ product: 'Device', total: 5, reserved: 0, price: 1200 }],
    sellers: [{ name: 'Seller' }], warehouses: [{ id: 'warehouse', name: 'Warehouse' }],
  }} />);
  const fields = screen.getAllByRole('combobox');
  for (const [label, query] of [['Buyer', 'Buyer'], ['Device', 'Device'], ['Seller', 'Seller']]) {
    const field = fields.find(input => input.tagName === 'INPUT' &&
      (label === 'Buyer' ? input.getAttribute('aria-label').startsWith('Müştəri') :
        label === 'Device' ? input.getAttribute('aria-label').startsWith('Məhsul') :
          input.getAttribute('aria-label').startsWith('Satıcı')));
    fireEvent.change(field, { target: { value: query } });
    fireEvent.click(screen.getByRole('option', { name: new RegExp(label) }));
  }
  return { onClose, button: screen.getByRole('button', { name: 'Sifarişi yarat' }) };
}

describe('server-confirmed sales submission', () => {
  it('locks repeat submission and closing until the server settles', async () => {
    let resolve;
    const onCreate = vi.fn(() => new Promise(done => { resolve = done; }));
    const { button } = prepare(onCreate);
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    fireEvent.submit(button.closest('form'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pəncərəni bağla' })).toBeDisabled();
    await act(async () => resolve(false));
    expect(button).not.toBeDisabled();
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('keeps entered data and permits retry after a server error', async () => {
    const onCreate = vi.fn().mockRejectedValueOnce(new Error('Server unavailable')).mockResolvedValue(true);
    const { button } = prepare(onCreate);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable'));
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
    expect(onCreate.mock.calls[1][1]).toMatchObject({ customer: 'Buyer', orderTotal: 1200 });
  });
});
