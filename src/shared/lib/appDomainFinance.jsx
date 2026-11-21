import { Download, FileText, X } from "lucide-react";
import { StatusBadge, TwoLine } from "../../components/ui.jsx";
import { money } from "../../services/format.js";
// Finance domain logic (close checklist, support context, aging, cash summary, expense status, ledger) lives in
// financeDomain.ts; this file keeps the finance UI components and re-exports the moved logic for old imports.
export {
  buildAccountingCloseChecklist,
  buildSupportTicketContext,
  getSupportThreadId,
  buildReceivableAgingSummary,
  currentBusinessYear,
  buildInvoiceControlSummary,
  buildInvoiceAgingRows,
  getInvoiceAgingBucket,
  getInstallmentStatus,
  baseCreditDate,
  buildDailyCashSummary,
  EXPENSE_STATUS,
  EXPENSE_STATUS_OPTIONS,
  expenseCashAction,
  isExpenseCashPosted,
  isExpenseCancelled,
  buildExpenseCategoryRows,
  buildFinanceLedger,
  buildFinanceScenario,
  hasExpenseCashImpact,
  sortByFinanceDate,
} from "./financeDomain.ts";

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
            <p>Faktura/e-qaimə çap görünüşü və HTML/PDF ixracına hazırlıq.</p>
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
            HTML ixracı
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

// Credit detail UI (modal, contract snapshot, schedule, payment form, health summary) lives in
// modules/credits/components/CreditDetail.tsx; re-exported here for old imports.
export {
  CreditDetailModal,
  CreditDetail,
  CreditContext,
  CreditContractSnapshot,
  CreditDebtFormula,
  CreditPaymentHistory,
  CreditSchedule,
  CreditPaymentAlert,
  CreditPaymentForm,
  CreditHealthSummary,
} from "../../modules/credits/components/CreditDetail.tsx";
