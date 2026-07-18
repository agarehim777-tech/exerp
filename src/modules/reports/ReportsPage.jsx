import { useMemo, useState } from "react";
import { BarChart3, CircleAlert, CreditCard, Download, Wallet } from "lucide-react";
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
import { money } from "../../services/format.js";

function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

export function ReportsPage({
  orders = [],
  credits = [],
  vendors = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  invoices = [],
  cashEntries = [],
  exports = [],
  onExport,
  canExport = true,
  snapshotDate,
  buildExecutiveInsights,
  buildReportPackage,
}) {
  const [riskFilter, setRiskFilter] = useState("Hamısı");
  const executiveInsights = useMemo(
    () => buildExecutiveInsights({ orders, credits, vendors, employees }),
    [buildExecutiveInsights, orders, credits, vendors, employees],
  );
  const reportPackage = useMemo(
    () =>
      buildReportPackage({
        orders,
        credits,
        vendors,
        employees,
        expenses,
        warehouseStock,
        products,
        purchaseOrders,
        invoices,
        cashEntries,
      }),
    [buildReportPackage, orders, credits, vendors, employees, expenses, warehouseStock, products, purchaseOrders, invoices, cashEntries],
  );
  const revenue = sumRows(orders, "amount");
  const activeCustomers = new Set(orders.map((order) => order.fin || order.customer).filter(Boolean)).size;
  const averageOrder = orders.length ? revenue / orders.length : 0;
  const riskAreas = useMemo(
    () => ["Hamısı", ...new Set(reportPackage.riskRows.map((row) => row.area))],
    [reportPackage.riskRows],
  );
  const visibleRiskRows = useMemo(
    () => (riskFilter === "Hamısı" ? reportPackage.riskRows : reportPackage.riskRows.filter((row) => row.area === riskFilter)),
    [reportPackage.riskRows, riskFilter],
  );
  const topProducts = useMemo(() => {
    const byProduct = new Map();
    orders.forEach((order) => {
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
      .slice(0, 4);
  }, [orders]);
  const lastExport = exports[0];

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Hesabat score" value={`${reportPackage.score}/100`} trend={`${reportPackage.sections} modul`} icon={BarChart3} tone={reportPackage.score >= 80 ? "success" : "warning"} />
        <MetricCard label="Risk siqnalı" value={reportPackage.riskCount} trend={`${reportPackage.criticalCount} yüksək`} icon={CircleAlert} tone={reportPackage.criticalCount ? "warning" : "success"} />
        <MetricCard label="Satış gəliri" value={money(revenue)} trend={`${orders.length} sifariş`} icon={Wallet} tone="success" />
        <MetricCard label="Açıq qalıq" value={money(reportPackage.creditBalance + reportPackage.invoiceBalance)} trend={`${activeCustomers} müştəri`} icon={CreditCard} tone="info" />
      </section>
      <section className="report-control-grid" data-testid="reports-control-panel">
        <div className="report-control-card">
          <span>Dövr</span>
          <strong>{reportPackage.period}</strong>
          <small>{formatPaymentDate(parsePaymentDate(snapshotDate))} tarixli snapshot</small>
        </div>
        <div className="report-control-card success">
          <span>Data həcmi</span>
          <strong>{reportPackage.rows}</strong>
          <small>Satış, kredit, anbar, HR və maliyyə sətirləri</small>
        </div>
        <div className="report-control-card warning">
          <span>Orta sifariş</span>
          <strong>{money(averageOrder)}</strong>
          <small>Satış performans müqayisəsi üçün baza</small>
        </div>
        <div className="report-control-card info">
          <span>Son export</span>
          <strong>{lastExport?.format || "Yoxdur"}</strong>
          <small>{lastExport ? `${lastExport.title} · ${lastExport.at}` : "Export yaradılmayıb"}</small>
        </div>
      </section>
      <Panel className="executive-insight-panel">
        <PanelHeader
          title="Executive insight"
          subtitle="Satış, kredit, anbar, vendor və HR siqnallarından avtomatik idarəetmə xülasəsi"
          icon={BarChart3}
        />
        <div className="executive-insight-grid">
          {executiveInsights.map((insight) => (
            <div className={`executive-insight-card ${insight.tone}`} key={insight.title}>
              <span>{insight.title}</span>
              <strong>{insight.value}</strong>
              <small>{insight.desc}</small>
            </div>
          ))}
        </div>
        <div className="automation-rule-list">
          <div>
            <strong>Kredit gecikməsi</strong>
            <span>1 gün gecikmə olduqda SMS, 7 gündən sonra zəng taskı, 30+ gündə restruktur mərhələsi açılsın.</span>
          </div>
          <div>
            <strong>Minimum stok</strong>
            <span>Satış üçün qalıq reorder point-dən aşağı düşdükdə vendor PO draft yaradılsın.</span>
          </div>
          <div>
            <strong>Təhvil SLA</strong>
            <span>Hazır statusunda 2 gündən çox qalan sifarişlər delivery rəhbərinə eskalasiya edilsin.</span>
          </div>
        </div>
      </Panel>
      <Panel className="report-module-panel" data-testid="report-module-panel">
        <PanelHeader title="Modul üzrə analitika" subtitle="Hər modulun əsas metrikası, həcm göstəricisi və nəzarət siqnalı" icon={BarChart3} />
        <DataTable
          columns={["Modul", "Əsas metrik", "Həcm", "Siqnal", "Status"]}
          rows={reportPackage.moduleRows.map((row) => [
            <strong>{row.module}</strong>,
            row.metric,
            row.count,
            row.signal,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
      <Panel className="report-risk-panel" data-testid="report-risk-panel">
        <PanelHeader title="Risk registeri" subtitle="Hesabatlardan çıxan operativ yoxlama siyahısı" icon={CircleAlert} />
        <div className="report-risk-toolbar">
          <div className="report-risk-tabs">
            {riskAreas.map((area) => (
              <button key={area} className={riskFilter === area ? "active" : ""} onClick={() => setRiskFilter(area)}>
                {area}
              </button>
            ))}
          </div>
          <span>{visibleRiskRows.length}/{reportPackage.riskRows.length} siqnal</span>
        </div>
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
      </Panel>
      <section className="dashboard-grid">
        <Panel className="span-2">
          <PanelHeader title="Hesabat Şablonları" subtitle="PDF və Excel formatında idarəetmə paketi yarat" />
          <div className="report-list">
            {reportTemplates.map((report) => (
              <article
                key={report.title}
                className="report-row report-template-row"
                title={!canExport ? "Hesabat export üçün icazə yoxdur" : ""}
              >
                <div>
                  <strong>{report.title}</strong>
                  <span>{report.desc}</span>
                  <small className="report-export-meta">{report.cadence} · {reportPackage.rows} data sətri</small>
                </div>
                <StatusBadge status={report.cadence} />
                <div className="report-actions">
                  <button
                    className="secondary-btn compact"
                    onClick={() => onExport(report.title, "PDF")}
                    disabled={!canExport}
                    data-testid="report-template-export"
                  >
                    <Download size={15} />
                    PDF
                  </button>
                  <button
                    className="primary-btn compact"
                    onClick={() => onExport(report.title, "Excel")}
                    disabled={!canExport}
                    data-testid="report-template-export"
                  >
                    <Download size={15} />
                    Excel
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Top 4 Məhsul" subtitle="Bu ay üzrə satış" />
          <div className="rank-list product">
            {topProducts.map(([name, count, amount], index) => (
              <div className="rank-row" key={name}>
                <span>{index + 1}</span>
                <TwoLine title={name} subtitle={`${count} ədəd`} />
                <strong>{money(amount)}</strong>
              </div>
            ))}
            {topProducts.length === 0 && <EmptyState title="Satış məlumatı yoxdur" />}
          </div>
          <div className="report-checklist">
            {reportPackage.checklist.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </Panel>
      </section>
      <Panel>
        <PanelHeader title="Son exportlar" subtitle="PDF/Excel hazırlıq əməliyyatları və audit izi" icon={Download} />
        <DataTable
          columns={["ID", "Hesabat", "Format", "Dövr", "Vaxt", "Sətir", "Score", "Risk", "İcraçı", "Status"]}
          rows={exports.map((row) => [
            <strong>{row.id}</strong>,
            row.title,
            row.format || "PDF",
            row.period || row.snapshot?.period || "—",
            row.at,
            row.rows,
            row.score !== undefined ? `${row.score}/100` : "—",
            row.riskCount ?? row.snapshot?.riskCount ?? "—",
            row.owner,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}
