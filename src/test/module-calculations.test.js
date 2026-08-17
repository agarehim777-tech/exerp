import { describe, expect, it } from "vitest";
import { calculateOrderFinancials, calculateOrderLineTotal } from "../modules/sales/services/orderCalculations.js";
import { getProductProcurementSnapshot } from "../modules/procurement/services/procurementCalculations.js";
import { getRecommendedOrderPlan } from "../shared/lib/appDomain.jsx";

describe("sales order calculations", () => {
  it("calculates line totals and VAT without UI state", () => {
    const lines = [
      { product: "A", qty: 2, price: 100, vatRate: 18 },
      { product: "B", qty: 1, price: 50, vatRate: 0 },
    ];
    expect(calculateOrderLineTotal(lines)).toBe(250);
    expect(calculateOrderFinancials(lines)).toEqual({ subtotal: 250, vat: 36, total: 286 });
  });
});

describe("procurement coverage calculations", () => {
  it("deducts reserved and open PO quantities from the suggested order", () => {
    const snapshot = getProductProcurementSnapshot(
      "Telefon A",
      { WH1: [{ product: "Telefon A", total: 5, reserved: 2 }] },
      [{ id: "P1", name: "Telefon A", reorderLevel: 5, salePrice: 500 }],
      [{ id: "PO1", product: "Telefon A", qty: 4, receivedQty: 0, status: "Təsdiqləndi" }],
    );
    expect(snapshot.available).toBe(3);
    expect(snapshot.suggestedQty).toBe(7);
    expect(snapshot.orderGap).toBe(3);
  });
});

describe("recommended order quantity", () => {
  it("adds the stock deficit to the configured base order quantity", () => {
    expect(getRecommendedOrderPlan({ available: 0, minimum: 2, baseQty: 2, orderedQty: 0 })).toMatchObject({
      recommendedQty: 4,
      additionalQty: 4,
      deficit: 2,
    });
  });

  it("deducts open PO coverage only from the additional quantity", () => {
    expect(getRecommendedOrderPlan({ available: 0, minimum: 2, baseQty: 2, orderedQty: 2 })).toMatchObject({
      recommendedQty: 4,
      orderedQty: 2,
      additionalQty: 2,
    });
  });

  it("does not recommend an order while stock is above the minimum", () => {
    expect(getRecommendedOrderPlan({ available: 3, minimum: 2, baseQty: 2 })).toMatchObject({
      thresholdReached: false,
      recommendedQty: 0,
      additionalQty: 0,
    });
  });
});
