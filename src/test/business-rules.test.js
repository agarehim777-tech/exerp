import { describe, expect, it } from "vitest";
import {
  applyCreditPrincipalPayment,
  buildCreditPlan,
  getAvailableQuantity,
  getDeliveryStockCheck,
  getReceivableClosureAmount,
  isCreditClosed,
} from "../App.jsx";

describe("credit business rules", () => {
  it("splits the remaining principal and corrects the final installment", () => {
    const plan = buildCreditPlan({
      total: 1200,
      initialPayment: 100,
      months: 12,
      startDate: "2026-07-01",
    });

    expect(plan.balance).toBe(1100);
    expect(plan.installments.slice(0, 11).every((item) => item.amount === 92)).toBe(true);
    expect(plan.installments[11].amount).toBe(88);
    expect(plan.installments.reduce((sum, item) => sum + item.amount, 0)).toBe(1100);
  });

  it("carries an excess principal payment into following installments", () => {
    const credit = {
      total: 1200,
      balance: 1200,
      initialPayment: 0,
      months: 12,
      paidMonths: 0,
      installments: buildCreditPlan({ total: 1200, months: 12 }).installments,
    };

    const result = applyCreditPrincipalPayment(credit, 150);

    expect(result.appliedPrincipal).toBe(150);
    expect(result.extraPrincipal).toBe(50);
    expect(result.installments[0].amount).toBe(0);
    expect(result.installments[1].amount).toBe(50);
    expect(result.nextBalance).toBe(1050);
  });

  it("marks a credit closed only when the principal is fully settled", () => {
    expect(isCreditClosed({ balance: 0, status: "Aktiv", months: 12, paidMonths: 1 })).toBe(true);
    expect(isCreditClosed({ balance: 50, status: "Aktiv", months: 12, paidMonths: 11 })).toBe(false);
  });
});

describe("inventory business rules", () => {
  it("keeps reserved stock out of the available quantity", () => {
    expect(getAvailableQuantity({ total: 12, reserved: 5 })).toBe(7);
    expect(getAvailableQuantity({ total: 2, reserved: 8 })).toBe(0);
  });

  it("allows partial delivery from physical stock and keeps the rest as backorder", () => {
    const order = {
      id: "SO-1",
      warehouseId: "WH-1",
      status: "Rezervdə",
      productLines: [{ product: "Telefon A", qty: 5 }],
    };

    const partial = getDeliveryStockCheck(order, {
      "WH-1": [{ product: "Telefon A", total: 3, reserved: 5 }],
    });
    expect(partial.ok).toBe(true);
    expect(partial.partial).toBe(true);
    expect(partial.plan.deliverableTotal).toBe(3);
    expect(partial.plan.shortageTotal).toBe(2);

    const blocked = getDeliveryStockCheck(order, {
      "WH-1": [{ product: "Telefon A", total: 0, reserved: 5 }],
    });
    expect(blocked.ok).toBe(false);

    const full = getDeliveryStockCheck(
      { ...order, deliveredQuantities: { "Telefon A": 3 } },
      { "WH-1": [{ product: "Telefon A", total: 2, reserved: 2 }] },
    );
    expect(full.ok).toBe(true);
    expect(full.partial).toBe(false);
    expect(full.plan.deliverableTotal).toBe(2);
  });

});

describe("receivable business rules", () => {
  it("uses the authoritative open amount without double counting linked sources", () => {
    expect(
      getReceivableClosureAmount({
        amount: 925,
        customerDebt: 925,
        orderBalance: 925,
        creditIds: ["KR-1"],
      }),
    ).toBe(925);
  });
});
