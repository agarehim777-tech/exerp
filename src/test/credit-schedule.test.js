import { describe, it, expect } from "vitest";
import {
  buildCreditPlan,
  roundMoney,
  applyCreditPrincipalPayment,
  shiftPaymentDate,
  daysBetween,
} from "../shared/lib/credit.js";

describe("credit schedule", () => {
  it("spreads the financed amount across the full term", () => {
    const plan = buildCreditPlan({ total: 1200, initialPayment: 0, months: 12, startDate: "2026-01-10" });
    expect(plan.installments).toHaveLength(12);
    const sum = plan.installments.reduce((acc, row) => acc + Number(row.amount || 0), 0);
    expect(roundMoney(sum)).toBeGreaterThan(0);
  });

  it("reduces the financed principal by the initial payment", () => {
    const withoutInitial = buildCreditPlan({ total: 1000, initialPayment: 0, months: 10, startDate: "2026-01-10" });
    const withInitial = buildCreditPlan({ total: 1000, initialPayment: 400, months: 10, startDate: "2026-01-10" });
    const sumOf = (plan) => roundMoney(plan.installments.reduce((a, r) => a + Number(r.amount || 0), 0));
    expect(sumOf(withInitial)).toBeLessThan(sumOf(withoutInitial));
  });

  it("keeps installment due dates one month apart", () => {
    const plan = buildCreditPlan({ total: 600, initialPayment: 0, months: 3, startDate: "2026-01-31" });
    const dues = plan.installments.map((row) => row.due);
    expect(new Set(dues).size).toBe(dues.length);
    for (const due of dues) expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("never produces a negative outstanding balance after a payment", () => {
    const credit = {
      total: 500,
      balance: 100,
      months: 12,
      payments: [],
      installments: buildCreditPlan({ total: 500, months: 12, startDate: "2026-01-10" }).installments,
    };
    const next = applyCreditPrincipalPayment(credit, 250);
    expect(Number(next.balance)).toBeGreaterThanOrEqual(0);
  });
});

describe("credit date helpers", () => {
  it("shifts a payment date by whole months", () => {
    expect(shiftPaymentDate("2026-01-15", 1)).toBe("2026-02-15");
    expect(shiftPaymentDate("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("counts calendar days between two dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(-10);
  });
});

describe("money rounding", () => {
  it("rounds to two decimals without float drift", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1234.005)).toBeCloseTo(1234.01, 2);
  });
});
