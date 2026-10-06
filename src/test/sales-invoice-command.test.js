import { expect, it, vi } from 'vitest';
import { createInvoiceCommand, createInvoicePaymentCommand } from '../services/salesInvoices.js';

it('uses one RPC for all invoice lines and retains decimal inputs without trusting client totals',async () => {
  const rpc = vi.fn().mockResolvedValue({ data:{ invoice_id:'invoice-a',invoice_no:'INV-QA' } });
  await createInvoiceCommand('tenant-a',rpc)({ customer_id:'customer-a',total:1,lines:[{ qty:'3',unit_price:'10.005',vat_rate:18 }] });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][0]).toBe('create_sales_invoice_atomic');
  expect(rpc.mock.calls[0][1]).toMatchObject({ _tenant_id:'tenant-a',_payload:{ customer_id:'customer-a',
    lines:[{ qty:'3',unit_price:'10.005',vat_rate:'18' }] } });
  expect(rpc.mock.calls[0][1]._payload).not.toHaveProperty('total');
});

it('deduplicates pending invoice payments and retries an uncertain response with the same key',async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ error:{ message:'network timeout' } })
    .mockResolvedValue({ data:{ payment_id:'payment-a',transaction_id:'cash-a',journal_entry_id:'gl-a' } });
  const command = createInvoicePaymentCommand('tenant-a',rpc);
  const payload = { invoice_id:'invoice-a',account_id:'cash-a',amount:'15.10' };
  const first = command(payload);
  expect(command(payload)).toBe(first);
  await expect(first).rejects.toMatchObject({ message:'network timeout' });
  await command(payload);
  expect(rpc.mock.calls[0][0]).toBe('record_invoice_payment_atomic');
  expect(rpc.mock.calls[0][1]._request_key).toBe(rpc.mock.calls[1][1]._request_key);
  expect(rpc.mock.calls[1][1]._payload.amount).toBe('15.10');
  await command(payload);
  expect(rpc.mock.calls[2][1]._request_key).not.toBe(rpc.mock.calls[1][1]._request_key);
});

it('retains its replay key when an incomplete response lacks the ledger acknowledgement',async () => {
  const rpc = vi.fn().mockResolvedValueOnce({ data:{ payment_id:'payment-a' } })
    .mockResolvedValue({ data:{ payment_id:'payment-a',transaction_id:'cash-a',journal_entry_id:'gl-a' } });
  const command = createInvoicePaymentCommand('tenant-a',rpc);
  await expect(command({ amount:'10' })).rejects.toThrow('təsdiqləmədi');
  await command({ amount:'10' });
  expect(rpc.mock.calls[0][1]._request_key).toBe(rpc.mock.calls[1][1]._request_key);
});

it('fails visibly on an old schema instead of inserting partial payment rows',async () => {
  const rpc = vi.fn().mockResolvedValue({ error:{ code:'PGRST202',message:'missing function' } });
  await expect(createInvoicePaymentCommand('tenant-a',rpc)({})).rejects.toMatchObject({ code:'ERP_SCHEMA_MIGRATION_REQUIRED' });
  expect(rpc).toHaveBeenCalledTimes(1);
  await expect(createInvoiceCommand(null,rpc)({})).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);
});
