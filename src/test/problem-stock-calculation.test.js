import { describe, expect, it } from "vitest";
import { buildWarehouseBalanceRows, getAvailableQuantity } from "../shared/lib/appDomain.jsx";

describe("problem stock calculation", () => {
  it("keeps problem units in physical balance and removes them from saleable", () => {
    expect(getAvailableQuantity({ total: 5, reserved: 1, problemQty: 2 })).toBe(2);
  });

  it("moves repaired units to saleable without changing physical balance", () => {
    expect(getAvailableQuantity({ total: 5, reserved: 1, problemQty: 0 })).toBe(4);
  });

  it("shows problem stock in product balance rows", () => {
    const [row] = buildWarehouseBalanceRows({
      warehouses: [{ id: "w1", name: "Əsas anbar" }],
      warehouseStock: { w1: [{ product: "Sonia G5", total: 5, reserved: 1, problemQty: 2 }] },
      products: [{ id: "p1", name: "Sonia G5", status: "Aktiv" }],
      view: "products",
    });
    expect(row).toMatchObject({ total: 5, reserved: 1, problem: 2, available: 2 });
  });
});
