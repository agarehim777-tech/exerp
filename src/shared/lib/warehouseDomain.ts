// Anbar domen məntiqi: anbarlar üzrə ümumi stok, minimum qalıq siqnalları, anbar xülasəsi, transfer təklifləri,
// WMS sətirləri, satışa uyğun/sərbəst/çatışmayan miqdar, serial xülasəsi, qalıq hesabatı (məhsul və anbar görünüşü),
// filtrləri və CSV export. appDomainWarehouse.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { normalize } from "../../services/format.js";
import { toLocalIsoDate } from "../../services/date.js";
import { total } from "../utils/aggregate.js";
import { sellableQty } from "./stockMath.js";
import { csvCell } from "./csvCell.js";
import { buildProductLookup, buildPurchaseOrderCoverage, getRecommendedOrderPlan, getReorderPoint } from "./appDomainProcurement.jsx";
import { foldSearchText } from "./searchText.ts";

type Row = Record<string, any>;
export type WarehouseStock = Record<string, Row[] | null | undefined>;

export function buildAggregateWarehouseStock(warehouses: Row[], warehouseStock: WarehouseStock): Row[] {
  const warehouseById = new Map<string, Row>(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map<string, Row>();

  Object.entries(warehouseStock).forEach(([warehouseId, items]: [string, any]) => {
    const warehouse = warehouseById.get(warehouseId);
    items.forEach((item: Row) => {
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: item.price,
        distribution: [],
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = item.price || current.price;
      current.distribution.push({
        warehouse: warehouse?.name || warehouseId,
        total: Number(item.total || 0),
        available: sellableQty(item),
      });
      byProduct.set(item.product, current);
    });
  });

  return [...byProduct.values()].sort((a, b) => a.product.localeCompare(b.product, "az"));
}

export function buildWarehouseStockAlerts(warehouses: Row[], warehouseStock: WarehouseStock, products: Row[] = []): Row[] {
  const productsByName = buildProductLookup(products);

  return warehouses.flatMap((warehouse) =>
    (warehouseStock[warehouse.id] || [])
      .map((item: Row) => ({
        item,
        reorderPoint: getReorderPoint(item, productsByName),
      }))
      .filter(({ item, reorderPoint }) => reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint)
      .map(({ item, reorderPoint }) => ({
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          city: warehouse.city,
          product: item.product,
          total: Number(item.total || 0),
          reserved: Number(item.reserved || 0),
          available: getAvailableQuantity(item),
          reorderPoint,
          status: getAvailableQuantity(item) <= Math.max(1, Math.floor(reorderPoint / 2)) ? "Kritik stok" : "Aşağı stok",
        })),
  );
}

export function buildWarehouseSummaries(warehouses: Row[], warehouseStock: WarehouseStock, products: Row[] = []): Row[] {
  return warehouses.map((warehouse) => ({
    warehouse,
    ...getWarehouseStockSummary(warehouseStock[warehouse.id] || [], Number(warehouse.capacity || 0), products),
  }));
}

export function buildWarehouseTransferSuggestions(warehouses: Row[], warehouseStock: WarehouseStock): Row[] {
  const warehouseById = new Map<string, Row>(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map<string, Row[]>();

  Object.entries(warehouseStock).forEach(([warehouseId, items]: [string, any]) => {
    items.forEach((item: Row) => {
      const rows = byProduct.get(item.product) || [];
      rows.push({
        warehouseId,
        warehouseName: warehouseById.get(warehouseId)?.name || warehouseId,
        city: warehouseById.get(warehouseId)?.city || "",
        product: item.product,
        price: Number(item.price || 0),
        total: Number(item.total || 0),
        reserved: Number(item.reserved || 0),
        available: getAvailableQuantity(item),
      });
      byProduct.set(item.product, rows);
    });
  });

  return [...byProduct.entries()].flatMap(([product, rows]) => {
    const targets = rows.filter((row) => row.available <= 3).sort((a, b) => a.available - b.available);
    const sources = rows.filter((row) => row.available >= 6).sort((a, b) => b.available - a.available);
    return targets.flatMap((target) => {
      const source = sources.find((item) => item.warehouseId !== target.warehouseId);
      if (!source) return [];
      const qty = Math.max(1, Math.min(5 - target.available, source.available - 4));
      if (qty <= 0) return [];
      return {
        id: `${product}-${source.warehouseId}-${target.warehouseId}`,
        product,
        fromWarehouseId: source.warehouseId,
        fromWarehouse: source.warehouseName,
        toWarehouseId: target.warehouseId,
        toWarehouse: target.warehouseName,
        qty,
        reason: `${target.warehouseName} üzrə satış üçün ${target.available} qalıb`,
      };
    });
  });
}

export function buildWarehouseWmsRows(items: Row[], products: Row[] = []): Row[] {
  const productsByName = buildProductLookup(products);

  return items.map((item, index) => {
    const available = getAvailableQuantity(item);
    const serialSummary = getSerialSummary(item.serials || []);
    const catalogProduct = productsByName.get(normalize(item.product));
    const reorderPoint = getReorderPoint(item, productsByName);
    const serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
    const reorderQty = Math.max(0, reorderPoint * 2 - available);
    const brandCode = normalize(item.product).replace(/[^a-z0-9]/g, "").slice(0, 5).toLocaleUpperCase("az-AZ");
    const sku = `SKU-${brandCode || index + 1}-${String(index + 1).padStart(3, "0")}`;
    const barcode = `869${String(index + 100000001).padStart(9, "0")}`;
    return {
      sku,
      barcode,
      qrPayload: `ERPZ|${sku}|${item.product}|${available}`,
      product: item.product,
      bin: `${String.fromCharCode(65 + (index % 4))}-${String((index % 6) + 1).padStart(2, "0")}`,
      serialMode: serialTracked ? "IMEI/Serial" : "Partiya",
      cycleCount: index % 3 === 0 ? "Bu həftə" : index % 3 === 1 ? "Növbəti həftə" : "Aylıq",
      available,
      reserved: Number(item.reserved || 0),
      serialSummary,
      sampleSerial: item.serials?.find((serial: Row) => serial.status !== "Satılıb")?.imei || "Partiya",
      reorderPoint,
      reorderQty,
      status: reorderQty > 0 ? "Sifariş aç" : available <= reorderPoint + 2 ? "Nəzarət" : "Normal",
    };
  });
}

export function filterRows<T extends object>(rows: T[], query: string): T[] {
  if (!query.trim()) return rows;
  const q = foldSearchText(query);
  return rows.filter((row) => foldSearchText(Object.values(row).join(" ")).includes(q));
}

export function filterWarehouseItems(items: Row[], filter: string): Row[] {
  if (filter === "Satış üçün var") {
    return items.filter((item) => getAvailableQuantity(item) > 0);
  }
  if (filter === "Rezervdə") {
    return items.filter((item) => item.reserved > 0);
  }
  if (filter === "Aşağı stok") {
    return items.filter((item) => getAvailableQuantity(item) <= 3);
  }
  return items;
}

export function getAvailableQuantity(item: Row): number {
  return sellableQty(item);
}

// Satış üçün real sərbəst qalıq — mənfi ola bilər (backorder / sifariş gözləyən miqdar).

export function getWarehouseStockSummary(items: Row[], capacity = 0, products: Row[] = []): Row {
  const productsByName = buildProductLookup(products);
  const totalQty = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reservedQty = total(items, "reserved");
  const problemQty = items.reduce((sum, item) => sum + Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0), 0);
  const availableQty = totalQty - reservedQty - problemQty;
  const value = items.reduce((sum, item) => sum + Math.max(0, getAvailableQuantity(item)) * Number(item.price || 0), 0);
  return {
    sku: items.length,
    total: totalQty,
    reserved: reservedQty,
    problem: problemQty,
    available: availableQty,
    value,
    lowStock: items.filter((item) => isLowStockItem(item, productsByName)).length,
    utilization: capacity > 0 ? Math.min(100, Math.round((totalQty / capacity) * 100)) : 0,
    reservedRate: totalQty > 0 ? (reservedQty / totalQty) * 100 : 0,
  };
}

export function isLowStockItem(item: Row, productsByName: Map<string, Row> = new Map()): boolean {
  const reorderPoint = getReorderPoint(item, productsByName);
  return reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint;
}

export function getSerialSummary(serials: Row[] = []): { available: number; reserved: number; sold: number } {
  return {
    available: serials.filter((serial) => serial.status === "Anbarda").length,
    reserved: serials.filter((serial) => serial.status === "Rezervdə").length,
    sold: serials.filter((serial) => serial.status === "Satılıb").length,
  };
}

export function isSerialTrackedProduct(item: Row = {}): boolean {
  if (typeof item.serialTracked === "boolean") return item.serialTracked;
  return Number(item.price || 0) >= 1500;
}

export const warehouseBalanceFilterDefaults = {
  productQuery: "",
  warehouseId: "all",
  category: "all",
  stockStatus: "all",
  reserveStatus: "all",
  serialStatus: "all",
  belowMinimum: false,
};

export function buildWarehouseBalanceRows({ warehouses = [], warehouseStock = {}, products = [], purchaseOrders = [], view = "products", warehouseId = "all" }: {
  warehouses?: Row[];
  warehouseStock?: WarehouseStock;
  products?: Row[];
  purchaseOrders?: Row[];
  view?: string;
  warehouseId?: string;
}): Row[] {
  const warehouseById = new Map<string, Row>(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const createRow = (productName: string, catalogProduct: Row | null = null): Row => ({
    key: catalogProduct?.id || normalize(productName),
    product: productName,
    productId: catalogProduct?.id || "",
    imageUrl: catalogProduct?.imageUrl || catalogProduct?.image_url || "",
    category: catalogProduct?.category || "Kataloqu olmayan",
    sku: catalogProduct?.sku || "—",
    unit: catalogProduct?.unit || "ədəd",
    serialTracked: Boolean(catalogProduct?.serialTracked),
    costPrice: Number(catalogProduct?.costPrice || 0),
    salePrice: Number(catalogProduct?.salePrice || 0),
    reorderLevel: Number(catalogProduct?.reorderLevel || 0),
    recommendedOrderQty: Number(catalogProduct?.recommendedOrderQty || 0),
    total: 0,
    reserved: 0,
    problem: 0,
    orderedQty: 0,
    openPoCount: 0,
    latestPoId: "",
    stockValue: 0,
    warehouseDistribution: [],
  });

  if (view === "products") {
    const rowsByProduct = new Map<string, Row>();
    products.filter((product) => product.status !== "Passiv").forEach((product) => {
      rowsByProduct.set(normalize(product.name), createRow(product.name, product));
    });

    Object.entries(warehouseStock).forEach(([sourceWarehouseId, items]: [string, any]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return;
      (items || []).forEach((item: Row) => {
        const key = normalize(item.product);
        const catalogProduct = productsByName.get(key);
        const row = rowsByProduct.get(key) || createRow(item.product, catalogProduct);
        row.total += Number(item.total || 0);
        row.reserved += Number(item.reserved || 0);
        row.problem += Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0);
        row.stockValue += Number(item.total || 0) * Number(item.costPrice || 0);
        row.salePrice = row.salePrice || Number(item.price || 0);
        row.serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
        row.reorderLevel = getReorderPoint(item, productsByName);
        row.warehouseDistribution.push({
          warehouse: warehouseById.get(sourceWarehouseId)?.name || sourceWarehouseId,
          warehouseId: sourceWarehouseId,
          total: Number(item.total || 0),
          problem: Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0),
          available: getAvailableQuantity(item),
        });
        rowsByProduct.set(key, row);
      });
    });

    return [...rowsByProduct.values()]
      .map((row): Row => {
        const free = row.total - row.reserved - row.problem;
        const available = free;
        const shortage = Math.max(0, -free);
        const coverage = orderCoverage.get(normalize(row.product)) || { orderedQty: 0, count: 0, latest: null };
        const averageCost = row.total > 0 ? row.stockValue / row.total : row.costPrice;
        const recommendation: Row = getRecommendedOrderPlan({ available, minimum: row.reorderLevel, baseQty: row.recommendedOrderQty, orderedQty: coverage.orderedQty });
        return {
          ...row,
          costPrice: averageCost,
          warehouseName: row.warehouseDistribution.length === 0 ? "—" : `${row.warehouseDistribution.length} anbar`,
          warehouseCount: row.warehouseDistribution.length,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          ...recommendation,
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, row.reorderLevel),
          stockValue: row.stockValue,
          salesValue: row.total * row.salePrice,
        };
      })
      .sort((a, b) => a.product.localeCompare(b.product, "az"));
  }

  const warehouseRows = Object.entries(warehouseStock)
    .flatMap(([sourceWarehouseId, items]: [string, any]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return [];
      const warehouse = warehouseById.get(sourceWarehouseId);
      return (items || []).map((item: Row) => {
        const catalogProduct = productsByName.get(normalize(item.product));
        const totalQty = Number(item.total || 0);
        const reserved = Number(item.reserved || 0);
        const problem = Number(item.problem ?? item.problemQty ?? item.problem_qty ?? 0);
        const available = getAvailableQuantity(item);
        const free = getFreeQuantity(item);
        const shortage = getShortageQuantity(item);
        const reorderLevel = getReorderPoint(item, productsByName);
        const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, count: 0, latest: null };
        const costPrice = Number(item.costPrice || catalogProduct?.costPrice || 0);
        const salePrice = Number(catalogProduct?.salePrice || item.price || 0);
        const recommendation: Row = getRecommendedOrderPlan({ available, minimum: reorderLevel, baseQty: catalogProduct?.recommendedOrderQty, orderedQty: coverage.orderedQty });
        return {
          key: `${sourceWarehouseId}-${catalogProduct?.id || item.product}`,
          warehouseId: sourceWarehouseId,
          warehouseName: warehouse?.name || sourceWarehouseId,
          product: item.product,
          productId: catalogProduct?.id || "",
          imageUrl: catalogProduct?.imageUrl || catalogProduct?.image_url || "",
          category: catalogProduct?.category || "Kataloqu olmayan",
          sku: catalogProduct?.sku || "—",
          unit: catalogProduct?.unit || "ədəd",
          serialTracked: catalogProduct?.serialTracked ?? isSerialTrackedProduct(item),
          costPrice,
          salePrice,
          reorderLevel,
          total: totalQty,
          reserved,
          problem,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          recommendedOrderQty: Number(catalogProduct?.recommendedOrderQty || 0),
          ...recommendation,
          warehouseDistribution: [],
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, reorderLevel),
          stockValue: totalQty * costPrice,
          salesValue: totalQty * salePrice,
        };
      });
    });

  // Kataloqda olan, lakin heç bir anbarda qalığı olmayan məhsullar da 0 qalıqla görünməlidir.
  const coveredProducts = new Set(warehouseRows.map((row) => normalize(row.product)));
  const emptyWarehouse = warehouseId !== "all" ? warehouseById.get(warehouseId) : null;
  const zeroRows = products
    .filter((product) => product.status !== "Passiv" && product.name && !coveredProducts.has(normalize(product.name)))
    .map((product) => {
      const reorderLevel = Number(product.reorderLevel || 0);
      const coverage = orderCoverage.get(normalize(product.name)) || { orderedQty: 0, count: 0, latest: null };
      const recommendation: Row = getRecommendedOrderPlan({ available: 0, minimum: reorderLevel, baseQty: product.recommendedOrderQty, orderedQty: coverage.orderedQty });
      return {
        key: `no-stock-${product.id || normalize(product.name)}`,
        warehouseId: emptyWarehouse?.id || "",
        warehouseName: emptyWarehouse?.name || "—",
        product: product.name,
        productId: product.id || "",
        imageUrl: product.imageUrl || product.image_url || "",
        category: product.category || "Kataloqu olmayan",
        sku: product.sku || "—",
        unit: product.unit || "ədəd",
        serialTracked: Boolean(product.serialTracked),
        costPrice: Number(product.costPrice || 0),
        salePrice: Number(product.salePrice || 0),
        reorderLevel,
        total: 0,
        reserved: 0,
        problem: 0,
        available: 0,
        free: 0,
        shortage: 0,
        orderedQty: Number(coverage.orderedQty || 0),
        openPoCount: Number(coverage.count || 0),
        latestPoId: coverage.latest?.id || "",
        recommendedOrderQty: Number(product.recommendedOrderQty || 0),
        ...recommendation,
        warehouseDistribution: [],
        status: getWarehouseBalanceStatus(0, reorderLevel),
        stockValue: 0,
        salesValue: 0,
      };
    });

  return [...warehouseRows, ...zeroRows]
    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "az") || a.product.localeCompare(b.product, "az"));
}

export function filterWarehouseBalanceRows(rows: Row[], filters: Row, globalQuery = ""): Row[] {
  const search = foldSearchText([filters.productQuery, globalQuery].filter(Boolean).join(" "));
  return rows.filter((row) => {
    const matchesSearch = !search || foldSearchText(`${row.product} ${row.sku} ${row.category} ${row.warehouseName}`).includes(search);
    const matchesCategory = filters.category === "all" || row.category === filters.category;
    const matchesStock =
      filters.stockStatus === "all" ||
      (filters.stockStatus === "below" && (row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq")) ||
      (filters.stockStatus === "available" && row.available > 0) ||
      (filters.stockStatus === "empty" && row.available <= 0) ||
      (filters.stockStatus === "shortage" && row.shortage > 0) ||
      (filters.stockStatus === "problem" && Number(row.problem || 0) > 0);
    const matchesReserve =
      filters.reserveStatus === "all" ||
      (filters.reserveStatus === "reserved" && row.reserved > 0) ||
      (filters.reserveStatus === "free" && row.reserved === 0);
    const matchesSerial =
      filters.serialStatus === "all" ||
      (filters.serialStatus === "serial" && row.serialTracked) ||
      (filters.serialStatus === "batch" && !row.serialTracked);
    const matchesMinimum = !filters.belowMinimum || row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq";
    return matchesSearch && matchesCategory && matchesStock && matchesReserve && matchesSerial && matchesMinimum;
  });
}

export function exportWarehouseBalanceCsv(rows: Row[], view: string): void {
  const headers = ["Kateqoriya", "Məhsul", "SKU", "Anbar", "Qalıq", "Minimum", "Rezerv", "Problemli", "Satışa uyğun", "Sifarişdə", "Tövsiyə", "Əlavə alınmalı", "Vahid", "Maya", "Stok dəyəri", "Satış qiyməti", "Status"];
  const escapeValue = (value: unknown) => csvCell(value);
  const csvRows = rows.map((row) => [
    row.category,
    row.product,
    row.sku,
    view === "products" ? row.warehouseName : row.warehouseName,
    row.total,
    row.reorderLevel,
    row.reserved,
    row.problem,
    row.available,
    row.orderedQty,
    row.recommendedQty,
    row.additionalQty,
    row.unit,
    row.costPrice,
    row.stockValue,
    row.salePrice,
    row.status,
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `anbar-qaliqlari-${toLocalIsoDate()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function getWarehouseBalanceStatus(available: number, reorderPoint: number): string {
  if (available <= 0) return "Stok tükənib";
  if (reorderPoint > 0 && available <= Math.max(1, Math.floor(reorderPoint / 2))) return "Kritik stok";
  if (reorderPoint > 0 && available <= reorderPoint) return "Aşağı stok";
  return "Normal";
}

export function getFreeQuantity(item: Row): number {
  return getAvailableQuantity(item);
}

export function getShortageQuantity(item: Row): number {
  return Math.max(0, -getFreeQuantity(item));
}
