import { describe, expect, it } from "vitest";
import * as bridge from "../shared/lib/appDomainFinance.jsx";
import {
  EXPENSE_STATUS,
  buildAccountingCloseChecklist,
  buildDailyCashSummary,
  buildExpenseCategoryRows,
  buildFinanceLedger,
  buildFinanceScenario,
  buildInvoiceAgingRows,
  buildInvoiceControlSummary,
  buildReceivableAgingSummary,
  buildSupportTicketContext,
  expenseCashAction,
  getInstallmentStatus,
  getInvoiceAgingBucket,
  getSupportThreadId,
  hasExpenseCashImpact,
  isExpenseCancelled,
  isExpenseCashPosted,
  sortByFinanceDate,
} from "../shared/lib/financeDomain.ts";
import { currentBusinessDate } from "../shared/lib/businessDate";
import { formatDateInput } from "../services/date.js";

const shift = (days: number) => {
  const date = new Date(`${currentBusinessDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
};

describe("finance domain", () => {
  it("keeps the old appDomainFinance imports working", () => {
    expect(bridge.buildFinanceLedger).toBe(buildFinanceLedger);
    expect(bridge.EXPENSE_STATUS).toBe(EXPENSE_STATUS);
    expect(typeof bridge.CreditDetailModal).toBe("function");
  });

  it("marks the month close ready only when every check passes", () => {
    const accounting = {
      balance: { assets: 1000, liabilities: 400, equity: 600 },
      pl: { netProfit: 250 },
      cashFlow: { closing: 300 },
      journalRows: [{}],
      chartRows: [{ code: "1010", balance: 300 }],
      vatPayable: 18,
    };
    const open = buildAccountingCloseChecklist(accounting, null);
    expect(open).toMatchObject({ readyCount: 4, warningCount: 1, equationDiff: 0, cashDiff: 0, closeReady: false, retainedEarnings: 250 });
    expect(buildAccountingCloseChecklist(accounting, { period: "2026-10" }).closeReady).toBe(true);
    expect(buildAccountingCloseChecklist({ ...accounting, cashFlow: { closing: 250 } }, { period: "2026-10" }).checks[1])
      .toMatchObject({ label: "Kassa uzlaşması", status: "Yoxlanmalıdır" });
  });

  it("links a support ticket to its order, credit, customer and thread", () => {
    const ticket = { id: "T1", orderId: "O1", comments: [{ text: "ilk" }, { text: "son" }] };
    const context = buildSupportTicketContext(ticket, {
      orders: [{ id: "O1", fin: "FIN1", customer: "Aysel" }],
      credits: [{ id: "C1", orderId: "O1", contractId: "KR-1" }],
      customers: [{ fin: "FIN1", name: "Aysel" }],
      conversations: [{ id: "MSG-T1", messages: [{}, {}], preview: "salam" }],
    });
    expect(context).toMatchObject({ linkedLabel: "KR-1", commentCount: 4, latestComment: "son" });
    expect(context.credit?.id).toBe("C1");
    expect(context.customerRecord?.name).toBe("Aysel");
    expect(getSupportThreadId({ id: "T2" })).toBe("MSG-T2");
    expect(getSupportThreadId({ id: "T2", threadId: "X" })).toBe("X");
  });

  it("groups receivables and invoices into aging buckets", () => {
    expect(buildReceivableAgingSummary([{ agingBucket: "Cari", amount: 10 }, { agingBucket: "90+ gün", amount: "5" }]))
      .toEqual([
        { bucket: "Cari", count: 1, amount: 10 },
        { bucket: "1-30 gün", count: 0, amount: 0 },
        { bucket: "31-60 gün", count: 0, amount: 0 },
        { bucket: "61-90 gün", count: 0, amount: 0 },
        { bucket: "90+ gün", count: 1, amount: 5 },
      ]);
    const invoices = [
      { balance: 0, totalAmount: 100, dueDate: shift(-40) },
      { balance: 50, totalAmount: 50, dueDate: shift(3), eTaxStatus: "Göndərişə hazır" },
      { balance: 20, totalAmount: 20, dueDate: shift(-5), invoiceSentAt: "x" },
      { balance: 30, totalAmount: 30, dueDate: shift(-45) },
    ];
    expect(invoices.map(getInvoiceAgingBucket)).toEqual(["Ödənilib", "Vaxtında", "1-7 gün", "30+ gün"]);
    expect(buildInvoiceAgingRows(invoices).find((row) => row.bucket === "30+ gün")).toEqual({ bucket: "30+ gün", count: 1, balance: 30, total: 30 });
    expect(buildInvoiceControlSummary(invoices)).toEqual({
      sent: 1, ready: 1, overdueCount: 2, overdueBalance: 50, dueSoonCount: 1, dueSoonBalance: 50, openBalance: 100,
    });
  });

  it("labels installments against the business date", () => {
    expect(getInstallmentStatus({ amount: 0, due: shift(-3) })).toBe("Ödənilib");
    expect(getInstallmentStatus({ amount: 10, due: shift(-3) })).toBe("Gecikib");
    expect(getInstallmentStatus({ amount: 10, due: currentBusinessDate })).toBe("Bu gün");
    expect(getInstallmentStatus({ amount: 10, due: shift(2) })).toBe("Gözləyir");
  });

  it("summarises one cash day from the opening balance and earlier movements", () => {
    const day = "2026-11-10";
    const summary = buildDailyCashSummary([
      { date: "2026-11-09", direction: "in", amount: 100 },
      { date: "2026-11-09", direction: "out", amount: 30 },
      { date: day, direction: "in", amount: 50, penalty: 2 },
      { date: day, direction: "out", amount: 20 },
      { date: day, direction: "pending", amount: 15 },
      { date: day, direction: "accrual", amount: 7 },
    ], 1000, day);
    expect(summary).toMatchObject({
      date: day, opening: 1070, inflow: 50, outflow: 20, pendingOutflow: 15, accrual: 7, penalty: 2, closing: 1100, projectedClosing: 1085,
    });
    expect(summary.rows).toHaveLength(4);
  });

  it("maps expense statuses to cash posting and category totals", () => {
    expect(expenseCashAction(EXPENSE_STATUS.approved)).toBe("approved");
    expect(expenseCashAction(EXPENSE_STATUS.accepted)).toBe("accepted");
    expect(expenseCashAction(EXPENSE_STATUS.rejected)).toBe("cancelled");
    expect(expenseCashAction(EXPENSE_STATUS.pending)).toBeNull();
    expect(hasExpenseCashImpact({ source: "HR Payroll" })).toBe(false);
    expect(hasExpenseCashImpact({ cashImpact: false })).toBe(false);
    expect(isExpenseCashPosted({ status: EXPENSE_STATUS.approved, source: "HR Payroll" })).toBe(false);
    expect(isExpenseCancelled({ status: EXPENSE_STATUS.cancelled })).toBe(true);
    expect(buildExpenseCategoryRows([
      { category: "İcarə", amount: 100, status: EXPENSE_STATUS.approved },
      { category: "İcarə", amount: 40, status: EXPENSE_STATUS.pending },
      { category: "Nəqliyyat", amount: 300, status: EXPENSE_STATUS.rejected },
    ])).toEqual([
      { category: "Nəqliyyat", total: 300, approved: 0, pending: 0, rejected: 300 },
      { category: "İcarə", total: 140, approved: 100, pending: 40, rejected: 0 },
    ]);
  });

  it("builds a newest-first ledger from paid sales, credit cash and expenses", () => {
    const ledger = buildFinanceLedger({
      orders: [
        { id: "O1", date: "2026-11-01", paid: 200, paymentMethod: "Kart", customer: "Aysel", products: [] },
        { id: "O2", date: "2026-11-02", paid: 0 },
      ],
      cashEntries: [{ id: "CE1", date: "2026-11-03", creditId: "C1", amount: 80, principal: 75, penalty: 5, customer: "Aysel" }],
      expenses: [
        { id: "E1", date: "2026-11-04", amount: 60, status: EXPENSE_STATUS.approved, category: "İcarə", description: "Ofis" },
        { id: "E2", date: "2026-10-30", amount: 500, status: EXPENSE_STATUS.approved, source: "HR Payroll", category: "Maaş" },
      ],
    });
    expect(ledger.map((row) => [row.id, row.direction])).toEqual([
      ["E1", "out"], ["CE1", "in"], ["SALE-O1", "in"], ["E2", "accrual"],
    ]);
    expect(ledger.find((row) => row.id === "E2")).toMatchObject({ account: "Uçot xərci", status: `${EXPENSE_STATUS.approved} · cash təsiri yoxdur` });
    expect(sortByFinanceDate([{ date: "01.11.2026" }, { date: "2026-11-05" }]).map((row) => row.date)).toEqual(["2026-11-05", "01.11.2026"]);
  });

  it("projects cash after pending expenses in the finance scenario", () => {
    const scenario = buildFinanceScenario({
      orders: [{ id: "O1", date: "2026-11-01", paid: 100, amount: 1000, products: [] }],
      cashEntries: [],
      credits: [],
      expenses: [
        { amount: 30, status: "Təsdiq edildi" },
        { amount: 20, status: "Təsdiq gözləyir" },
        { amount: 999, status: "Təsdiq edildi", source: "HR Payroll" },
      ],
      openingBalance: 50,
    });
    expect(scenario).toMatchObject({
      inflow: 100, approvedExpense: 30, pendingExpense: 20, creditBalance: 0, grossSales: 1000, estimatedCost: 680, grossProfit: 320, cashAfterPending: 100,
    });
    expect(scenario.margin).toBeCloseTo(32);
  });
});
