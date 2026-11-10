import { stages } from "../../data.js";
import { normalize } from "../../services/format.js";
import { parsePaymentDate, toLocalIsoDate } from "../../services/date.js";
import { daysBetween } from "../../shared/lib/credit.js";
import { currentBusinessDate } from "../../shared/lib/businessDate";

export function enrichDeliveryOrder(order) {
  const stageIndex = getDeliveryStageIndex(order);
  return {
    ...order,
    stageIndex,
    progress: ((stageIndex + 1) / stages.length) * 100,
    ageDays: getDeliveryAgeDays(order),
    risk: getDeliveryRisk(order),
    balance: getOrderBalance(order),
    deliveryStatusText: getOrderDeliveryStatus(order),
  };
}

export function getDeliveryStockCheck(order, warehouseStock = {}) {
  if (!order) {
    return { ok: false, status: "Sifariş yoxdur", reason: "Sifariş tapılmadı.", issues: [] };
  }

  if (order.status === "Təhvil verilib") {
    return { ok: false, status: "Təhvil verilib", reason: "Bu sifariş artıq təhvil verilib.", issues: [], plan: null };
  }

  const productLines = normalizeOrderProductLines(order.productLines || []);
  if (productLines.length === 0) {
    return { ok: false, status: "Məhsul yoxdur", reason: "Sifarişdə təhvil veriləcək məhsul yoxdur.", issues: [] };
  }

  const warehouseId = order.warehouseId;
  if (!warehouseId) {
    return { ok: false, status: "Anbar seçilməyib", reason: "Sifariş üçün anbar seçilməyib.", issues: [] };
  }

  const plan = getDeliveryPlan({ ...order, warehouseId }, warehouseStock);

  if (plan.remainingTotal === 0) {
    return { ok: false, status: "Təhvil verilib", reason: "Sifarişin bütün məhsulları təhvil verilib.", issues: [], plan };
  }

  const issues = plan.lines
    .filter((line) => line.shortage > 0)
    .map(
      (line) =>
        `${line.product}: anbarda ${line.deliverable}/${line.remaining} ədəd var — ${line.shortage} ədəd təchizat gözlənilir (backorder)`,
    );

  if (plan.deliverableTotal === 0) {
    return {
      ok: false,
      status: "Çatışmazlıq (backorder)",
      reason: issues[0] || "Anbarda təhvil üçün qalıq yoxdur.",
      issues,
      plan,
    };
  }

  if (plan.shortageTotal > 0) {
    return {
      ok: true,
      partial: true,
      status: "Qismən təhvilə hazır",
      reason: `${plan.deliverableTotal}/${plan.remainingTotal} ədəd indi təhvil verilə bilər, ${plan.shortageTotal} ədəd backorder qalır.`,
      issues,
      plan,
    };
  }

  return {
    ok: true,
    partial: false,
    status: "Təhvilə hazır",
    reason: "Bütün qalan məhsullar anbardadır və çıxarıla bilər.",
    issues: [],
    plan,
  };
}

export function getDeliveryDisplayStage(order) {
  if (order?.status === "Təhvil verilib") return "Təhvil verildi";
  return "Anbarda";
}

export function getDeliveryTotalQuantity(order) {
  return normalizeOrderProductLines(order?.productLines || []).reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

export function isDeliveryQueueOrder(order) {
  const status = normalize(order?.status || "");
  const isCancelled =
    status === "cancelled" ||
    status === "canceled" ||
    status.includes("ləğv") ||
    status.includes("legv");

  return Boolean(
    order &&
      !isCancelled &&
      order.status !== "Təhvil verilib" &&
      Array.isArray(order.productLines) &&
      normalizeOrderProductLines(order.productLines).length > 0,
  );
}

export function getOrderPaymentMethod(order) {
  return order.paymentMethod || (getOrderBalance(order) > 0 ? "Qalıqlı" : "Nağd");
}

export function summarizeOrderProducts(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines
      .map((line) => `${line.product}${Number(line.qty || 1) > 1 ? ` x${Number(line.qty)}` : ""}`)
      .join(", ");
  }
  return order.products || "Cihaz qeyd edilməyib";
}

export function exportDeliveryQueueCsv(rows) {
  const headers = ["Sifariş", "Müqavilə", "Kredit", "Müştəri", "FIN", "Məhsul", "Miqdar", "Anbar", "Ödəniş", "Qalıq", "Stok statusu", "Qeyd"];
  const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csvRows = rows.map((order) => [
    order.orderNo || order.id,
    order.contractId || "",
    order.creditId || "",
    order.customer,
    order.fin || "",
    summarizeOrderProducts(order),
    order.deliveryQty || getDeliveryTotalQuantity(order),
    order.warehouseName || "",
    order.paymentStatus || getOrderPaymentMethod(order),
    getOrderBalance(order),
    order.stockCheck?.status || getDeliveryStockCheck(order).status,
    order.stockCheck?.reason || "",
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tehvil-reyestri-${toLocalIsoDate()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function OrderProductLines({ lines }) {
  return (
    <div className="order-product-lines">
      {lines.map((line) => (
        <span key={`${line.product}-${line.qty}`}>
          {line.product} <strong>x{line.qty}</strong>
          {Array.isArray(line.serials) && line.serials.length > 0 && (
            <small>{line.serials.join(", ")}</small>
          )}
        </span>
      ))}
    </div>
  );
}

export function getOrderBalance(order) {
  return Math.max(0, Number(order.amount || 0) - Number(order.paid || 0));
}

export function normalizeOrderProductLines(rows = []) {
  return rows
    .filter((row) => row?.product)
    .map((row) => ({
      product: String(row.product || "").trim(),
      qty: Math.max(1, Math.round(Number(row.qty || 1))),
      price: Math.max(0, Number(row.price || 0)),
      serials: Array.isArray(row.serials) ? row.serials.filter(Boolean) : [],
    }));
}

export function getDeliveryPlan(order, warehouseStock = {}) {
  const productLines = normalizeOrderProductLines(order?.productLines || []);
  const warehouseId = order?.warehouseId;
  const rows = (warehouseId && warehouseStock?.[warehouseId]) || [];
  const deliveredMap = getDeliveredQuantities(order);
  const stockLeft = new Map();

  const lines = productLines.map((line) => {
    const ordered = Number(line.qty || 0);
    const delivered = Math.min(ordered, deliveredMap.get(line.product) || 0);
    const remaining = Math.max(0, ordered - delivered);
    const item = rows.find((row) => row.product === line.product);
    if (!stockLeft.has(line.product)) {
      stockLeft.set(line.product, Math.max(0, Number(item?.total || 0)));
    }
    const physical = stockLeft.get(line.product);
    const deliverable = Math.max(0, Math.min(remaining, physical));
    stockLeft.set(line.product, physical - deliverable);
    return {
      product: line.product,
      price: Number(line.price || 0),
      ordered,
      delivered,
      remaining,
      physical,
      deliverable,
      shortage: Math.max(0, remaining - deliverable),
      hasStockRow: Boolean(item),
    };
  });

  const orderedTotal = lines.reduce((sum, line) => sum + line.ordered, 0);
  const deliveredTotal = lines.reduce((sum, line) => sum + line.delivered, 0);
  const remainingTotal = lines.reduce((sum, line) => sum + line.remaining, 0);
  const deliverableTotal = lines.reduce((sum, line) => sum + line.deliverable, 0);
  const shortageTotal = lines.reduce((sum, line) => sum + line.shortage, 0);

  return {
    lines,
    orderedTotal,
    deliveredTotal,
    remainingTotal,
    deliverableTotal,
    shortageTotal,
    partial: deliverableTotal > 0 && shortageTotal > 0,
    complete: remainingTotal === 0,
  };
}

export function getDeliveredQuantities(order) {
  const raw = order?.deliveredQuantities;
  const map = new Map();
  if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([product, qty]) => {
      map.set(String(product), Math.max(0, Number(qty || 0)));
    });
  }
  return map;
}

// Qismən təhvil planı: hər sətir üçün nə qədəri anbardan verilə bilər, nə qədəri backorder qalır.

export function getDeliveryStageIndex(order) {
  return Math.max(0, stages.indexOf(order.status));
}

export function getDeliveryAgeDays(order) {
  const orderDate = parsePaymentDate(order.date);
  const today = parsePaymentDate(baseDeliveryDate);
  if (!orderDate || !today) return 0;
  return Math.max(0, daysBetween(orderDate, today));
}

export function getDeliveryRisk(order) {
  if (order.status === "Təhvil verilib") return "Tamamlandı";
  if (getDeliveryStageIndex(order) >= 2 && (!order.driver || order.driver === "—")) return "Sürücü yoxdur";
  if (order.status === "Təhvilə çıxıb" || order.status === "Hazırdır") return "Bu gün prioritet";
  if (getDeliveryAgeDays(order) >= 6) return "Gecikmə riski";
  return "Normal";
}

export function getOrderDeliveryStatus(order) {
  if (order.status === "Təhvil verilib") return "Təhvil verilib";
  return order.deliveryStatus || "Təhvil gözləyir";
}

export const baseDeliveryDate = currentBusinessDate;


