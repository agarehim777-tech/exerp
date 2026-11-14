import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as serialStock from "../shared/lib/serialStockHelpers.ts";
import {
  addStockToRows,
  adjustStockRows,
  buildQuantityMap,
  ensureStockItemSerials,
  getAvailableSerialsForProduct,
  releaseOrderSerialReservations,
  updateSerialStatuses,
} from "../shared/lib/serialStockHelpers.ts";
import { currentBusinessDate } from "../shared/lib/businessDate.ts";

const phone = (total: number, reserved = 0) =>
  ensureStockItemSerials({ product: "iPhone 15", total, reserved, serialTracked: true }, "WH-01");

describe("serial and stock row helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(serialStock)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("sums line quantities per product and skips lines without a product", () => {
    expect([...buildQuantityMap([{ product: "A", qty: 2 }, { product: "A", qty: "3" }, { qty: 9 }, { product: "B" }])]).toEqual([["A", 5], ["B", 0]]);
  });

  it("generates serials for tracked stock and reserves the first ones", () => {
    const row = phone(3, 1);
    expect(row.serials.map((serial) => [serial.imei, serial.status])).toEqual([
      ["İPHOH01-00001", "Rezervdə"],
      ["İPHOH01-00002", "Anbarda"],
      ["İPHOH01-00003", "Anbarda"],
    ]);
    expect(ensureStockItemSerials({ product: "Kabel", total: 5, reserved: 0, price: 10 }).serials).toEqual([]);
    expect(getAvailableSerialsForProduct({ "WH-01": [row] }, "WH-01", "iPhone 15")).toEqual(["İPHOH01-00002", "İPHOH01-00003"]);
  });

  it("reserves, sells and releases serials for an order", () => {
    const lines = [{ product: "iPhone 15", qty: 1 }];
    const [reserved] = updateSerialStatuses([phone(2)], lines, "Rezervdə", "SO-1");
    expect(reserved.serials?.map((serial) => [serial.status, serial.orderId])).toEqual([["Rezervdə", "SO-1"], ["Anbarda", undefined]]);
    expect(reserved.serials?.[0].reservedAt).toBe(currentBusinessDate);

    const [sold] = updateSerialStatuses([reserved], lines, "Satılıb", "SO-1");
    expect(sold.serials?.[0]).toMatchObject({ status: "Satılıb", soldAt: currentBusinessDate });

    const [released] = releaseOrderSerialReservations([reserved], lines, "SO-1");
    expect(released.serials?.[0]).toMatchObject({ status: "Anbarda", orderId: "", reservedAt: "" });
  });

  it("never lets stock go negative and opens a backorder row when asked", () => {
    const rows = [{ product: "A", total: 1, reserved: 0 }];
    expect(adjustStockRows(rows, new Map([["A", 3]]), { totalDelta: -1 })).toEqual([{ product: "A", total: 0, reserved: 0 }]);
    expect(adjustStockRows(rows, new Map([["B", 2]]), { reservedDelta: 1, createMissing: true })).toEqual([
      { product: "A", total: 1, reserved: 0 },
      { product: "B", total: 0, reserved: 2, price: 0, serials: [] },
    ]);
  });

  it("adds received stock to an existing row or creates one with product metadata", () => {
    const rows = [{ product: "A", total: 2, reserved: 0, price: 5 }];
    expect(addStockToRows(rows, "A", 3, 0, "WH-01", { sku: "SKU-A", costPrice: "4" })).toEqual([
      { product: "A", total: 5, reserved: 0, price: 5, sku: "SKU-A", costPrice: 4, serials: [] },
    ]);
    expect(addStockToRows(rows, "B", 1, 7, "WH-01", { unit: "əd" })[1]).toEqual({ product: "B", total: 1, reserved: 0, price: 7, unit: "əd", serials: [] });
    expect(addStockToRows(rows, "A", 0, 1)).toBe(rows);
  });
});
