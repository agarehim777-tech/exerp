import { describe, expect, it } from "vitest";
import { calcPayroll, workDaysInMonth } from "../modules/hr/payroll.js";
import { calculatePayrollTax2026 } from '../shared/lib/hrDomain.ts';

describe("calcPayroll", () => {
  it.each([0, 200, 1000, 1200, 2500, 8000, 10000])('matches shared HR/finance for %s', gross => {
    const shared = calculatePayrollTax2026(gross);
    expect(calcPayroll({ baseSalary: gross })).toMatchObject({ gross: shared.gross, incomeTax: shared.incomeTax, net: shared.net, employerCost: shared.employerCost, totalDeductions: shared.totalDeductions });
  });
  it('preserves zero worked days', () => {
    expect(calcPayroll({ baseSalary: 1000, workDays: 22, workedDays: 0 })).toMatchObject({ gross: 0, net: 0 });
  });
  it("aşağı əmək haqqında DSMF 3% tətbiq edir", () => {
    const result = calcPayroll({ baseSalary: 200 });
    expect(result.gross).toBe(200);
    expect(result.socialEmployee).toBe(6);
    expect(result.incomeTax).toBe(0);
    expect(result.net).toBe(calculatePayrollTax2026(200).net);
  });

  it("200 manatdan yuxarı hissəyə 10% DSMF tətbiq edir", () => {
    const result = calcPayroll({ baseSalary: 1200 });
    expect(result.socialEmployee).toBeCloseTo(6 + 100, 2);
    expect(result.incomeTax).toBe(calculatePayrollTax2026(1200).incomeTax);
    expect(result.employerCost).toBeGreaterThan(result.gross);
  });

  it("8000 manatdan yuxarı hissəyə 14% gəlir vergisi tətbiq edir", () => {
    const result = calcPayroll({ baseSalary: 10000 });
    expect(result.incomeTax).toBe(calculatePayrollTax2026(10000).incomeTax);
  });

  it("işlənmiş günə görə proporsional hesablayır", () => {
    const result = calcPayroll({ baseSalary: 1000, workDays: 20, workedDays: 10 });
    expect(result.gross).toBe(500);
  });

  it("iş günlərini həftəsonsuz sayır", () => {
    expect(workDaysInMonth(2026, 2)).toBe(20);
  });
});
