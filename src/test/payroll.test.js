import { describe, expect, it } from "vitest";
import { calcPayroll, workDaysInMonth } from "../modules/hr/payroll.js";

describe("calcPayroll", () => {
  it("aşağı əmək haqqında DSMF 3% tətbiq edir", () => {
    const result = calcPayroll({ baseSalary: 200 });
    expect(result.gross).toBe(200);
    expect(result.socialEmployee).toBe(6);
    expect(result.incomeTax).toBe(0);
    expect(result.net).toBeCloseTo(200 - 6 - 1 - 4, 2);
  });

  it("200 manatdan yuxarı hissəyə 10% DSMF tətbiq edir", () => {
    const result = calcPayroll({ baseSalary: 1200 });
    expect(result.socialEmployee).toBeCloseTo(6 + 100, 2);
    expect(result.incomeTax).toBe(0);
    expect(result.employerCost).toBeGreaterThan(result.gross);
  });

  it("8000 manatdan yuxarı hissəyə 14% gəlir vergisi tətbiq edir", () => {
    const result = calcPayroll({ baseSalary: 10000 });
    expect(result.incomeTax).toBeCloseTo(2000 * 0.14, 2);
  });

  it("işlənmiş günə görə proporsional hesablayır", () => {
    const result = calcPayroll({ baseSalary: 1000, workDays: 20, workedDays: 10 });
    expect(result.gross).toBe(500);
  });

  it("iş günlərini həftəsonsuz sayır", () => {
    expect(workDaysInMonth(2026, 2)).toBe(20);
  });
});
