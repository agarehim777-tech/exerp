import { describe, it, expect } from "vitest";
import {
  valuateFifo,
  valuateAverage,
  valuateByProduct,
  summarizeValuation,
  grossMargin,
  signedQty,
} from "../shared/utils/inventoryValuation";

const mv = (move_type, qty, unit_cost, moved_at, product_id = "p1") => ({
  product_id,
  move_type,
  qty,
  unit_cost,
  moved_at,
});

describe("inventory valuation — FIFO", () => {
  it("qatları ardıcıllıqla istehlak edir", () => {
    const result = valuateFifo([
      mv("in", 10, 5, "2026-01-01"),
      mv("in", 10, 7, "2026-01-05"),
      mv("out", 15, 0, "2026-01-10"),
    ]);
    expect(result.cogs).toBe(85);
    expect(result.qtyOnHand).toBe(5);
    expect(result.inventoryValue).toBe(35);
    expect(result.unitCost).toBe(7);
    expect(result.shortageQty).toBe(0);
  });

  it("tarixə görə sıralayır (qeydiyyat sırasından asılı deyil)", () => {
    const result = valuateFifo([
      mv("out", 5, 0, "2026-01-10"),
      mv("in", 10, 4, "2026-01-01"),
    ]);
    expect(result.cogs).toBe(20);
    expect(result.qtyOnHand).toBe(5);
  });

  it("backorder çıxışını son maya ilə qiymətləndirir", () => {
    const result = valuateFifo([mv("in", 5, 10, "2026-02-01"), mv("out", 8, 0, "2026-02-02")]);
    expect(result.cogs).toBe(80);
    expect(result.shortageQty).toBe(3);
    expect(result.qtyOnHand).toBe(-3);
    expect(result.inventoryValue).toBe(0);
  });

  it("hərəkət yoxdursa sıfır qaytarır", () => {
    const result = valuateFifo([]);
    expect(result.qtyOnHand).toBe(0);
    expect(result.cogs).toBe(0);
  });
});

describe("inventory valuation — çəkili orta", () => {
  it("orta maya ilə COGS hesablayır", () => {
    const result = valuateAverage([
      mv("in", 10, 5, "2026-01-01"),
      mv("in", 10, 7, "2026-01-05"),
      mv("out", 15, 0, "2026-01-10"),
    ]);
    expect(result.cogs).toBe(90);
    expect(result.qtyOnHand).toBe(5);
    expect(result.inventoryValue).toBe(30);
    expect(result.unitCost).toBe(6);
  });

  it("çatışmazlığı qeyd edir", () => {
    const result = valuateAverage([mv("in", 5, 10, "2026-02-01"), mv("out", 8, 0, "2026-02-02")]);
    expect(result.cogs).toBe(80);
    expect(result.shortageQty).toBe(3);
    expect(result.qtyOnHand).toBe(-3);
  });
});

describe("aggregasiya", () => {
  it("məhsul üzrə qruplaşdırır və yekunlaşdırır", () => {
    const rows = valuateByProduct([
      mv("in", 10, 5, "2026-01-01", "p1"),
      mv("out", 4, 0, "2026-01-02", "p1"),
      mv("in", 3, 20, "2026-01-01", "p2"),
    ]);
    expect(rows).toHaveLength(2);
    const total = summarizeValuation(rows);
    expect(total.productCount).toBe(2);
    expect(total.inventoryValue).toBe(30 + 60);
    expect(total.cogs).toBe(20);
  });

  it("ümumi mənfəəti faizlə hesablayır", () => {
    expect(grossMargin(100, 80)).toEqual({ value: 20, ratio: 20 });
    expect(grossMargin(0, 0).ratio).toBe(0);
  });

  it("hərəkət işarəsini düzgün oxuyur", () => {
    expect(signedQty({ move_type: "out", qty: 5 })).toBe(-5);
    expect(signedQty({ move_type: "in", qty: 5 })).toBe(5);
    expect(signedQty({ move_type: "adjust", qty: -2 })).toBe(-2);
    expect(signedQty({ move_type: "in", qty: 5, valuation_effect: "ignore" })).toBe(0);
  });

  it("rezerv və daxili transferi dəyərləməyə, silinməni isə COGS-a daxil etmir", () => {
    const result = valuateFifo([
      { ...mv("in", 10, 5, "2026-01-01"), valuation_effect: "cogs" },
      { ...mv("out", 3, 5, "2026-01-02"), valuation_effect: "ignore" },
      { ...mv("in", 3, 5, "2026-01-02"), valuation_effect: "ignore" },
      { ...mv("out", 2, 5, "2026-01-03"), valuation_effect: "inventory" },
      { ...mv("out", 4, 0, "2026-01-04"), valuation_effect: "cogs" },
    ]);

    expect(result.qtyOnHand).toBe(4);
    expect(result.inventoryValue).toBe(20);
    expect(result.cogs).toBe(20);
  });
});
