import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleAlert, CreditCard, Download, Eye, Filter, Play, RefreshCw, Search, Wallet } from "lucide-react";
import { DataTable, MetricCard, Panel, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money } from "../services/format.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { total } from "../shared/utils/aggregate.js";
import {
  baseCreditDate,
  currentBusinessYear,
} from "../shared/lib/appDomain.jsx";
import {
  buildCreditPlan,
  CreditDetailModal,
  getCreditDebtFormula,
  getCreditDisplayPlan,
  getCreditInitials,
  getCreditManagementStatus,
  getCreditPaidTotal,
  getCreditPaymentState,
  getCreditRowDate,
  getCreditSourceLabel,
  isCreditClosed,
  isCreditStarted,
  matchesCreditManagementFilter,
  matchesCreditSearch,
  matchesCreditSourceFilter,
  monthNamesAz,
} from "../shared/lib/appDomain.jsx";

export default CreditsPage;

function CreditsPage({
  credits,
  sendCreditSms,
  onUpdatePaymentDate,
  onReceivePayment,
  onCreateCredit,
  onStartCredit,
  onPayCreditInitial,
  onOpenSalesOrder,
  selectedCreditId,
  onClearSelectedCredit,
}) {
  const [creditFilter, setCreditFilter] = useState("Hamısı");
  const [sourceFilter, setSourceFilter] = useState("Bütün mənbələr");
  const [monthFilter, setMonthFilter] = useState("Bütün aylar");
  const [yearFilter, setYearFilter] = useState(String(currentBusinessYear));
  const [searchTerm, setSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [detailCreditId, setDetailCreditId] = useState("");
  const [quickCreditId, setQuickCreditId] = useState("");
  const [startCreditId, setStartCreditId] = useState("");

  const enrichedCredits = useMemo(
    () =>
      credits.map((credit) => {
        const plan = getCreditDisplayPlan(credit);
        const paymentState = getCreditPaymentState(credit, plan);
        const progress =
          credit.rate ?? Math.round((Number(credit.paidMonths || 0) / Math.max(1, plan.months)) * 100);

        return { credit, plan, paymentState, progress };
      }),
    [credits],
  );
  const activeCredits = enrichedCredits.filter((item) => isCreditStarted(item.credit) && !isCreditClosed(item.credit, item.plan));
  const notStartedCredits = enrichedCredits.filter((item) => !isCreditStarted(item.credit) && !isCreditClosed(item.credit, item.plan));
  const todayCredits = enrichedCredits.filter((item) => item.paymentState.isDueToday);
  const overdueCredits = enrichedCredits.filter((item) => item.paymentState.isOverdue);
  const completedCredits = enrichedCredits.filter((item) => isCreditClosed(item.credit, item.plan));
  const salesCredits = enrichedCredits.filter((item) => getCreditSourceLabel(item.credit) === "Satışdan gələn");
  const monthlyDue = enrichedCredits.reduce((sum, item) => {
    if (isCreditClosed(item.credit, item.plan)) return sum;
    return sum + Number(item.paymentState.nextInstallment?.amount || 0);
  }, 0);
  const overdueAmount = overdueCredits.reduce(
    (sum, item) => sum + Number(item.paymentState.nextInstallment?.amount || 0),
    0,
  );
  const portfolioBalance = enrichedCredits.reduce((sum, item) => sum + Number(item.plan.balance || 0), 0);
  const paidTotal = enrichedCredits.reduce((sum, item) => sum + getCreditPaidTotal(item.plan), 0);
  const averageMonthly = activeCredits.length ? Math.round(monthlyDue / activeCredits.length) : 0;
  const currentMonthCredits = enrichedCredits.filter((item) => matchesCreditManagementFilter(item, "Cari ay"));
  const linkedSalesCredits = salesCredits.filter((item) => item.credit.orderId && item.credit.contractId);
  const uniqueContractCount = new Set(enrichedCredits.map((item) => item.credit.contractId || item.credit.id)).size;
  const collectionQueueCount = todayCredits.length + overdueCredits.length;
  const handoverItems = [
    {
      label: "Satış bağlantısı",
      value: `${linkedSalesCredits.length}/${salesCredits.length}`,
      hint: "Sifariş və müqavilə ilə gələn kreditlər",
      tone: linkedSalesCredits.length === salesCredits.length ? "success" : "warning",
    },
    {
      label: "Ayrı borc məntiqi",
      value: uniqueContractCount,
      hint: "Hər kredit ayrıca müqavilə kimi saxlanır",
      tone: uniqueContractCount === enrichedCredits.length ? "success" : "warning",
    },
    {
      label: "Yığım növbəsi",
      value: collectionQueueCount,
      hint: "Bu gün və gecikmiş ödənişlər",
      tone: collectionQueueCount > 0 ? "danger" : "success",
    },
    {
      label: "Maliyyə sinxronu",
      value: money(paidTotal),
      hint: "Əsas ödəniş borcdan, cərimə kassadan izlənir",
      tone: "info",
    },
  ];
  const filterItems = [
    { label: "Hamısı", title: "Hamısı", count: enrichedCredits.length, tone: "primary" },
    { label: "Aktiv", title: "Aktiv kreditlər", count: activeCredits.length, tone: "success" },
    { label: "Başlanmamış", title: "Başlanmamış", count: notStartedCredits.length, tone: "warning" },
    { label: "Gecikmiş", title: "Gecikmiş", count: overdueCredits.length, tone: "danger" },
    { label: "Bağlanmış", title: "Bağlanmış kreditlər", count: completedCredits.length, tone: "info" },
    { label: "Bugünkü", title: "Bugünkü", count: todayCredits.length, tone: "neutral" },
    { label: "Cari ay", title: "Cari ay", count: currentMonthCredits.length, tone: "neutral" },
  ];
  const sourceFilters = ["Bütün mənbələr", "Satışdan gələn", "Manual kredit"];
  const yearOptions = [
    ...new Set(
      enrichedCredits
        .map((item) => getCreditRowDate(item)?.getFullYear())
        .filter(Boolean)
        .map((year) => String(year))
        .concat(String(currentBusinessYear)),
    ),
  ].sort((a, b) => Number(b) - Number(a));
  const visibleCredits = enrichedCredits
    .filter((item) => {
      const date = getCreditRowDate(item);
      // Başlanmamış kreditin növbəti ödəniş tarixi yoxdur — ay/il filtri onları gizlətməməlidir.
      const undated = !date;
      const matchesMonth = undated || monthFilter === "Bütün aylar" || monthNamesAz[date.getMonth()] === monthFilter;
      const matchesYear = undated || yearFilter === "Bütün illər" || String(date.getFullYear()) === String(yearFilter);
      return (
        matchesCreditManagementFilter(item, creditFilter) &&
        matchesCreditSourceFilter(item, sourceFilter) &&
        matchesCreditSearch(item, searchTerm) &&
        matchesMonth &&
        matchesYear
      );
    })

    .sort((a, b) => {
      if (a.paymentState.isOverdue !== b.paymentState.isOverdue) return a.paymentState.isOverdue ? -1 : 1;
      const dateA = getCreditRowDate(a)?.getTime() || 0;
      const dateB = getCreditRowDate(b)?.getTime() || 0;
      return dateA - dateB;
    });
  const tableCredits = visibleCredits.slice(0, pageSize);
  const detailItem = detailCreditId ? enrichedCredits.find((item) => item.credit.id === detailCreditId) : null;
  const quickItem = quickCreditId ? enrichedCredits.find((item) => item.credit.id === quickCreditId) : null;
  const startItem = startCreditId ? enrichedCredits.find((item) => item.credit.id === startCreditId) : null;
  const todayLabel = formatPaymentDate(parsePaymentDate(baseCreditDate));

  useEffect(() => {
    if (!selectedCreditId) return;
    if (credits.some((credit) => credit.id === selectedCreditId)) {
      setDetailCreditId(selectedCreditId);
    }
  }, [credits, selectedCreditId]);

  const closeDetail = () => {
    setDetailCreditId("");
    onClearSelectedCredit?.();
  };
  const resetFilters = () => {
    setCreditFilter("Hamısı");
    setSourceFilter("Bütün mənbələr");
    setMonthFilter("Bütün aylar");
    setYearFilter(String(currentBusinessYear));
    setSearchTerm("");
    setPageSize(10);
  };
  const applyFilters = () => {
    setSearchTerm((value) => value.trim());
  };
  const exportVisibleCredits = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Kod", "Müştəri", "FIN", "Müqavilə", "Cihaz", "Məbləğ", "Qalıq", "Aylıq", "Növbəti tarix", "Status", "Gecikmə", "Mənbə"],
      ...visibleCredits.map((item) => {
        const { credit, plan, paymentState } = item;
        return [
          credit.id,
          credit.customer,
          credit.fin,
          credit.contractId,
          credit.device || credit.product,
          plan.total,
          plan.balance,
          paymentState.nextInstallment?.amount || plan.monthly,
          paymentState.nextInstallment?.due || credit.next,
          getCreditManagementStatus(item),
          paymentState.isOverdue ? `${paymentState.daysOverdue} gün` : "",
          getCreditSourceLabel(credit),
        ];
      }),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `kreditler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktiv kreditlər" value={activeCredits.length} icon={CreditCard} tone="primary" />
        <MetricCard label="Portfel qalığı" value={money(portfolioBalance)} trend={`${money(paidTotal)} ödənilib`} icon={Wallet} tone="success" />
        <MetricCard label="Bu ay yığım" value={money(monthlyDue)} trend={`Orta ${money(averageMonthly)}`} icon={CalendarClock} tone="info" />
        <MetricCard label="Gecikmiş" value={overdueCredits.length} trend={money(overdueAmount)} icon={CircleAlert} tone="danger" />
      </section>

      <section className="credit-handover-strip" aria-label="Kredit modulunun təhvil statusu">
        {handoverItems.map((item) => (
          <div className={`credit-handover-item ${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.hint}</small>
          </div>
        ))}
      </section>

      <section className="credit-management-shell">
        <div className="credit-management-topline">
          <div>
            <h2>Portfel siyahısı</h2>
            <p>Kreditləri prioritet, tarix və mənbə üzrə idarə edin.</p>
          </div>
          <div className="credit-management-summary" aria-label="Kredit portfeli xülasəsi">
            <span><strong>{visibleCredits.length}</strong> nəticə</span>
            <span><strong>{todayCredits.length}</strong> bu gün</span>
            <span><strong>{salesCredits.length}</strong> satışdan</span>
          </div>
        </div>

        <div className="credit-status-strip">
          {filterItems.map((item) => (
            <button
              key={item.label}
              className={`credit-status-chip ${item.tone} ${creditFilter === item.label ? "active" : ""}`}
              onClick={() => setCreditFilter(item.label)}
            >
              <span>{item.title}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>

        <Panel className="credit-directory-panel">
          <div className="credit-directory-head">
            <div>
              <h3>
                <CreditCard size={17} />
                Kredit siyahısı
              </h3>
              <span>{todayLabel} tarixinə portfel icmalı</span>
            </div>
            <strong>{visibleCredits.length} kredit</strong>
          </div>

          <div className="credit-directory-filters">
            <label>
              <span>Göstər</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Ay</span>
              <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                <option>Bütün aylar</option>
                {monthNamesAz.map((month) => (
                  <option key={month}>{month}</option>
                ))}
              </select>
            </label>
            <label>
              <span>İl</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option>Bütün illər</option>
                {yearOptions.map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="credit-search-field">
              <span>Axtarış</span>
              <div>
                <Search size={15} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Müştəri, kredit kodu, müqavilə..."
                />
              </div>
            </label>
            <label>
              <span>Mənbə</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {sourceFilters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button className="primary-btn icon-only" title="Filterləri tətbiq et" type="button" onClick={applyFilters}>
              <Filter size={16} />
            </button>
            <button className="secondary-btn icon-only" title="Filterləri sıfırla" type="button" onClick={resetFilters}>
              <RefreshCw size={16} />
            </button>
            <button className="secondary-btn credit-excel-btn" type="button" onClick={exportVisibleCredits}>
              <Download size={16} />
              Excel
            </button>
          </div>

          <DataTable
            columns={["#", "Müştəri", "Müqavilə / cihaz", "Müqavilə məbləği", "Ödənilib", "Qalıq", "Növbəti", "Status", "Əməl."]}
            rows={tableCredits.map((item, index) => {
              const { credit, plan, paymentState } = item;
              const nextAmount = Number(paymentState.nextInstallment?.amount || 0);
              const debt = getCreditDebtFormula(item);
              const compactCode = String(credit.id || "").replace(/\D/g, "").slice(-4) || credit.id;
              const customerMeta = [credit.fin, getCreditSourceLabel(credit)].filter(Boolean).join(" · ");
              return [
                index + 1,
                <div className="credit-customer-cell">
                  <span className="credit-avatar">{getCreditInitials(credit.customer)}</span>
                  <div className="credit-customer-copy">
                    <strong>{credit.customer}</strong>
                    <span>
                      <b>#{compactCode}</b>
                      {customerMeta ? ` · ${customerMeta}` : ""}
                    </span>
                  </div>
                </div>,
                <div className="credit-contract-cell" data-testid="credit-contract-cell">
                  <strong>{credit.contractId || credit.id}</strong>
                  <span>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</span>
                  <em>
                    {credit.orderId ? (
                      <button
                        className="inline-module-link"
                        type="button"
                        onClick={() => onOpenSalesOrder?.(credit.orderId)}
                        data-testid="credit-row-order-link"
                      >
                        {credit.orderId} sifarişi
                      </button>
                    ) : (
                      "Manual qeyd"
                    )}{" "}
                    · {debt.remainingMonths} ay qalıb
                  </em>
                </div>,
                <TwoLine title={money(debt.total)} subtitle={`${plan.months} ay · ${credit.date || "tarixsiz"}`} />,
                <TwoLine title={money(debt.paid)} subtitle={`${credit.paidMonths || 0}/${plan.months} ay bağlanıb`} />,
                <TwoLine title={money(debt.balance)} subtitle={`Növbəti ${money(debt.nextAmount)}`} />,
                <TwoLine title={isCreditStarted(credit) ? paymentState.nextInstallment?.due || credit.next || "—" : "Tarix təyin edilməyib"} subtitle={!isCreditStarted(credit) ? "Başlatma gözləyir" : nextAmount > 0 ? `${money(nextAmount)} aylıq` : "Plan tamamlanıb"} />,
                <div className="credit-status-stack">
                  <StatusBadge status={getCreditManagementStatus(item)} />
                  {paymentState.isOverdue && <strong className="credit-overdue-days">{paymentState.daysOverdue} gün gecikmə</strong>}
                </div>,
                <div className="credit-table-actions">
                  <button
                    className="primary-btn compact"
                    type="button"
                    title="Kredit üzrə ödəniş götür"
                    disabled={debt.balance <= 0 || !isCreditStarted(credit)}
                    onClick={() => setQuickCreditId(credit.id)}
                  >
                    <Wallet size={15} />
                    Ödəniş götür
                  </button>
                  {!isCreditStarted(credit) && !isCreditClosed(credit, plan) ? (
                    <button className="primary-btn compact" type="button" onClick={() => setStartCreditId(credit.id)}>
                      <Play size={15} />
                      Krediti başlat
                    </button>
                  ) : null}
                  <button className="icon-btn" title="Kredit kartına bax" onClick={() => setDetailCreditId(credit.id)}>
                    <Eye size={16} />
                  </button>
                </div>,

              ];
            })}
          />
        </Panel>

        {quickItem ? (
          <QuickCollectModal
            item={quickItem}
            onReceivePayment={onReceivePayment}
            onClose={() => setQuickCreditId("")}
          />
        ) : null}

        {startItem ? (
          <StartCreditModal
            item={startItem}
            onStartCredit={onStartCredit}
            onPayInitial={onPayCreditInitial}
            onClose={() => setStartCreditId("")}
          />
        ) : null}

        {detailItem ? (
          <CreditDetailModal
            item={detailItem}
            sendCreditSms={sendCreditSms}
            onUpdatePaymentDate={onUpdatePaymentDate}
            onReceivePayment={onReceivePayment}
            onOpenSalesOrder={onOpenSalesOrder}
            onClose={closeDetail}
          />
        ) : null}
      </section>

    </div>
  );
}

function StartCreditModal({ item, onStartCredit, onPayInitial, onClose }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const requiredInitial = Number(item.credit.requiredInitial ?? item.credit.initialPayment ?? 0);
  const initialPaid = Number(item.credit.initialPaid ?? 0);
  const initialRemaining = Math.max(0, requiredInitial - initialPaid);
  const initialComplete = initialRemaining <= 0.01;
  const [depositAmount, setDepositAmount] = useState(initialRemaining || 0);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    // İlkin ödəniş dəyişdikdə giriş sahəsi və cədvəl avtomatik yenilənir
    setDepositAmount(initialRemaining || 0);
    setHistoryKey((key) => key + 1);
  }, [initialPaid, requiredInitial, initialRemaining]);

  const depositValue = Number(depositAmount || 0);
  const depositError =
    depositValue < 0
      ? "Məbləğ mənfi ola bilməz."
      : depositValue > initialRemaining + 0.01
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

  function submit(event) {
    event.preventDefault();
    if (!startDate || !initialComplete) return;
    onStartCredit?.(item.credit.id, startDate);
    onClose();
  }

  async function collectDeposit() {
    if (depositError || depositValue <= 0) return;
    await onPayInitial?.(item.credit.id, depositValue);
    setHistoryKey((key) => key + 1);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="start-credit-title">
      <div className="modal-card start-credit-modal-card">
        <div className="modal-head">
          <div>
            <h2 id="start-credit-title">Krediti başlat</h2>
            <p>{item.credit.customer} · {item.credit.contractId || item.credit.id}</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Bağla">×</button>
        </div>
        <form className="credit-payment-form" onSubmit={submit}>
          <div className="credit-payment-preview">
            <span>İlkin ödəniş hədəfi <strong>{money(requiredInitial)}</strong></span>
            <span>Yığılıb <strong>{money(initialPaid)}</strong></span>
            <span>Qalıq beh <strong>{money(initialRemaining)}</strong></span>
            <span>Ödənişdən sonra <strong>{money(projectedPaid)}</strong></span>
          </div>
          {!initialComplete ? (
            <div className="credit-schedule-preview">
              <strong>İlkin ödənişi tamamla</strong>
              <label>
                <span>Qəbul ediləcək məbləğ</span>
                <input
                  type="number"
                  min="0"
                  max={initialRemaining}
                  value={depositAmount}
                  onChange={(event) => setDepositAmount(event.target.value)}
                />
              </label>
              {depositError ? <p className="bonus-note bonus-note--error">{depositError}</p> : null}
              <button
                type="button"
                className="secondary-btn"
                onClick={collectDeposit}
                disabled={Boolean(depositError) || depositValue <= 0}
              >
                Behi kassaya qəbul et
              </button>
              <p className="form-help">
                İlkin ödəniş tam yığılmayınca kredit başladıla bilməz. Hədəf tamamlananda cədvəl avtomatik aktivləşir.
              </p>
            </div>
          ) : null}
          <CreditInitialPaymentsHistory creditId={item.credit.id} refreshKey={historyKey} />
          <label>
            <span>Kreditin başlanma tarixi</span>
            <input type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
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
              <table className="credit-schedule-preview-table">
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
              </table>
            </div>
          </div>
          <p className="form-help">Təsdiqdən sonra bu cədvəl yadda saxlanacaq və kredit aktiv portfelə keçəcək.</p>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn" disabled={!initialComplete}>
              <Play size={15} /> Krediti başlat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



function QuickCollectModal({ item, onReceivePayment, onClose }) {
  const { credit, plan, paymentState } = item;
  const debt = getCreditDebtFormula(item);
  const suggested = Math.min(
    Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
    Number(debt.balance || 0),
  );
  const [principalAmount, setPrincipalAmount] = useState(Math.round(suggested));
  const [penaltyAmount, setPenaltyAmount] = useState(0);
  const principal = Math.max(0, Math.round(Number(principalAmount || 0)));
  const penalty = Math.max(0, Math.round(Number(penaltyAmount || 0)));

  function submit(event) {
    event.preventDefault();
    if (principal <= 0 && penalty <= 0) return;
    onReceivePayment?.(credit.id, { principalAmount: principal, penaltyAmount: penalty });
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
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Bağla">×</button>
        </div>
        <form className="credit-payment-form" onSubmit={submit}>
          <div className="credit-payment-inputs">
            <label>
              <span>Əsas məbləğ</span>
              <input
                aria-label="Əsas məbləğ"
                type="number"
                min="0"
                value={principalAmount}
                onChange={(event) => setPrincipalAmount(event.target.value)}
              />
            </label>
            <label>
              <span>Gecikmə faizi</span>
              <input
                aria-label="Gecikmə faizi"
                type="number"
                min="0"
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
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn" disabled={principal <= 0 && penalty <= 0}>
              Ödənişi qeyd et
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
