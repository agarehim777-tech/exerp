import { describe, expect, it } from "vitest";
import { buildProductWarehouseBalances } from "../modules/warehouse/ProductBalancesPage.jsx";

describe("product warehouse balances", () => {
  it("shows each live warehouse balance separately", () => {
    const product = { id: "p1", name: "Sonia G5" };
    const warehouses = [{ id: "w1", name: "Əsas anbar" }, { id: "w2", name: "Filial" }];
    const rows = buildProductWarehouseBalances(product, warehouses, {}, [
      { product_id: "p1", warehouse_id: "w1", on_hand: "15", reserved: "1" },
      { product_id: "p1", warehouse_id: "w2", on_hand: "4", reserved: "2" },
    ]);
    expect(rows).toEqual([
      { warehouse: warehouses[0], total: 15, reserved: 1, available: 14 },
      { warehouse: warehouses[1], total: 4, reserved: 2, available: 2 },
    ]);
  });

  it("supports legacy stock rows when live balances are unavailable", () => {
    const product = { id: "p1", name: "Sonia G5" };
    const warehouses = [{ id: "w1", name: "Əsas anbar" }];
    expect(buildProductWarehouseBalances(product, warehouses, {
      w1: [{ productId: "p1", total: 8, reserved: 3 }],
    })).toEqual([{ warehouse: warehouses[0], total: 8, reserved: 3, available: 5 }]);
  });
});
