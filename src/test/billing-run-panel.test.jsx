import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const source = vi.hoisted(() => ({
  orders: [],
  projects: [],
  error: null,
  refresh: vi.fn(),
}));
vi.mock('../shared/hooks/useBillingSources.js', () => ({ useBillingSources: () => source }));

import BillingRunPanel from '../modules/finance/components/BillingRunPanel.jsx';

const customers = [{ id: 'CU1', name: 'Aysel MMC' }];

beforeEach(() => {
  source.refresh.mockReset();
  source.error = null;
  source.orders = [
    { id: 'O1', order_no: 'S-1', customer_id: 'CU1', customer: { name: 'Aysel MMC' }, total: 118, status: 'confirmed', currency: 'AZN',
      items: [{ product_id: 'P1', description: 'Stul', qty: 2, unit_price: 50, vat_rate: 18 }] },
    { id: 'O2', order_no: 'S-2', billed: true, items: [] },
  ];
  source.projects = [{ id: 'PR1', name: 'Ofis təmiri', budget: 1000 }];
});

function renderPanel(extra = {}) {
  const props = {
    tenantId: 'tenant-a', customers, products: [], invoicesVersion: 1,
    nextInvoiceNo: vi.fn(async () => 'INV-9'), onCreateDraft: vi.fn(async (/** @type {any} */ _draft) => true), ...extra,
  };
  const view = render(<BillingRunPanel {...props} />);
  return { ...props, view };
}

it('lists unbilled orders and turns one into a confirmed draft invoice', async () => {
  const { nextInvoiceNo, onCreateDraft } = renderPanel();
  expect(screen.getByText('2 gözləyir')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
  expect(screen.getByRole('button', { name: 'Sifarişlər (1)' })).toBeInTheDocument();
  const row = screen.getByText('S-1').closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: 'Ön baxış və kəs' }));
  await screen.findByText('Sifariş S-1 üzrə faktura');
  expect(nextInvoiceNo).toHaveBeenCalledOnce();

  source.refresh.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Təsdiqlə və faktura kəs' }));
  await waitFor(() => expect(onCreateDraft).toHaveBeenCalledOnce());
  expect(onCreateDraft.mock.calls[0][0]).toMatchObject({
    invoice_no: 'INV-9', customer_id: 'CU1', order_id: 'O1', currency: 'AZN',
    lines: [{ product_id: 'P1', description: 'Stul', qty: 2, unit_price: 50, discount_pct: 0, vat_rate: 18 }],
  });
  await waitFor(() => expect(screen.queryByText('Sifariş S-1 üzrə faktura')).toBeNull());
  expect(source.refresh).toHaveBeenCalled();
});

it('keeps the preview open when the draft is not saved', async () => {
  renderPanel({ onCreateDraft: vi.fn(async () => false) });
  fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
  fireEvent.click(within(screen.getByText('S-1').closest('tr')).getByRole('button', { name: 'Ön baxış və kəs' }));
  await screen.findByText('Sifariş S-1 üzrə faktura');
  fireEvent.click(screen.getByRole('button', { name: 'Təsdiqlə və faktura kəs' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Təsdiqlə və faktura kəs' })).not.toBeDisabled());
  expect(screen.getByText('Sifariş S-1 üzrə faktura')).toBeInTheDocument();
});

it('needs a customer before a project milestone can be previewed', async () => {
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
  fireEvent.click(screen.getByRole('button', { name: 'Layihələr (1)' }));
  const row = screen.getByText('Ofis təmiri').closest('tr');
  const preview = within(row).getByRole('button', { name: 'Ön baxış və kəs' });
  expect(preview).toBeDisabled();
  fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'CU1' } });
  fireEvent.change(within(row).getByRole('spinbutton'), { target: { value: '40' } });
  fireEvent.click(preview);
  await screen.findByText('Layihə "Ofis təmiri" üzrə mərhələ fakturası');
});

it('refreshes billing sources when the invoice list changes and shows load errors', () => {
  const { view } = renderPanel();
  expect(source.refresh).toHaveBeenCalledTimes(1);
  view.rerender(<BillingRunPanel tenantId="tenant-a" customers={customers} products={[]} invoicesVersion={2} nextInvoiceNo={vi.fn()} onCreateDraft={vi.fn()} />);
  expect(source.refresh).toHaveBeenCalledTimes(2);
  source.error = { message: 'şəbəkə xətası' };
  view.rerender(<BillingRunPanel tenantId="tenant-a" customers={customers} products={[]} invoicesVersion={2} nextInvoiceNo={vi.fn()} onCreateDraft={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Faktura mənbələri yüklənmədi: şəbəkə xətası');
});
