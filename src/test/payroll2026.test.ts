import { expect, it } from 'vitest';
import { calculatePayrollTax2026 } from '../shared/lib/hrDomain.ts';

it.each([
  // Amounts are in qəpik (0.01 ₼), not rounded to whole manats.
  [0, 0, 0, 0], [200, 0, 44, 249], [2500, 69, 389, 2951.5],
  [2501, 75.1, 389.15, 2952.68], [8000, 625, 1214, 9414], [8001, 625.14, 1214.11, 9415.13],
])('preserves application policy at gross %s', (gross, incomeTax, employerSocial, employerCost) => {
  const result = calculatePayrollTax2026(gross);
  expect(result).toMatchObject({ gross, incomeTax, employerSocial, employerCost });
  expect(Math.round((result.net + result.totalDeductions) * 100) / 100).toBe(gross);
});

it('normalizes missing, string, fractional and negative inputs', () => {
  expect(calculatePayrollTax2026(null).gross).toBe(0);
  expect(calculatePayrollTax2026(undefined).gross).toBe(0);
  expect(calculatePayrollTax2026('200.5').gross).toBe(200.5);
  expect(calculatePayrollTax2026(2501)).toMatchObject({ employeeUnemployment: 12.51, employeeMedical: 50.02, net: 2127.27 });
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
