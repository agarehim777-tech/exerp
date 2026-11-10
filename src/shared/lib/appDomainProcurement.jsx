import { normalize } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";
import { formatPaymentDate, parsePaymentDate } from "../../services/date.js";
import { getAvailableQuantity } from "./appDomainWarehouse.jsx";

export function buildProcurementRows(vendors, warehouseStock, orders, products = [], purchaseOrders = []) {
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const byProduct = new Map();

  products.filter((product) => product.status !== "Passiv").forEach((product) => {
    byProduct.set(product.name, {
      product: product.name,
      total: 0,
      reserved: 0,
      price: Number(product.salePrice || product.costPrice || 0),
      costPrice: Number(product.costPrice || 0),
      salePrice: Number(product.salePrice || 0),
      sku: product.sku || "",
    });
  });

  Object.values(warehouseStock).forEach((items) => {
    (items || []).forEach((item) => {
      const catalogProduct = productsByName.get(normalize(item.product));
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: Number(item.price || 0),
        costPrice: Number(catalogProduct?.costPrice || 0),
        salePrice: Number(catalogProduct?.salePrice || item.price || 0),
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = Number(item.price || current.price || 0);
      current.costPrice = Number(current.costPrice || catalogProduct?.costPrice || 0);
      current.salePrice = Number(current.salePrice || catalogProduct?.salePrice || item.price || 0);
      byProduct.set(item.product, current);
    });
  });

  const soldByProduct = orders.reduce((map, order) => {
    (order.productLines || []).forEach((line) => {
      map.set(line.product, (map.get(line.product) || 0) + Number(line.qty || 0));
    });
    return map;
  }, new Map());

  return [...byProduct.values()]
    .map((item) => {
      const available = getAvailableQuantity(item);
      const sold = soldByProduct.get(item.product) || 0;
      const demand = Math.max(4, sold * 2);
      const reorderPoint = getReorderPoint(item, productsByName);
      const targetQty = Math.max(demand, reorderPoint > 0 ? reorderPoint * 2 : 0);
      const recommendedQty = Math.max(0, targetQty - available);
      const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, amount: 0, count: 0 };
      const unitCost = Number(item.costPrice || Math.round(Number(item.price || 0) * 0.76));
      const orderGap = Math.max(0, recommendedQty - Number(coverage.orderedQty || 0));
      const orderStatus =
        recommendedQty <= 0
          ? "Stok normal"
          : coverage.orderedQty >= recommendedQty
            ? "Sifariş verilib"
            : coverage.orderedQty > 0
              ? "Qismən sifarişdə"
              : "Sifariş verilməyib";
      return {
        ...item,
        available,
        sold,
        reorderPoint,
        vendor: getPreferredVendorName(item.product, vendors),
        recommendedQty,
        orderGap,
        orderedQty: Number(coverage.orderedQty || 0),
        openPoCount: Number(coverage.count || 0),
        latestPoId: coverage.latest?.id || "",
        unitCost,
        estimatedCost: Math.round(orderGap * unitCost),
        status:
          recommendedQty > 0
            ? orderStatus
            : reorderPoint > 0 && available <= reorderPoint
              ? "Nəzarət"
              : "Kifayət edir",
      };
    })
    .sort((a, b) => b.recommendedQty - a.recommendedQty || a.available - b.available);
}

export function isPurchaseOrderOpen(po = {}) {
  const status = normalize(po.status);
  return (
    !status.includes("edildi") &&
    !status.includes("ödən") &&
    !status.includes("oden") &&
    !status.includes("bağ") &&
    !status.includes("bag") &&
    !status.includes("imtina") &&
    !status.includes("cancel")
  );
}

export const currentBusinessQuarter = Math.floor(new Date().getMonth() / 3) + 1;

export function buildProductLookup(products = []) {
  return new Map((products || []).map((product) => [normalize(product.name), product]));
}

export function buildPurchaseOrderCoverage(purchaseOrders = []) {
  return (purchaseOrders || []).filter(isPurchaseOrderOpen).reduce((map, po) => {
    const key = normalize(po.product);
    if (!key) return map;
    const current = map.get(key) || { orderedQty: 0, amount: 0, count: 0, latest: null };
    map.set(key, {
      orderedQty: current.orderedQty + Number(po.qty || 0),
      amount: current.amount + Number(po.amount || 0),
      count: current.count + 1,
      latest: current.latest || po,
    });
    return map;
  }, new Map());
}

export function getRecommendedOrderPlan({ available = 0, minimum = 0, baseQty = 0, orderedQty = 0 } = {}) {
  const currentAvailable = Number(available || 0);
  const minimumStock = Math.max(0, Number(minimum || 0));
  const baseOrderQty = Math.max(0, Number(baseQty || 0));
  const openOrderQty = Math.max(0, Number(orderedQty || 0));
  const thresholdReached = currentAvailable < 0 || (minimumStock > 0 && currentAvailable <= minimumStock);
  const deficit = thresholdReached ? Math.max(0, minimumStock - currentAvailable) : 0;
  const recommendedQty = thresholdReached ? baseOrderQty + deficit : 0;
  return {
    thresholdReached,
    deficit,
    recommendedQty,
    orderedQty: openOrderQty,
    additionalQty: Math.max(0, recommendedQty - openOrderQty),
  };
}

export const backorderDefaultLeadDays = 14;

export const backorderGrnDays = 3;

export function getBackorderPlan({
  product,
  missingQty = 0,
  purchaseOrders = [],
  today = new Date(),
  leadDays = backorderDefaultLeadDays,
}) {
  const missing = Math.max(0, Math.round(Number(missingQty || 0)));
  if (!product || missing <= 0) return null;

  const key = normalize(product);
  const openPos = (purchaseOrders || [])
    .filter((po) => normalize(po.product) === key && isPurchaseOrderOpen(po))
    .sort((a, b) => {
      const dateA = parsePaymentDate(a.expectedAt || a.date)?.getTime() || Infinity;
      const dateB = parsePaymentDate(b.expectedAt || b.date)?.getTime() || Infinity;
      return dateA - dateB;
    });
  const incomingQty = openPos.reduce((sum, po) => sum + Math.max(0, Number(po.qty || 0)), 0);
  const covered = Math.min(missing, incomingQty);
  const uncovered = missing - covered;
  const primaryPo = openPos[0] || null;
  const baseDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const addDays = (date, days) => {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
  };

  let expectedDate;
  let step;
  let stepHint;

  if (!primaryPo) {
    expectedDate = addDays(baseDate, leadDays + backorderGrnDays);
    step = "Satınalma sifarişi (PO) yaradılmalıdır";
    stepHint = "Satınalma → PO təsdiqi → Anbar qəbulu (GRN) → Təhvil";
  } else {
    const poDate = parsePaymentDate(primaryPo.expectedAt) || addDays(parsePaymentDate(primaryPo.date) || baseDate, leadDays);
    expectedDate = addDays(poDate < baseDate ? baseDate : poDate, backorderGrnDays);
    const status = normalize(primaryPo.status);
    if (status.includes("gözl") || status.includes("gozl")) {
      step = `${primaryPo.id} PO təsdiqi gözlənilir`;
      stepHint = "PO təsdiqi → Anbar qəbulu (GRN) → Rezervin bağlanması → Təhvil";
    } else {
      step = `${primaryPo.id} üzrə anbar qəbulu (GRN)`;
      stepHint = "Anbar qəbulu (GRN) → Rezervin bağlanması → Təhvil";
    }
  }

  return {
    product,
    missingQty: missing,
    coveredQty: covered,
    uncoveredQty: uncovered,
    purchaseOrder: primaryPo,
    expectedDate,
    expectedLabel: formatPaymentDate(expectedDate),
    step,
    stepHint,
    closeStage: "Anbardan təhvil (rezerv bağlanır)",
  };
}

export function getReorderPoint(item = {}, productsByName = new Map()) {
  const catalogProduct = productsByName.get(normalize(item.product));
  const configuredPoint = catalogProduct?.reorderLevel ?? item.reorderLevel;
  if (configuredPoint !== undefined && configuredPoint !== null && configuredPoint !== "") {
    const point = Number(configuredPoint);
    if (Number.isFinite(point)) return Math.max(0, Math.round(point));
  }
  return Number(item.price || 0) >= 2000 ? 5 : 8;
}

export function getPreferredVendorName(product, vendors) {
  const normalizedProduct = normalize(product);
  const direct = vendors.find((vendor) => normalizedProduct.includes(normalize(vendor.name).split(" ")[0]));
  if (direct) return direct.name;
  return vendors[0]?.name || "Vendor təyin edilməyib";
}

export function getNormalizedVendor(vendor = {}) {
  const key = getVendorKey(vendor);
  return {
    ...normalizeVendor({ ...vendor, id: key }, vendor),
    id: key,
  };
}

export function getVendorKey(vendor = {}) {
  return vendor.id || `VND-${normalize(vendor.name).replace(/[^a-z0-9]+/g, "-") || "vendor"}`;
}

export function normalizeVendor(values = {}, fallback = {}) {
  const name = String(values.name ?? fallback.name ?? "").trim();
  return {
    id: fallback.id || values.id || `VND-${Date.now()}`,
    name,
    country: String(values.country ?? fallback.country ?? "").trim(),
    sku: Math.max(0, Math.round(Number(values.sku ?? fallback.sku ?? 0))),
    sold: Math.max(0, Math.round(Number(values.sold ?? fallback.sold ?? 0))),
    quota: Math.max(0, Math.round(Number(values.quota ?? fallback.quota ?? 0))),
    status: values.status || fallback.status || "Aktiv",
    contact: String(values.contact ?? fallback.contact ?? "").trim(),
    phone: String(values.phone ?? fallback.phone ?? "").trim(),
    email: String(values.email ?? fallback.email ?? "").trim(),
    leadTimeDays: Math.max(0, Math.round(Number(values.leadTimeDays ?? fallback.leadTimeDays ?? 14))),
    paymentTerms: String(values.paymentTerms ?? fallback.paymentTerms ?? "30 gün").trim(),
    note: String(values.note ?? fallback.note ?? "").trim(),
  };
}
