import { useMemo, useState } from "react";
import {
  BarChart3,
  Boxes,
  CircleAlert,
  CreditCard,
  Download,
  Factory,
  Filter,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { reportTemplates } from "../../data.js";
import {
  DataTable,
  EmptyState,
  MetricCard,
  Panel,
  PanelHeader,
  StatusBadge,
  TwoLine,
} from "../../components/ui.jsx";
import { formatPaymentDate, parsePaymentDate } from "../../services/date.js";
import { money, normalize, percent } from "../../services/format.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useLiveReportData } from "../../shared/hooks/useLiveReportData.js";
import { downloadReportCsv, downloadReportPdf } from "../../shared/lib/reportDownload.js";

function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

function getRowDate(row, fallback) {
  const raw = row?.createdAt || row?.date || row?.at || row?.orderDate || row?.completedAt || row?.approvedAt;
  const parsed = raw ? new Date(raw) : new Date(fallback);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

function inSelectedPeriod(row, period, snapshotDate) {
  if (period === "Hamısı") return true;
  const date = getRowDate(row, snapshotDate);
  const snapshot = new Date(snapshotDate);
  if (period === "Bu ay") {
    return date.getFullYear() === snapshot.getFullYear() && date.getMonth() === snapshot.getMonth();
  }
  if (period === "Bu rüb") {
    return date.getFullYear() === snapshot.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(snapshot.getMonth() / 3);
  }
  return date.getFullYear() === snapshot.getFullYear();
}

function buildMonthlyTrend(orders, expenses, snapshotDate) {
  const snapshot = new Date(snapshotDate);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(snapshot.getFullYear(), snapshot.getMonth() - (5 - index), 1);
    const sameMonth = (row) => {
      const rowDate = getRowDate(row, snapshotDate);
      return rowDate.getFullYear() === date.getFullYear() && rowDate.getMonth() === date.getMonth();
    };
    return {
      label: new Intl.DateTimeFormat("az-AZ", { month: "short" }).format(date),
      revenue: orders.filter(sameMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0),
      expense: expenses.filter(sameMonth).reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  });
}

export function ReportsPage({
  orders = [],
  credits = [],
  vendors = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  warehouses = [],
  products = [],
  purchaseOrders = [],
  productionPlans = [],
  invoices = [],
  cashEntries = [],
  exports = [],
  onExport,
  canExport = true,
  snapshotDate,
  buildExecutiveInsights,
  buildReportPackage,
}) {
  const { activeTenantId } = useAuth();
  const live = useLiveReportData(activeTenantId);
  const [period, setPeriod] = useState("Bu ay");
  const [moduleFilter, setModuleFilter] = useState("Hamısı");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("Hamısı");
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");
  const reportExpenses = live.loaded ? live.expenses : expenses;
  const reportVendors = live.loaded ? live.vendors : vendors;
  const reportPurchaseOrders = live.loaded ? live.purchaseOrders : purchaseOrders;
  const reportInvoices = live.loaded ? live.invoices : invoices;
  const reportCashEntries = live.loaded ? live.cashEntries : cashEntries;

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (row) =>
          inSelectedPeriod(row, period, snapshotDate) &&
          (warehouseFilter === "all" || row.warehouseId === warehouseFilter),
      ),
    [orders, period, snapshotDate, warehouseFilter],
  );
  const filteredExpenses = useMemo(
    () => reportExpenses.filter((row) => inSelectedPeriod(row, period, snapshotDate)),
    [reportExpenses, period, snapshotDate],
  );
  const filteredPurchaseOrders = useMemo(
    () =>
      reportPurchaseOrders.filter(
        (row) =>
          inSelectedPeriod(row, period, snapshotDate) &&
          (warehouseFilter === "all" || row.warehouseId === warehouseFilter),
      ),
    [reportPurchaseOrders, period, snapshotDate, warehouseFilter],
  );
  const filteredProduction = useMemo(
    () =>
      productionPlans.filter(
        (row) =>
          inSelectedPeriod(row, period, snapshotDate) &&
          (warehouseFilter === "all" || row.warehouseId === warehouseFilter),
      ),
    [productionPlans, period, snapshotDate, warehouseFilter],
  );
  const filteredWarehouseStock = useMemo(() => {
    if (warehouseFilter === "all") return warehouseStock;
    return { [warehouseFilter]: warehouseStock[warehouseFilter] || [] };
  }, [warehouseFilter, warehouseStock]);
  const filteredCashEntries = useMemo(
    () => reportCashEntries.filter((row) => inSelectedPeriod(row, period, snapshotDate)),
    [reportCashEntries, period, snapshotDate],
  );
  const filteredInvoices = useMemo(
    () => reportInvoices.filter((row) => inSelectedPeriod(row, period, snapshotDate)),
    [reportInvoices, period, snapshotDate],
  );

  const executiveInsights = useMemo(
    () => buildExecutiveInsights({ orders: filteredOrders, credits, vendors: reportVendors, employees }),
    [buildExecutiveInsights, filteredOrders, credits, reportVendors, employees],
  );
  const reportPackage = useMemo(
    () =>
      buildReportPackage({
        orders: filteredOrders,
        credits,
        vendors: reportVendors,
        employees,
        expenses: filteredExpenses,
        warehouseStock: filteredWarehouseStock,
        products,
        purchaseOrders: filteredPurchaseOrders,
        productionPlans: filteredProduction,
        invoices: filteredInvoices,
        cashEntries: filteredCashEntries,
      }),
    [
      buildReportPackage,
      filteredOrders,
      credits,
      reportVendors,
      employees,
      filteredExpenses,
      filteredWarehouseStock,
      products,
      filteredPurchaseOrders,
      filteredProduction,
      filteredInvoices,
      filteredCashEntries,
    ],
  );

  const productByName = useMemo(
    () => new Map(products.map((product) => [normalize(product.name), product])),
    [products],
  );
  const revenue = sumRows(filteredOrders, "amount");
  const salesCost = filteredOrders.reduce(
    (sum, order) =>
      sum +
      (order.productLines || []).reduce((lineSum, line) => {
        const product = productByName.get(normalize(line.product));
        return lineSum + Number(line.qty || 0) * Number(product?.costPrice || line.costPrice || 0);
      }, 0),
    0,
  );
  const operatingExpense = filteredExpenses
    .filter((row) => !normalize(row.status).includes("imtina"))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const grossProfit = revenue - salesCost;
  const netResult = grossProfit - operatingExpense;
  const stockRows = Object.values(filteredWarehouseStock).flatMap((rows) => rows || []);
  const stockValue = stockRows.reduce(
    (sum, row) => sum + Number(row.total || 0) * Number(row.costPrice || row.price || 0),
    0,
  );
  const productionCost = filteredProduction.reduce((sum, row) => sum + Number(row.totalCost || 0), 0);
  const activeCustomers = new Set(filteredOrders.map((order) => order.fin || order.customer).filter(Boolean)).size;
  const averageOrder = filteredOrders.length ? revenue / filteredOrders.length : 0;
  const trendRows = useMemo(
    () => buildMonthlyTrend(orders, reportExpenses, snapshotDate),
    [orders, reportExpenses, snapshotDate],
  );
  const maxTrendValue = Math.max(1, ...trendRows.flatMap((row) => [row.revenue, row.expense]));

  const moduleRows = useMemo(() => {
    const rows = [...reportPackage.moduleRows];
    rows.push({
      module: "İstehsalat",
      metric: money(productionCost),
      count: `${filteredProduction.length} plan`,
      signal: filteredProduction.some((row) => normalize(row.status).includes("risk"))
        ? "Xammal riski var"
        : `${filteredProduction.filter((row) => normalize(row.status).includes("istehsal edildi")).length} tamamlanıb`,
      status: filteredProduction.some((row) => normalize(row.status).includes("risk")) ? "Risk" : "Hazır",
    });
    return moduleFilter === "Hamısı" ? rows : rows.filter((row) => row.module === moduleFilter);
  }, [reportPackage.moduleRows, productionCost, filteredProduction, moduleFilter]);

  const productionRisks = filteredProduction
    .filter((row) => normalize(row.status).includes("risk") || row.materials?.some((item) => !item.enough))
    .map((row) => ({
      id: row.id,
      area: "İstehsalat",
      title: row.product,
      amount: Number(row.totalCost || 0),
      owner: row.warehouseName,
      action: row.bottleneck || "Xammal təminatı",
      priority: "Yüksək",
      status: "Xammal riski",
    }));
  const allRiskRows = [...productionRisks, ...reportPackage.riskRows];
  const riskAreas = useMemo(() => ["Hamısı", ...new Set(allRiskRows.map((row) => row.area))], [allRiskRows]);
  const visibleRiskRows = allRiskRows.filter(
    (row) =>
      (riskFilter === "Hamısı" || row.area === riskFilter) &&
      (moduleFilter === "Hamısı" || normalize(row.area).includes(normalize(moduleFilter))),
  );

  const topProducts = useMemo(() => {
    const byProduct = new Map();
    filteredOrders.forEach((order) => {
      (order.productLines || []).forEach((line) => {
        const current = byProduct.get(line.product) || { count: 0, amount: 0 };
        byProduct.set(line.product, {
          count: current.count + Number(line.qty || 0),
          amount: current.amount + Number(line.qty || 0) * Number(line.price || 0),
        });
      });
    });
    return [...byProduct.entries()]
      .map(([name, values]) => [name, values.count, values.amount])
      .sort((a, b) => b[2] - a[2])
      .slice(0, 5);
  }, [filteredOrders]);
  const lastExport = exports[0];

  const reportPayload = (title) => {
    const common = {
      title,
      period,
      summary: [
        ["Satis geliri", money(revenue)], ["Umumi menfeet", money(grossProfit)],
        ["Xalis netice", money(netResult)], ["Anbar deyeri", money(stockValue)],
        ["Aciq borc", money(reportPackage.creditBalance + reportPackage.invoiceBalance)],
      ],
    };
    if (title === "Aylıq satış hesabatı") return { ...common, columns: ["Sifaris", "Musteri", "Tarix", "Mehsul", "Mebleg"], rows: filteredOrders.map((row) => [row.orderNo || row.id, row.customer, row.date, row.products, money(row.amount)]) };
    if (title === "Maliyyə mənfəət/zərər") return { ...common, columns: ["Tarix", "Kateqoriya", "Tesvir", "Status", "Mebleg"], rows: filteredExpenses.map((row) => [row.date, row.category, row.description, row.status, money(row.amount)]) };
    if (title === "Anbar hərəkəti") return { ...common, columns: ["Mehsul", "SKU", "Qaliq", "Rezerv", "Maya", "Deyer"], rows: stockRows.map((row) => [row.product, row.sku, row.total, row.reserved, money(row.costPrice || row.price), money(Number(row.total || 0) * Number(row.costPrice || row.price || 0))]) };
    return { ...common, columns: ["Muqavile", "Musteri", "Status", "Muddet", "Qaliq"], rows: credits.map((row) => [row.contractId || row.id, row.customer, row.status, `${row.months || row.termMonths || "—"} ay`, money(row.balance || row.remaining || row.principal)]) };
  };

  const runDownload = async (report, format) => {
    const key = `${report.title}:${format}`;
    setExporting(key);
    setExportError("");
    try {
      const payload = reportPayload(report.title);
      if (format === "PDF") await downloadReportPdf(payload);
      else downloadReportCsv(payload);
      onExport(report.title, format);
    } catch (error) {
      setExportError(`Fayl yaradılmadı: ${error.message || error}`);
    } finally {
      setExporting("");
    }
  };

  return (
    <div className="stack reports-module">
      <section className="reports-filter-bar">
        <div><Filter size={17} /><strong>Hesabat filtrləri</strong></div>
        <label>
          <span>Dövr</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option>Bu ay</option><option>Bu rüb</option><option>Bu il</option><option>Hamısı</option>
          </select>
        </label>
        <label>
          <span>Modul</span>
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
            <option>Hamısı</option><option>Satış</option><option>Kredit</option><option>Anbar</option>
            <option>Vendor / PO</option><option>İstehsalat</option><option>Maliyyə</option><option>Faktura</option><option>HR</option>
          </select>
        </label>
        <label>
          <span>Anbar</span>
          <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
            <option value="all">Bütün anbarlar</option>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </label>
        <button className="primary-btn" disabled={!canExport} onClick={() => onExport(`İdarəetmə paketi · ${period}`, "Excel")}>
          <Download size={16} /> Excel
        </button>
        <button className="secondary-btn" type="button" disabled={live.loading} onClick={live.refresh} title="Real datanı yenilə">
          <RefreshCw size={16} /> {live.loading ? "Yenilənir" : "Yenilə"}
        </button>
      </section>

      {(live.error || live.degraded) && <div className="inline-alert warning">Canlı hesabat bağlantısı zəifləyib. Son uğurlu data göstərilir; «Yenilə» ilə təkrar yoxlayın.</div>}
      {exportError && <div className="inline-alert danger">{exportError}</div>}

      <section className="metric-grid four">
        <MetricCard label="Satış gəliri" value={money(revenue)} trend={`${filteredOrders.length} sifariş`} icon={Wallet} tone="success" />
        <MetricCard label="Ümumi mənfəət" value={money(grossProfit)} trend={`Marja ${percent(revenue ? (grossProfit / revenue) * 100 : 0)}`} icon={TrendingUp} tone={grossProfit >= 0 ? "success" : "danger"} />
        <MetricCard label="Xalis nəticə" value={money(netResult)} trend={`${money(operatingExpense)} xərc`} icon={BarChart3} tone={netResult >= 0 ? "primary" : "danger"} />
        <MetricCard label="Açıq borc" value={money(reportPackage.creditBalance + reportPackage.invoiceBalance)} trend={`${activeCustomers} müştəri`} icon={CreditCard} tone="warning" />
      </section>

      <section className="report-control-grid" data-testid="reports-control-panel">
        <div className="report-control-card"><span>Hesabat score</span><strong>{reportPackage.score}/100</strong><small>{allRiskRows.length} risk siqnalı</small></div>
        <div className="report-control-card success"><span>Anbar dəyəri</span><strong>{money(stockValue)}</strong><small>{stockRows.length} stok sətri</small></div>
        <div className="report-control-card warning"><span>İstehsal mayası</span><strong>{money(productionCost)}</strong><small>{filteredProduction.length} istehsal planı</small></div>
        <div className="report-control-card info"><span>Orta sifariş</span><strong>{money(averageOrder)}</strong><small>{formatPaymentDate(parsePaymentDate(snapshotDate))} snapshot</small></div>
      </section>

      <section className="reports-analytics-grid">
        <Panel className="reports-trend-panel">
          <PanelHeader title="Gəlir və xərc trendi" subtitle="Son 6 ay üzrə müqayisə" icon={BarChart3} />
          <div className="reports-trend-chart">
            {trendRows.map((row) => (
              <div className="reports-trend-column" key={row.label}>
                <div className="reports-trend-bars">
                  <span className="revenue" style={{ height: `${Math.max(4, (row.revenue / maxTrendValue) * 100)}%` }} title={money(row.revenue)} />
                  <span className="expense" style={{ height: `${Math.max(4, (row.expense / maxTrendValue) * 100)}%` }} title={money(row.expense)} />
                </div>
                <strong>{row.label}</strong>
              </div>
            ))}
          </div>
          <div className="reports-chart-legend"><span className="revenue">Gəlir</span><span className="expense">Xərc</span></div>
        </Panel>

        <Panel>
          <PanelHeader title="Rəhbərlik xülasəsi" subtitle="Avtomatik operativ nəticələr" icon={TrendingUp} />
          <div className="executive-insight-grid reports-insights">
            {executiveInsights.map((insight) => (
              <div className={`executive-insight-card ${insight.tone}`} key={insight.title}>
                <span>{insight.title}</span><strong>{insight.value}</strong><small>{insight.desc}</small>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel className="report-module-panel" data-testid="report-module-panel">
        <PanelHeader title="Modullar üzrə analitika" subtitle="Əsas metrik, həcm və nəzarət siqnalları" icon={Boxes} />
        <DataTable
          columns={["Modul", "Əsas metrik", "Həcm", "Siqnal", "Status"]}
          rows={moduleRows.map((row) => [
            <strong>{row.module}</strong>, row.metric, row.count, row.signal, <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <Panel className="report-risk-panel" data-testid="report-risk-panel">
        <PanelHeader title="Risk reyestri" subtitle="Kredit, stok, satınalma, istehsal və maliyyə üzrə operativ siyahı" icon={CircleAlert} />
        <div className="report-risk-toolbar">
          <div className="report-risk-tabs">
            {riskAreas.map((area) => (
              <button key={area} className={riskFilter === area ? "active" : ""} onClick={() => setRiskFilter(area)}>{area}</button>
            ))}
          </div>
          <span>{visibleRiskRows.length}/{allRiskRows.length} siqnal</span>
        </div>
        {visibleRiskRows.length ? (
          <DataTable
            columns={["Sahə", "Mövzu", "Məbləğ", "Məsul/Mənbə", "Növbəti addım", "Prioritet", "Status"]}
            rows={visibleRiskRows.map((row) => [
              row.area,
              <TwoLine title={row.title} subtitle={row.id} />,
              money(row.amount),
              row.owner || "—",
              row.action,
              <StatusBadge status={row.priority} />,
              <StatusBadge status={row.status} />,
            ])}
          />
        ) : <EmptyState title="Seçilmiş filtr üzrə risk yoxdur" />}
      </Panel>

      <section className="dashboard-grid">
        <Panel className="span-2">
          <PanelHeader title="Hesabat şablonları" subtitle="PDF və Excel idarəetmə paketi yarat" />
          <div className="report-list">
            {reportTemplates.map((report) => (
              <article key={report.title} className="report-row report-template-row">
                <div><strong>{report.title}</strong><span>{report.desc}</span><small>{report.cadence} · {reportPackage.rows} data sətri</small></div>
                <StatusBadge status={report.cadence} />
                <div className="report-actions">
                  <button className="secondary-btn compact" onClick={() => runDownload(report, "PDF")} disabled={!canExport || Boolean(exporting)}><Download size={15} /> {exporting === `${report.title}:PDF` ? "Hazırlanır" : "PDF"}</button>
                  <button className="primary-btn compact" onClick={() => runDownload(report, "Excel")} disabled={!canExport || Boolean(exporting)}><Download size={15} /> {exporting === `${report.title}:Excel` ? "Hazırlanır" : "Excel"}</button>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Top 5 məhsul" subtitle={`${period} üzrə satış`} />
          <div className="rank-list product">
            {topProducts.map(([name, count, amount], index) => (
              <div className="rank-row" key={name}><span>{index + 1}</span><TwoLine title={name} subtitle={`${count} ədəd`} /><strong>{money(amount)}</strong></div>
            ))}
            {!topProducts.length && <EmptyState title="Satış məlumatı yoxdur" />}
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelHeader title="Son exportlar" subtitle="PDF/Excel əməliyyatları və audit izi" icon={Download} />
        <DataTable
          columns={["ID", "Hesabat", "Format", "Dövr", "Vaxt", "Sətir", "Score", "Risk", "İcraçı", "Status"]}
          rows={exports.map((row) => [
            <strong>{row.id}</strong>, row.title, row.format || "PDF", row.period || row.snapshot?.period || "—",
            row.at, row.rows, row.score !== undefined ? `${row.score}/100` : "—",
            row.riskCount ?? row.snapshot?.riskCount ?? "—", row.owner, <StatusBadge status={row.status} />,
          ])}
        />
        {!exports.length && <EmptyState title="Hələ export yaradılmayıb" />}
      </Panel>
    </div>
  );
}
