import { describe, expect, it } from "vitest";
import { normalizeStockMovement } from "../shared/lib/stockMovementNormalization.js";

describe("stock movement dual-schema normalization", () => {
  it("modern delivery overrides legacy adjust/zero defaults", () => {
    expect(normalizeStockMovement({
      movement_type: "delivery",
      quantity: -4,
      move_type: "adjust",
      qty: 0,
    })).toMatchObject({ move_type: "out", qty: 4, valuation_effect: "cogs" });
  });

  it("modern receipt overrides legacy defaults", () => {
    expect(normalizeStockMovement({
      movement_type: "receipt",
      quantity: 7,
      move_type: "adjust",
      qty: 0,
    })).toMatchObject({ move_type: "in", qty: 7, valuation_effect: "cogs" });
  });

  it("reservation does not change inventory valuation", () => {
    expect(normalizeStockMovement({
      movement_type: "reservation",
      quantity: 2,
      move_type: "adjust",
      qty: 0,
    })).toMatchObject({ valuation_effect: "ignore" });
  });

  it("internal legacy transfer is excluded from global COGS", () => {
    expect(normalizeStockMovement({
      move_type: "out",
      qty: 3,
      reference: "TR-1786300000000",
      note: "Daxili anbar transferi",
    })).toMatchObject({ move_type: "out", qty: 3, valuation_effect: "ignore" });
  });

  it("write-off reduces stock without becoming sales COGS", () => {
    expect(normalizeStockMovement({
      movement_type: "write_off",
      quantity: -1,
      move_type: "adjust",
      qty: 0,
    })).toMatchObject({ move_type: "out", qty: 1, valuation_effect: "inventory" });
  });
});
