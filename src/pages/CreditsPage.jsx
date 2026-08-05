import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CircleAlert, CreditCard, Download, Eye, Filter, RefreshCw, Search, Wallet } from "lucide-react";
import { DataTable, MetricCard, Panel, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, normalize } from "../services/format.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { total } from "../shared/utils/aggregate.js";
import { CreditRiskPanel } from "../modules/credits/CreditRiskPanel.jsx";
import {
  CreditDetailModal,
  baseCreditDate,
  currentBusinessYear,
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
  const [creditFilter, setCreditFilter] = useState("HamД±sД±");
  const [sourceFilter, setSourceFilter] = useState("BГјtГјn mЙ™nbЙ™lЙ™r");
  const [monthFilter, setMonthFilter] = useState("BГјtГјn aylar");
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
  const salesCredits = enrichedCredits.filter((item) => getCreditSourceLabel(item.credit) === "SatД±Еџdan gЙ™lЙ™n");
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
      label: "SatД±Еџ baДџlantД±sД±",
      value: `${linkedSalesCredits.length}/${salesCredits.length}`,
      hint: "SifariЕџ vЙ™ mГјqavilЙ™ ilЙ™ gЙ™lЙ™n kreditlЙ™r",
      tone: linkedSalesCredits.length === salesCredits.length ? "success" : "warning",
    },
    {
      label: "AyrД± borc mЙ™ntiqi",
      value: uniqueContractCount,
      hint: "HЙ™r kredit ayrД±ca mГјqavilЙ™ kimi saxlanД±r",
      tone: uniqueContractCount === enrichedCredits.length ? "success" : "warning",
    },
    {
      label: "YД±ДџД±m nГ¶vbЙ™si",
      value: collectionQueueCount,
      hint: "Bu gГјn vЙ™ gecikmiЕџ Г¶dЙ™niЕџlЙ™r",
      tone: collectionQueueCount > 0 ? "danger" : "success",
    },
    {
      label: "MaliyyЙ™ sinxronu",
      value: money(paidTotal),
      hint: "ЖЏsas Г¶dЙ™niЕџ borcdan, cЙ™rimЙ™ kassadan izlЙ™nir",
      tone: "info",
    },
  ];
  const filterItems = [
    { label: "HamД±sД±", title: "HamД±sД±", count: enrichedCredits.length, tone: "primary" },
    { label: "Aktiv", title: "Aktiv", count: activeCredits.length, tone: "success" },
    { label: "GГ¶zlЙ™yЙ™n", title: "GГ¶zlЙ™yЙ™n", count: enrichedCredits.filter((item) => matchesCreditManagementFilter(item, "GГ¶zlЙ™yЙ™n")).length, tone: "warning" },
    { label: "GecikmiЕџ", title: "GecikmiЕџ", count: overdueCredits.length, tone: "danger" },
    { label: "BaДџlanmД±Еџ", title: "BaДџlanmД±Еџ", count: completedCredits.length, tone: "info" },
    { label: "BugГјnkГј", title: "BugГјnkГј", count: todayCredits.length, tone: "neutral" },
    { label: "Cari ay", title: "Cari ay", count: currentMonthCredits.length, tone: "neutral" },
  ];
  const sourceFilters = ["BГјtГјn mЙ™nbЙ™lЙ™r", "SatД±Еџdan gЙ™lЙ™n", "Manual kredit"];
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
      const matchesMonth = monthFilter === "BГјtГјn aylar" || (date && monthNamesAz[date.getMonth()] === monthFilter);
      const matchesYear = yearFilter === "BГјtГјn illЙ™r" || (date && String(date.getFullYear()) === String(yearFilter));
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
    setCreditFilter("HamД±sД±");
    setSourceFilter("BГјtГјn mЙ™nbЙ™lЙ™r");
    setMonthFilter("BГјtГјn aylar");
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
      ["Kod", "MГјЕџtЙ™ri", "FIN", "MГјqavilЙ™", "Cihaz", "MЙ™blЙ™Дџ", "QalД±q", "AylД±q", "NГ¶vbЙ™ti tarix", "Status", "GecikmЙ™", "MЙ™nbЙ™"],
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
          paymentState.isOverdue ? `${paymentState.daysOverdue} gГјn` : "",
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
        <MetricCard label="Aktiv kreditlЙ™r" value={activeCredits.length} icon={CreditCard} tone="primary" />
        <MetricCard label="Portfel qalД±ДџД±" value={money(portfolioBalance)} trend={`${money(paidTotal)} Г¶dЙ™nilib`} icon={Wallet} tone="success" />
        <MetricCard label="Bu ay yД±ДџД±m" value={money(monthlyDue)} trend={`Orta ${money(averageMonthly)}`} icon={CalendarClock} tone="info" />
        <MetricCard label="GecikmiЕџ" value={overdueCredits.length} trend={money(overdueAmount)} icon={CircleAlert} tone="danger" />
      </section>

      <section className="credit-handover-strip" aria-label="Kredit modulunun tЙ™hvil statusu">
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
            <h2>Portfel siyahД±sД±</h2>
            <p>KreditlЙ™ri prioritet, tarix vЙ™ mЙ™nbЙ™ ГјzrЙ™ idarЙ™ edin.</p>
          </div>
          <div className="credit-management-summary" aria-label="Kredit portfeli xГјlasЙ™si">
            <span><strong>{visibleCredits.length}</strong> nЙ™ticЙ™</span>
            <span><strong>{todayCredits.length}</strong> bu gГјn</span>
            <span><strong>{salesCredits.length}</strong> satД±Еџdan</span>
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
                Kredit siyahД±sД±
              </h3>
              <span>{todayLabel} tarixinЙ™ portfel icmalД±</span>
            </div>
            <strong>{visibleCredits.length} kredit</strong>
          </div>

          <div className="credit-directory-filters">
            <label>
              <span>GГ¶stЙ™r</span>
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Ay</span>
              <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                <option>BГјtГјn aylar</option>
                {monthNamesAz.map((month) => (
                  <option key={month}>{month}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Д°l</span>
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option>BГјtГјn illЙ™r</option>
                {yearOptions.map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="credit-search-field">
              <span>AxtarД±Еџ</span>
              <div>
                <Search size={15} />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="MГјЕџtЙ™ri, kredit kodu, mГјqavilЙ™..."
                />
              </div>
            </label>
            <label>
              <span>MЙ™nbЙ™</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {sourceFilters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <button className="primary-btn icon-only" title="FilterlЙ™ri tЙ™tbiq et" type="button" onClick={applyFilters}>
              <Filter size={16} />
            </button>
            <button className="secondary-btn icon-only" title="FilterlЙ™ri sД±fД±rla" type="button" onClick={resetFilters}>
              <RefreshCw size={16} />
            </button>
            <button className="secondary-btn credit-excel-btn" type="button" onClick={exportVisibleCredits}>
              <Download size={16} />
              Excel
            </button>
          </div>

          <DataTable
            columns={["#", "MГјЕџtЙ™ri", "MГјqavilЙ™ / cihaz", "MГјqavilЙ™ mЙ™blЙ™Дџi", "Г–dЙ™nilib", "QalД±q", "NГ¶vbЙ™ti", "Status", "ЖЏmЙ™l."]}
            rows={tableCredits.map((item, index) => {
              const { credit, plan, paymentState } = item;
              const nextAmount = Number(paymentState.nextInstallment?.amount || 0);
              const debt = getCreditDebtFormula(item);
              const compactCode = String(credit.id || "").replace(/\D/g, "").slice(-4) || credit.id;
              const customerMeta = [credit.fin, getCreditSourceLabel(credit)].filter(Boolean).join(" В· ");
              return [
                index + 1,
                <div className="credit-customer-cell">
                  <span className="credit-avatar">{getCreditInitials(credit.customer)}</span>
                  <div className="credit-customer-copy">
                    <strong>{credit.customer}</strong>
                    <span>
                      <b>#{compactCode}</b>
                      {customerMeta ? ` В· ${customerMeta}` : ""}
                    </span>
                  </div>
                </div>,
                <div className="credit-contract-cell" data-testid="credit-contract-cell">
                  <strong>{credit.contractId || credit.id}</strong>
                  <span>{credit.device || credit.product || "Cihaz qeyd edilmЙ™yib"}</span>
                  <em>
                    {credit.orderId ? (
                      <button
                        className="inline-module-link"
                        type="button"
                        onClick={() => onOpenSalesOrder?.(credit.orderId)}
                        data-testid="credit-row-order-link"
                      >
                        {credit.orderId} sifariЕџi
                      </button>
                    ) : (
                      "Manual qeyd"
                    )}{" "}
                    В· {debt.remainingMonths} ay qalД±b
                  </em>
                </div>,
                <TwoLine title={money(debt.total)} subtitle={`${plan.months} ay В· ${credit.date || "tarixsiz"}`} />,
                <TwoLine title={money(debt.paid)} subtitle={`${credit.paidMonths || 0}/${plan.months} ay baДџlanД±b`} />,
                <TwoLine title={money(debt.balance)} subtitle={`NГ¶vbЙ™ti ${money(debt.nextAmount)}`} />,
                <TwoLine title={paymentState.nextInstallment?.due || credit.next || "вЂ”"} subtitle={nextAmount > 0 ? `${money(nextAmount)} aylД±q` : "Plan tamamlanД±b"} />,
                <div className="credit-status-stack">
                  <StatusBadge status={getCreditManagementStatus(item)} />
                  {paymentState.isOverdue && <strong className="credit-overdue-days">{paymentState.daysOverdue} gГјn gecikmЙ™</strong>}
                </div>,
                <div className="credit-table-actions">
                  <button className="icon-btn" title="Kredit kartД±na bax" onClick={() => setDetailCreditId(credit.id)}>
                    <Eye size={16} />
                  </button>
                  <button className="icon-btn" title="Г–dЙ™niЕџ tarixГ§Й™si" onClick={() => setDetailCreditId(credit.id)}>
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

