import { CalendarClock, Download, FileText, X } from "lucide-react";
import { ProgressRow, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { CreditInitialPaymentsHistory } from "../../modules/credits/CreditInitialPayments.jsx";
import { useRef, useState } from "react";
import { money } from "../../services/format.js";
import { round2 } from "../utils/invoiceMath.js";
import { createIdempotencyKey } from "../../services/coreOperations.js";
import { toDateInputValue } from "../../services/date.js";
import { getCreditDebtFormula, getCreditPaidTotal, getCreditRiskLabel, getCreditSourceLabel, isCreditStarted } from "./credit.js";
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
import { baseCreditDate } from "./financeDomain.ts";

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
