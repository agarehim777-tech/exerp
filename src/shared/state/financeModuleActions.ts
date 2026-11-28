// Finance module commands moved from moduleActions.js: send the next e-invoice, export the accounting journal,
// create a tax payment task, and sync the receivable/payable register. createModuleActions passes the app values.
import { money } from "../../services/format.js";
import { baseFinanceDate } from "../lib/hrDomain.ts";
import { buildReceivableAgingSummary } from "../lib/financeDomain.ts";
import { getActionStamp } from "./actionStamp.ts";
import { createPrefixedId } from "../utils/id.js";

type Row = Record<string, any>;
type AuditEntry = { module: string; action: string; detail: string };

export function createFinanceModuleActions({ accountingData, auditCurrentState, invoiceRows, notify, receivableRows, setState, taxCalendarRows }: {
  accountingData: Row;
  auditCurrentState: (state: Row, entry: AuditEntry) => Row;
  invoiceRows: Row[];
  notify: (message: string, tone?: string) => void;
  receivableRows: Row[];
  setState: (update: (current: Row) => Row) => void;
  taxCalendarRows: Row[];
}) {
  function runInvoiceAction() {
    const targetInvoice =
      invoiceRows.find((invoice) => invoice.eTaxStatus === "Göndərişə hazır") ||
      invoiceRows.find((invoice) => !invoice.invoiceSentAt);

    if (!targetInvoice) {
      notify("Göndəriləcək faktura tapılmadı.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const batchId = createPrefixedId("ETX");

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          orders: current.orders.map((order: Row) =>
            order.id === targetInvoice.orderId
              ? {
                  ...order,
                  eTaxStatus: "Əl ilə göndərildi",
                  invoiceBatchId: batchId,
                  invoiceSentAt: stamp,
                }
              : order,
          ),
        },
        {
          module: "Faktura",
          action: "Faktura göndərildi kimi qeyd edildi",
          detail: `${targetInvoice.id} · ${targetInvoice.customer} · ${batchId}`,
        },
      ),
    );
    // Nothing is sent to the e-qaimə portal yet; the invoice is only marked as sent by hand.
    notify(`${targetInvoice.id} göndərildi kimi qeyd edildi. E-qaimə portalına avtomatik göndəriş hələ qoşulmayıb.`);
  }

  function runAccountingAction() {
    const stamp = getActionStamp();
    const journalCount = accountingData.journalRows.length;

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          accountingClose: {
            period: baseFinanceDate.slice(0, 7),
            exportedAt: stamp,
            journalCount,
            balance: accountingData.balance.assets,
            netProfit: accountingData.pl.netProfit,
          },
        },
        {
          module: "Mühasibat",
          action: "Jurnal export",
          detail: `${journalCount} jurnal sətri export üçün hazırlandı`,
        },
      ),
    );
    notify("Jurnal export hazırlandı və mühasibat bağlanışına yazıldı.");
  }

  function runTaxAction() {
    const targetTax =
      taxCalendarRows.find(
        (row) => ["Gecikib", "Bu gün", "Yaxınlaşır"].includes(row.status) && !row.paymentTaskId,
      ) ||
      taxCalendarRows.find((row) => Number(row.amount || 0) > 0 && !row.paymentTaskId);

    if (!targetTax) {
      notify("Aktiv vergi öhdəliyi tapılmadı.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const expenseId = `TAXPAY-${targetTax.id}`;
    const amount = Math.max(0, Math.round(Number(targetTax.amount || 0)));

    setState((current) => {
      const hasExpense = current.expenses.some((expense: Row) => expense.id === expenseId);
      const expenses = hasExpense
        ? current.expenses
        : [
            {
              id: expenseId,
              description: `${targetTax.title} - ${targetTax.period}`,
              category: "Vergi",
              date: baseFinanceDate,
              amount,
              status: "Təsdiq gözləyir",
              source: "Vergi təqvimi",
            },
            ...current.expenses,
          ];

      const currentTaxCalendar: Row[] = current.taxCalendar || [];
      const taxCalendar = currentTaxCalendar.some((item) => item.id === targetTax.id)
        ? currentTaxCalendar.map((item) =>
            item.id === targetTax.id
              ? {
                  ...item,
                  paymentStatus: "Ödəniş tapşırığı",
                  paymentTaskId: expenseId,
                  checkedAt: stamp,
                }
              : item,
          )
        : [
            {
              id: targetTax.id,
              title: targetTax.title,
              type: targetTax.type,
              period: targetTax.period,
              dueDate: targetTax.dueDate,
              owner: targetTax.owner,
              source: targetTax.source || "Avtomatik",
              paymentStatus: "Ödəniş tapşırığı",
              paymentTaskId: expenseId,
              checkedAt: stamp,
            },
            ...currentTaxCalendar,
          ];

      return auditCurrentState(
        {
          ...current,
          expenses,
          taxCalendar,
        },
        {
          module: "Vergi/Maliyyə",
          action: "Ödəniş tapşırığı yaradıldı",
          detail: `${targetTax.title} · ${money(amount)}`,
        },
      );
    });
    notify(`${targetTax.title} üçün ödəniş tapşırığı maliyyəyə düşdü.`);
  }

  function runReceivableSyncAction() {
    const debtorTotal = receivableRows
      .filter((row) => row.type === "Debitor")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const creditorTotal = receivableRows
      .filter((row) => row.type === "Kreditor")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const overdueCount = receivableRows.filter((row) => Number(row.overdueDays || 0) > 0).length;
    const highRiskCount = receivableRows.filter((row) => ["Kritik", "Yüksək"].includes(row.riskCategory)).length;
    const agingSummary = buildReceivableAgingSummary(receivableRows);
    const stamp = getActionStamp();

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          receivableSync: {
            at: stamp,
            debtorTotal,
            creditorTotal,
            overdueCount,
            highRiskCount,
            agingSummary,
            rows: receivableRows.length,
          },
        },
        {
          module: "Debitor/Kreditor",
          action: "Balans sinxronizasiya edildi",
          detail: `${receivableRows.length} tərəf · net ${money(debtorTotal - creditorTotal)}`,
        },
      ),
    );
    notify("Debitor/kreditor reyestri yeniləndi.");
  }

  return { runInvoiceAction, runAccountingAction, runTaxAction, runReceivableSyncAction };
}
