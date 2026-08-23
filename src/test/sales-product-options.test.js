import { describe, expect, it } from "vitest";
import { buildSalesProductOptions } from "../modules/sales/components/SalesOrderModals.jsx";

describe("sales product selection", () => {
  it("keeps catalog products selectable when warehouse stock is zero", () => {
    const options = buildSalesProductOptions([], [
      { id: "p-1", name: "Sonia G5", sku: "SN-G5", salePrice: 500, status: "Aktiv" },
    ]);

    expect(options).toEqual([
      expect.objectContaining({ product: "Sonia G5", sku: "SN-G5", total: 0, reserved: 0, price: 500 }),
    ]);
  });

  it("preserves the selected warehouse balance for products that are in stock", () => {
    const options = buildSalesProductOptions(
      [{ product: "Sonia G5", sku: "SN-G5", total: 4, reserved: 1, price: 520 }],
      [{ id: "p-1", name: "Sonia G5", sku: "SN-G5", salePrice: 500, status: "Aktiv" }],
    );

    expect(options[0]).toEqual(expect.objectContaining({ total: 4, reserved: 1, price: 520 }));
  });
});
