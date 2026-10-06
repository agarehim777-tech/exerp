import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { InvoiceForm, InvoiceRow } from '../modules/finance/SalesInvoicesPage.jsx';

afterEach(cleanup);
const invoice = { id:'invoice-a',invoice_no:'INV-QA',invoice_date:'2026-10-06',total:100,paid_amount:0,status:'issued',posted:true };

it('keeps a rejected payment open and disables its controls while waiting for the server',async () => {
  let resolve;
  const onPay = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve=done; })).mockResolvedValue(true);
  render(<table><tbody><InvoiceRow invoice={invoice} accounts={[{ id:'cash-a',name:'QA Cash' }]}
    onPay={onPay} onPost={vi.fn()} onCancel={vi.fn()} /></tbody></table>);
  fireEvent.click(screen.getByRole('button',{ name:'Ödəniş',exact:true }));
  fireEvent.change(screen.getByLabelText('Faktura ödəniş hesabı'),{ target:{ value:'cash-a' } });
  fireEvent.click(screen.getByRole('button',{ name:'Ödənişi qeyd et' }));
  expect(screen.getByLabelText('Faktura ödəniş məbləği')).toBeDisabled();
  expect(screen.getByRole('button',{ name:'Ödənişi qeyd et' })).toBeDisabled();
  await act(async () => { resolve(false); });
  expect(screen.getByLabelText('Faktura ödəniş məbləği')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{ name:'Ödənişi qeyd et' }));
  await waitFor(() => expect(screen.queryByLabelText('Faktura ödəniş məbləği')).not.toBeInTheDocument());
  expect(onPay).toHaveBeenCalledTimes(2);
});

it('routes linked invoices to their sales lifecycle, never the standalone payment form',() => {
  const open = vi.fn();
  render(<table><tbody><InvoiceRow invoice={{ ...invoice,order_id:'order-a' }} accounts={[]}
    onOpenSalesOrder={open} /></tbody></table>);
  fireEvent.click(screen.getByRole('button',{ name:'Satış ödənişi' }));
  expect(open).toHaveBeenCalledWith('order-a');
  expect(screen.queryByRole('button',{ name:'Ödəniş',exact:true })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Faktura ödəniş məbləği')).not.toBeInTheDocument();
});

it('does not offer journal posting or payments for a cancelled invoice',() => {
  render(<table><tbody><InvoiceRow invoice={{ ...invoice,status:'cancelled',posted:false }} accounts={[]} /></tbody></table>);
  expect(screen.queryByRole('button',{ name:'Jurnala yaz' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{ name:'Ödəniş',exact:true })).not.toBeInTheDocument();
});

it('keeps the invoice form and all draft values after failed saving and releases the busy state',async () => {
  let resolve;
  const submit = vi.fn(() => new Promise(done => { resolve=done; }));
  render(<InvoiceForm customers={[{ id:'customer-a',name:'QA Customer' }]} products={[]} onSubmit={submit} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText('Faktura №'),{ target:{ value:'INV-Retry' } });
  fireEvent.submit(screen.getByRole('button',{ name:'Yadda saxla' }).closest('form'));
  expect(screen.getByRole('button',{ name:'Yadda saxla' })).toBeDisabled();
  await act(async () => { resolve(false); });
  expect(screen.getByRole('button',{ name:'Yadda saxla' })).toBeEnabled();
  expect(screen.getByPlaceholderText('Faktura №')).toHaveValue('INV-Retry');
});
