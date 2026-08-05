import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarClock,
  Check,
  CreditCard,
  Download,
  Plus,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  DataTable,
  MetricCard,
  Panel,
  PanelHeader,
  ProgressRow,
  StatusBadge,
  TwoLine,
} from "../components/ui.jsx";
import { money, normalize, percent } from "../services/format.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import { total } from "../shared/utils/aggregate.js";
import { ReconciliationPanel } from "../modules/finance/ReconciliationPanel.jsx";
import {
  baseFinanceDate,
  buildDailyCashSummary,
  buildExpenseCategoryRows,
  buildFinanceLedger,
  buildFinanceScenario,
  hasExpenseCashImpact,
  getCreditDisplayPlan,
  getCreditPaymentState,
  isCreditClosed,
} from "../App.jsx";

export default FinancePage;

function FinancePage({
  expenses,
  cashEntries,
  orders,
  credits,
  currencyRows = [],
  setExpenseStatus,
  accounts = [],
  openingBalance = 0,
  onCreateAccount,
  onEditAccount,
  onEditExpense,
  onDeleteExpense,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenVendors,
}) {
  const [financeFilter, setFinanceFilter] = useState("HamД±sД±");
  const [categoryFilter, setCategoryFilter] = useState("BГјtГјn kateqoriyalar");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const pending = expenses.filter((expense) => expense.status === "TЙ™sdiq gГ¶zlЙ™yir");
  const approvedExpenses = expenses.filter((expense) => expense.status === "TЙ™sdiq edildi");
  const approvedCashExpenses = approvedExpenses.filter((expense) => hasExpenseCashImpact(expense));
  const pendingCashExpenses = pending.filter((expense) => hasExpenseCashImpact(expense));
  const nonCashExpenseTotal = expenses
    .filter((expense) => !hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const ledger = useMemo(() => buildFinanceLedger({ orders, expenses, cashEntries }), [orders, expenses, cashEntries]);
  const financeScenario = useMemo(
    () => buildFinanceScenario({ orders, expenses, credits, cashEntries, openingBalance }),
    [orders, expenses, credits, cashEntries, openingBalance],
  );
  const categoryRows = buildExpenseCategoryRows(expenses);
  const approvedExpenseTotal = total(approvedCashExpenses, "amount");
  const pendingExpenseTotal = total(pendingCashExpenses, "amount");
  const inflowTotal = ledger
    .filter((row) => row.direction === "in")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const salesCashTotal = ledger
    .filter((row) => row.type === "SatД±Еџ" && row.direction === "in")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const creditCashTotal = ledger
    .filter((row) => row.type === "Kredit")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const penaltyIncome = ledger.reduce((sum, row) => sum + Number(row.penalty || 0), 0);
  const cashTotal = Number(openingBalance || 0) + inflowTotal - approvedExpenseTotal;
  const netFlow = inflowTotal - approvedExpenseTotal;
  const expectedCredit = credits.reduce((sum, credit) => {
    const plan = getCreditDisplayPlan(credit);
    if (isCreditClosed(credit, plan)) return sum;
    const paymentState = getCreditPaymentState(credit, plan);
    return sum + Number(paymentState.nextInstallment?.amount || 0);
  }, 0);
  const filterItems = [
    { label: "HamД±sД±", count: ledger.length },
    { label: "Daxilolma", count: ledger.filter((row) => row.direction === "in").length },
    { label: "SatД±Еџ", count: ledger.filter((row) => row.type === "SatД±Еџ").length },
    { label: "Kredit", count: ledger.filter((row) => row.type === "Kredit").length },
    { label: "XЙ™rc", count: ledger.filter((row) => row.type === "XЙ™rc").length },
    { label: "GecikmЙ™ gЙ™liri", count: ledger.filter((row) => Number(row.penalty || 0) > 0).length },
    { label: "TЙ™sdiq gГ¶zlЙ™yir", count: pending.length },
    { label: "Cash tЙ™sirsiz", count: ledger.filter((row) => row.direction === "accrual").length },
  ];
  const categoryOptions = ["BГјtГјn kateqoriyalar", ...new Set(ledger.map((row) => row.category).filter(Boolean))];
  const visibleLedger = ledger.filter((row) => {
    const matchesFilter = matchesFinanceFilter(row, financeFilter);
    const matchesCategory = categoryFilter === "BГјtГјn kateqoriyalar" || row.category === categoryFilter;
    return (
      matchesFilter &&
      matchesCategory &&
      matchesFinanceDateRange(row, dateFrom, dateTo) &&
      matchesFinanceSearch(row, ledgerSearch)
    );
  });
  const visibleInflow = visibleLedger
    .filter((row) => row.direction === "in")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visibleOutflow = visibleLedger
    .filter((row) => row.direction === "out")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visiblePending = visibleLedger
    .filter((row) => row.direction === "pending")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visibleAccrual = visibleLedger
    .filter((row) => row.direction === "accrual")
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const visiblePenalty = visibleLedger.reduce((sum, row) => sum + Number(row.penalty || 0), 0);
  const visibleNet = visibleInflow - visibleOutflow;
  const dailyCash = useMemo(() => buildDailyCashSummary(ledger, openingBalance, baseFinanceDate), [ledger, openingBalance]);
  const dailyCreditRows = dailyCash.rows.filter((row) => row.type === "Kredit");
  const dailySalesRows = dailyCash.rows.filter((row) => row.type === "SatД±Еџ");
  const dailyExpenseRows = dailyCash.rows.filter((row) => row.type === "XЙ™rc");
  const maxCategoryTotal = Math.max(1, ...categoryRows.map((row) => row.total));
  const fxExposure = currencyRows.reduce((sum, row) => sum + Math.abs(Number(row.exposureAzn || 0)), 0);
  const activeAccounts = accounts.filter((account) => account.status === "Aktiv");
  const cashAccounts = activeAccounts.filter((account) => normalize(account.type).includes("kassa"));
  const bankAccounts = activeAccounts.filter((account) => !normalize(account.type).includes("kassa"));
  const accountOpeningBalance = total(activeAccounts, "openingBalance");
  const resetLedgerFilters = () => {
    setFinanceFilter("HamД±sД±");
    setCategoryFilter("BГјtГјn kateqoriyalar");
    setDateFrom("");
    setDateTo("");
    setLedgerSearch("");
  };
  const exportVisibleLedger = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Tarix", "Tip", "MЙ™nbЙ™ modul", "Kateqoriya", "Hesab", "MЙ™nbЙ™", "TЙ™rЙ™f", "ЖЏsas", "GecikmЙ™", "MЙ™blЙ™Дџ", "Status"],
      ...visibleLedger.map((row) => [
        row.date,
        row.type,
        row.source,
        row.category,
        row.account,
        row.title,
        row.party,
        row.principal,
        row.penalty,
        row.amount,
        row.status,
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `maliyye-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };
  const renderFinanceSource = (row) => {
    if (row.type === "SatД±Еџ" && row.orderId) {
      return (
        <div className="finance-source-cell">
          <button
            className="module-link-btn"
            type="button"
            onClick={() => onOpenSalesOrder?.(row.orderId)}
            data-testid="finance-ledger-order-link"
          >
            {row.orderId}
          </button>
          <small>{row.description}</small>
        </div>
      );
    }

    if (row.type === "Kredit" && row.creditId) {
      return (
        <div className="finance-source-cell">
          <div className="finance-source-links">
            <button
              className="module-link-btn"
              type="button"
              onClick={() => onOpenCredit?.(row.creditId)}
              data-testid="finance-ledger-credit-link"
            >
              {row.creditId}
            </button>
            {row.orderId ? (
              <button
                className="module-link-btn subtle"
                type="button"
                onClick={() => onOpenSalesOrder?.(row.orderId)}
                data-testid="finance-ledger-credit-order-link"
              >
                {row.orderId}
              </button>
            ) : null}
          </div>
          <small>{row.contractId || row.description}</small>
        </div>
      );
    }

    if (row.poId) {
      return (
        <div className="finance-source-cell">
          <button
            className="module-link-btn"
            type="button"
            onClick={() => onOpenVendors?.(row.poId)}
            data-testid="finance-ledger-po-link"
          >
            {row.poId}
          </button>
          <small>{row.title}</small>
        </div>
      );
    }

    return <TwoLine title={row.title} subtitle={row.description} />;
  };

  return (
    <div className="stack">
      <ReconciliationPanel />
      <section className="metric-grid four">
        <MetricCard label="Cash balans" value={money(cashTotal)} icon={Wallet} tone="success" />
        <MetricCard label="Daxilolma" value={money(inflowTotal)} trend={`${orders.length} satД±Еџ/kredit mЙ™nbЙ™yi`} icon={TrendingUp} tone="primary" />
        <MetricCard label="Real cash Г§Д±xД±ЕџД±" value={money(approvedExpenseTotal)} trend={`${money(pendingExpenseTotal)} tЙ™sdiqdЙ™ В· ${money(nonCashExpenseTotal)} cash tЙ™sirsiz`} icon={BarChart3} tone="warning" />
        <MetricCard
          label="Kredit kassasД±"
          value={money(creditCashTotal)}
          trend={`${money(penaltyIncome)} gecikmЙ™ gЙ™liri`}
          icon={CreditCard}
          tone="info"
        />
      </section>

      <Panel className="finance-control-panel">
        <PanelHeader title="MaliyyЙ™ nЙ™zarЙ™ti" subtitle="Kassa, satД±Еџ, kredit vЙ™ xЙ™rc axД±nlarД±nД±n icmalД±" icon={Wallet} />
        <div className="finance-control-grid">
          <div className="finance-control-tile">
            <span>BaЕџlanДџД±c balans</span>
            <strong>{money(openingBalance)}</strong>
            <small>{accounts.length} hesab ГјzrЙ™</small>
          </div>
          <div className="finance-control-tile">
            <span>Net axД±n</span>
            <strong>{money(netFlow)}</strong>
            <small>Daxilolma - tЙ™sdiqli xЙ™rclЙ™r</small>
          </div>
          <div className="finance-control-tile">
            <span>GГ¶zlЙ™nilЙ™n kredit</span>
            <strong>{money(expectedCredit)}</strong>
            <small>NГ¶vbЙ™ti aylД±q Г¶dЙ™niЕџlЙ™r</small>
          </div>
          <div className="finance-control-tile">
            <span>BugГјn</span>
            <strong>{formatPaymentDate(parsePaymentDate(baseFinanceDate))}</strong>
            <small>{pending.length} tЙ™sdiq gГ¶zlЙ™yir</small>
          </div>
        </div>
        <div className="finance-cash-bridge">
          <div>
            <span>SatД±Еџdan kassa</span>
            <strong>{money(salesCashTotal)}</strong>
            <small>NaДџd/kart/kГ¶Г§ГјrmЙ™ yД±ДџД±mД±</small>
          </div>
          <div>
            <span>Kredit yД±ДџД±mД±</span>
            <strong>{money(creditCashTotal)}</strong>
            <small>ЖЏsas + gecikmЙ™ gЙ™liri</small>
          </div>
          <div>
            <span>TЙ™sdiqli cash Г§Д±xД±ЕџД±</span>
            <strong>{money(approvedExpenseTotal)}</strong>
            <small>Real kassaya tЙ™sir edЙ™n xЙ™rclЙ™r</small>
          </div>
          <div>
            <span>Cash tЙ™sirsiz uГ§ot</span>
            <strong>{money(nonCashExpenseTotal)}</strong>
            <small>Payroll vЙ™ accrual xЙ™rclЙ™r</small>
          </div>
        </div>
        <div className="finance-signal-list">
          {pending.slice(0, 4).map((expense) => (
            <button key={expense.id} className="finance-signal-row" onClick={() => setExpenseStatus(expense.id, "TЙ™sdiq edildi")}>
              <div>
                <strong>{expense.description}</strong>
                <span>
                  {expense.category} В· {money(expense.amount)} В· kliklЙ™ tЙ™sdiqlЙ™
                </span>
              </div>
              <StatusBadge status={expense.status} />
            </button>
          ))}
          {pending.length === 0 && (
            <div className="finance-signal-empty">
              <Check size={16} />
              TЙ™sdiq gГ¶zlЙ™yЙ™n xЙ™rc yoxdur
            </div>
          )}
        </div>
      </Panel>

      <Panel className="finance-daily-close-panel" data-testid="finance-daily-close">
        <PanelHeader
          title="GГјnlГјk kassa baДџlanД±ЕџД±"
          subtitle={`${dailyCash.label} ГјzrЙ™ real kassa hЙ™rЙ™kЙ™ti, pending Г¶hdЙ™lik vЙ™ cash-neutral uГ§ot ayrД±mД±`}
          icon={CalendarClock}
        />
        <div className="finance-daily-grid">
          <div>
            <span>AГ§Д±lД±Еџ</span>
            <strong>{money(dailyCash.opening)}</strong>
            <small>ЖЏvvЙ™lki gГјnlЙ™rdЙ™n gЙ™lЙ™n balans</small>
          </div>
          <div>
            <span>BugГјnkГј giriЕџ</span>
            <strong>{money(dailyCash.inflow)}</strong>
            <small>{dailySalesRows.length} satД±Еџ В· {dailyCreditRows.length} kredit</small>
          </div>
          <div>
            <span>BugГјnkГј Г§Д±xД±Еџ</span>
            <strong>{money(dailyCash.outflow)}</strong>
            <small>TЙ™sdiqli real xЙ™rc</small>
          </div>
          <div>
            <span>BaДџlanД±Еџ</span>
            <strong>{money(dailyCash.closing)}</strong>
            <small>Faktiki cash qalД±ДџД±</small>
          </div>
          <div>
            <span>GГ¶zlЙ™yЙ™n Г§Д±xД±Еџ</span>
            <strong>{money(dailyCash.pendingOutflow)}</strong>
            <small>{dailyExpenseRows.filter((row) => row.direction === "pending").length} tЙ™sdiq gГ¶zlЙ™yir</small>
          </div>
          <div>
            <span>Proqnoz qalД±q</span>
            <strong>{money(dailyCash.projectedClosing)}</strong>
            <small>{money(dailyCash.penalty)} gecikmЙ™ gЙ™liri В· {money(dailyCash.accrual)} accrual</small>
          </div>
        </div>
        <DataTable
          columns={["MЙ™nbЙ™", "Tip", "TЙ™rЙ™f", "ЖЏsas", "GecikmЙ™", "Kassa", "Status"]}
          rows={dailyCash.rows.slice(0, 6).map((row) => [
            renderFinanceSource(row),
            <StatusBadge status={row.type} />,
            row.party,
            row.principal > 0 ? money(row.principal) : "вЂ”",
            row.penalty > 0 ? money(row.penalty) : "вЂ”",
            <strong className={`finance-amount ${row.direction}`}>
              {row.direction === "out" ? "-" : row.direction === "in" ? "+" : ""}
              {money(row.amount)}
            </strong>,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <Panel className="finance-account-panel">
        <div className="warehouse-detail-head">
          <div>
            <h2>Kassa vЙ™ bank hesablarД±</h2>
            <p>AГ§Д±lД±Еџ balanslarД± hesablar ГјzrЙ™ mГјhasibat vЙ™ kassa proqnozuna daxil edilir.</p>
          </div>
          <button className="secondary-btn" onClick={onCreateAccount}>
            <Plus size={16} />
            Hesab Й™lavЙ™ et
          </button>
        </div>
        <div className="finance-account-summary">
          <div>
            <span>Aktiv hesablar</span>
            <strong>{activeAccounts.length}</strong>
            <small>{cashAccounts.length} kassa В· {bankAccounts.length} bank</small>
          </div>
          <div>
            <span>AГ§Д±lД±Еџ balansД±</span>
            <strong>{money(accountOpeningBalance)}</strong>
            <small>Kassa proqnozuna daxildir</small>
          </div>
          <div>
            <span>Cari cash balans</span>
            <strong>{money(cashTotal)}</strong>
            <small>AГ§Д±lД±Еџ + daxilolma - tЙ™sdiqli Г§Д±xД±Еџ</small>
          </div>
        </div>
        <DataTable
          columns={["Hesab", "Tip", "Valyuta", "AГ§Д±lД±Еџ balansД±", "Status", "ЖЏmЙ™liyyat"]}
          rows={accounts.map((account) => [
            <TwoLine title={account.name} subtitle={account.code} />,
            account.type,
            account.currency,
            <strong>{money(account.openingBalance)}</strong>,
            <StatusBadge status={account.status} />,
            <button className="text-btn" onClick={() => onEditAccount(account.id)}>RedaktЙ™</button>,
          ])}
        />
      </Panel>

      <Panel className="finance-scenario-panel">
        <PanelHeader
          title="Д°darЙ™etmЙ™ uГ§otu"
          subtitle="P&L, debitor qalД±qlarД± vЙ™ tЙ™sdiq gГ¶zlЙ™yЙ™n xЙ™rclЙ™rin kassaya tЙ™siri"
          icon={BarChart3}
        />
        <div className="finance-scenario-grid">
          <div>
            <span>BrГјt satД±Еџ</span>
            <strong>{money(financeScenario.grossSales)}</strong>
            <small>SatД±Еџ modulu ГјzrЙ™</small>
          </div>
          <div>
            <span>TЙ™xmini maya</span>
            <strong>{money(financeScenario.estimatedCost)}</strong>
            <small>68% mЙ™hsul maya modeli</small>
          </div>
          <div>
            <span>BrГјt mЙ™nfЙ™Й™t</span>
            <strong>{money(financeScenario.grossProfit)}</strong>
            <small>{percent(financeScenario.margin)} marja</small>
          </div>
          <div>
            <span>Debitor portfeli</span>
            <strong>{money(financeScenario.creditBalance)}</strong>
            <small>Kredit qalД±qlarД±</small>
          </div>
          <div>
            <span>GГ¶zlЙ™yЙ™n xЙ™rclЙ™rdЙ™n sonra</span>
            <strong>{money(financeScenario.cashAfterPending)}</strong>
            <small>Kassa proqnozu</small>
          </div>
        </div>
      </Panel>

      <Panel className="finance-currency-panel">
        <PanelHeader
          title="Multi-valyuta nЙ™zarЙ™ti"
          subtitle="SatД±Еџ, yД±ДџД±m vЙ™ aГ§Д±q kredit portfeli ГјzrЙ™ AZN/USD/EUR ekvivalenti"
          icon={Wallet}
        />
        <div className="finance-scenario-grid">
          <div>
            <span>FX risk</span>
            <strong>{money(fxExposure)}</strong>
            <small>AГ§Д±q portfel ГјzrЙ™ tЙ™xmini tЙ™sir</small>
          </div>
          <div>
            <span>Valyuta sayД±</span>
            <strong>{currencyRows.length}</strong>
            <small>Aktiv kurs masasД±</small>
          </div>
          <div>
            <span>Baza valyuta</span>
            <strong>AZN</strong>
            <small>Kassa vЙ™ mГјhasibat bazasД±</small>
          </div>
        </div>
        <DataTable
          columns={["Valyuta", "Kurs", "SatД±Еџ ekvivalenti", "YД±ДџД±m ekvivalenti", "FX tЙ™sir", "Status"]}
          rows={currencyRows.map((row) => [
            <TwoLine title={row.code} subtitle={row.name} />,
            row.rate,
            `${row.salesEquivalent} ${row.code}`,
            `${row.collectedEquivalent} ${row.code}`,
            money(row.exposureAzn),
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <section className="dashboard-grid">
        <Panel>
          <PanelHeader title="XЙ™rc kateqoriyalarД±" subtitle="TЙ™sdiqli, gГ¶zlЙ™yЙ™n vЙ™ imtina edilmiЕџ xЙ™rclЙ™r" />
          <div className="finance-category-list">
            {categoryRows.map((row) => (
              <div className="finance-category-row" key={row.category}>
                <div className="finance-category-main">
                  <TwoLine title={row.category} subtitle={`${money(row.approved)} tЙ™sdiqli В· ${money(row.pending)} gГ¶zlЙ™yir`} />
                  <strong>{money(row.total)}</strong>
                </div>
                <ProgressRow value={(row.total / maxCategoryTotal) * 100} compact />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="finance-expense-queue-panel span-2">
          <PanelHeader title="XЙ™rc tЙ™sdiq nГ¶vbЙ™si" subtitle="RЙ™hbЙ™rlik tЙ™sdiqi vЙ™ imtina axД±nД±" />
          <DataTable
            columns={["TЙ™svir", "Kateqoriya", "Tarix", "MЙ™blЙ™Дџ", "Status", "ЖЏmЙ™liyyat"]}
            rows={expenses.map((expense) => [
              <strong>{expense.description}</strong>,
              expense.category,
              expense.date,
              money(expense.amount),
              <StatusBadge status={expense.status} />,
              <div className="row-actions operation-table-actions">
                {expense.status === "TЙ™sdiq gГ¶zlЙ™yir" && (
                  <>
                    <button className="text-btn" onClick={() => setExpenseStatus(expense.id, "TЙ™sdiq edildi")}>
                      TЙ™sdiq
                    </button>
                    <button className="text-btn danger" onClick={() => setExpenseStatus(expense.id, "Д°mtina edildi")}>
                      Д°mtina
                    </button>
                  </>
                )}
                <button className="text-btn" onClick={() => onEditExpense(expense.id)}>RedaktЙ™</button>
                <button className="text-btn danger" onClick={() => onDeleteExpense(expense.id)}>Sil</button>
              </div>,
            ])}
          />
        </Panel>
      </section>

      <Panel className="finance-ledger-panel">
        <PanelHeader title="Kassa axД±nД±" subtitle="SatД±Еџ, kredit Г¶dЙ™niЕџi vЙ™ xЙ™rclЙ™r vahid reyestrdЙ™" />
        <div className="finance-filter-toolbar">
          <div className="tabs finance-filter-tabs">
            {filterItems.map((item) => (
              <button
                key={item.label}
                className={financeFilter === item.label ? "active" : ""}
                onClick={() => setFinanceFilter(item.label)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          <div className="finance-filter-controls">
            <label className="finance-search-filter">
              <span>AxtarД±Еџ</span>
              <input
                value={ledgerSearch}
                onChange={(event) => setLedgerSearch(event.target.value)}
                placeholder="MЙ™nbЙ™, tЙ™rЙ™f, status..."
              />
            </label>
            <label className="finance-category-filter">
              <span>Kateqoriya</span>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                {categoryOptions.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="finance-date-filter">
              <span>BaЕџlanДџД±c</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="finance-date-filter">
              <span>Son</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button className="secondary-btn icon-only" type="button" title="FilterlЙ™ri sД±fД±rla" onClick={resetLedgerFilters}>
              <RefreshCw size={16} />
            </button>
            <button className="secondary-btn finance-export-btn" type="button" onClick={exportVisibleLedger}>
              <Download size={16} />
              Export
            </button>
          </div>
        </div>
        <div className="finance-ledger-summary">
          <div>
            <span>GГ¶rГјnЙ™n daxilolma</span>
            <strong>{money(visibleInflow)}</strong>
          </div>
          <div>
            <span>GГ¶rГјnЙ™n Г§Д±xД±Еџ</span>
            <strong>{money(visibleOutflow)}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong>{money(visibleNet)}</strong>
          </div>
          <div>
            <span>GГ¶zlЙ™yЙ™n / accrual</span>
            <strong>{money(visiblePending + visibleAccrual)}</strong>
          </div>
          <div>
            <span>GecikmЙ™ gЙ™liri</span>
            <strong>{money(visiblePenalty)}</strong>
          </div>
        </div>
        <DataTable
          columns={["Tarix", "Tip", "Hesab", "MЙ™nbЙ™", "MГјЕџtЙ™ri/TЙ™svir", "ЖЏsas", "GecikmЙ™", "MЙ™blЙ™Дџ", "Status"]}
          rows={visibleLedger.map((row) => [
            row.date,
            <StatusBadge status={row.type} />,
            row.account || "вЂ”",
            renderFinanceSource(row),
            row.party,
            row.principal > 0 ? money(row.principal) : "вЂ”",
            row.penalty > 0 ? money(row.penalty) : "вЂ”",
            <strong className={`finance-amount ${row.direction}`}>
              {row.direction === "out" ? "-" : row.direction === "in" ? "+" : ""}
              {money(row.amount)}
            </strong>,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <Panel>
        <PanelHeader title="Kredit kassa daxilolmalarД±" subtitle="ЖЏsas mЙ™blЙ™Дџ vЙ™ gecikmЙ™ gЙ™liri ayrД± izlЙ™nir" />
        <DataTable
          columns={["Tarix", "MГјЕџtЙ™ri", "Kredit", "MГјqavilЙ™", "ЖЏsas", "GecikmЙ™", "Kassa"]}
          rows={cashEntries.map((entry) => [
            entry.date,
            <strong>{entry.customer}</strong>,
            entry.creditId,
            entry.contractId || "вЂ”",
            money(entry.principal),
            money(entry.penalty),
            <StatusBadge status={money(entry.amount)} />,
          ])}
        />
      </Panel>
    </div>
  );
}


