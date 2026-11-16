// Satış sifarişi köməkçiləri: satıcı bonus sətirləri, sətir cəmi və imzası, sifarişdən kredit qeydinin qurulması
// (ödənilmiş əsas borc kredit planına tətbiq olunur). appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { normalizeOrderProductLines, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { applyCreditPrincipalPayment, buildCreditPlan, isCreditClosed } from "./credit.js";
import { getCreditIdForOrder } from "./creditRecordHelpers.ts";

type Row = Record<string, any>;

export interface SellerBonusRow {
  seller: string;
  bonus: number;
}

function buildSellerBonusRows(rows: Row[] = []): SellerBonusRow[] {
  return rows
    .filter((row) => row?.seller)
    .slice(0, 3)
    .map((row) => ({
      seller: row.seller,
      bonus: Math.max(0, Number(row.bonus || 0)),
    }));
}

function summarizeSellerBonusRows(rows: Row[] = []): string {
  return buildSellerBonusRows(rows)
    .map((row) => `${row.seller} ${Number(row.bonus || 0)}%`)
    .join(", ");
}

function calculateOrderLineTotal(productLines: Row[] = []): number {
  return normalizeOrderProductLines(productLines).reduce(
    (sum: number, line: Row) => sum + Number(line.qty || 0) * Number(line.price || 0),
    0,
  );
}

function productLineSignature(productLines: Row[] = []): string {
  return normalizeOrderProductLines(productLines)
    .map((line: Row) => `${line.product}:${line.qty}:${line.price}`)
    .join("|");
}

function buildSalesCreditForOrder(order: Row, storedCredit?: Row | null): Row {
  const totalAmount = Number(order.amount || 0);
  const initialPayment = Number(order.initialPayment || 0);
  const months = Number(order.creditMonths || storedCredit?.months || 12);
  const creditPlan = buildCreditPlan({ total: totalAmount, initialPayment, months });
  const payments = Array.isArray(storedCredit?.payments) ? storedCredit.payments : [];
  const installments = creditPlan.installments.map((installment: Row, index: number) => ({
    ...installment,
    due: storedCredit?.installments?.[index]?.due || installment.due,
  }));
  const baseCredit = {
    ...(storedCredit || {}),
    id: order.creditId || storedCredit?.id || getCreditIdForOrder(order),
    salesSource: true,
    createdFrom: "Satış modulu",
    orderId: order.id,
    orderNo: order.orderNo || order.order_no || order.id,
    contractId: order.contractId || storedCredit?.contractId || `MQ-${order.id}`,
    customer: order.customer,
    fin: order.fin,
    product: summarizeOrderProducts(order),
    device: summarizeOrderProducts(order),
    productLines: order.productLines || [],
    seller: order.seller,
    warehouseName: order.warehouseName,
    total: creditPlan.total,
    initialPayment: creditPlan.initialPayment,
    balance: creditPlan.balance,
    monthly: creditPlan.monthly,
    lastPayment: creditPlan.lastPayment,
    months: creditPlan.months,
    paidMonths: 0,
    rate: 0,
    next: installments[0]?.due || "—",
    status: storedCredit?.status || "Başlanmamış",
    startDate: storedCredit?.startDate ?? null,
    startedAt: storedCredit?.startedAt ?? null,
    installments,
    payments,
  };
  const paidPrincipal = payments.reduce((sum: number, payment: Row) => sum + Number(payment.principal || 0), 0);
  if (paidPrincipal <= 0) {
    return isCreditClosed(storedCredit || baseCredit, { ...creditPlan, installments })
      ? { ...baseCredit, balance: 0, paidMonths: creditPlan.months, rate: 100, status: "Tamamlandı" }
      : baseCredit;
  }

  const paymentResult = applyCreditPrincipalPayment(baseCredit, paidPrincipal);
  return {
    ...baseCredit,
    balance: paymentResult.nextBalance,
    installments: paymentResult.installments,
    paidMonths: paymentResult.nextPaidMonths,
    rate: Math.round((paymentResult.nextPaidMonths / Math.max(1, creditPlan.months)) * 100),
    next: paymentResult.nextDue,
    monthly: paymentResult.nextMonthly,
    status: paymentResult.nextBalance <= 0 ? "Tamamlandı" : paymentResult.status,
  };
}

export { buildSellerBonusRows, summarizeSellerBonusRows, calculateOrderLineTotal, productLineSignature, buildSalesCreditForOrder };
