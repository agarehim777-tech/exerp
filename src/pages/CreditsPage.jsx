import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleAlert, CreditCard, Download, Eye, Filter, RefreshCw, Search, Wallet } from "lucide-react";
import { DataTable, MetricCard, Panel, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, normalize } from "../services/format.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { total } from "../shared/utils/aggregate.js";
import { CreditRiskPanel } from "../modules/credits/CreditRiskPanel.jsx";
import {
  baseCreditDate,
  currentBusinessYear,
} from "../shared/lib/appDomain.jsx";
import {
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
  matchesCreditManagementFilter,
  matchesCreditSearch,
  matchesCreditSourceFilter,
  monthNamesAz,
} from "../App.jsx";

export default CreditsPage;

function CreditsPage({
  credits,
  sendCreditSms,
  onUpdatePaymentDate,
  onReceivePayment,
  onCreateCredit,
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
  const activeCredits = enrichedCredits.filter((item) => normalize(item.credit.status).includes("aktiv") && !isCreditClosed(item.credit, item.plan));
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
    { label: "Aktiv", title: "Aktiv", count: activeCredits.length, tone: "success" },
    { label: "Gözləyən", title: "Gözləyən", count: enrichedCredits.filter((item) => matchesCreditManagementFilter(item, "Gözləyən")).length, tone: "warning" },
    { label: "Gecikmiş", title: "Gecikmiş", count: overdueCredits.length, tone: "danger" },
    { label: "Bağlanmış", title: "Bağlanmış", count: completedCredits.length, tone: "info" },
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
      const matchesMonth = monthFilter === "Bütün aylar" || (date && monthNamesAz[date.getMonth()] === monthFilter);
      const matchesYear = yearFilter === "Bütün illər" || (date && String(date.getFullYear()) === String(yearFilter));
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

      <CreditRiskPanel />

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
                <TwoLine title={paymentState.nextInstallment?.due || credit.next || "—"} subtitle={nextAmount > 0 ? `${money(nextAmount)} aylıq` : "Plan tamamlanıb"} />,
                <div className="credit-status-stack">
                  <StatusBadge status={getCreditManagementStatus(item)} />
                  {paymentState.isOverdue && <strong className="credit-overdue-days">{paymentState.daysOverdue} gün gecikmə</strong>}
                </div>,
                <div className="credit-table-actions">
                  <button className="icon-btn" title="Kredit kartına bax" onClick={() => setDetailCreditId(credit.id)}>
                    <Eye size={16} />
                  </button>
                  <button className="icon-btn" title="Ödəniş tarixçəsi" onClick={() => setDetailCreditId(credit.id)}>
                    <RefreshCw size={16} />
                  </button>
                </div>,
              ];
            })}
          />
        </Panel>

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
