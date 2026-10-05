import { expect, it } from 'vitest';
import { vendorInvoiceLineGross, vendorInvoiceTotal } from '../modules/procurement/procurementMath.js';

it('includes VAT in the payable invoice amount for numeric database fields', () => {
  const line = { qty_invoiced: '2', unit_price: '50', tax_rate: '18' };
  expect(vendorInvoiceLineGross(line)).toBe(118);
  expect(vendorInvoiceTotal([line])).toBe(118);
  expect(vendorInvoiceTotal([{ ...line, tax_rate: '0' }])).toBe(100);
});

it('rounds the aggregate once to match the server payment command', () => {
  expect(vendorInvoiceTotal([
    { qty_invoiced: 1, unit_price: 0.004, tax_rate: 0 },
    { qty_invoiced: 1, unit_price: 0.004, tax_rate: 0 },
  ])).toBe(0.01);
  expect(vendorInvoiceTotal([{ qty_invoiced: '1,5', unit_price: 10, tax_rate: 18 }])).toBe(17.7);
  expect(vendorInvoiceTotal([])).toBe(0);
});
