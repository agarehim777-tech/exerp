import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ProductSearchSelect from '../components/ProductSearchSelect.jsx';

const products = [{ id: 'new', name: 'New Device', sku: 'NEW-SKU' }];

it('keeps the option mounted through pointer down and selects on completed click', () => {
  const onChange = vi.fn();
  render(<ProductSearchSelect products={products} onChange={onChange} placeholder="Product" />);
  fireEvent.change(screen.getByPlaceholderText('Product'), { target: { value: 'NEW-SKU' } });
  const option = screen.getByRole('button', { name: 'New Device NEW-SKU', exact: true });
  fireEvent.mouseDown(option);
  expect(onChange).not.toHaveBeenCalled();
  expect(option).toBeVisible();
  fireEvent.click(option);
  expect(onChange).toHaveBeenCalledExactlyOnceWith('new', products[0]);
  expect(screen.queryByRole('button', { name: 'New Device NEW-SKU' })).toBeNull();
});

it('retains keyboard selection', () => {
  const onChange = vi.fn();
  render(<ProductSearchSelect products={products} onChange={onChange} placeholder="Product" />);
  const input = screen.getByPlaceholderText('Product');
  fireEvent.change(input, { target: { value: 'NEW-SKU' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledExactlyOnceWith('new', products[0]);
});
