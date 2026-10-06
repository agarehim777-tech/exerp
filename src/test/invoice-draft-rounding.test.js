import { expect, it } from 'vitest';
import { computeDraftTotals, validateDraft } from '../lib/invoiceDraft.js';

it('rounds net and VAT per line so the preview matches server decimal totals',() => {
  const lines = [{ qty:3,unit_price:'10.01',discount_pct:10,vat_rate:18 },
    { qty:1,unit_price:'0.01',discount_pct:0,vat_rate:0 }];
  const totals = computeDraftTotals(lines);
  expect(totals.subtotal).toBe(27.04);
  expect(totals.vat_total).toBe(4.87);
  expect(totals.total).toBe(31.91);
  expect(totals.rows.map(row => row.line_total)).toEqual([31.90,0.01]);
  expect(validateDraft({ customer_id:'customer',invoice_date:'2026-10-06',lines }).roundingDiff).toBe(0);
});

it('rejects precision the database cannot store instead of silently changing the invoice',() => {
  for (const patch of [{ qty:'1.0001' },{ unit_price:'10.005' },{ discount_pct:'0.001' },{ vat_rate:'18.001' }]) {
    const result = validateDraft({ customer_id:'customer',invoice_date:'2026-10-06',
      lines:[{ qty:1,unit_price:10,discount_pct:0,vat_rate:18,...patch }] });
    expect(result.hasErrors).toBe(true);
    expect(result.lineIssues[0]).toContainEqual(expect.objectContaining({ field:Object.keys(patch)[0],level:'error' }));
  }
});
