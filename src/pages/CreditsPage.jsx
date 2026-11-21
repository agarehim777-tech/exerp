import ModuleLink from "../shared/ui/ModuleLink.jsx";
import { csvCell } from "../shared/lib/csvCell.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleAlert, CreditCard, Download, Eye, Play, RefreshCw, Search, Wallet } from "lucide-react";
import { DataTable, MetricCard, Panel, StatusBadge, TwoLine } from "../components/ui.jsx";
import { cashAmount as money } from "../services/format.js";
import { usePageQuery } from "../shared/hooks/usePageQuery.jsx";
import { pathForRecord } from "../config/routes.js";
import { formatPaymentDate, parsePaymentDate, toLocalIsoDate } from "../services/date.js";
import { baseCreditDate, currentBusinessYear, CreditDetailModal, getCreditDebtFormula, getCreditDisplayPlan, getCreditInitials, getCreditManagementStatus, getCreditPaidTotal, getCreditPaymentState, getCreditRowDate, getCreditSourceLabel, isCreditClosed, isCreditStarted, matchesCreditManagementFilter, matchesCreditSearch, matchesCreditSourceFilter, monthNamesAz } from "../shared/lib/appDomain.jsx";
import { Button, Input, Select } from "../shared/ui/primitives.tsx";
import { QuickCollectModal, StartCreditModal } from "../modules/credits/components/CreditActionModals.jsx";

// The start-credit and quick-collect modals live in modules/credits/components/CreditActionModals.jsx.
export { StartCreditModal };

export default CreditsPage;

function CreditsPage({
  credits,
  loading = false,
  error = null,
  onRefresh,
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
  const defaults = { credit: '', filter: 'Hamısı', source: 'Bütün mənbələr', month: 'Bütün aylar', year: String(currentBusinessYear), q: '', size: '10' };
  const [pageQuery, setPageQuery] = usePageQuery(defaults);
  const { credit: detailCreditId, filter: creditFilter, source: sourceFilter, month: monthFilter, year: yearFilter, q: searchTerm } = pageQuery;
  const pageSize = [10, 25, 50, 100].includes(Number(pageQuery.size)) ? Number(pageQuery.size) : 10;
  const setCreditFilter = filter => setPageQuery({ filter });
  const setSourceFilter = source => setPageQuery({ source }, { replace: true });
  const setMonthFilter = month => setPageQuery({ month }, { replace: true });
  const setYearFilter = year => setPageQuery({ year }, { replace: true });
  const setSearchTerm = q => setPageQuery({ q }, { replace: true });
  const setPageSize = size => setPageQuery({ size: String(size) }, { replace: true });
  const setDetailCreditId = useCallback(credit => setPageQuery({ credit }), [setPageQuery]);
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
  const monthlyDue = enrichedCredits.reduce((sum, item) => {
    if (isCreditClosed(item.credit, item.plan)) return sum;
    return sum + Number(item.paymentState.nextInstallment?.amount || 0);
  }, 0);
  const overdueAmount = overdueCredits.reduce(
    (sum, item) => sum + Number(item.paymentState.nextInstallment?.amount || 0),
    0,
  );
  const portfolioBalance = enrichedCredits.reduce((sum, item) => sum + Number(getCreditDebtFormula(item).balance || 0), 0);
  const paidTotal = enrichedCredits.reduce(
    (sum, item) =>
      sum +
      (isCreditStarted(item.credit)
        ? getCreditPaidTotal(item.plan)
        : Number(item.credit.initialPaid || 0)),
    0,
  );
  const initialPendingTotal = notStartedCredits.reduce((sum, item) => {
    const required = Number(item.credit.requiredInitial ?? item.credit.initialPayment ?? 0);
    return sum + Math.max(0, required - Number(item.credit.initialPaid || 0));
  }, 0);
  const averageMonthly = activeCredits.length ? Math.round(monthlyDue / activeCredits.length) : 0;
  const collectionQueueCount = todayCredits.length + overdueCredits.length;
  const handoverItems = [
    {
      label: "Qalıq ilkin ödəniş",
      value: money(initialPendingTotal),
      hint: `${notStartedCredits.length} başlanmamış kredit üzrə beh qalığı`,
      tone: initialPendingTotal > 0 ? "warning" : "success",
    },
    {
      label: "Yığım növbəsi",
      value: collectionQueueCount,
      hint: "Bu gün və gecikmiş ödənişlər",
      tone: collectionQueueCount > 0 ? "danger" : "success",
    },
  ];
  const filterItems = [
    { label: "Hamısı", title: "Hamısı", count: enrichedCredits.length, tone: "primary" },
    { label: "Aktiv", title: "Aktiv kreditlər", count: activeCredits.length, tone: "success" },
    { label: "Başlanmamış", title: "Başlanmamış", count: notStartedCredits.length, tone: "warning" },
    { label: "Gecikmiş", title: "Gecikmiş", count: overdueCredits.length, tone: "danger" },
    { label: "Bağlanmış", title: "Bağlanmış kreditlər", count: completedCredits.length, tone: "info" },
    { label: "Bugünkü", title: "Bugünkü", count: todayCredits.length, tone: "neutral" },
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
    if (!selectedCreditId || selectedCreditId === detailCreditId) return;
    if (credits.some((credit) => credit.id === selectedCreditId)) {
      setDetailCreditId(selectedCreditId);
    }
  }, [credits, selectedCreditId, detailCreditId, setDetailCreditId]);

  const closeDetail = () => {
    setDetailCreditId("");
    onClearSelectedCredit?.();
  };
  const resetFilters = () => {
    setPageQuery({ ...defaults, credit: detailCreditId }, { replace: true });
  };
  const exportVisibleCredits = () => {
    const escapeCsv = (value) => csvCell(value);
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
    link.download = `kreditler-${toLocalIsoDate()}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="stack credit-workspace">
      {error ? (
        <div role="alert" className="form-error">
          <p>Kredit məlumatları yüklənmədi: {error.message || String(error)}</p>
          <Button variant="secondary" type="button"  disabled={loading} onClick={onRefresh}>
            <RefreshCw size={16} /> Yenidən yüklə
          </Button>
        </div>
      ) : loading ? <p role="status">Kredit məlumatları yüklənir...</p> : null}
      {!loading && !error && detailCreditId && !detailItem && <div role="alert" className="ui-notice ui-notice-warning">
        Kredit tapılmadı və ya bu şirkətdə əlçatan deyil.
        <Button variant="ghost" type="button" className="text-btn" onClick={closeDetail}>Bağla</Button>
      </div>}
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
              <Select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </Select>
            </label>
            <label>
              <span>Ay</span>
              <Select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                <option>Bütün aylar</option>
                {monthNamesAz.map((month) => (
                  <option key={month}>{month}</option>
                ))}
              </Select>
            </label>
            <label>
              <span>İl</span>
              <Select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option>Bütün illər</option>
                {yearOptions.map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </Select>
            </label>
            <label className="credit-search-field">
              <span>Axtarış</span>
              <div>
                <Search size={15} />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Müştəri, kredit kodu, müqavilə..."
                />
              </div>
            </label>
            <label>
              <span>Mənbə</span>
              <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {sourceFilters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" className="icon-only" title="Filtrləri sıfırla" aria-label="Filtrləri sıfırla" type="button" onClick={resetFilters}>
              <RefreshCw size={16} />
            </Button>
            <Button variant="secondary" className="credit-excel-btn" type="button" onClick={exportVisibleCredits}>
              <Download size={16} />
              Excel
            </Button>
          </div>

          <DataTable
            label="Kredit siyahısı"
            columns={[
              { label: '#', mobileHidden: true },
              { label: 'Müştəri', sticky: true },
              { label: 'Müqavilə / cihaz', mobileHidden: true },
              { label: 'Müqavilə məbləği', align: 'right', mobileHidden: true },
              { label: 'Ödənilib / beh', align: 'right', mobileHidden: true },
              { label: 'Qalıq', align: 'right' },
              { label: 'Növbəti', mobileHidden: true },
              { label: 'Status', mobileHidden: true },
              { label: 'Əməl.' },
            ]}
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
                    <ModuleLink className="record-link credit-mobile-contract" to={pathForRecord('credits', credit.id)} onSelect={() => setDetailCreditId(credit.id)}>{credit.contractId || 'Kreditə bax'}</ModuleLink>
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
                      <ModuleLink
                        className="inline-module-link"
                        to={pathForRecord('sales', credit.orderId)}
                        onSelect={onOpenSalesOrder ? () => onOpenSalesOrder(credit.orderId) : undefined}
                        data-testid="credit-row-order-link"
                      >
                        {credit.orderNo || credit.orderId} sifarişi
                      </ModuleLink>
                    ) : (
                      "Manual qeyd"
                    )}{" "}
                    · {debt.remainingMonths} ay qalıb
                  </em>
                </div>,
                <TwoLine title={money(debt.total)} subtitle={`${plan.months} ay · ${credit.date || "tarixsiz"}`} />,
                <TwoLine
                  title={money(debt.paid)}
                  subtitle={debt.phase === "initial"
                    ? <b className="credit-deposit-target">Yığılan beh · hədəf {money(debt.requiredInitial)}</b>
                    : `${credit.paidMonths || 0}/${plan.months} ay bağlanıb`}
                />,
                <TwoLine
                  title={money(debt.balance)}
                  subtitle={debt.phase === "initial" ? <>Qalıq ümumi borc<b className="credit-mobile-initial">İlkin qalıq: {money(Math.max(0, debt.requiredInitial - debt.paid))}</b></> : `Növbəti ${money(debt.nextAmount)}`}
                />,
                <TwoLine title={isCreditStarted(credit) ? paymentState.nextInstallment?.due || credit.next || "—" : "Tarix təyin edilməyib"} subtitle={!isCreditStarted(credit) ? "Başlatma gözləyir" : nextAmount > 0 ? `${money(nextAmount)} aylıq` : "Plan tamamlanıb"} />,
                <div className="credit-status-stack">
                  <StatusBadge status={getCreditManagementStatus(item)} />
                  {paymentState.isOverdue && <strong className="credit-overdue-days">{paymentState.daysOverdue} gün gecikmə</strong>}
                </div>,
                <div className="credit-table-actions">
                  <Button variant="primary" size="compact"
                    
                    type="button"
                    title="Kredit üzrə ödəniş götür"
                    aria-label="Kredit üzrə ödəniş götür"
                    disabled={debt.balance <= 0 || !isCreditStarted(credit)}
                    onClick={() => setQuickCreditId(credit.id)}
                  >
                    <Wallet size={15} />
                    <span className="credit-action-label">Ödəniş götür</span>
                  </Button>
                  {!isCreditStarted(credit) && !isCreditClosed(credit, plan) ? (
                    <Button variant="primary" size="compact"  type="button" title="Krediti başlat" aria-label="Krediti başlat" onClick={() => setStartCreditId(credit.id)}>
                      <Play size={15} />
                      <span className="credit-action-label">Krediti başlat</span>
                    </Button>
                  ) : null}
                  <ModuleLink className="icon-btn" title="Kredit kartına bax" aria-label="Kredit kartına bax" to={pathForRecord('credits', credit.id)} onSelect={() => setDetailCreditId(credit.id)}>
                    <Eye size={16} />
                  </ModuleLink>
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
