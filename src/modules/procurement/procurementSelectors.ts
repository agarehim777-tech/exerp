// Satınalma səhifəsinin hesablanan dəyərləri: qəbul/faktura miqdarı (PO sətri üzrə), PO metrikaları (məbləğ, sifariş,
// qəbul, faktura, irəliləyiş), faktura cəmləri, PO üzrə hesablanan/ödənilən məbləğ, siyahı filtrləri və panel statistikası.
// ProcurementPage.jsx bunları useMemo içində eyni asılılıqlarla çağırır; məntiqi burada dəyişin.
import { lineAmount, matchesQuery, toNumber } from "./procurementShared.jsx";
import { vendorInvoiceTotal } from "./procurementMath.js";

type Row = Record<string, any>;

export interface PoMetrics {
  total: number;
  ordered: number;
  received: number;
  invoiced: number;
  lineCount: number;
  progress: number;
}

export interface ProcurementStats {
  openPo: Row[];
  waitingReceipt: Row[];
  exceptions: Row[];
  approvedSpend: number;
}

export function buildAcceptedByLine(receiptLines: Row[]): Map<unknown, number> {
  const map = new Map();
  receiptLines.forEach((line) => {
    const accepted = Math.max(0, toNumber(line.qty_received) - toNumber(line.qty_rejected));
    map.set(line.po_line_id, (map.get(line.po_line_id) || 0) + accepted);
  });
  return map;
}

export function buildInvoicedByLine(invoiceLines: Row[]): Map<unknown, number> {
  const map = new Map();
  invoiceLines.forEach((line) => {
    map.set(line.po_line_id, (map.get(line.po_line_id) || 0) + toNumber(line.qty_invoiced));
  });
  return map;
}

export function buildPoMetrics(
  purchaseOrders: Row[],
  linesByPo: Map<unknown, Row[]>,
  acceptedByLine: Map<unknown, number>,
  invoicedByLine: Map<unknown, number>,
): Map<unknown, PoMetrics> {
  const map = new Map();
  purchaseOrders.forEach((po) => {
    const lines = linesByPo.get(po.id) || [];
    const total = lines.reduce((sum, line) => sum + lineAmount(line), 0);
    const ordered = lines.reduce((sum, line) => sum + toNumber(line.qty_ordered), 0);
    const received = lines.reduce((sum, line) => sum + (acceptedByLine.get(line.id) || 0), 0);
    const invoiced = lines.reduce((sum, line) => sum + (invoicedByLine.get(line.id) || 0), 0);
    map.set(po.id, {
      total,
      ordered,
      received,
      invoiced,
      lineCount: lines.length,
      progress: ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0,
    });
  });
  return map;
}

export function buildInvoiceTotals(invoices: Row[], invoiceLinesByInvoice: Map<unknown, Row[]>): Map<unknown, number> {
  const map = new Map();
  invoices.forEach((invoice) => {
    const lines = invoiceLinesByInvoice.get(invoice.id) || [];
    map.set(invoice.id, vendorInvoiceTotal(lines));
  });
  return map;
}

export function buildPaymentByPo(invoices: Row[], invoiceTotals: Map<unknown, number>, poPayments: Row[]): Map<unknown, { billed: number; paid: number }> {
  const map = new Map();
  invoices.forEach((invoice) => {
    if (!invoice.po_id || invoice.status === "cancelled") return;
    const amount = invoiceTotals.get(invoice.id) || 0;
    const current = map.get(invoice.po_id) || { billed: 0, paid: 0 };
    current.billed += amount;
    if (invoice.status === "paid") current.paid += amount;
    map.set(invoice.po_id, current);
  });
  poPayments.forEach((payment) => {
    const current = map.get(payment.po_id) || { billed: 0, paid: 0 };
    current.paid += toNumber(payment.amount);
    map.set(payment.po_id, current);
  });
  return map;
}

export function filterVendors(vendors: Row[], query: string): Row[] {
  return vendors.filter((vendor) => matchesQuery([vendor.name, vendor.tax_id, vendor.email, vendor.phone], query));
}

export function filterPurchaseOrders(purchaseOrders: Row[], poStatus: string, query: string, vendors: Row[]): Row[] {
  return purchaseOrders.filter((po) => {
    const statusOk = poStatus === "all" || po.status === poStatus;
    const vendorName = po.vendors?.name || vendors.find((vendor) => vendor.id === po.vendor_id)?.name;
    return statusOk && matchesQuery([po.po_number, vendorName, po.status, po.notes], query);
  });
}

export function filterInvoices(invoices: Row[], invoiceStatus: string, query: string): Row[] {
  return invoices.filter((invoice) => {
    const statusOk = invoiceStatus === "all" || invoice.status === invoiceStatus;
    return statusOk && matchesQuery([invoice.invoice_number, invoice.vendors?.name, invoice.purchase_orders?.po_number, invoice.status], query);
  });
}

export function buildProcurementStats(purchaseOrders: Row[], invoices: Row[], poMetrics: Map<unknown, PoMetrics>): ProcurementStats {
  const openPo = purchaseOrders.filter((po) => ["draft", "approved", "partial"].includes(po.status));
  const waitingReceipt = purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status));
  const exceptions = invoices.filter((invoice) => invoice.status === "exception");
  const approvedSpend = purchaseOrders
    .filter((po) => po.status !== "cancelled")
    .reduce((sum, po) => sum + (poMetrics.get(po.id)?.total || 0), 0);
  return { openPo, waitingReceipt, exceptions, approvedSpend };
}
