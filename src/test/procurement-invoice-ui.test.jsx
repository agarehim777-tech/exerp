import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: {} }));
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ activeTenantId: 'tenant-a', user: { id: 'actor-a' } }) }));
vi.mock('../services/enterpriseWorkflows.js', () => ({ listWorkflowRecords: async () => [], saveWorkflowRecord: vi.fn() }));
vi.mock('../modules/procurement/procurementSchema.js', () => ({
  isMissingPoPaymentsTable: () => false,
  readLegacyPoPayments: async () => ({ data: [], error: null }),
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: {
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
  from: table => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain,
      then: resolve => Promise.resolve({ data: mocks.rows[table] || [], error: null }).then(resolve) };
    return chain;
  },
} }));
import ProcurementPage from '../modules/procurement/ProcurementPage.jsx';

beforeEach(() => {
  mocks.rows = {
    purchase_orders: [{ id: 'po-a', po_number: 'PO-QA', currency: 'AZN', status: 'approved', vendors: { name: 'QA Vendor' } }],
    purchase_order_lines: [{ id: 'line-a', po_id: 'po-a', qty_ordered: 2, unit_price: 50, product_sku: 'QA-SKU' }],
    vendor_invoices: [{ id: 'invoice-a', po_id: 'po-a', invoice_number: 'INV-QA', currency: 'AZN', status: 'paid' }],
    vendor_invoice_lines: [{ id: 'invoice-line', invoice_id: 'invoice-a', po_line_id: 'line-a', qty_invoiced: 2, unit_price: 50, tax_rate: 0 }],
  };
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
