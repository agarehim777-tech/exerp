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

describe("warehouse balance product images", () => {
  const product = {
    id: "product-1",
    name: "Sonia G5",
    sku: "1",
    imageUrl: "https://example.com/sonia-g5.webp",
    status: "Aktiv",
  };

  it("keeps the catalog image on warehouse stock rows", () => {
    const [row] = buildWarehouseBalanceRows({
      warehouses: [{ id: "warehouse-1", name: "Əsas anbar" }],
      warehouseStock: { "warehouse-1": [{ product: "Sonia G5", total: 4 }] },
      products: [product],
      view: "warehouses",
    });

    expect(row.imageUrl).toBe(product.imageUrl);
  });

  it("keeps the catalog image on zero-stock rows", () => {
    const [row] = buildWarehouseBalanceRows({
      warehouses: [{ id: "warehouse-1", name: "Əsas anbar" }],
      warehouseStock: {},
      products: [product],
      view: "warehouses",
    });

    expect(row.imageUrl).toBe(product.imageUrl);
  });
});
