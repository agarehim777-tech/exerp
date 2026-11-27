import { expect, it } from 'vitest';
import { calculatePayrollTax2026 } from '../shared/lib/hrDomain.ts';

it.each([
  [0, 0, 0, 0], [200, 0, 44, 249], [2500, 69, 389, 2952],
  [2501, 75, 389, 2953], [8000, 625, 1214, 9414], [8001, 625, 1214, 9415],
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

it('deducts mandatory health insurance from the employee and charges the employer the same', () => {
  // 2% of the part up to 8000 ₼, 0.5% of the part above; the HR panel and finance use this one rule.
  expect(calculatePayrollTax2026(1000)).toMatchObject({ employeeMedical: 20, employerMedical: 20 });
  expect(calculatePayrollTax2026(10000)).toMatchObject({ employeeMedical: 170, employerMedical: 170 });
  const result = calculatePayrollTax2026(1000);
  expect(result.totalDeductions).toBe(result.incomeTax + result.employeeSocial + result.employeeUnemployment + 20);
});
