import { describe, expect, it } from "vitest";
import { buildAverageCostHistory, movementKind } from "../modules/warehouse/inventory360.js";

describe("inventory 360", () => {
  it("calculates weighted average cost and margin after each receipt", () => {
    const rows = buildAverageCostHistory([
      { movement_type: "receipt", quantity: 10, unit_cost: 100, created_at: "2026-08-01" },
      { movement_type: "receipt", quantity: 10, unit_cost: 120, created_at: "2026-08-02" },
      { movement_type: "delivery", quantity: -5, unit_cost: 110, created_at: "2026-08-03" },
    ], 150);
    expect(rows[1]).toMatchObject({ quantity: 20, previousCost: 100, averageCost: 110, margin: 40 });
    expect(rows[2]).toMatchObject({ quantity: 15, averageCost: 110 });
  });

  it("classifies all important stock workflow events", () => {
    expect(movementKind({ movement_type: "customer_return" })).toBe("Müştəri qaytarması");
    expect(movementKind({ movement_type: "vendor_return" })).toBe("Vendor qaytarması");
    expect(movementKind({ movement_type: "return_quarantine" })).toBe("Karantin / zədəli");
    expect(movementKind({ movement_type: "transfer_out" })).toBe("Transfer");
  });
});
