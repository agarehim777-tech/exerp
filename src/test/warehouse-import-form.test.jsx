import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WarehouseImportModal } from '../components/AppWidgets.jsx';

const warehouses = [{ id: 'warehouse', code: 'WH-QA', name: 'QA Warehouse' }];
const csv = 'product,sku,warehouse,qty,salePrice,costPrice,category,unit,reorderLevel,serialTracked\nDevice,SKU-QA,WH-QA,7,900,600,Laser,pcs,3,true';
const chooseFile = (view, text = csv) => fireEvent.change(view.getByLabelText('CSV faylı seçin'), {
  target: { files: [{ name: 'stock.csv', text: async () => text }] },
});

it('disables changes while saving, preserves an uncertain request and gives changed data a new key', async () => {
  let reject;
  const save = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }))
    .mockResolvedValueOnce({ row_count: 1 }).mockResolvedValueOnce({ row_count: 1 });
  const close = vi.fn();
  const view = render(<WarehouseImportModal warehouses={warehouses} onClose={close} onImport={save} />);
  chooseFile(view);
  await waitFor(() => expect(view.getByRole('button', { name: 'İmport et' })).toBeEnabled());
  fireEvent.click(view.getByRole('button', { name: 'İmport et' }));
  expect(view.getByRole('button', { name: 'Saxlanılır...' })).toBeDisabled();
  expect(view.getByRole('button', { name: 'Ləğv et' })).toBeDisabled();
  expect(view.getByLabelText('CSV faylı seçin')).toBeDisabled();
  await act(async () => reject(new Error('Network unavailable')));
  expect(view.getByRole('alert')).toHaveTextContent('Network unavailable');
  fireEvent.click(view.getByRole('button', { name: 'İmport et' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]).toEqual(save.mock.calls[0]);
  await waitFor(() => expect(view.getByRole('button', { name: 'İmport et' })).toBeEnabled());
  chooseFile(view, csv.replace(',7,', ',8,'));
  await waitFor(() => expect(view.getByRole('button', { name: 'İmport et' })).toBeEnabled());
  fireEvent.click(view.getByRole('button', { name: 'İmport et' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
  expect(save.mock.calls[2][1]).not.toBe(save.mock.calls[0][1]);
  expect(save.mock.calls[2][0][0].qty).toBe(8);
  expect(close).not.toHaveBeenCalled();
});
