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
  const [financeFilter, setFinanceFilter] = useState("Hamısı");
  const [categoryFilter, setCategoryFilter] = useState("Bütün kateqoriyalar");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const pending = expenses.filter((expense) => expense.status === "Təsdiq gözləyir");
  const approvedExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi");
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
    .filter((row) => row.type === "Satış" && row.direction === "in")
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
    { label: "Hamısı", count: ledger.length },
    { label: "Daxilolma", count: ledger.filter((row) => row.direction === "in").length },
    { label: "Satış", count: ledger.filter((row) => row.type === "Satış").length },
    { label: "Kredit", count: ledger.filter((row) => row.type === "Kredit").length },
    { label: "Xərc", count: ledger.filter((row) => row.type === "Xərc").length },
    { label: "Gecikmə gəliri", count: ledger.filter((row) => Number(row.penalty || 0) > 0).length },
    { label: "Təsdiq gözləyir", count: pending.length },
    { label: "Cash təsirsiz", count: ledger.filter((row) => row.direction === "accrual").length },
  ];
  const categoryOptions = ["Bütün kateqoriyalar", ...new Set(ledger.map((row) => row.category).filter(Boolean))];
  const visibleLedger = ledger.filter((row) => {
    const matchesFilter = matchesFinanceFilter(row, financeFilter);
    const matchesCategory = categoryFilter === "Bütün kateqoriyalar" || row.category === categoryFilter;
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
  const dailySalesRows = dailyCash.rows.filter((row) => row.type === "Satış");
  const dailyExpenseRows = dailyCash.rows.filter((row) => row.type === "Xərc");
  const maxCategoryTotal = Math.max(1, ...categoryRows.map((row) => row.total));
  const fxExposure = currencyRows.reduce((sum, row) => sum + Math.abs(Number(row.exposureAzn || 0)), 0);
  const activeAccounts = accounts.filter((account) => account.status === "Aktiv");
  const cashAccounts = activeAccounts.filter((account) => normalize(account.type).includes("kassa"));
  const bankAccounts = activeAccounts.filter((account) => !normalize(account.type).includes("kassa"));
  const accountOpeningBalance = total(activeAccounts, "openingBalance");
  const resetLedgerFilters = () => {
    setFinanceFilter("Hamısı");
    setCategoryFilter("Bütün kateqoriyalar");
    setDateFrom("");
    setDateTo("");
    setLedgerSearch("");
  };
  const exportVisibleLedger = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Tarix", "Tip", "Mənbə modul", "Kateqoriya", "Hesab", "Mənbə", "Tərəf", "Əsas", "Gecikmə", "Məbləğ", "Status"],
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
    if (row.type === "Satış" && row.orderId) {
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
      <section className="metric-grid four">
        <MetricCard label="Cash balans" value={money(cashTotal)} icon={Wallet} tone="success" />
        <MetricCard label="Daxilolma" value={money(inflowTotal)} trend={`${orders.length} satış/kredit mənbəyi`} icon={TrendingUp} tone="primary" />
        <MetricCard label="Real cash çıxışı" value={money(approvedExpenseTotal)} trend={`${money(pendingExpenseTotal)} təsdiqdə · ${money(nonCashExpenseTotal)} cash təsirsiz`} icon={BarChart3} tone="warning" />
        <MetricCard
          label="Kredit kassası"
          value={money(creditCashTotal)}
          trend={`${money(penaltyIncome)} gecikmə gəliri`}
          icon={CreditCard}
          tone="info"
        />
      </section>

      <Panel className="finance-control-panel">
        <PanelHeader title="Maliyyə nəzarəti" subtitle="Kassa, satış, kredit və xərc axınlarının icmalı" icon={Wallet} />
        <div className="finance-control-grid">
          <div className="finance-control-tile">
            <span>Başlanğıc balans</span>
            <strong>{money(openingBalance)}</strong>
            <small>{accounts.length} hesab üzrə</small>
          </div>
          <div className="finance-control-tile">
            <span>Net axın</span>
            <strong>{money(netFlow)}</strong>
            <small>Daxilolma - təsdiqli xərclər</small>
          </div>
          <div className="finance-control-tile">
            <span>Gözlənilən kredit</span>
            <strong>{money(expectedCredit)}</strong>
            <small>Növbəti aylıq ödənişlər</small>
          </div>
          <div className="finance-control-tile">
            <span>Bugün</span>
            <strong>{formatPaymentDate(parsePaymentDate(baseFinanceDate))}</strong>
            <small>{pending.length} təsdiq gözləyir</small>
          </div>
        </div>
        <div className="finance-cash-bridge">
          <div>
            <span>Satışdan kassa</span>
            <strong>{money(salesCashTotal)}</strong>
            <small>Nağd/kart/köçürmə yığımı</small>
          </div>
          <div>
            <span>Kredit yığımı</span>
            <strong>{money(creditCashTotal)}</strong>
            <small>Əsas + gecikmə gəliri</small>
          </div>
          <div>
            <span>Təsdiqli cash çıxışı</span>
            <strong>{money(approvedExpenseTotal)}</strong>
            <small>Real kassaya təsir edən xərclər</small>
          </div>
          <div>
            <span>Cash təsirsiz uçot</span>
            <strong>{money(nonCashExpenseTotal)}</strong>
            <small>Payroll və accrual xərclər</small>
          </div>
        </div>
        <div className="finance-signal-list">
          {pending.slice(0, 4).map((expense) => (
            <button key={expense.id} className="finance-signal-row" onClick={() => setExpenseStatus(expense.id, "Təsdiq edildi")}>
              <div>
                <strong>{expense.description}</strong>
                <span>
                  {expense.category} · {money(expense.amount)} · kliklə təsdiqlə
                </span>
              </div>
              <StatusBadge status={expense.status} />
            </button>
          ))}
          {pending.length === 0 && (
            <div className="finance-signal-empty">
              <Check size={16} />
              Təsdiq gözləyən xərc yoxdur
            </div>
          )}
        </div>
      </Panel>

      <Panel className="finance-daily-close-panel" data-testid="finance-daily-close">
        <PanelHeader
          title="Günlük kassa bağlanışı"
          subtitle={`${dailyCash.label} üzrə real kassa hərəkəti, pending öhdəlik və cash-neutral uçot ayrımı`}
          icon={CalendarClock}
        />
        <div className="finance-daily-grid">
          <div>
            <span>Açılış</span>
            <strong>{money(dailyCash.opening)}</strong>
            <small>Əvvəlki günlərdən gələn balans</small>
          </div>
          <div>
            <span>Bugünkü giriş</span>
            <strong>{money(dailyCash.inflow)}</strong>
            <small>{dailySalesRows.length} satış · {dailyCreditRows.length} kredit</small>
          </div>
          <div>
            <span>Bugünkü çıxış</span>
            <strong>{money(dailyCash.outflow)}</strong>
            <small>Təsdiqli real xərc</small>
          </div>
          <div>
            <span>Bağlanış</span>
            <strong>{money(dailyCash.closing)}</strong>
            <small>Faktiki cash qalığı</small>
          </div>
          <div>
            <span>Gözləyən çıxış</span>
            <strong>{money(dailyCash.pendingOutflow)}</strong>
            <small>{dailyExpenseRows.filter((row) => row.direction === "pending").length} təsdiq gözləyir</small>
          </div>
          <div>
            <span>Proqnoz qalıq</span>
            <strong>{money(dailyCash.projectedClosing)}</strong>
            <small>{money(dailyCash.penalty)} gecikmə gəliri · {money(dailyCash.accrual)} accrual</small>
          </div>
        </div>
        <DataTable
          columns={["Mənbə", "Tip", "Tərəf", "Əsas", "Gecikmə", "Kassa", "Status"]}
          rows={dailyCash.rows.slice(0, 6).map((row) => [
            renderFinanceSource(row),
            <StatusBadge status={row.type} />,
            row.party,
            row.principal > 0 ? money(row.principal) : "—",
            row.penalty > 0 ? money(row.penalty) : "—",
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
            <h2>Kassa və bank hesabları</h2>
            <p>Açılış balansları hesablar üzrə mühasibat və kassa proqnozuna daxil edilir.</p>
          </div>
          <button className="secondary-btn" onClick={onCreateAccount}>
            <Plus size={16} />
            Hesab əlavə et
          </button>
        </div>
        <div className="finance-account-summary">
          <div>
            <span>Aktiv hesablar</span>
            <strong>{activeAccounts.length}</strong>
            <small>{cashAccounts.length} kassa · {bankAccounts.length} bank</small>
          </div>
          <div>
            <span>Açılış balansı</span>
            <strong>{money(accountOpeningBalance)}</strong>
            <small>Kassa proqnozuna daxildir</small>
          </div>
          <div>
            <span>Cari cash balans</span>
            <strong>{money(cashTotal)}</strong>
            <small>Açılış + daxilolma - təsdiqli çıxış</small>
          </div>
        </div>
        <DataTable
          columns={["Hesab", "Tip", "Valyuta", "Açılış balansı", "Status", "Əməliyyat"]}
          rows={accounts.map((account) => [
            <TwoLine title={account.name} subtitle={account.code} />,
            account.type,
            account.currency,
            <strong>{money(account.openingBalance)}</strong>,
            <StatusBadge status={account.status} />,
            <button className="text-btn" onClick={() => onEditAccount(account.id)}>Redaktə</button>,
          ])}
        />
      </Panel>

      <Panel className="finance-scenario-panel">
        <PanelHeader
          title="İdarəetmə uçotu"
          subtitle="P&L, debitor qalıqları və təsdiq gözləyən xərclərin kassaya təsiri"
          icon={BarChart3}
        />
        <div className="finance-scenario-grid">
          <div>
            <span>Brüt satış</span>
            <strong>{money(financeScenario.grossSales)}</strong>
            <small>Satış modulu üzrə</small>
          </div>
          <div>
            <span>Təxmini maya</span>
            <strong>{money(financeScenario.estimatedCost)}</strong>
            <small>68% məhsul maya modeli</small>
          </div>
          <div>
            <span>Brüt mənfəət</span>
            <strong>{money(financeScenario.grossProfit)}</strong>
            <small>{percent(financeScenario.margin)} marja</small>
          </div>
          <div>
            <span>Debitor portfeli</span>
            <strong>{money(financeScenario.creditBalance)}</strong>
            <small>Kredit qalıqları</small>
          </div>
          <div>
            <span>Gözləyən xərclərdən sonra</span>
            <strong>{money(financeScenario.cashAfterPending)}</strong>
            <small>Kassa proqnozu</small>
          </div>
        </div>
      </Panel>

      <Panel className="finance-currency-panel">
        <PanelHeader
          title="Multi-valyuta nəzarəti"
          subtitle="Satış, yığım və açıq kredit portfeli üzrə AZN/USD/EUR ekvivalenti"
          icon={Wallet}
        />
        <div className="finance-scenario-grid">
          <div>
            <span>FX risk</span>
            <strong>{money(fxExposure)}</strong>
            <small>Açıq portfel üzrə təxmini təsir</small>
          </div>
          <div>
            <span>Valyuta sayı</span>
            <strong>{currencyRows.length}</strong>
            <small>Aktiv kurs masası</small>
          </div>
          <div>
            <span>Baza valyuta</span>
            <strong>AZN</strong>
            <small>Kassa və mühasibat bazası</small>
          </div>
        </div>
        <DataTable
          columns={["Valyuta", "Kurs", "Satış ekvivalenti", "Yığım ekvivalenti", "FX təsir", "Status"]}
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
          <PanelHeader title="Xərc kateqoriyaları" subtitle="Təsdiqli, gözləyən və imtina edilmiş xərclər" />
          <div className="finance-category-list">
            {categoryRows.map((row) => (
              <div className="finance-category-row" key={row.category}>
                <div className="finance-category-main">
                  <TwoLine title={row.category} subtitle={`${money(row.approved)} təsdiqli · ${money(row.pending)} gözləyir`} />
                  <strong>{money(row.total)}</strong>
                </div>
                <ProgressRow value={(row.total / maxCategoryTotal) * 100} compact />
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="finance-expense-queue-panel span-2">
          <PanelHeader title="Xərc təsdiq növbəsi" subtitle="Rəhbərlik təsdiqi və imtina axını" />
          <DataTable
            columns={["Təsvir", "Kateqoriya", "Tarix", "Məbləğ", "Status", "Əməliyyat"]}
            rows={expenses.map((expense) => [
              <strong>{expense.description}</strong>,
              expense.category,
              expense.date,
              money(expense.amount),
              <StatusBadge status={expense.status} />,
              <div className="row-actions operation-table-actions">
                {expense.status === "Təsdiq gözləyir" && (
                  <>
                    <button className="text-btn" onClick={() => setExpenseStatus(expense.id, "Təsdiq edildi")}>
                      Təsdiq
                    </button>
                    <button className="text-btn danger" onClick={() => setExpenseStatus(expense.id, "İmtina edildi")}>
                      İmtina
                    </button>
                  </>
                )}
                <button className="text-btn" onClick={() => onEditExpense(expense.id)}>Redaktə</button>
                <button className="text-btn danger" onClick={() => onDeleteExpense(expense.id)}>Sil</button>
              </div>,
            ])}
          />
        </Panel>
      </section>

      <Panel className="finance-ledger-panel">
        <PanelHeader title="Kassa axını" subtitle="Satış, kredit ödənişi və xərclər vahid reyestrdə" />
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
              <span>Axtarış</span>
              <input
                value={ledgerSearch}
                onChange={(event) => setLedgerSearch(event.target.value)}
                placeholder="Mənbə, tərəf, status..."
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
              <span>Başlanğıc</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="finance-date-filter">
              <span>Son</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button className="secondary-btn icon-only" type="button" title="Filterləri sıfırla" onClick={resetLedgerFilters}>
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
            <span>Görünən daxilolma</span>
            <strong>{money(visibleInflow)}</strong>
          </div>
          <div>
            <span>Görünən çıxış</span>
            <strong>{money(visibleOutflow)}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong>{money(visibleNet)}</strong>
          </div>
          <div>
            <span>Gözləyən / accrual</span>
            <strong>{money(visiblePending + visibleAccrual)}</strong>
          </div>
          <div>
            <span>Gecikmə gəliri</span>
            <strong>{money(visiblePenalty)}</strong>
          </div>
        </div>
        <DataTable
          columns={["Tarix", "Tip", "Hesab", "Mənbə", "Müştəri/Təsvir", "Əsas", "Gecikmə", "Məbləğ", "Status"]}
          rows={visibleLedger.map((row) => [
            row.date,
            <StatusBadge status={row.type} />,
            row.account || "—",
            renderFinanceSource(row),
            row.party,
            row.principal > 0 ? money(row.principal) : "—",
            row.penalty > 0 ? money(row.penalty) : "—",
            <strong className={`finance-amount ${row.direction}`}>
              {row.direction === "out" ? "-" : row.direction === "in" ? "+" : ""}
              {money(row.amount)}
            </strong>,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <Panel>
        <PanelHeader title="Kredit kassa daxilolmaları" subtitle="Əsas məbləğ və gecikmə gəliri ayrı izlənir" />
        <DataTable
          columns={["Tarix", "Müştəri", "Kredit", "Müqavilə", "Əsas", "Gecikmə", "Kassa"]}
          rows={cashEntries.map((entry) => [
            entry.date,
            <strong>{entry.customer}</strong>,
            entry.creditId,
            entry.contractId || "—",
            money(entry.principal),
            money(entry.penalty),
            <StatusBadge status={money(entry.amount)} />,
          ])}
        />
      </Panel>
    </div>
  );
}

