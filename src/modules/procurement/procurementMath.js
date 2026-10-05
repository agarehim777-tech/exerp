import { round2 } from '../../shared/utils/invoiceMath.js';

const numeric = value => {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

export function vendorInvoiceLineGross(line) {
  return numeric(line.qty_invoiced) * numeric(line.unit_price) * (1 + numeric(line.tax_rate) / 100);
}

export function vendorInvoiceTotal(lines) {
  // The payment RPC rounds the aggregate, not each individual line.
  return round2(lines.reduce((sum, line) => sum + vendorInvoiceLineGross(line), 0));
}
