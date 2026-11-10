import { getOrderPaymentMethod, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { CalendarClock, Download, FileText, X } from "lucide-react";
import { ProgressRow, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { CreditInitialPaymentsHistory } from "../../modules/credits/CreditInitialPayments.jsx";
import { useRef, useState } from "react";
import { money, normalize } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";
import { round2 } from "../utils/invoiceMath.js";
import { currentBusinessDate } from "./businessDate";
import { createIdempotencyKey } from "../../services/coreOperations.js";
import { formatDateInput, formatPaymentDate, parsePaymentDate, toDateInputValue } from "../../services/date.js";
import { daysBetween, getCreditDebtFormula, getCreditDisplayPlan, getCreditPaidTotal, getCreditRiskLabel, getCreditSourceLabel, isCreditStarted } from "./credit.js";
import { baseFinanceDate } from "./appDomainHr.jsx";

export function buildAccountingCloseChecklist(accounting, closeRun) {
  const { balance, pl, cashFlow, journalRows, chartRows } = accounting;
  const cashAccount = chartRows.find((row) => row.code === "1010");
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

export function buildSupportTicketContext(ticket, { orders = [], credits = [], customers = [], conversations = [] }) {
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
    latestComment: comments[comments.length - 1]?.text || thread?.preview || "Comment yoxdur",
  };
}

export function getSupportThreadId(ticket) {
  return ticket.threadId || `MSG-${ticket.id}`;
}

export function buildReceivableAgingSummary(rows = []) {
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

export function buildInvoiceControlSummary(invoices) {
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
    sent: invoices.filter((invoice) => invoice.invoiceSentAt || invoice.eTaxStatus === "E-qaimə göndərildi").length,
    ready: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
    overdueCount: overdue.length,
    overdueBalance: total(overdue, "balance"),
    dueSoonCount: dueSoon.length,
    dueSoonBalance: total(dueSoon, "balance"),
    openBalance: total(openInvoices, "balance"),
  };
}

export function buildInvoiceAgingRows(invoices) {
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

export function InvoicePrintModal({ invoice, invoiceSettings = {}, onClose }) {
  function downloadHtml() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.id}</title></head><body><h1>${invoice.id}</h1><p>${invoice.customer}</p><p>${invoice.products}</p><p>Cəmi: ${money(invoice.totalAmount)}</p><p>ƏDV: ${money(invoice.vatAmount)}</p></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.id}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card invoice-print-card">
        <div className="modal-head">
          <div>
            <h2>{invoice.id}</h2>
            <p>Faktura/e-qaimə çap görünüşü və HTML/PDF export hazırlığı.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <section className="invoice-paper">
          <div className="invoice-paper-head">
            <div>
              <span>Satıcı</span>
              <strong>{invoice.seller}</strong>
              <small>VÖEN {invoice.voen}</small>
            </div>
            <div>
              <span>Faktura</span>
              <strong>{invoice.id}</strong>
              <small>{invoice.date} · {invoice.currency}</small>
            </div>
          </div>
          <div className="invoice-paper-grid">
            <TwoLine title="Alıcı" subtitle={`${invoice.customer} · FİN ${invoice.fin}`} />
            <TwoLine title="Sifariş/Müqavilə" subtitle={`${invoice.orderId} · ${invoice.contractId}`} />
            <TwoLine title="Ödəniş tipi" subtitle={invoice.paymentMethod} />
            <TwoLine title="Son tarix" subtitle={invoice.dueDate} />
          </div>
          <div className="invoice-product-box">
            <span>Məhsul/Xidmət</span>
            <strong>{invoice.products}</strong>
          </div>
          <div className="invoice-total-grid">
            <TwoLine title="Net məbləğ" subtitle={money(invoice.netAmount)} />
            <TwoLine title={`ƏDV ${invoiceSettings.vatRate || 18}%`} subtitle={money(invoice.vatAmount)} />
            <TwoLine title="Cəmi" subtitle={money(invoice.totalAmount)} />
            <TwoLine title="Qalıq" subtitle={invoice.balance > 0 ? money(invoice.balance) : "Yoxdur"} />
          </div>
          <StatusBadge status={invoice.eTaxStatus} />
        </section>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={downloadHtml}>
            <Download size={16} />
            HTML export
          </button>
          <button type="button" className="primary-btn" onClick={() => window.print()}>
            <FileText size={16} />
            Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export function getInvoiceAgingBucket(invoice) {
  if (Number(invoice.balance || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(invoice.dueDate);
  const today = parsePaymentDate(currentBusinessDate);
  const days = dueDate && today ? daysBetween(dueDate, today) : 0;
  if (days <= 0) return "Vaxtında";
  if (days <= 7) return "1-7 gün";
  if (days <= 30) return "8-30 gün";
  return "30+ gün";
}

export function getInstallmentStatus(installment) {
  if (Number(installment.amount || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(installment.due);
  const today = parsePaymentDate(baseCreditDate);
  if (dueDate && today && daysBetween(dueDate, today) > 0) return "Gecikib";
  if (dueDate && today && daysBetween(dueDate, today) === 0) return "Bu gün";
  return "Gözləyir";
}

export const baseCreditDate = currentBusinessDate;

export function CreditDetailModal({ item, sendCreditSms, onUpdatePaymentDate, onReceivePayment, onOpenSalesOrder, onClose }) {
  const { credit } = item;

  return (
    <div className="modal-shell credit-detail-modal-shell" role="dialog" aria-modal="true" aria-labelledby="credit-detail-modal-title">
      <div className="modal-card credit-detail-modal-card">
        <div className="modal-head credit-detail-modal-head">
          <div>
            <h2 id="credit-detail-modal-title">Kredit müqaviləsi</h2>
            <p>{credit.customer} üzrə fərdi müqavilə, cihaz, ödəniş və tarixçə məlumatları</p>
            <div className="credit-detail-title-meta">
              <span>{credit.id}</span>
              <span>{credit.contractId || "Müqaviləsiz"}</span>
              <span>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <div className="credit-detail-modal-body">
          <CreditDetail
            item={item}
            sendCreditSms={sendCreditSms}
            onUpdatePaymentDate={onUpdatePaymentDate}
            onReceivePayment={onReceivePayment}
            onOpenSalesOrder={onOpenSalesOrder}
          />
          <CreditInitialPaymentsHistory creditId={credit.id} />
        </div>
      </div>
    </div>
  );
}

export function buildDailyCashSummary(ledger, openingBalance = 0, targetDate = baseFinanceDate) {
  const target = parsePaymentDate(targetDate);
  const targetKey = formatDateInput(target || new Date());
  const previousRows = ledger.filter((row) => {
    const rowDate = parsePaymentDate(row.date);
    return rowDate && target && rowDate < target;
  });
  const dayRows = ledger.filter((row) => formatDateInput(parsePaymentDate(row.date) || new Date(0)) === targetKey);
  const sumRows = (rows, direction) =>
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
export function expenseCashAction(status) {
  if (status === EXPENSE_STATUS.approved) return "approved";
  if (status === EXPENSE_STATUS.accepted) return "accepted";
  if (status === EXPENSE_STATUS.cancelled || status === EXPENSE_STATUS.rejected) return "cancelled";
  return null;
}

export function isExpenseCashPosted(expense = {}) {
  return (
    hasExpenseCashImpact(expense) &&
    [EXPENSE_STATUS.approved, EXPENSE_STATUS.accepted].includes(expense.status)
  );
}

export function isExpenseCancelled(expense = {}) {
  return [EXPENSE_STATUS.cancelled, EXPENSE_STATUS.rejected].includes(expense.status);
}

export function buildExpenseCategoryRows(expenses) {
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

export function buildFinanceLedger({ orders, expenses, cashEntries }) {
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

export function buildFinanceScenario({ orders, expenses, credits, cashEntries, openingBalance = 0 }) {
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

export function hasExpenseCashImpact(expense = {}) {
  if (expense.cashImpact === false) return false;
  return expense.source !== "HR Payroll";
}

export function sortByFinanceDate(rows) {
  return [...rows].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  });
}

export function CreditDetail({ item, sendCreditSms, onUpdatePaymentDate, onReceivePayment, onOpenSalesOrder }) {
  const { credit, plan, paymentState, progress } = item;
  const started = isCreditStarted(credit);
  const requiredInitial = Number(credit.requiredInitial ?? plan.initialPayment ?? credit.initialPayment ?? 0);
  const initialPaid = Math.min(requiredInitial, Number(credit.initialPaid ?? credit.paid ?? 0));
  const initialRemaining = Math.max(0, requiredInitial - initialPaid);

  return (
    <div className="credit-detail">
      <div className={`credit-detail-layout ${started ? "is-started" : "not-started"}`}>
        <section className="credit-detail-primary">
          <div className="credit-detail-head">
            <div>
              <span>{credit.id}</span>
              <h2>{credit.customer}</h2>
            </div>
            <StatusBadge status={paymentState.isOverdue ? `${paymentState.daysOverdue} gün gecikib` : credit.status} />
          </div>
          <CreditContext credit={credit} onOpenSalesOrder={onOpenSalesOrder} />
          {!started ? (
            <div className="credit-payment-alert">
              <CalendarClock size={16} />
              <div>
                <strong>Kredit başlanmayıb</strong>
                <span>Dəqiq başlanma tarixi seçildikdən sonra ödəniş cədvəli aktiv olacaq.</span>
              </div>
            </div>
          ) : null}
          <CreditContractSnapshot item={item} />
          <div className="credit-terms-strip" aria-label="İlkin ödəniş və müqavilə şərtləri">
            <div>
              <span>İlkin ödəniş hədəfi</span>
              <strong>{money(requiredInitial)}</strong>
            </div>
            <div>
              <span>Yığılan ilkin ödəniş</span>
              <strong>{money(initialPaid)}</strong>
            </div>
            <div className={initialRemaining > 0 ? "warning" : "complete"}>
              <span>Qalıq ilkin ödəniş</span>
              <strong>{money(initialRemaining)}</strong>
            </div>
            <div>
              <span>Müddət</span>
              <strong>{plan.months} ay</strong>
            </div>
          </div>
          <div className="credit-plan-card">
            <div className="credit-plan-note">
              <span>
                {plan.months > 1 ? `${plan.months - 1} ay` : "Aylıq"} <strong>{money(plan.monthly)}</strong>
              </span>
              <span>
                Son ay <strong>{money(plan.lastPayment)}</strong>
              </span>
            </div>
            <ProgressRow label={`${credit.paidMonths}/${plan.months} ay`} value={progress} />
          </div>
          <div className="credit-detail-records">
            <CreditPaymentHistory payments={credit.payments || []} />
            {started ? <div className="credit-schedule-edit-block">
              <div className="credit-schedule-head">
                <div>
                  <h3>Ödəniş tarixləri</h3>
                  <p>Hələlik tarix redaktəsi bütün istifadəçilər üçün açıqdır.</p>
                </div>
              </div>
              <CreditSchedule
                installments={plan.installments}
                onUpdatePaymentDate={(month, due) => onUpdatePaymentDate(credit.id, month, due)}
              />
            </div> : null}
          </div>
        </section>

        <aside className="credit-detail-aside">
          {started ? <CreditPaymentAlert paymentState={paymentState} /> : null}
          {started ? <CreditPaymentForm
            key={credit.id}
            credit={credit}
            paymentState={paymentState}
            onReceivePayment={onReceivePayment}
          /> : null}
          <CreditHealthSummary item={item} />
          {started ? <div className="credit-detail-actions">
            <span>Növbəti: {paymentState.nextInstallment?.due || credit.next}</span>
            <button className="secondary-btn" onClick={() => sendCreditSms(credit.id)}>
              SMS xatırlatma
            </button>
          </div> : null}
        </aside>
      </div>
    </div>
  );
}

export function CreditContext({ credit, onOpenSalesOrder }) {
  return (
    <div className="credit-context-grid">
      <div>
        <span>Müqavilə</span>
        <strong>{credit.contractId || "Müqavilə qeyd edilməyib"}</strong>
      </div>
      <div>
        <span>Cihaz</span>
        <strong>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</strong>
      </div>
      {credit.orderId && (
        <div>
          <span>Sifariş</span>
          <button
            className="module-link-btn"
            type="button"
            onClick={() => onOpenSalesOrder?.(credit.orderId)}
            data-testid="credit-order-link"
            title="Bağlı sifariş detalına keç"
          >
            {credit.orderNo || credit.orderId}
          </button>
        </div>
      )}
      <div>
        <span>Mənbə</span>
        <strong>{getCreditSourceLabel(credit)}</strong>
      </div>
      {credit.warehouseName && (
        <div>
          <span>Anbar</span>
          <strong>{credit.warehouseName}</strong>
        </div>
      )}
    </div>
  );
}

export function CreditContractSnapshot({ item }) {
  const { credit, paymentState } = item;
  const debt = getCreditDebtFormula(item);

  return (
    <div className="credit-contract-snapshot">
      <div className="credit-contract-tile total" data-testid="credit-total-tile">
        <span>Müqavilə məbləği</span>
        <strong>{money(debt.total)}</strong>
        <small>{credit.contractId || credit.id}</small>
      </div>
      <div className="credit-contract-tile paid" data-testid="credit-paid-tile">
        <span>Ödənilib</span>
        <strong>{money(debt.paid)}</strong>
        <small>İlkin + əsas ödənişlər</small>
      </div>
      <div className="credit-contract-tile balance" data-testid="credit-balance-tile">
        <span>Qalıq borc</span>
        <strong>{money(debt.balance)}</strong>
        <small>{debt.remainingMonths} ay qalıb</small>
      </div>
      <div className={`credit-contract-tile next ${paymentState.isOverdue ? "danger" : paymentState.isDueToday ? "today" : ""}`}>
        <span>Növbəti yığım</span>
        <strong>{money(debt.nextAmount)}</strong>
        <small>{paymentState.nextInstallment?.due || credit.next || "Tarix yoxdur"}</small>
      </div>
    </div>
  );
}

export function CreditDebtFormula({ item }) {
  const debt = getCreditDebtFormula(item);
  const formulaIsBalanced = debt.total - debt.paid === debt.balance;

  return (
    <div className="credit-debt-formula" data-testid="credit-debt-formula">
      <div>
        <span>Müqavilə məbləği</span>
        <strong>{money(debt.total)}</strong>
      </div>
      <b>-</b>
      <div>
        <span>Ödənilib</span>
        <strong>{money(debt.paid)}</strong>
      </div>
      <b>=</b>
      <div className="balance">
        <span>Qalıq borc</span>
        <strong>{money(debt.balance)}</strong>
      </div>
      <small className={formulaIsBalanced ? "ok" : "warning"}>
        {formulaIsBalanced ? "Borcla ödəniş balansı uyğundur" : "Balans yenidən yoxlanmalıdır"}
      </small>
    </div>
  );
}

export function CreditPaymentHistory({ payments }) {
  const rows = payments || [];

  return (
    <div className="credit-payment-history">
      <div className="credit-history-head">
        <div>
          <h3>Ödəniş tarixçəsi</h3>
          <p>Əsas məbləğ borcdan silinir, gecikmə faizi yalnız kassaya gəlir.</p>
        </div>
        <span>{rows.length} əməliyyat</span>
      </div>
      {rows.length === 0 ? (
        <div className="credit-history-empty">Bu kredit üzrə hələ ödəniş qəbul edilməyib.</div>
      ) : (
        <div className="credit-history-list">
          {rows.slice(0, 6).map((payment, index) => {
            const principal = Number(payment.principal || 0);
            const penalty = Number(payment.penalty || 0);
            const cashIn = Number(payment.cashIn ?? principal + penalty);
            const extraApplied = Number(payment.extraApplied || 0);

            return (
              <div className="credit-payment-row" key={`${payment.date}-${index}`}>
                <div>
                  <strong>{payment.date || baseCreditDate}</strong>
                  <span>
                    Əsas {money(principal)} · Gecikmə {money(penalty)}
                  </span>
                  {extraApplied > 0 && <em>Növbəti aylardan azaldıldı: {money(extraApplied)}</em>}
                </div>
                <b>{money(cashIn)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CreditSchedule({ installments, onUpdatePaymentDate }) {
  const firstOpenMonth = installments.find((installment) => Number(installment.amount || 0) > 0)?.month;

  return (
    <div className="credit-schedule" aria-label="Kredit ödəniş tarixləri">
      {installments.map((installment) => {
        const amount = Number(installment.amount || 0);
        const status = amount <= 0 ? "Bağlanıb" : installment.month === firstOpenMonth ? "Cari ay" : "Gözləyir";

        return (
          <label key={installment.month} className={amount <= 0 ? "closed" : installment.month === firstOpenMonth ? "current" : ""}>
            <em>{installment.month}. ay</em>
            <strong>{money(amount)}</strong>
            <small>{status}</small>
            <input
              aria-label={`${installment.month}. ay ödəniş tarixi`}
              type="date"
              value={toDateInputValue(installment.due)}
              onChange={(event) => onUpdatePaymentDate(installment.month, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

export function CreditPaymentAlert({ paymentState }) {
  const amount = paymentState.nextInstallment?.amount || 0;
  const due = paymentState.nextInstallment?.due || "—";
  const label = paymentState.isOverdue
    ? `${paymentState.daysOverdue} gün gecikib`
    : paymentState.isDueToday
      ? "Bu gün ödənilməlidir"
      : "Növbəti ödəniş";

  return (
    <div className={`credit-payment-alert ${paymentState.isOverdue ? "overdue" : ""} ${paymentState.isDueToday ? "today" : ""}`}>
      <CalendarClock size={16} />
      <div>
        <strong>{money(amount)}</strong>
        <span>
          {label} · {due}
        </span>
      </div>
    </div>
  );
}

export function CreditPaymentForm({ credit, paymentState, onReceivePayment }) {
  const currentPrincipal = Number(paymentState.nextInstallment?.amount || 0);
  const [principalAmount, setPrincipalAmount] = useState(currentPrincipal);
  const [penaltyAmount, setPenaltyAmount] = useState(0);
  const [pending, setPending] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const submitting = useRef(false);
  const request = useRef(null);
  const principal = Math.max(0, round2(Number(principalAmount || 0)));
  const penalty = Math.max(0, round2(Number(penaltyAmount || 0)));
  const extraPrincipal = Math.max(0, principal - currentPrincipal);
  const cashIn = round2(principal + penalty);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || cashIn <= 0) return;
    const signature = JSON.stringify([credit.id, principal, penalty]);
    if (request.current?.signature !== signature) {
      request.current = { signature, receiptNo: createIdempotencyKey("KRD") };
    }
    submitting.current = true;
    setPending(true);
    setPaymentError("");
    try {
      const saved = await onReceivePayment(credit.id, {
        principalAmount: principal,
        penaltyAmount: penalty,
        receiptNo: request.current.receiptNo,
      });
      if (saved === true) {
        request.current = null;
        setPrincipalAmount("");
        setPenaltyAmount(0);
      }
    } catch (error) {
      setPaymentError(error.message || "Ödəniş qeydə alınmadı.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form className="credit-payment-form" onSubmit={submit}>
      {paymentError && <p role="alert" className="inline-alert danger">{paymentError}</p>}
      <div className="credit-payment-form-head">
        <div>
          <h3>Ödəniş qəbul et</h3>
          <p>Əsas məbləğ borcdan silinir, gecikmə faizi yalnız kassaya daxil olur.</p>
        </div>
      </div>
      <div className="credit-payment-inputs">
        <label>
          <span>Əsas məbləğ</span>
          <input
            aria-label="Əsas məbləğ"
            disabled={pending}
            type="number"
            min="0"
            step="0.01"
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(event.target.value)}
          />
        </label>
        <label>
          <span>Gecikmə faizi</span>
          <input
            aria-label="Gecikmə faizi"
            disabled={pending}
            type="number"
            min="0"
            step="0.01"
            value={penaltyAmount}
            onChange={(event) => setPenaltyAmount(event.target.value)}
          />
        </label>
      </div>
      <div className="credit-payment-preview">
        <span>
          Borcdan silinir <strong>{money(principal)}</strong>
        </span>
        <span>
          Gecikmə gəliri <strong>{money(penalty)}</strong>
        </span>
        <span>
          Kassaya daxil olur <strong>{money(cashIn)}</strong>
        </span>
        {extraPrincipal > 0 && (
          <span className="success">
            Növbəti aydan azalır <strong>{money(extraPrincipal)}</strong>
          </span>
        )}
      </div>
      <button type="submit" className="primary-btn" disabled={pending || cashIn <= 0} aria-busy={pending}>
        {pending ? "Qeydə alınır..." : "Ödənişi qəbul et"}
      </button>
    </form>
  );
}

export function CreditHealthSummary({ item }) {
  const { credit, plan, paymentState, progress } = item;
  const paidTotal = getCreditPaidTotal(plan);

  return (
    <div className="credit-health-grid">
      <div>
        <span>Ödənilib</span>
        <strong>{money(paidTotal)}</strong>
        <small>{Math.round(progress)}% tamamlanıb</small>
      </div>
      <div>
        <span>Qalıq borc</span>
        <strong>{money(plan.balance)}</strong>
        <small>{plan.months} aylıq plan</small>
      </div>
      <div className={paymentState.isOverdue ? "danger" : paymentState.isDueToday ? "info" : ""}>
        <span>Yığım statusu</span>
        <strong>{getCreditRiskLabel(item)}</strong>
        <small>{paymentState.nextInstallment?.due || credit.next || "Tarix yoxdur"}</small>
      </div>
      <div>
        <span>Mənbə</span>
        <strong>{getCreditSourceLabel(credit)}</strong>
        <small>{credit.orderId ? `${credit.orderNo || credit.orderId} sifarişi` : "Manual qeyd"}</small>
      </div>
    </div>
  );
}
