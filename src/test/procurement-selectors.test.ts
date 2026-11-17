import { describe, expect, it } from "vitest";
import {
  buildAcceptedByLine,
  buildInvoicedByLine,
  buildInvoiceTotals,
  buildPaymentByPo,
  buildPoMetrics,
  buildProcurementStats,
  filterInvoices,
  filterPurchaseOrders,
  filterVendors,
} from "../modules/procurement/procurementSelectors.ts";
import { groupBy } from "../modules/procurement/procurementShared.jsx";

const purchaseOrders = [
  { id: "PO1", po_number: "PO-001", vendor_id: "V1", status: "approved" },
  { id: "PO2", po_number: "PO-002", vendor_id: "V2", status: "cancelled", vendors: { name: "Beta" } },
  { id: "PO3", po_number: "PO-003", vendor_id: "V1", status: "draft" },
];
const poLines = [
  { id: "L1", po_id: "PO1", qty_ordered: 10, unit_price: 5, tax_rate: 18 },
  { id: "L2", po_id: "PO1", qty_ordered: 4, unit_price: 10, tax_rate: 0 },
  { id: "L3", po_id: "PO2", qty_ordered: 1, unit_price: 100, tax_rate: 0 },
];
const receiptLines = [
  { po_line_id: "L1", qty_received: 6, qty_rejected: 1 },
  { po_line_id: "L1", qty_received: 2, qty_rejected: 5 },
  { po_line_id: "L2", qty_received: "4", qty_rejected: 0 },
];
const invoiceLines = [
  { invoice_id: "I1", po_line_id: "L1", qty_invoiced: 5, unit_price: 5, tax_rate: 18 },
  { invoice_id: "I2", po_line_id: "L2", qty_invoiced: 4, unit_price: 10, tax_rate: 0 },
];
const invoices = [
  { id: "I1", po_id: "PO1", invoice_number: "INV-1", status: "paid", vendors: { name: "Alfa" } },
  { id: "I2", po_id: "PO1", invoice_number: "INV-2", status: "exception" },
  { id: "I3", po_id: "PO2", invoice_number: "INV-3", status: "cancelled" },
];
const vendors = [{ id: "V1", name: "Alfa MMC", tax_id: "1234" }, { id: "V2", name: "Beta" }];

describe("procurement selectors", () => {
  it("sums accepted and invoiced quantities per PO line, never counting negative acceptance", () => {
    expect([...buildAcceptedByLine(receiptLines)]).toEqual([["L1", 5], ["L2", 4]]);
    expect([...buildInvoicedByLine(invoiceLines)]).toEqual([["L1", 5], ["L2", 4]]);
  });

  it("builds PO totals, quantities and receipt progress", () => {
    const metrics = buildPoMetrics(purchaseOrders, groupBy(poLines, "po_id"), buildAcceptedByLine(receiptLines), buildInvoicedByLine(invoiceLines));
    expect(metrics.get("PO1")).toEqual({ total: 99, ordered: 14, received: 9, invoiced: 9, lineCount: 2, progress: 64 });
    expect(metrics.get("PO3")).toEqual({ total: 0, ordered: 0, received: 0, invoiced: 0, lineCount: 0, progress: 0 });
  });

  it("totals invoices and splits billed vs paid per PO, skipping cancelled invoices", () => {
    const totals = buildInvoiceTotals(invoices, groupBy(invoiceLines, "invoice_id"));
    expect([...totals]).toEqual([["I1", 29.5], ["I2", 40], ["I3", 0]]);
    const payments = buildPaymentByPo(invoices, totals, [{ po_id: "PO1", amount: "10" }, { po_id: "PO3", amount: 5 }]);
    expect(payments.get("PO1")).toEqual({ billed: 69.5, paid: 39.5 });
    expect(payments.get("PO2")).toBeUndefined();
    expect(payments.get("PO3")).toEqual({ billed: 0, paid: 5 });
  });

  it("filters vendors, POs and invoices by query and status", () => {
    expect(filterVendors(vendors, "1234").map((vendor) => vendor.id)).toEqual(["V1"]);
    expect(filterVendors(vendors, "").length).toBe(2);
    expect(filterPurchaseOrders(purchaseOrders, "all", "alfa", vendors).map((po) => po.id)).toEqual(["PO1", "PO3"]);
    expect(filterPurchaseOrders(purchaseOrders, "draft", "", vendors).map((po) => po.id)).toEqual(["PO3"]);
    expect(filterInvoices(invoices, "all", "INV-2").map((invoice) => invoice.id)).toEqual(["I2"]);
    // Current behaviour: az-AZ lower-casing turns "I" into dotless "ı", so a lower-case "inv" does not find "INV-2".
    expect(filterInvoices(invoices, "all", "inv-2")).toEqual([]);
    expect(filterInvoices(invoices, "paid", "").map((invoice) => invoice.id)).toEqual(["I1"]);
  });

  it("counts open POs, waiting receipts, exceptions and non-cancelled spend", () => {
    const metrics = buildPoMetrics(purchaseOrders, groupBy(poLines, "po_id"), buildAcceptedByLine(receiptLines), buildInvoicedByLine(invoiceLines));
    const stats = buildProcurementStats(purchaseOrders, invoices, metrics);
    expect(stats.openPo.map((po) => po.id)).toEqual(["PO1", "PO3"]);
    expect(stats.waitingReceipt.map((po) => po.id)).toEqual(["PO1"]);
    expect(stats.exceptions.map((invoice) => invoice.id)).toEqual(["I2"]);
    expect(stats.approvedSpend).toBe(99);
  });
});
