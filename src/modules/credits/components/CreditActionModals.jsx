// Credit action modals moved unchanged from pages/CreditsPage.jsx: StartCreditModal (collect the initial deposit,
// pick the start date and start the credit) and QuickCollectModal (one-step installment collection with an
// idempotent receipt). CreditsPage renders them; change the modal UI here.
import { useEffect, useMemo, useRef, useState } from "react";
import { createIdempotencyKey } from "../../../services/coreOperations.js";
import { Play } from "lucide-react";
import { CreditInitialPaymentsHistory } from "../CreditInitialPayments.jsx";
import { cashAmount as money } from "../../../services/format.js";
import { toLocalIsoDate } from "../../../services/date.js";
import { buildCreditPlan, getCreditDebtFormula } from "../../../shared/lib/appDomain.jsx";
import { Button, Input, Table } from "../../../shared/ui/primitives.tsx";

export function StartCreditModal({ item, onStartCredit, onPayInitial, onClose }) {
  const [startDate, setStartDate] = useState(toLocalIsoDate());
  const requiredInitial = Number(item.credit.requiredInitial ?? item.credit.initialPayment ?? 0);
  const initialPaid = Number(item.credit.initialPaid ?? 0);
  const initialRemaining = Number(Math.max(0, requiredInitial - initialPaid).toFixed(2));
  const initialComplete = initialRemaining === 0;
  const [depositAmount, setDepositAmount] = useState(/** @type {number | string} */ (initialRemaining || 0));
  const [historyKey, setHistoryKey] = useState(0);
  const [saving, setSaving] = useState("");
  const [saveError, setSaveError] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    // İlkin ödəniş dəyişdikdə giriş sahəsi və cədvəl avtomatik yenilənir
    setDepositAmount(initialRemaining || 0);
    setHistoryKey((key) => key + 1);
  }, [initialPaid, requiredInitial, initialRemaining]);

  const depositValue = Number(depositAmount || 0);
  const depositError =
    !Number.isFinite(depositValue)
      ? "Məbləğ düzgün deyil."
      : depositValue < 0
      ? "Məbləğ mənfi ola bilməz."
      : depositValue > initialRemaining
        ? `Hədəfi aşırsınız: qalıq ${money(initialRemaining)}, daxil edilən ${money(depositValue)}.`
        : "";

  const projectedPaid = Math.min(requiredInitial, initialPaid + Math.max(0, depositError ? 0 : depositValue));
  const previewPlan = useMemo(
    () =>
      buildCreditPlan({
        total: item.credit.total,
        initialPayment: requiredInitial,
        months: item.credit.months || item.plan.months,
        startDate,
      }),
    [item, requiredInitial, startDate],
  );
  const firstPaymentDate = previewPlan.installments[0]?.due || "—";

  async function save(kind, command) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setSaving(kind);
    setSaveError("");
    try {
      const saved = await command();
      if (!saved) setSaveError("Əməliyyat tamamlanmadı.");
      return Boolean(saved);
    } catch (error) {
      setSaveError(error.message || "Əməliyyat tamamlanmadı.");
      return false;
    } finally {
      inFlight.current = false;
      setSaving("");
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!startDate || !initialComplete) return;
    const started = await save("start", () => onStartCredit?.(item.credit.id, startDate));
    if (started) onClose();
  }

  async function collectDeposit() {
    if (depositError || depositValue <= 0) return;
    const saved = await save("deposit", () => onPayInitial?.(item.credit.id, depositValue));
    if (saved) setHistoryKey((key) => key + 1);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="start-credit-title">
      <div className="modal-card start-credit-modal-card">
        <div className="modal-head">
          <div>
            <h2 id="start-credit-title">Krediti başlat</h2>
            <p>{item.credit.customer} · {item.credit.contractId || item.credit.id}</p>
          </div>
          <Button variant="ghost" className="icon-btn" type="button" disabled={Boolean(saving)} onClick={onClose} aria-label="Bağla">×</Button>
        </div>
        <form className="credit-payment-form" onSubmit={submit} aria-busy={Boolean(saving)}>
          {saveError ? <p role="alert" className="form-error">{saveError}</p> : null}
          <div className="credit-payment-preview">
            <span>İlkin ödəniş hədəfi <strong>{money(requiredInitial)}</strong></span>
            <span>Yığılıb <strong>{money(initialPaid)}</strong></span>
            <span>Qalıq beh <strong>{money(initialRemaining)}</strong></span>
            <span>Ödənişdən sonra <strong>{money(projectedPaid)}</strong></span>
          </div>
          <div className="credit-schedule-preview">
            <strong>{initialComplete ? "İlkin ödəniş tamamlanıb" : "Qalıq ilkin ödənişi qəbul et"}</strong>
            {!initialComplete ? (
              <>
              <label className="field">
                <span>Qəbul ediləcək məbləğ</span>
                <Input
                  type="number"
                  step="0.01"
                  disabled={Boolean(saving)}
                  min="0"
                  max={initialRemaining}
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                />
              </label>
              {depositError ? <p className="bonus-note bonus-note--error">{depositError}</p> : null}
              <Button variant="secondary"
                type="button"
                
                onClick={collectDeposit}
                disabled={Boolean(saving) || Boolean(depositError) || depositValue <= 0}
              >
                {saving === "deposit" ? "Qəbul edilir..." : "Behi kassaya qəbul et"}
              </Button>
              <p className="form-help">
                İlkin ödəniş tam yığılmayınca kredit başladıla bilməz. Hədəf tamamlananda cədvəl avtomatik aktivləşir.
              </p>
              </>
            ) : (
              <p className="form-help">
                Planlaşdırılmış {money(requiredInitial)} beh tam yığılıb. Kredit aktivləşdirilə bilər.
              </p>
            )}
          </div>
          <CreditInitialPaymentsHistory
            creditId={item.credit.id}
            orderId={item.credit.orderId}
            orderNo={item.credit.orderNo}
            refreshKey={historyKey}
          />
          <label className="field">
            <span>Kreditin başlanma tarixi</span>
            <Input type="date" required disabled={Boolean(saving)} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <div className="credit-payment-preview">
            <span>İlk ödəniş tarixi <strong>{firstPaymentDate}</strong></span>
            <span>Müddət <strong>{previewPlan.months} ay</strong></span>
            <span>Aylıq <strong>{money(previewPlan.monthly)}</strong></span>
            <span>Qalıq <strong>{money(previewPlan.balance)}</strong></span>
          </div>
          <div className="credit-schedule-preview">
            <strong>Ödəniş cədvəli önizləməsi</strong>
            {!initialComplete ? (
              <p className="form-help">
                Cədvəl {money(requiredInitial)} hədəfinə görə hesablanır. Çatışmayan {money(initialRemaining)} yığılan
                kimi cədvəl avtomatik yenilənəcək.
              </p>
            ) : null}
            <div className="credit-schedule-preview-scroll">
              <Table className="credit-schedule-preview-table">
                <thead>
                  <tr><th>#</th><th>Ödəniş tarixi</th><th>Məbləğ</th></tr>
                </thead>
                <tbody>
                  {previewPlan.installments.map((installment) => (
                    <tr key={installment.month}>
                      <td>{installment.month}</td>
                      <td>{installment.due}</td>
                      <td>{money(installment.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
          <p className="form-help">Təsdiqdən sonra bu cədvəl yadda saxlanacaq və kredit aktiv portfelə keçəcək.</p>
          <div className="modal-actions">
            <Button variant="secondary" type="button"  disabled={Boolean(saving)} onClick={onClose}>Ləğv et</Button>
            <Button variant="primary" type="submit"  disabled={Boolean(saving) || !initialComplete}>
              <Play size={15} /> {saving === "start" ? "Başladılır..." : "Krediti başlat"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}



const toCents = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function QuickCollectModal({ item, onReceivePayment, onClose }) {
  const { credit, plan, paymentState } = item;
  const debt = getCreditDebtFormula(item);
  const suggested = Math.min(
    Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
    Number(debt.balance || 0),
  );
  const [principalAmount, setPrincipalAmount] = useState(/** @type {number | string} */ (toCents(suggested)));
  const [penaltyAmount, setPenaltyAmount] = useState(/** @type {number | string} */ (0));
  // One idempotent receipt key per modal opening prevents duplicate postings.
  const [receiptNo] = useState(() => createIdempotencyKey("KRD"));
  // Payments keep their qəpik: 100.49 used to be posted as 100.
  const principal = Math.max(0, toCents(principalAmount));
  const penalty = Math.max(0, toCents(penaltyAmount));

  function submit(event) {
    event.preventDefault();
    if (principal <= 0 && penalty <= 0) return;
    onReceivePayment?.(credit.id, { principalAmount: principal, penaltyAmount: penalty, receiptNo });
    onClose();
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>Ödəniş götür</h2>
            <p>{credit.customer} · {credit.contractId || credit.id} · qalıq {money(debt.balance)}</p>
          </div>
          <Button variant="ghost" className="icon-btn" type="button" onClick={onClose} aria-label="Bağla">×</Button>
        </div>
        <form className="credit-payment-form" onSubmit={submit}>
          <div className="credit-payment-inputs">
            <label>
              <span>Əsas məbləğ</span>
              <Input
                aria-label="Əsas məbləğ"
                type="number"
                min="0"
                step="0.01"
                value={principalAmount}
                onChange={(event) => setPrincipalAmount(event.target.value)}
              />
            </label>
            <label>
              <span>Gecikmə faizi</span>
              <Input
                aria-label="Gecikmə faizi"
                type="number"
                min="0"
                step="0.01"
                value={penaltyAmount}
                onChange={(event) => setPenaltyAmount(event.target.value)}
              />
            </label>
          </div>
          <div className="credit-payment-preview">
            <span>Borcdan silinir <strong>{money(principal)}</strong></span>
            <span>Kassaya daxil olur <strong>{money(principal + penalty)}</strong></span>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" type="button"  onClick={onClose}>Ləğv et</Button>
            <Button variant="primary" type="submit"  disabled={principal <= 0 && penalty <= 0}>
              Ödənişi qeyd et
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
