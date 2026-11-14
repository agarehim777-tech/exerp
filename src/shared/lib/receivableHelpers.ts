// Debitor/kreditor reyestri: müştəri borcları, qalıqlı sifarişlər, kredit qalıqları və vendor PO öhdəlikləri,
// yaşlanma qrupu, risk kateqoriyası, kolleksiya statusu və növbəti addım ilə.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { normalize } from "../../services/format.js";
import { parsePaymentDate } from "../../services/date.js";
import { getOrderBalance, getOrderPaymentMethod, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { currentBusinessDate } from "./businessDate.ts";
import { getCreditOrder, getCustomerOrders, getCustomerRelatedCredits } from "./appDomainSales.jsx";
import { addDays, daysBetween, getCreditDisplayPlan, getCreditPaymentState, isCreditClosed } from "./credit.js";

type Row = Record<string, any>;

export type ReceivableType = "Debitor" | "Kreditor";

export interface ReceivableRow {
  id: string;
  type: ReceivableType;
  party: unknown;
  source: unknown;
  sourceType: "credit" | "manual" | "order" | "vendor";
  sourceTypeLabel: string;
  amount: number;
  overdueDays: number;
  owner: unknown;
  status: unknown;
  detail: string;
  closingMode: "cash-in" | "cash-out";
  orderBalance?: number;
  creditBalance?: number;
  customerDebt?: number;
  orderIds?: unknown[];
  openOrderIds?: unknown[];
  creditIds?: unknown[];
  contractIds?: unknown[];
  poIds?: unknown[];
}

export interface EnrichedReceivableRow extends ReceivableRow {
  agingBucket: string;
  riskCategory: string;
  collectionStatus: string;
  nextAction: string;
}

interface RiskInput {
  amount?: unknown;
  overdueDays?: unknown;
  type?: string;
}

function getReceivableAgingBucket(days: unknown = 0): string {
  const value = Math.max(0, Number(days || 0));
  if (value === 0) return "Cari";
  if (value <= 30) return "1-30 gün";
  if (value <= 60) return "31-60 gün";
  if (value <= 90) return "61-90 gün";
  return "90+ gün";
}

function getReceivableRiskCategory({ amount = 0, overdueDays = 0, type = "Debitor" }: RiskInput): string {
  const value = Number(amount || 0);
  const days = Number(overdueDays || 0);
  if (value <= 0) return "Bağlı";
  if (days > 90 || value >= 10000) return "Kritik";
  if (days > 30 || value >= 5000) return "Yüksək";
  if (days > 0 || value >= 1500 || type === "Kreditor") return "Nəzarət";
  return "Sağlam";
}

function getReceivableCollectionStatus({ amount = 0, overdueDays = 0, type = "Debitor" }: RiskInput): string {
  const value = Number(amount || 0);
  const days = Number(overdueDays || 0);
  if (value <= 0) return "Bağlandı";
  if (type === "Kreditor") return days > 0 ? "Ödəniş prioriteti" : "Ödəniş planı";
  if (days > 90) return "Hüquqi eskalasiya";
  if (days > 30) return "Eskalasiyada";
  if (days > 7) return "Kolleksiyada";
  if (days > 0) return "Xatırlatma";
  return "İzləmədə";
}

function getReceivableNextAction(row: RiskInput): string {
  if (Number(row.amount || 0) <= 0) return "Arxivdə saxla";
  if (row.type === "Kreditor") {
    return Number(row.overdueDays || 0) > 0 ? "Vendor ödənişini bağla" : "Ödəniş tarixini təsdiqlə";
  }
  if (Number(row.overdueDays || 0) > 90) return "Hüquqi mərhələyə ötür";
  if (Number(row.overdueDays || 0) > 30) return "Menecer eskalasiyası";
  if (Number(row.overdueDays || 0) > 7) return "Kollektor zəngi";
  if (Number(row.overdueDays || 0) > 0) return "SMS xatırlatma";
  return "Planlı izləmə";
}

function enrichReceivableRow<T extends RiskInput>(row: T): T & Omit<EnrichedReceivableRow, keyof ReceivableRow> {
  const agingBucket = getReceivableAgingBucket(row.overdueDays);
  const riskCategory = getReceivableRiskCategory(row);
  const collectionStatus = getReceivableCollectionStatus(row);
  return {
    ...row,
    agingBucket,
    riskCategory,
    collectionStatus,
    nextAction: getReceivableNextAction({ ...row, agingBucket, riskCategory, collectionStatus } as RiskInput),
  };
}

const isPayable = (po: Row) => {
  const status = normalize(po.status);
  return !status.includes("ödən") && !status.includes("oden") && !status.includes("imtina") && !status.includes("cancel");
};

interface ReceivableSources {
  customers?: Row[];
  orders?: Row[];
  credits?: Row[];
  vendors?: Row[];
  purchaseOrders?: Row[];
}

function buildReceivableRows({ customers = [], orders = [], credits = [], vendors = [], purchaseOrders = [] }: ReceivableSources): EnrichedReceivableRow[] {
  const matchedCreditIds = new Set<unknown>();

  const createCreditDebtRow = (credit: Row, customer: Row | null = null): EnrichedReceivableRow | null => {
    const plan = getCreditDisplayPlan(credit);
    const balance = Number(plan.balance || 0);
    if (balance <= 0 || isCreditClosed(credit, plan)) return null;

    const paymentState = getCreditPaymentState(credit, plan);
    const relatedOrder = getCreditOrder(credit, orders);
    const device = credit.device || credit.product || relatedOrder?.products || "Cihaz qeyd edilməyib";

    return enrichReceivableRow<ReceivableRow>({
      id: `DB-CR-${credit.id}`,
      type: "Debitor",
      party: customer?.name || credit.customer || "Müştəri qeyd edilməyib",
      source: credit.contractId || credit.id,
      sourceType: "credit",
      sourceTypeLabel: "Kredit müqaviləsi",
      amount: balance,
      orderBalance: 0,
      creditBalance: balance,
      customerDebt: 0,
      overdueDays: Number(paymentState.daysOverdue || 0),
      owner: credit.seller || relatedOrder?.sellerBonuses?.[0]?.seller || relatedOrder?.seller || "Kredit",
      status: paymentState.isOverdue ? "Gecikmə" : "Aktiv",
      detail: `${credit.id} · ${device} · ${plan.months} ay`,
      orderIds: credit.orderId ? [credit.orderId] : [],
      openOrderIds: [],
      creditIds: [credit.id],
      contractIds: [credit.contractId].filter(Boolean),
      closingMode: "cash-in",
    });
  };

  const customerRows = customers.flatMap((customer) => {
    const relatedOrders: Row[] = getCustomerOrders(customer, orders);
    const relatedCredits: Row[] = getCustomerRelatedCredits(customer, credits);
    const rows: EnrichedReceivableRow[] = [];
    const manualDebt = Math.max(0, Number(customer.debt || 0));

    if (manualDebt > 0) {
      rows.push(
        enrichReceivableRow<ReceivableRow>({
          id: `DB-CUST-${customer.fin || normalize(customer.name)}`,
          type: "Debitor",
          party: customer.name,
          source: customer.fin || customer.name,
          sourceType: "manual",
          sourceTypeLabel: "Manual borc",
          amount: manualDebt,
          orderBalance: 0,
          creditBalance: 0,
          customerDebt: manualDebt,
          overdueDays: Number(customer.delay || 0),
          owner: "CRM",
          status: Number(customer.delay || 0) > 0 ? "Gecikmə" : "Aktiv",
          detail: "Müştəri kartındakı ayrıca borc",
          orderIds: [],
          openOrderIds: [],
          creditIds: [],
          contractIds: [],
          closingMode: "cash-in",
        }),
      );
    }

    relatedOrders
      .filter((order) => getOrderPaymentMethod(order) !== "Kredit" && !order.creditId)
      .forEach((order) => {
        const balance = getOrderBalance(order);
        if (balance <= 0) return;

        const dueDate = parsePaymentDate(order.dueDate) || addDays(order.date || currentBusinessDate, 7);
        const today = parsePaymentDate(currentBusinessDate);
        const overdueDays = dueDate && today ? Math.max(0, daysBetween(dueDate, today)) : 0;

        rows.push(
          enrichReceivableRow<ReceivableRow>({
            id: `DB-ORD-${order.id}`,
            type: "Debitor",
            party: customer.name,
            source: order.id,
            sourceType: "order",
            sourceTypeLabel: "Nağd/qalıqlı sifariş",
            amount: balance,
            orderBalance: balance,
            creditBalance: 0,
            customerDebt: 0,
            overdueDays,
            owner: order.sellerBonuses?.[0]?.seller || order.seller || "Satış",
            status: overdueDays > 0 ? "Gecikmə" : "Aktiv",
            detail: `${order.id} · ${summarizeOrderProducts(order)}`,
            orderIds: [order.id],
            openOrderIds: [order.id],
            creditIds: [],
            contractIds: [],
            closingMode: "cash-in",
          }),
        );
      });

    relatedCredits.forEach((credit) => {
      matchedCreditIds.add(credit.id);
      const row = createCreditDebtRow(credit, customer);
      if (row) rows.push(row);
    });

    return rows;
  });

  const orphanCreditRows = credits
    .filter((credit) => !matchedCreditIds.has(credit.id))
    .map((credit) => createCreditDebtRow(credit))
    .filter((row): row is EnrichedReceivableRow => Boolean(row));

  const vendorRows = vendors.flatMap((vendor) => {
    const vendorPos = (purchaseOrders || []).filter((po) => po.vendor === vendor.name);
    const payablePos = vendorPos.filter(isPayable);
    const pendingAmount = payablePos.reduce((sum, po) => sum + Number(po.amount || 0), 0);
    const latestPo = vendorPos[0];
    const today = parsePaymentDate(currentBusinessDate);
    const overdueDays = Math.max(
      vendor.status !== "Aktiv" && pendingAmount > 0 ? 5 : 0,
      ...payablePos.map((po) => {
        const dueDate = parsePaymentDate(po.paymentDueDate || po.expectedAt) || addDays(po.date || currentBusinessDate, 30);
        return dueDate && today ? Math.max(0, daysBetween(dueDate, today)) : 0;
      }),
    );

    if (pendingAmount <= 0) return [];

    return [
      enrichReceivableRow<ReceivableRow>({
        id: `CR-${vendor.name}`,
        type: "Kreditor",
        party: vendor.name,
        source: vendor.country,
        sourceType: "vendor",
        sourceTypeLabel: "Vendor/PO",
        amount: pendingAmount,
        overdueDays,
        owner: "Vendor/Maliyyə",
        status: pendingAmount > 0 ? "Ödəniş gözləyir" : vendor.status,
        detail: latestPo ? `${vendorPos.length} PO · son: ${latestPo.id}` : `${vendor.sku} SKU · PO yoxdur`,
        poIds: payablePos.map((po) => po.id),
        closingMode: "cash-out",
      }),
    ];
  });

  return [...customerRows, ...orphanCreditRows, ...vendorRows].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
}

export {
  getReceivableAgingBucket,
  getReceivableRiskCategory,
  getReceivableCollectionStatus,
  getReceivableNextAction,
  enrichReceivableRow,
  buildReceivableRows,
};
