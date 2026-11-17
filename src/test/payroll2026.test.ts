import { expect, it } from 'vitest';
import { calculatePayrollTax2026 } from '../shared/lib/hrDomain.ts';

it.each([
  [0, 0, 0, 0], [200, 0, 44, 245], [2500, 69, 389, 2902],
  [2501, 75, 389, 2903], [8000, 625, 1214, 9254], [8001, 625, 1214, 9255],
])('preserves application policy at gross %s', (gross, incomeTax, employerSocial, employerCost) => {
  const result = calculatePayrollTax2026(gross);
  expect(result).toMatchObject({ gross, incomeTax, employerSocial, employerCost });
  expect(result.net + result.totalDeductions).toBe(gross);
});

it('normalizes missing, string, fractional and negative inputs', () => {
  expect(calculatePayrollTax2026(null).gross).toBe(0);
  expect(calculatePayrollTax2026(undefined).gross).toBe(0);
  expect(calculatePayrollTax2026('200.5').gross).toBe(201);
  expect(calculatePayrollTax2026(-1).gross).toBe(0);
});

it('rejects invalid values instead of producing NaN payroll totals', () => {
  expect(() => calculatePayrollTax2026('invalid')).toThrow('Invalid payroll amount');
  expect(() => calculatePayrollTax2026(Infinity)).toThrow();
  expect(() => calculatePayrollTax2026(NaN)).toThrow();
});
