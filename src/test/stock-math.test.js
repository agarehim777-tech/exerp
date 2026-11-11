import { describe, it, expect } from "vitest";
import { sellableQty } from "../shared/lib/stockMath.js";
import { formatAmount } from "../services/format.js";

describe("sellableQty", () => {
  it("excludes reserved and quarantined units", () => {
    expect(sellableQty({ on_hand: 10, reserved: 3, problem_qty: 2 })).toBe(5);
  });
  it("reads UI row shapes", () => {
    expect(sellableQty({ total: 8, reserved: 1, problemQty: 4 })).toBe(3);
  });
});

describe("formatAmount", () => {
  it("uses two decimals by default and the requested currency", () => {
    expect(formatAmount(12.5, { currency: "AZN" })).toMatch(/^12,50 AZN$/);
  });
  it("supports whole numbers for dashboards", () => {
    expect(formatAmount(1234.6, { decimals: 0 })).toMatch(/1.?235 ₼$/);
  });
});
