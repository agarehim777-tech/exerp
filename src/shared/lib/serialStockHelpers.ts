// Anbar sətirləri və IMEI/seriya nömrələri: miqdar xəritəsi, seriya yaradılması, rezerv/satış statusları,
// qalıq və rezerv düzəlişləri. Satıla bilən qalıq hesabı stockMath.js-dədir, burada deyil.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { normalize } from "../../services/format.js";
import { currentBusinessDate } from "./businessDate.ts";
import { isSerialTrackedProduct } from "./appDomainWarehouse.jsx";

export type SerialStatus = "Anbarda" | "Rezervdə" | "Satılıb";

export interface StockSerial {
  imei: string;
  status: SerialStatus | string;
  warehouseId?: string;
  product?: string;
  orderId?: string;
  reservedAt?: string;
  soldAt?: string;
  [key: string]: unknown;
}

export interface StockRow {
  product: string;
  total: number;
  reserved: number;
  price?: number;
  serials?: StockSerial[];
  [key: string]: unknown;
}

export interface ProductLine {
  product?: string;
  qty?: number | string;
  serials?: string[];
  [key: string]: unknown;
}

export interface ProductMeta {
  costPrice?: number | string;
  sku?: string;
  category?: string;
  unit?: string;
  serialTracked?: boolean;
  reorderLevel?: number | string;
}

export type WarehouseStock = Record<string, StockRow[] | null | undefined>;

function buildQuantityMap(items: ProductLine[]): Map<string, number> {
  return items.reduce((map, item) => {
    if (!item.product) return map;
    map.set(item.product, (map.get(item.product) || 0) + Number(item.qty || 0));
    return map;
  }, new Map<string, number>());
}

function buildSerialPrefix(product: unknown = "", warehouseId: unknown = ""): string {
  const productCode = normalize(product).replace(/[^a-z0-9]/g, "").slice(0, 4).toLocaleUpperCase("az-AZ") || "SKU";
  const warehouseCode = String(warehouseId || "WH").replace(/[^A-Z0-9]/gi, "").slice(-3).toLocaleUpperCase("az-AZ");
  return `${productCode}${warehouseCode}`;
}

function ensureStockItemSerials<T extends StockRow>(item: T, warehouseId = "WH"): T & { serials: StockSerial[] } {
  if (!isSerialTrackedProduct(item)) return { ...item, serials: item.serials || [] };

  const totalCount = Math.max(0, Math.round(Number(item.total || 0)));
  const reservedCount = Math.max(0, Math.round(Number(item.reserved || 0)));
  const existingSerials = Array.isArray(item.serials) ? item.serials : [];
  const nonSoldSerials = existingSerials.filter((serial) => serial.status !== "Satılıb");
  const serials: StockSerial[] = [...existingSerials];
  const prefix = buildSerialPrefix(item.product, warehouseId);

  for (let index = nonSoldSerials.length; index < totalCount; index += 1) {
    serials.push({
      imei: `${prefix}-${String(index + 1).padStart(5, "0")}`,
      status: index < reservedCount ? "Rezervdə" : "Anbarda",
      warehouseId,
      product: item.product,
    });
  }

  let reservedSeen = 0;
  const normalizedSerials = serials.map((serial) => {
    if (serial.status === "Satılıb") return serial;
    reservedSeen += 1;
    return {
      ...serial,
      status: reservedSeen <= reservedCount ? "Rezervdə" : "Anbarda",
      warehouseId: serial.warehouseId || warehouseId,
      product: serial.product || item.product,
    };
  });

  return {
    ...item,
    serials: normalizedSerials,
  };
}

function ensureWarehouseSerials(warehouseStock: WarehouseStock = {}): Record<string, Array<StockRow & { serials: StockSerial[] }>> {
  return Object.fromEntries(
    Object.entries(warehouseStock).map(([warehouseId, rows]) => [
      warehouseId,
      (rows || []).map((item) => ensureStockItemSerials(item, warehouseId)),
    ]),
  );
}

function getAvailableSerialsForProduct(warehouseStock: WarehouseStock = {}, warehouseId: string, product: string): string[] {
  const item = (warehouseStock?.[warehouseId] || []).find((row) => row.product === product);
  if (!item || !isSerialTrackedProduct(item)) return [];
  return (item.serials || []).filter((serial) => serial.status === "Anbarda").map((serial) => serial.imei);
}

function updateSerialStatuses<T extends StockRow>(rows: T[], productLines: ProductLine[], nextStatus: SerialStatus | string, orderId: string): T[] {
  return rows.map((item) => {
    const matchingLines = productLines.filter((line) => line.product === item.product);
    if (matchingLines.length === 0 || !Array.isArray(item.serials) || item.serials.length === 0) return item;

    const requestedSerials = new Set(matchingLines.flatMap((line) => line.serials || []).filter(Boolean));
    const neededFallback = matchingLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    let fallbackCount = 0;

    return {
      ...item,
      serials: item.serials.map((serial) => {
        const explicit = requestedSerials.has(serial.imei);
        const fallback =
          requestedSerials.size === 0 &&
          serial.status !== "Satılıb" &&
          fallbackCount < neededFallback &&
          (nextStatus === "Satılıb" ? serial.status === "Rezervdə" : serial.status === "Anbarda");

        if (!explicit && !fallback) return serial;
        fallbackCount += fallback ? 1 : 0;
        return {
          ...serial,
          status: nextStatus,
          orderId,
          reservedAt: nextStatus === "Rezervdə" ? currentBusinessDate : serial.reservedAt,
          soldAt: nextStatus === "Satılıb" ? currentBusinessDate : serial.soldAt,
        };
      }),
    };
  });
}

function releaseOrderSerialReservations<T extends StockRow>(rows: T[], productLines: ProductLine[], orderId: string): T[] {
  return rows.map((item) => {
    const matchingLines = productLines.filter((line) => line.product === item.product);
    if (matchingLines.length === 0 || !Array.isArray(item.serials) || item.serials.length === 0) return item;

    const requestedSerials = new Set(matchingLines.flatMap((line) => line.serials || []).filter(Boolean));
    const fallbackLimit = matchingLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    let releasedCount = 0;

    return {
      ...item,
      serials: item.serials.map((serial) => {
        const explicit = requestedSerials.has(serial.imei);
        const sameOrder = serial.orderId === orderId;
        const fallback = requestedSerials.size === 0 && sameOrder && releasedCount < fallbackLimit;
        if (serial.status !== "Rezervdə" || (!explicit && !fallback)) return serial;
        releasedCount += 1;
        return {
          ...serial,
          status: "Anbarda",
          orderId: "",
          reservedAt: "",
        };
      }),
    };
  });
}

interface StockAdjustment {
  totalDelta?: number;
  reservedDelta?: number;
  createMissing?: boolean;
}

function adjustStockRows(rows: StockRow[], quantities: Map<string, number>, { totalDelta = 0, reservedDelta = 0, createMissing = false }: StockAdjustment): StockRow[] {
  const seen = new Set<string>();
  const next = rows.map((item) => {
    const qty = quantities.get(item.product) || 0;
    if (!qty) return item;
    seen.add(item.product);
    return {
      ...item,
      // Qalıq heç vaxt mənfi olmur; rezerv qalıqdan çox ola bilər (backorder).
      total: Math.max(0, item.total + totalDelta * qty),
      reserved: Math.max(0, item.reserved + reservedDelta * qty),
    };
  });
  if (!createMissing) return next;
  // Anbarda sətri olmayan məhsul da satıla bilər — sıfır qalıqla rezerv sətri açılır.
  quantities.forEach((qty, product) => {
    if (!qty || seen.has(product) || next.some((item) => item.product === product)) return;
    next.push({
      product,
      total: 0,
      reserved: Math.max(0, reservedDelta * qty),
      price: 0,
      serials: [],
    });
  });
  return next;
}

// Daxil olan mal üçün məhsul kartından ötürülən sahələr; yalnız dəyəri olanlar yazılır.
function productMetaFields(productMeta: ProductMeta) {
  return {
    ...(Number.isFinite(Number(productMeta.costPrice)) ? { costPrice: Number(productMeta.costPrice) } : {}),
    ...(productMeta.sku ? { sku: productMeta.sku } : {}),
    ...(productMeta.category ? { category: productMeta.category } : {}),
    ...(productMeta.unit ? { unit: productMeta.unit } : {}),
    ...(typeof productMeta.serialTracked === "boolean" ? { serialTracked: productMeta.serialTracked } : {}),
    ...(Number.isFinite(Number(productMeta.reorderLevel)) ? { reorderLevel: Number(productMeta.reorderLevel) } : {}),
  };
}

function addStockToRows(rows: StockRow[], product: string, qty: unknown, price: unknown, warehouseId = "", productMeta: ProductMeta = {}): StockRow[] {
  const amount = Math.max(0, Math.round(Number(qty || 0)));
  if (!product || amount <= 0) return rows;

  const exists = rows.some((item) => item.product === product);
  if (exists) {
    return rows.map((item) => {
      if (item.product !== product) return item;

      const nextItem = {
        ...item,
        total: Number(item.total || 0) + amount,
        price: Number(price || item.price || 0),
        ...productMetaFields(productMeta),
      };
      return {
        ...nextItem,
        serials: ensureStockItemSerials(nextItem, warehouseId).serials,
      };
    });
  }

  return [
    ...rows,
    ensureStockItemSerials(
      {
        product,
        total: amount,
        reserved: 0,
        price: Number(price || 0),
        ...productMetaFields(productMeta),
      },
      warehouseId,
    ),
  ];
}

export {
  buildQuantityMap,
  buildSerialPrefix,
  ensureStockItemSerials,
  ensureWarehouseSerials,
  getAvailableSerialsForProduct,
  updateSerialStatuses,
  releaseOrderSerialReservations,
  adjustStockRows,
  addStockToRows,
};
