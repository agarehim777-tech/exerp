// Kredit reyestri: satışdan yaranan kreditlər (DB kontrakt sahələri brauzer proyeksiyasından üstündür), manual kreditlər,
// risk balı/səviyyəsi və gecikmə qrupları üzrə yaşlanma. appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { normalize } from "../../services/format.js";
import { summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { buildCreditPlan, isCreditClosed } from "./credit.js";

type Row = Record<string, any>;

export interface CreditRecord extends Row {
  id: string;
  orderId: unknown;
  salesSource: true;
  total: number;
  initialPayment: number;
  balance: number;
  months: number;
  paidMonths: number;
  status: string;
}

export interface CreditRiskRow extends Row {
  riskScore: number;
  riskLevel: string;
  bucket: string;
  recommendedAction: string;
}

export interface CreditAgingBucket {
  bucket: string;
  count: number;
  amount: number;
  balance: number;
}

function getCreditIdForOrder(order: Row): string {
  return order.creditId || `KR-${String(order.id || "").replace(/\D/g, "")}`;
}

function buildSalesCreditRecord(order: Row, storedCredit?: Row): CreditRecord {
  if (order._source === "db") {
    const installments = order.creditInstallments || [];
    const next = installments.find((row: Row) => row.amount > 0);
    const startDate = order.creditStartDate || null;
    const status = normalize(order.creditStatus);
    // Canonical contract fields must win over stale browser/collection projections.
    storedCredit = { ...storedCredit, id: order.creditId, date: order.date, balance: order.creditBalance,
      initialPaid: order.initialPaid, requiredInitial: order.requiredInitial,
      startDate, startedAt: startDate,
      status: status === "closed" ? "Tamamlandı" : !startDate || ["draft", "pending"].includes(status)
        ? "Başlanmamış" : status === "overdue" ? "Gecikmiş" : "Aktiv",
      installments, payments: [],
      paidMonths: installments.filter((row: Row) => row.amount <= 0).length,
      monthly: next?.amount ?? 0, lastPayment: installments.at(-1)?.amount ?? 0,
      next: next?.due || "—",
      rate: installments.length ? Math.round(installments.filter((row: Row) => row.amount <= 0).length / installments.length * 100) : 0,
    };
  }
  const totalAmount = Number(order.creditPrincipal ?? order.amount ?? storedCredit?.total ?? 0);
  const initialPayment = Number(order.initialPayment ?? order.paid ?? storedCredit?.initialPayment ?? 0);
  const months = Number(order.creditMonths || storedCredit?.months || 12);
  const basePlan = buildCreditPlan({ total: totalAmount, initialPayment, months });
  const productSummary = summarizeOrderProducts(order);
  const balance = Number(storedCredit?.balance ?? order.creditBalance ?? basePlan.balance);
  const paidMonths = Number(storedCredit?.paidMonths ?? (balance <= 0 ? months : 0));
  // Satışdan gələn kredit təhvildən sonra əl ilə başladılır: başlanma tarixi
  // təyin edilməyibsə, kredit "Başlanmamış" statusunda gözləyir.
  const isStarted = Boolean(storedCredit?.startedAt || storedCredit?.startDate);
  const status = isCreditClosed({ ...(storedCredit || {}), balance, paidMonths, months }, { ...basePlan, balance })
    ? "Tamamlandı"
    : storedCredit?.status || (isStarted ? "Aktiv" : "Başlanmamış");

  return {
    ...(storedCredit || {}),
    id: storedCredit?.id || getCreditIdForOrder(order),
    salesSource: true,
    // An opening-balance credit (import_opening_balances) has no sale order to link to.
    openingBalance: Boolean(order.openingBalance),
    createdFrom: order.openingBalance ? "Başlanğıc qalıq" : "Satış modulu",
    orderId: order.openingBalance ? null : order.id,
    orderNo: order.openingBalance ? null : order.orderNo || order.order_no || order.id,
    date: storedCredit?.date || order.date || order.deliveryDate || null,
    customer: order.customer,

    fin: order.fin,
    contractId: order.contractId || storedCredit?.contractId || `MQ-${order.id}`,
    product: productSummary,
    device: productSummary,
    productLines: order.productLines || [],
    seller: order.seller,
    warehouseName: order.warehouseName,
    total: totalAmount,
    initialPayment,
    requiredInitial: Number(order.requiredInitial ?? storedCredit?.requiredInitial ?? initialPayment),
    initialPaid: Number(order.initialPaid ?? storedCredit?.initialPaid ?? order.paid ?? 0),
    balance,
    monthly: storedCredit?.monthly ?? order.creditMonthly ?? basePlan.monthly,
    lastPayment: storedCredit?.lastPayment ?? order.creditLastPayment ?? basePlan.lastPayment,
    months,
    paidMonths,
    rate: storedCredit?.rate ?? 0,
    startedAt: storedCredit?.startedAt ?? (isStarted ? storedCredit?.startedAt : null),
    startDate: storedCredit?.startDate ?? (isStarted ? storedCredit?.startDate : null),
    next: isStarted ? storedCredit?.next || basePlan.installments[0]?.due || "—" : "—",
    status,
    installments: storedCredit?.installments || basePlan.installments,
    payments: storedCredit?.payments || [],
  };
}

function buildSalesCreditRecords(orders: Row[], storedCredits: Row[]): CreditRecord[] {
  const storedByOrderId = new Map(storedCredits.filter((credit) => credit.orderId).map((credit) => [credit.orderId, credit]));
  const storedById = new Map(storedCredits.map((credit) => [credit.id, credit]));

  return orders
    .filter((order) => {
      const status = normalize(order.status || "");
      return status !== "cancelled" && !status.includes("ləğv") && !status.includes("legv");
    })
    .filter((order) => order.paymentMethod === "Kredit" || order.creditId)
    .map((order) => {
      const storedCredit = storedByOrderId.get(order.id) || storedById.get(order.creditId) || storedById.get(getCreditIdForOrder(order));
      return buildSalesCreditRecord(order, storedCredit);
    });
}

function buildAllCreditRecords(orders: Row[], storedCredits: Row[]): Row[] {
  const salesRecords = buildSalesCreditRecords(orders, storedCredits);
  const salesRecordIds = new Set(salesRecords.map((credit) => credit.id));
  const salesOrderIds = new Set(salesRecords.map((credit) => credit.orderId).filter(Boolean));
  const manualRecords = storedCredits.filter((credit) => {
    if (salesRecordIds.has(credit.id)) return false;
    if (credit.orderId && salesOrderIds.has(credit.orderId)) return false;
    // Satışdan yaranmış kreditin bağlı sifarişi artıq mövcud deyilsə, onu
    // manual kredit kimi göstərmək olmaz. Bu, silinmiş sifarişlərin kredit
    // modulunda təkrar/orphan qeyd kimi qalmasının qarşısını alır.
    if (credit.orderId) return false;
    if (credit.salesSource) return false;
    const source = normalize(credit.createdFrom || "");
    if (source.includes("satış") || source.includes("satis")) return false;
    return true;
  });

  return [...salesRecords, ...manualRecords];
}

function buildCreditRiskRows(enrichedCredits: Row[]): CreditRiskRow[] {
  return enrichedCredits
    .map((item) => {
      const overdueDays = Number(item.paymentState.daysOverdue || 0);
      const balance = Number(item.plan.balance || 0);
      const monthly = Number(item.paymentState.nextInstallment?.amount || item.plan.monthly || 0);
      const score = Math.min(
        100,
        Math.round(overdueDays * 4 + balance / 150 + monthly / 40 + (item.paymentState.isOverdue ? 22 : 0)),
      );
      const level = score >= 75 ? "Yüksək risk" : score >= 45 ? "Nəzarət" : "Sağlam";
      const bucket =
        overdueDays === 0 ? "Vaxtında" : overdueDays <= 7 ? "1-7 gün" : overdueDays <= 30 ? "8-30 gün" : "30+ gün";

      return {
        ...item,
        riskScore: score,
        riskLevel: level,
        bucket,
        recommendedAction:
          level === "Yüksək risk"
            ? "Kollektor zəngi + restruktur təklifi"
            : level === "Nəzarət"
              ? "SMS və ödəmə linki"
              : "Avtomatik xatırlatma",
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

function buildCreditAgingBuckets(riskRows: Row[]): CreditAgingBucket[] {
  const buckets = ["Vaxtında", "1-7 gün", "8-30 gün", "30+ gün"];
  return buckets.map((bucket) => {
    const rows = riskRows.filter((row) => row.bucket === bucket);
    return {
      bucket,
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row.paymentState.nextInstallment?.amount || 0), 0),
      balance: rows.reduce((sum, row) => sum + Number(row.plan.balance || 0), 0),
    };
  });
}

export {
  getCreditIdForOrder,
  buildSalesCreditRecord,
  buildSalesCreditRecords,
  buildAllCreditRecords,
  buildCreditRiskRows,
  buildCreditAgingBuckets,
};
