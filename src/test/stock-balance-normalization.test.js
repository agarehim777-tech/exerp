import { describe, expect, it } from "vitest";
import { normalizeBalance } from "../shared/hooks/useStock.js";

describe("stock balance normalization", () => {
  it("maps the current inventory schema to the warehouse screen", () => {
    expect(normalizeBalance({
      on_hand: "12",
      reserved: "2",
      problem_qty: "3",
      minimum_level: "3",
      avg_cost: "45.50",
    })).toMatchObject({
      qty: 12,
      on_hand: 12,
      reserved: 2,
      problem_qty: 3,
      reorder_point: 3,
      minimum_level: 3,
      avg_cost: 45.5,
    });
  });

  it("keeps legacy balance rows compatible and never produces NaN", () => {
    expect(normalizeBalance({ qty: "4", reorder_point: "1" })).toMatchObject({
      qty: 4,
      on_hand: 4,
      reorder_point: 1,
      avg_cost: 0,
    });
    expect(normalizeBalance({})).toMatchObject({ qty: 0, on_hand: 0, reorder_point: 0 });
  });
});
