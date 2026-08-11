import { describe, expect, it } from "vitest";
import { calculateOrderFinancials, calculateOrderLineTotal } from "../modules/sales/services/orderCalculations.js";
import { getProductProcurementSnapshot } from "../modules/procurement/services/procurementCalculations.js";

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
