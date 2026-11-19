import { describe, expect, it, vi } from "vitest";
import { createFinanceModuleActions } from "../shared/state/financeModuleActions.ts";
import { getActionStamp } from "../shared/state/actionStamp.ts";
import { createModuleActions } from "../shared/state/moduleActions.js";
import { baseFinanceDate } from "../shared/lib/hrDomain.ts";

type Row = Record<string, any>;

function setup(overrides: Row = {}, initial: Row = {}) {
  let state: Row = { orders: [], expenses: [], taxCalendar: [], ...initial };
  const audits: Row[] = [];
  const deps = {
    accountingData: { journalRows: [{}, {}], balance: { assets: 900 }, pl: { netProfit: 120 } },
    auditCurrentState: vi.fn((next: Row, entry: Row) => { audits.push(entry); return next; }),
    invoiceRows: [],
    notify: vi.fn(),
    receivableRows: [],
    setState: vi.fn((update: (current: Row) => Row) => { state = update(state); }),
    taxCalendarRows: [],
    ...overrides,
  };
  return { deps, actions: createFinanceModuleActions(deps), audits, getState: () => state };
}

describe("finance module actions", () => {
  it("are still returned by createModuleActions", () => {
    const actions = createModuleActions({ notify: vi.fn(), invoiceRows: [] } as any);
    expect(Object.keys(actions)).toEqual(expect.arrayContaining(["getActionStamp", "runInvoiceAction", "runAccountingAction", "runTaxAction", "runReceivableSyncAction", "runApiAction"]));
    expect(actions.getActionStamp).toBe(getActionStamp);
  });

  it("formats the action stamp as an az-AZ date and time", () => {
    expect(getActionStamp()).toMatch(/^\d{2}\.\d{2}\.\d{4},? \d{2}:\d{2}$/);
  });

  it("sends the e-invoice that is ready first and marks its order", () => {
    const { actions, deps, audits, getState } = setup(
      { invoiceRows: [{ id: "F-1", orderId: "O1", invoiceSentAt: "x" }, { id: "F-2", orderId: "O2", eTaxStatus: "Göndərişə hazır", customer: "Aysel" }] },
      { orders: [{ id: "O1" }, { id: "O2" }] },
    );
    actions.runInvoiceAction();
    expect(getState().orders[0]).toEqual({ id: "O1" });
    expect(getState().orders[1]).toMatchObject({ eTaxStatus: "E-qaimə göndərildi", invoiceBatchId: expect.stringMatching(/^ETX-\d{6}$/) });
    expect(audits[0]).toMatchObject({ module: "Faktura", action: "E-qaimə göndərildi" });
    expect(deps.notify).toHaveBeenLastCalledWith("F-2 e-qaimə növbəsinə göndərildi.");
  });

  it("warns when there is no invoice to send", () => {
    const { actions, deps } = setup({ invoiceRows: [{ id: "F-1", invoiceSentAt: "x" }] });
    actions.runInvoiceAction();
    expect(deps.setState).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenLastCalledWith("Göndəriləcək faktura tapılmadı.", "warning");
  });

  it("records the accounting journal export for the finance period", () => {
    const { actions, getState } = setup();
    actions.runAccountingAction();
    expect(getState().accountingClose).toMatchObject({ period: baseFinanceDate.slice(0, 7), journalCount: 2, balance: 900, netProfit: 120 });
  });

  it("creates one tax payment expense and links it to the calendar row", () => {
    const tax = { id: "VAT-11", title: "ƏDV", period: "2026-10", status: "Bu gün", amount: 180.4, type: "ƏDV" };
    const { actions, getState, deps } = setup({ taxCalendarRows: [tax] });
    actions.runTaxAction();
    actions.runTaxAction();
    expect(getState().expenses).toEqual([expect.objectContaining({ id: "TAXPAY-VAT-11", amount: 180, category: "Vergi", status: "Təsdiq gözləyir" })]);
    expect(getState().taxCalendar).toEqual([expect.objectContaining({ id: "VAT-11", paymentStatus: "Ödəniş tapşırığı", paymentTaskId: "TAXPAY-VAT-11" })]);
    expect(deps.notify).toHaveBeenLastCalledWith("ƏDV üçün ödəniş tapşırığı maliyyəyə düşdü.");
  });

  it("summarises the receivable register", () => {
    const { actions, getState } = setup({ receivableRows: [
      { type: "Debitor", amount: 500, overdueDays: 3, riskCategory: "Kritik", agingBucket: "1-30 gün" },
      { type: "Kreditor", amount: 200, riskCategory: "Aşağı", agingBucket: "Cari" },
    ] });
    actions.runReceivableSyncAction();
    expect(getState().receivableSync).toMatchObject({ debtorTotal: 500, creditorTotal: 200, overdueCount: 1, highRiskCount: 1, rows: 2 });
    expect(getState().receivableSync.agingSummary[1]).toEqual({ bucket: "1-30 gün", count: 1, amount: 500 });
  });
});
