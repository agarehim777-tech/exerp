import { describe, it, expect } from "vitest";
import {
  buildCreditPlan,
  roundMoney,
  applyCreditPrincipalPayment,
  shiftPaymentDate,
  daysBetween,
  isCreditClosed,
} from "../shared/lib/credit.js";

const sumInstallments = (plan) =>
  plan.installments.reduce((acc, row) => acc + Number(row.amount || 0), 0);

describe("credit schedule", () => {
  it("spreads the financed amount across the full term without losing a manat", () => {
    const plan = buildCreditPlan({ total: 1234, initialPayment: 0, months: 12, startDate: "2026-01-10" });
    expect(plan.installments).toHaveLength(12);
    expect(sumInstallments(plan)).toBe(1234);
    expect(plan.balance).toBe(1234);
  });

  it("subtracts the initial payment from the financed principal", () => {
    const plan = buildCreditPlan({ total: 1000, initialPayment: 400, months: 10, startDate: "2026-01-10" });
    expect(plan.initialPayment).toBe(400);
    expect(plan.balance).toBe(600);
    expect(sumInstallments(plan)).toBe(600);
  });

  it("never lets the initial payment exceed the total", () => {
    const plan = buildCreditPlan({ total: 500, initialPayment: 900, months: 6, startDate: "2026-01-10" });
    expect(plan.initialPayment).toBe(500);
    expect(plan.balance).toBe(0);
    expect(sumInstallments(plan)).toBe(0);
  });

  it("falls back to a 12 month term for an unsupported term length", () => {
    const plan = buildCreditPlan({ total: 700, months: 7, startDate: "2026-01-10" });
    expect(plan.months).toBe(12);
    expect(plan.installments).toHaveLength(12);
  });

  it("produces unique, sequential due dates", () => {
    const plan = buildCreditPlan({ total: 600, months: 3, startDate: "2026-01-31" });
    const dues = plan.installments.map((row) => row.due);
    expect(new Set(dues).size).toBe(dues.length);
    for (const due of dues) expect(due).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });
});

describe("credit principal payment", () => {
  const credit = {
    total: 1200,
    months: 12,
    paidMonths: 0,
    initialPayment: 0,
    createdAt: "2026-01-10",
    startDate: "2026-01-10",
  };

  it("closes out the schedule when the full balance is paid", () => {
    const result = applyCreditPrincipalPayment(credit, 5000);
    expect(result.appliedPrincipal).toBe(1200);
    expect(result.nextBalance).toBe(0);
    expect(result.status).toBe("Tamamlandı");
  });

  it("never produces a negative balance and caps the applied amount", () => {
    const result = applyCreditPrincipalPayment(credit, 300);
    expect(result.nextBalance).toBeGreaterThanOrEqual(0);
    expect(result.nextBalance).toBe(900);
    expect(result.appliedPrincipal).toBeLessThanOrEqual(1200);
  });

  it("applies an overpayment to future installments as extra principal", () => {
    const result = applyCreditPrincipalPayment(credit, 300);
    expect(result.extraPrincipal).toBeGreaterThan(0);
    expect(result.nextPaidMonths).toBeGreaterThan(0);
  });

  it("ignores a zero or negative payment", () => {
    expect(applyCreditPrincipalPayment(credit, 0).appliedPrincipal).toBe(0);
    expect(applyCreditPrincipalPayment(credit, -50).appliedPrincipal).toBe(0);
  });
});

describe("credit closure detection", () => {
  it("treats a zero balance as closed", () => {
    expect(isCreditClosed({ status: "Aktiv", balance: 0, months: 12, paidMonths: 3 })).toBe(true);
  });

  it("treats a fully paid term as closed", () => {
    expect(isCreditClosed({ status: "Aktiv", balance: 50, months: 12, paidMonths: 12 })).toBe(true);
  });
});

describe("credit date helpers", () => {
  it("shifts a payment date by whole months", () => {
    expect(shiftPaymentDate("2026-01-15", 1)).toBe("2026-02-15");
    expect(shiftPaymentDate("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("counts calendar days between Date objects", () => {
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 11))).toBe(10);
    expect(daysBetween(new Date(2026, 0, 11), new Date(2026, 0, 1))).toBe(-10);
  });

  it("accepts date strings as well as Date objects", () => {
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("01.01.2026", new Date(2026, 0, 11))).toBe(10);
  });

  it("returns 0 instead of throwing on invalid input", () => {
    expect(daysBetween(null, undefined)).toBe(0);
    expect(daysBetween("not-a-date", "2026-01-01")).toBe(0);
  });
});

describe("money rounding", () => {
  it("rounds credit amounts to whole manats (system-wide convention)", () => {
    expect(roundMoney(1234.4)).toBe(1234);
    expect(roundMoney(1234.6)).toBe(1235);
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney("42")).toBe(42);
  });
});
