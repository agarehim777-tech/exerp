import { afterEach, describe, expect, it, vi } from "vitest";
import * as legacy from "../shared/lib/appDomainWarehouse.jsx";
import * as barrel from "../shared/lib/appDomain.jsx";
import * as warehouse from "../shared/lib/warehouseDomain.ts";
import {
  buildAggregateWarehouseStock,
  buildWarehouseBalanceRows,
  buildWarehouseStockAlerts,
  buildWarehouseTransferSuggestions,
  buildWarehouseWmsRows,
  exportWarehouseBalanceCsv,
  filterRows,
  filterWarehouseBalanceRows,
  filterWarehouseItems,
  getFreeQuantity,
  getSerialSummary,
  getShortageQuantity,
  getWarehouseBalanceStatus,
  getWarehouseStockSummary,
  isLowStockItem,
  isSerialTrackedProduct,
  warehouseBalanceFilterDefaults,
} from "../shared/lib/warehouseDomain.ts";

const warehouses = [{ id: "W1", name: "Bakı", city: "Bakı", capacity: 100 }, { id: "W2", name: "Gəncə", city: "Gəncə" }];
const stock = {
  W1: [{ product: "Kabel", total: 20, reserved: 2, price: 10 }, { product: "Telefon", total: 3, reserved: 1, problem: 1, price: 2500 }],
  W2: [{ product: "Kabel", total: 2, reserved: 0, price: 10 }],
};

describe("warehouse domain logic", () => {
  afterEach(() => vi.restoreAllMocks());

  it("stays importable from appDomainWarehouse.jsx and the appDomain barrel", () => {
    for (const [name, value] of Object.entries(warehouse)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(value);
      expect((barrel as Record<string, unknown>)[name], name).toBe(value);
    }
  });

  it("aggregates stock across warehouses with a per-warehouse distribution", () => {
    const rows = buildAggregateWarehouseStock(warehouses, stock);
    expect(rows.map((row) => [row.product, row.total, row.reserved])).toEqual([["Kabel", 22, 2], ["Telefon", 3, 1]]);
    expect(rows[0].distribution).toEqual([{ warehouse: "Bakı", total: 20, available: 18 }, { warehouse: "Gəncə", total: 2, available: 2 }]);
  });

  it("flags low and critical stock against the reorder point", () => {
    const alerts = buildWarehouseStockAlerts(warehouses, stock, [{ name: "Kabel", reorderLevel: 4 }]);
    expect(alerts.map((row) => [row.warehouseId, row.product, row.available, row.reorderPoint, row.status])).toEqual([
      ["W1", "Telefon", 1, 5, "Kritik stok"],
      ["W2", "Kabel", 2, 4, "Kritik stok"],
    ]);
    expect(isLowStockItem({ product: "Kabel", total: 9, price: 10 })).toBe(false);
    expect(isLowStockItem({ product: "Kabel", total: 8, price: 10 })).toBe(true);
  });

  it("summarises a warehouse and its free, problem and reserved stock", () => {
    expect(getWarehouseStockSummary(stock.W1, 100)).toMatchObject({ sku: 2, total: 23, reserved: 3, problem: 1, available: 19, value: 18 * 10 + 1 * 2500, utilization: 23 });
    expect(getFreeQuantity({ total: 2, reserved: 5 })).toBe(-3);
    expect(getShortageQuantity({ total: 2, reserved: 5 })).toBe(3);
  });

  it("suggests transfers from well-stocked to low warehouses", () => {
    expect(buildWarehouseTransferSuggestions(warehouses, stock)).toEqual([{
      id: "Kabel-W1-W2", product: "Kabel", fromWarehouseId: "W1", fromWarehouse: "Bakı", toWarehouseId: "W2", toWarehouse: "Gəncə", qty: 3,
      reason: "Gəncə üzrə satış üçün 2 qalıb",
    }]);
  });

  it("builds WMS rows with SKU, barcode and serial mode", () => {
    const [cable, phone] = buildWarehouseWmsRows(stock.W1);
    expect(cable).toMatchObject({ sku: "SKU-KABEL-001", barcode: "869100000001", bin: "A-01", serialMode: "Batch", available: 18, status: "Normal" });
    expect(phone).toMatchObject({ serialMode: "IMEI/Serial", reorderQty: 9, status: "Sifariş aç" });
    expect(isSerialTrackedProduct({ price: 1500 })).toBe(true);
    expect(isSerialTrackedProduct({ price: 9999, serialTracked: false })).toBe(false);
    expect(getSerialSummary([{ status: "Anbarda" }, { status: "Rezervdə" }, { status: "Satılıb" }, { status: "Anbarda" }])).toEqual({ available: 2, reserved: 1, sold: 1 });
  });

  it("filters plain rows and warehouse items", () => {
    expect(filterRows([{ a: "Kabel" }, { a: "Telefon" }], "kab")).toEqual([{ a: "Kabel" }]);
    expect(filterRows([{ a: 1 }], "  ")).toEqual([{ a: 1 }]);
    expect(filterWarehouseItems(stock.W1, "Rezervdə").length).toBe(2);
    expect(filterWarehouseItems(stock.W1, "Aşağı stok").map((item) => item.product)).toEqual(["Telefon"]);
  });

  it("builds the balance report by product and by warehouse, including empty catalog items", () => {
    const products = [{ id: "P1", name: "Kabel", sku: "K-1", category: "Aksesuar", reorderLevel: 5, recommendedOrderQty: 10 }, { id: "P3", name: "Adapter", category: "Aksesuar", reorderLevel: 2 }];
    const byProduct = buildWarehouseBalanceRows({ warehouses, warehouseStock: stock, products, view: "products" });
    expect(byProduct.map((row) => [row.product, row.total, row.available, row.warehouseCount, row.status])).toEqual([
      ["Adapter", 0, 0, 0, "Stok tükənib"],
      ["Kabel", 22, 20, 2, "Normal"],
      ["Telefon", 3, 1, 1, "Kritik stok"],
    ]);
    const byWarehouse = buildWarehouseBalanceRows({ warehouses, warehouseStock: stock, products, view: "warehouses", warehouseId: "W2" });
    expect(byWarehouse.map((row) => [row.warehouseName, row.product, row.available])).toEqual([["Gəncə", "Adapter", 0], ["Gəncə", "Kabel", 2]]);
    expect(getWarehouseBalanceStatus(10, 5)).toBe("Normal");

    const filtered = filterWarehouseBalanceRows(byProduct, { ...warehouseBalanceFilterDefaults, belowMinimum: true });
    expect(filtered.map((row) => row.product)).toEqual(["Adapter", "Telefon"]);
    expect(filterWarehouseBalanceRows(byProduct, warehouseBalanceFilterDefaults, "aksesuar").map((row) => row.product)).toEqual(["Adapter", "Kabel"]);
  });

  it("exports the balance rows as a UTF-8 CSV download", async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => { created.push(blob as Blob); return "blob:x"; });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    exportWarehouseBalanceCsv([{ category: "Aksesuar", product: "Kabel, 2m", total: 3, status: "Normal" }], "products");
    expect(click).toHaveBeenCalledOnce();
    // Blob.text() drops the UTF-8 BOM, so check the raw bytes for it (Excel needs it for Azerbaijani letters).
    expect([...new Uint8Array(await created[0].arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await created[0].text();
    expect(text.startsWith('"Kateqoriya","Məhsul",')).toBe(true);
    expect(text).toContain('"Kabel, 2m"');
  });
});
