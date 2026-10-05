import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: {}, tenant: 'tenant-a', filters: [], selects: [], pending: null, rpc: vi.fn() }));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: mocks.tenant, user: { id: 'actor-a' } }) }));
vi.mock('../services/enterpriseWorkflows.js', () => ({ listWorkflowRecords: async () => [], saveWorkflowRecord: vi.fn() }));
vi.mock('../modules/procurement/procurementSchema.js', () => ({
  isMissingPoPaymentsTable: () => false,
  readLegacyPoPayments: async () => ({ data: [], error: null }),
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  rpc: mocks.rpc,
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
  from: table => {
    const filters = [];
    const chain = {
      select: columns => { mocks.selects.push({ table, columns }); return chain; },
      eq: (column, value) => { filters.push({ column, value }); mocks.filters.push({ table, column, value }); return chain; },
      order: () => chain,
      then: resolve => (mocks.pending?.(table, filters) || Promise.resolve({ data: mocks.rows[table] || [], error: null })).then(resolve),
    };
    return chain;
  },
} }));
import ProcurementPage from '../modules/procurement/ProcurementPage.jsx';

beforeEach(() => {
  mocks.tenant = 'tenant-a'; mocks.filters = []; mocks.selects = []; mocks.pending = null;
  mocks.rpc.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.rows = {
    purchase_orders: [{ id: 'po-a', po_number: 'PO-QA', currency: 'AZN', status: 'approved', vendors: { name: 'QA Vendor' } }],
    purchase_order_lines: [{ id: 'line-a', po_id: 'po-a', qty_ordered: 2, unit_price: 50, product_sku: 'QA-SKU' }],
    vendor_invoices: [{ id: 'invoice-a', po_id: 'po-a', invoice_number: 'INV-QA', currency: 'AZN', status: 'paid' }],
    vendor_invoice_lines: [{ id: 'invoice-line', invoice_id: 'invoice-a', po_line_id: 'line-a', qty_invoiced: 2, unit_price: 50, tax_rate: 0 }],
  };
});

it('explicitly scopes child line queries through their tenant-owned parent and labels both PO selectors', async () => {
  render(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Məlumatlar yüklənir')).not.toBeInTheDocument());
  for (const [table, parent] of [['purchase_order_lines', 'purchase_orders'], ['goods_receipt_lines', 'goods_receipts'], ['vendor_invoice_lines', 'vendor_invoices']]) {
    expect(mocks.filters).toContainEqual({ table, column: parent + '.tenant_id', value: 'tenant-a' });
    expect(mocks.selects.find(row => row.table === table).columns).toContain(parent + '!inner(tenant_id)');
  }
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Mədaxil', exact: true }));
  expect(screen.getByRole('combobox', { name: 'PO', exact: true })).toHaveAttribute('aria-label', 'PO');
  fireEvent.click(screen.getByRole('button', { name: 'Fakturalar', exact: true }));
  expect(screen.getByRole('combobox', { name: 'PO', exact: true })).toHaveAttribute('aria-label', 'PO');
});

it('resets tenant forms and rejects an old A response after A -> B -> A', async () => {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  let first = true;
  mocks.pending = (table, filters) => {
    if (table === 'vendors' && filters.some(row => row.value === 'tenant-a') && first) {
      first = false;
      return old;
    }
    return null;
  };
  const { rerender } = render(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(first).toBe(false));
  mocks.tenant = 'tenant-b';
  rerender(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Məlumatlar yüklənir')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Vendorlar', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Yeni vendor', exact: true }));
  fireEvent.change(screen.getByLabelText('Ad', { exact: true }), { target: { value: 'B draft' } });
  mocks.tenant = 'tenant-a';
  mocks.rows.vendors = [{ id: 'new-a', name: 'Current A', is_active: true }];
  rerender(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Məlumatlar yüklənir')).not.toBeInTheDocument());
  expect(screen.queryByDisplayValue('B draft')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Vendorlar', exact: true }));
  expect(screen.getByText('Current A')).toBeVisible();
  await act(async () => { resolveOld({ data: [{ id: 'old-a', name: 'Stale A', is_active: true }], error: null }); });
  expect(screen.queryByText('Stale A')).not.toBeInTheDocument();
  expect(screen.getByText('Current A')).toBeVisible();
  mocks.tenant = null;
  rerender(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  expect(screen.queryByText('Current A')).not.toBeInTheDocument();
});
afterEach(cleanup);

it('exposes the invoice work tab and derives paid PO amounts from canonical paid invoices', async () => {
  render(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Məlumatlar yüklənir')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Fakturalar', exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'PO', exact: true }));
  const row = screen.getByRole('button', { name: /PO-QA/ }).closest('tr');
  const cells = within(row).getAllByRole('cell');
  expect(cells[3]).toHaveTextContent('100');
  expect(cells[4]).toHaveTextContent('Tam ödənilib');
});

it('renders VAT-inclusive invoice totals and the tax rate in invoice details', async () => {
  mocks.rows.vendor_invoices[0].status = 'matched';
  mocks.rows.vendor_invoice_lines[0].tax_rate = 18;
  render(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Məlumatlar yüklənir')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Fakturalar', exact: true }));
  const invoice = screen.getByRole('button', { name: /INV-QA/ });
  const row = invoice.closest('tr');
  expect(within(row).getAllByRole('cell')[2]).toHaveTextContent('118');
  fireEvent.click(invoice);
  expect(screen.getByRole('columnheader', { name: 'ƏDV daxil cəm', exact: true })).toBeVisible();
  expect(screen.getByRole('cell', { name: '18', exact: true })).toBeVisible();
});

it('requires an explicitly selected tax account and recoverability confirmation before the atomic VAT command', async () => {
  mocks.rows.vendor_invoices[0].status = 'matched';
  mocks.rows.vendor_invoice_lines[0].tax_rate = 18;
  mocks.rows.cash_accounts = [{ id: 'cash-a', name: 'Cash', currency: 'AZN' }];
  mocks.rows.chart_of_accounts = [{ id: 'tax-a', code: '1530', name: 'Input VAT' }, { id: 'stock-a', code: '2050', name: 'Inventory' }];
  render(<MemoryRouter><ProcurementPage /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText('Məlumatlar yüklənir')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Fakturalar', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Ödəniş et', exact: true }));
  const dialog = await screen.findByRole('dialog', { name: 'Vendor fakturasının ödənişi' });
  const submit = within(dialog).getByRole('button', { name: 'Ödənişi təsdiq et', exact: true });
  expect(submit).toBeDisabled();
  expect(within(dialog).queryByRole('option', { name: /Inventory/ })).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('ƏDV uçot hesabı'), { target: { value: 'tax-a' } });
  expect(submit).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('checkbox'));
  expect(submit).toBeEnabled();
  fireEvent.click(submit);
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('pay_vendor_invoice_with_tax_atomic', expect.objectContaining({
    _tenant_id: 'tenant-a', _request_key: 'invoice-payment:invoice-a',
    _payload: expect.objectContaining({ tax_account_id: 'tax-a', tax_treatment: 'recoverable', invoice_id: 'invoice-a', account_id: 'cash-a' }),
  })));
});
