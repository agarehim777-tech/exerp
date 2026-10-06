import { createFinanceCommand } from './financeLedger.js';

const requireAcknowledgement = fields => data => {
  if (!data || fields.some(field => !data[field])) throw new Error('Server əməliyyatı təsdiqləmədi. Yenidən cəhd edin.');
  return data;
};

// Keep decimal inputs as strings. PostgreSQL calculates and rounds the persisted totals.
export function createInvoiceCommand(tenantId, rpc) {
  return createFinanceCommand(tenantId, 'create_sales_invoice_atomic', payload => ({
    invoice_no: payload.invoice_no || null, customer_id: payload.customer_id || null,
    order_id: payload.order_id || null, invoice_date: payload.invoice_date || null,
    due_date: payload.due_date || null, currency: payload.currency || 'AZN', notes: payload.notes || null,
    lines: (payload.lines || []).map(line => ({
      product_id: line.product_id || null, description: line.description || null,
      qty: String(line.qty ?? ''), unit_price: String(line.unit_price ?? ''),
      discount_pct: String(line.discount_pct ?? 0), vat_rate: String(line.vat_rate ?? 0),
    })),
  }), rpc, requireAcknowledgement(['invoice_id', 'invoice_no']));
}

export function createInvoicePaymentCommand(tenantId, rpc) {
  return createFinanceCommand(tenantId, 'record_invoice_payment_atomic', payload => ({
    invoice_id: payload.invoice_id, account_id: payload.account_id || null,
    amount: String(payload.amount ?? ''), paid_at: payload.paid_at || null,
    method: payload.method || 'bank', reference: payload.reference || null,
  }), rpc, requireAcknowledgement(['payment_id', 'transaction_id', 'journal_entry_id']));
}
