// Finance domain logic moved from appDomainFinance.jsx: month-close checklist, support ticket context,
// receivable/invoice aging, daily cash summary, expense statuses and cash posting, finance ledger and scenario.
// appDomainFinance.jsx re-exports these for old imports; change them here.
import { getOrderPaymentMethod, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { money, normalize } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";
import { currentBusinessDate } from "./businessDate";
import { formatDateInput, formatPaymentDate, parsePaymentDate } from "../../services/date.js";
import { daysBetween, getCreditDisplayPlan } from "./credit.js";
import { baseFinanceDate } from "./hrDomain.ts";

type Row = Record<string, any>;

export function buildAccountingCloseChecklist(accounting: Row, closeRun?: Row | null) {
  const { balance, pl, cashFlow, journalRows, chartRows } = accounting;
  const cashAccount = chartRows.find((row: Row) => row.code === "1010");
  const equationDiff = Math.round(Number(balance.assets || 0) - Number(balance.liabilities || 0) - Number(balance.equity || 0));
  const cashDiff = Math.round(Number(cashAccount?.balance || 0) - Number(cashFlow.closing || 0));
  const checks = [
    {
      label: "Balans bərabərliyi",
      detail: `Aktiv - öhdəlik - kapital = ${money(equationDiff)}`,
      status: Math.abs(equationDiff) <= 1 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Kassa uzlaşması",
      detail: `1010 hesabı ilə cash-flow fərqi ${money(cashDiff)}`,
      status: Math.abs(cashDiff) <= 1 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Jurnal yazılışları",
      detail: `${journalRows.length} jurnal sətri formalaşıb`,
      status: journalRows.length > 0 ? "Tamamlandı" : "Gözləyir",
    },
    {
      label: "ƏDV öhdəliyi",
      detail: `${money(accounting.vatPayable)} öhdəlik hesablandı`,
      status: Number(accounting.vatPayable || 0) >= 0 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Ay bağlanışı",
      detail: closeRun ? `${closeRun.period} export edilib` : "Jurnal export gözləyir",
      status: closeRun ? "Tamamlandı" : "Gözləyir",
    },
  ];

  return {
    checks,
    readyCount: checks.filter((check) => check.status === "Tamamlandı").length,
    warningCount: checks.filter((check) => check.status !== "Tamamlandı").length,
    equationDiff,
    cashDiff,
    closeReady: checks.every((check) => check.status === "Tamamlandı"),
    retainedEarnings: Number(pl.netProfit || 0),
  };
}

export function buildSupportTicketContext(ticket: Row, { orders = [], credits = [], customers = [], conversations = [] }: { orders?: Row[]; credits?: Row[]; customers?: Row[]; conversations?: Row[] }) {
  const order =
    orders.find((item) => item.id === ticket.orderId || (ticket.linkedType === "order" && item.id === ticket.linkedId)) ||
    orders.find((item) => item.creditId === ticket.creditId);
  const credit =
    credits.find((item) => item.id === ticket.creditId || (ticket.linkedType === "credit" && item.id === ticket.linkedId)) ||
    credits.find((item) => item.orderId === order?.id);
  const customer =
    customers.find((item) => item.fin === ticket.fin || item.fin === order?.fin || item.fin === credit?.fin) ||
    customers.find((item) => normalize(item.name) === normalize(ticket.customer || order?.customer || credit?.customer));
  const thread = conversations.find((conversation) => conversation.id === getSupportThreadId(ticket) || conversation.ticketId === ticket.id);
  const comments = Array.isArray(ticket.comments) ? ticket.comments : [];
  const linkedLabel =
    ticket.linkedLabel ||
    credit?.contractId ||
    order?.id ||
    customer?.name ||
    ticket.linkedId ||
    "Ümumi task";

  return {
    ...ticket,
    order,
    credit,
    customerRecord: customer,
    thread,
    comments,
    linkedLabel,
    commentCount: comments.length + (thread?.messages?.length || 0),
    latestComment: comments[comments.length - 1]?.text || thread?.preview || "Şərh yoxdur",
  };
}

export function getSupportThreadId(ticket: Row) {
  return ticket.threadId || `MSG-${ticket.id}`;
}

export function buildReceivableAgingSummary(rows: Row[] = []) {
  const buckets = ["Cari", "1-30 gün", "31-60 gün", "61-90 gün", "90+ gün"];
  return buckets.map((bucket) => {
    const bucketRows = rows.filter((row) => row.agingBucket === bucket);
    return {
      bucket,
      count: bucketRows.length,
      amount: bucketRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  });
}

export const currentBusinessYear = currentBusinessDate.slice(0, 4);

export function buildInvoiceControlSummary(invoices: Row[]) {
  const today = parsePaymentDate(currentBusinessDate);
  const openInvoices = invoices.filter((invoice) => Number(invoice.balance || 0) > 0);
  const overdue = openInvoices.filter((invoice) => {
    const dueDate = parsePaymentDate(invoice.dueDate);
    return dueDate && today && daysBetween(dueDate, today) > 0;
  });
  const dueSoon = openInvoices.filter((invoice) => {
    const dueDate = parsePaymentDate(invoice.dueDate);
    if (!dueDate || !today) return false;
    const diff = daysBetween(today, dueDate);
    return diff >= 0 && diff <= 7;
  });

  return {
    sent: invoices.filter((invoice) => invoice.invoiceSentAt || invoice.eTaxStatus === "E-qaimə göndərildi" || invoice.eTaxStatus === "Əl ilə göndərildi").length,
    ready: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
    overdueCount: overdue.length,
    overdueBalance: total(overdue, "balance"),
    dueSoonCount: dueSoon.length,
    dueSoonBalance: total(dueSoon, "balance"),
    openBalance: total(openInvoices, "balance"),
  };
}

export function buildInvoiceAgingRows(invoices: Row[]) {
  const buckets = ["Vaxtında", "1-7 gün", "8-30 gün", "30+ gün", "Ödənilib"];
  const rows = buckets.map((bucket) => ({
    bucket,
    count: 0,
    balance: 0,
    total: 0,
  }));
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));

  invoices.forEach((invoice) => {
    const bucket = getInvoiceAgingBucket(invoice);
    const row = byBucket.get(bucket);
    if (!row) return;
    row.count += 1;
    row.balance += Number(invoice.balance || 0);
    row.total += Number(invoice.totalAmount || 0);
  });

  return rows;
}

export function getInvoiceAgingBucket(invoice: Row) {
  if (Number(invoice.balance || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(invoice.dueDate);
  const today = parsePaymentDate(currentBusinessDate);
  const days = dueDate && today ? daysBetween(dueDate, today) : 0;
  if (days <= 0) return "Vaxtında";
  if (days <= 7) return "1-7 gün";
  if (days <= 30) return "8-30 gün";
  return "30+ gün";
}

export function getInstallmentStatus(installment: Row) {
  if (Number(installment.amount || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(installment.due);
  const today = parsePaymentDate(baseCreditDate);
  if (dueDate && today && daysBetween(dueDate, today) > 0) return "Gecikib";
  if (dueDate && today && daysBetween(dueDate, today) === 0) return "Bu gün";
  return "Gözləyir";
}

export const baseCreditDate = currentBusinessDate;

export function buildDailyCashSummary(ledger: Row[], openingBalance: number | string = 0, targetDate: string = baseFinanceDate) {
  const target = parsePaymentDate(targetDate);
  const targetKey = formatDateInput(target || new Date());
  const previousRows = ledger.filter((row) => {
    const rowDate = parsePaymentDate(row.date);
    return rowDate && target && rowDate < target;
  });
  const dayRows = ledger.filter((row) => formatDateInput(parsePaymentDate(row.date) || new Date(0)) === targetKey);
  const sumRows = (rows: Row[], direction: string) =>
    rows
      .filter((row) => row.direction === direction)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const previousInflow = sumRows(previousRows, "in");
  const previousOutflow = sumRows(previousRows, "out");
  const opening = Number(openingBalance || 0) + previousInflow - previousOutflow;
  const inflow = sumRows(dayRows, "in");
  const outflow = sumRows(dayRows, "out");
  const pendingOutflow = sumRows(dayRows, "pending");
  const accrual = sumRows(dayRows, "accrual");
  const penalty = dayRows.reduce((sum, row) => sum + Number(row.penalty || 0), 0);

  return {
    date: targetKey,
    label: formatPaymentDate(target),
    opening,
    inflow,
    outflow,
    pendingOutflow,
    accrual,
    penalty,
    closing: opening + inflow - outflow,
    projectedClosing: opening + inflow - outflow - pendingOutflow,
    rows: dayRows,
  };
}

export const EXPENSE_STATUS = {
  pending: "Təsdiq gözləyir",
  approved: "Təsdiq edildi",
  accepted: "Qəbul edildi",
  cancelled: "Ləğv edildi",
  rejected: "İmtina edildi",
};

export const EXPENSE_STATUS_OPTIONS = Object.values(EXPENSE_STATUS);

/** Maps an app-level expense status to the cash posting action stored in the database. */
export function expenseCashAction(status: string) {
  if (status === EXPENSE_STATUS.approved) return "approved";
  if (status === EXPENSE_STATUS.accepted) return "accepted";
  if (status === EXPENSE_STATUS.cancelled || status === EXPENSE_STATUS.rejected) return "cancelled";
  return null;
}

export function isExpenseCashPosted(expense: Row = {}) {
  return (
    hasExpenseCashImpact(expense) &&
    [EXPENSE_STATUS.approved, EXPENSE_STATUS.accepted].includes(expense.status)
  );
}

export function isExpenseCancelled(expense: Row = {}) {
  return [EXPENSE_STATUS.cancelled, EXPENSE_STATUS.rejected].includes(expense.status);
}

export function buildExpenseCategoryRows(expenses: Row[]) {
  const byCategory = expenses.reduce((map, expense) => {
    const current = map.get(expense.category) || {
      category: expense.category,
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    current.total += Number(expense.amount || 0);
    if (isExpenseCashPosted(expense)) current.approved += Number(expense.amount || 0);
    if (expense.status === EXPENSE_STATUS.pending) current.pending += Number(expense.amount || 0);
    if (isExpenseCancelled(expense)) current.rejected += Number(expense.amount || 0);
    map.set(expense.category, current);
    return map;
  }, new Map());

  return [...byCategory.values()].sort((a, b) => b.total - a.total);
}

export function buildFinanceLedger({ orders, expenses, cashEntries }: { orders: Row[]; expenses: Row[]; cashEntries: Row[] }) {
  const salesRows = orders
    .filter((order) => Number(order.paid || 0) > 0)
    .map((order) => {
      const paymentMethod = getOrderPaymentMethod(order);
      const account = ["Kart", "Köçürmə"].includes(paymentMethod) ? "Bank hesabı" : "Kassa";
      return {
        id: `SALE-${order.id}`,
        date: order.date,
        type: "Satış",
        source: "Satış modulu",
        category: paymentMethod,
        account,
        title: order.id,
        description: summarizeOrderProducts(order),
        party: order.customer,
        principal: Number(order.paid || 0),
        penalty: 0,
        amount: Number(order.paid || 0),
        direction: "in",
        status: order.paymentStatus || paymentMethod,
        orderId: order.id,
        creditId: order.creditId || "",
        contractId: order.contractId || "",
        poId: "",
      };
    });

  const creditRows = cashEntries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    type: entry.type || "Kredit",
    source: entry.source || "Kredit modulu",
    category: entry.category || "Kredit ödənişi",
    account: entry.account || "Kassa",
    title: entry.creditId || entry.orderId || entry.receivableId || entry.id,
    description: entry.contractId || entry.note || "Müqavilə qeyd edilməyib",
    party: entry.customer,
    principal: Number(entry.principal || 0),
    penalty: Number(entry.penalty || 0),
    amount: Number(entry.amount || 0),
    direction: "in",
    status: "Kassaya daxil oldu",
    orderId: entry.orderId || "",
    creditId: entry.creditId || "",
    contractId: entry.contractId || "",
    poId: "",
  }));

  const expenseRows = expenses.map((expense) => {
    const approved = isExpenseCashPosted(expense);
    const rejected = isExpenseCancelled(expense);
    const cashImpact = hasExpenseCashImpact(expense);
    const direction = !cashImpact ? "accrual" : approved ? "out" : rejected ? "ignored" : "pending";
    return {
      id: expense.id,
      date: expense.date,
      type: "Xərc",
      source: expense.source || "Maliyyə modulu",
      category: expense.category,
      account: !cashImpact ? "Uçot xərci" : direction === "ignored" ? "Təsirsiz" : expense.account || "Kassa",
      title: expense.description,
      description: expense.category,
      party: "Şirkət xərci",
      principal: 0,
      penalty: 0,
      amount: Number(expense.amount || 0),
      direction,
      status: cashImpact ? expense.status : `${expense.status} · cash təsiri yoxdur`,
      orderId: expense.orderId || "",
      creditId: expense.creditId || "",
      contractId: expense.contractId || "",
      poId: expense.poId || "",
      expenseId: expense.id,
    };
  });

  return sortByFinanceDate([...salesRows, ...creditRows, ...expenseRows]);
}

export function buildFinanceScenario({ orders, expenses, credits, cashEntries, openingBalance = 0 }: { orders: Row[]; expenses: Row[]; credits: Row[]; cashEntries: Row[]; openingBalance?: number | string }) {
  const ledger = buildFinanceLedger({ orders, expenses, cashEntries });
  const inflow = ledger.filter((row) => row.direction === "in").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const approvedExpense = expenses
    .filter((expense) => expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pendingExpense = expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir" && hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const grossSales = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const estimatedCost = Math.round(grossSales * 0.68);
  const grossProfit = grossSales - estimatedCost;

  return {
    inflow,
    approvedExpense,
    pendingExpense,
    creditBalance,
    grossSales,
    estimatedCost,
    grossProfit,
    margin: grossSales > 0 ? (grossProfit / grossSales) * 100 : 0,
    cashAfterPending: Number(openingBalance || 0) + inflow - approvedExpense - pendingExpense,
  };
}

export function hasExpenseCashImpact(expense: Row = {}) {
  if (expense.cashImpact === false) return false;
  return expense.source !== "HR Payroll";
}

export function sortByFinanceDate<T extends Row>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  });
}
