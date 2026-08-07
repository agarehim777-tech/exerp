import { BarChart3, CalendarClock, CircleAlert, Download, FileText, Wallet } from "lucide-react";
import { DataTable, MetricCard, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, percent } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useMemo, useState } from "react";
import { InvoicePrintModal, buildInvoiceAgingRows, buildInvoiceControlSummary } from "../shared/lib/appDomain.jsx";
export default function InvoicesPage({ invoices, summary, invoiceSettings = {}, onExport, onOpenSalesOrder }) {
  const [invoiceFilter, setInvoiceFilter] = useState("Hamısı");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const invoiceControl = useMemo(() => buildInvoiceControlSummary(invoices), [invoices]);
  const agingRows = useMemo(() => buildInvoiceAgingRows(invoices), [invoices]);
  const maxAgingBalance = Math.max(1, ...agingRows.map((row) => row.balance));
  const exportInvoices = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Faktura", "Sifaris", "Musteri", "FIN", "Mehsullar", "Net", "EDV", "Cemi", "Qaliq", "E-qaimə"],
      ...visibleInvoices.map((invoice) => [
        invoice.id,
        invoice.orderId,
        invoice.customer,
        invoice.fin,
        invoice.products,
        invoice.netAmount,
        invoice.vatAmount,
        invoice.totalAmount,
        invoice.balance,
        invoice.eTaxStatus,
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `fakturalar-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
    onExport?.(`Faktura PDF/Excel (${visibleInvoices.length} faktura)`);
  };
  const filterItems = [
    { label: "Hamısı", count: invoices.length },
    { label: "Ödənilib", count: invoices.filter((invoice) => invoice.status === "Ödənilib").length },
    {
      label: "Qismən ödənilib",
      count: invoices.filter((invoice) => invoice.status === "Qismən ödənilib").length,
    },
    {
      label: "Ödəniş gözləyir",
      count: invoices.filter((invoice) => invoice.status === "Ödəniş gözləyir").length,
    },
    {
      label: "Göndərişə hazır",
      count: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
    },
  ];
  const visibleInvoices = invoices.filter((invoice) => {
    if (invoiceFilter === "Hamısı") return true;
    if (invoiceFilter === "Göndərişə hazır") return invoice.eTaxStatus === invoiceFilter;
    return invoice.status === invoiceFilter;
  });

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Faktura sayı" value={summary.count} icon={FileText} tone="primary" />
        <MetricCard label="Ümumi məbləğ" value={money(summary.total)} icon={Wallet} tone="success" />
        <MetricCard label="ƏDV" value={money(summary.vat)} icon={BarChart3} tone="info" />
        <MetricCard label="Açıq qalıq" value={money(summary.balance)} icon={CircleAlert} tone="warning" />
      </section>

      <Panel className="invoice-control-panel">
        <PanelHeader
          title="E-qaimə idarə paneli"
          subtitle="Satış sifarişlərindən avtomatik formalaşan faktura və ƏDV bölgüsü"
          icon={FileText}
        />
        <div className="finance-control-grid">
          <div className="finance-control-tile">
            <span>Prefiks</span>
            <strong>{invoiceSettings.prefix || "EQ"}</strong>
            <small>{invoiceSettings.eTaxMode || "E-qaimə inteqrasiya rejimi"}</small>
          </div>
          <div className="finance-control-tile">
            <span>ƏDV dərəcəsi</span>
            <strong>{invoiceSettings.vatRate || 18}%</strong>
            <small>Satış məbləğindən ayrılır</small>
          </div>
          <div className="finance-control-tile">
            <span>Göndərişə hazır</span>
            <strong>{summary.ready}</strong>
            <small>E-tax növbəsi</small>
          </div>
          <div className="finance-control-tile">
            <span>Ödənilib</span>
            <strong>{money(summary.paid)}</strong>
            <small>Kassaya düşən fakturalar</small>
          </div>
        </div>
      </Panel>

      <Panel className="invoice-operations-panel">
        <PanelHeader
          title="Faktura əməliyyat nəzarəti"
          subtitle="Ödəniş vaxtı, gecikmə və e-qaimə göndəriş statusu bir yerdə izlənir"
          icon={CalendarClock}
        />
        <div className="invoice-control-grid">
          <div>
            <span>Açıq qalıq</span>
            <strong>{money(invoiceControl.openBalance)}</strong>
            <small>{invoices.filter((invoice) => Number(invoice.balance || 0) > 0).length} aktiv faktura</small>
          </div>
          <div>
            <span>7 günə qədər</span>
            <strong>{money(invoiceControl.dueSoonBalance)}</strong>
            <small>{invoiceControl.dueSoonCount} yaxın ödəniş</small>
          </div>
          <div>
            <span>Gecikən</span>
            <strong>{money(invoiceControl.overdueBalance)}</strong>
            <small>{invoiceControl.overdueCount} faktura gecikir</small>
          </div>
          <div>
            <span>E-qaimə</span>
            <strong>{invoiceControl.sent}/{invoices.length}</strong>
            <small>{invoiceControl.ready} göndərişə hazır</small>
          </div>
        </div>
        <DataTable
          columns={["Yaşlanma", "Faktura", "Qalıq", "Ümumi", "Pay"]}
          rows={agingRows.map((row) => [
            <StatusBadge status={row.bucket} />,
            row.count,
            money(row.balance),
            money(row.total),
            <ProgressRow label={percent((row.balance / maxAgingBalance) * 100)} value={(row.balance / maxAgingBalance) * 100} compact />,
          ])}
        />
      </Panel>

      <Panel className="invoice-registry-panel">
        <div className="finance-filter-toolbar">
          <div className="tabs finance-filter-tabs">
            {filterItems.map((item) => (
              <button
                key={item.label}
                className={invoiceFilter === item.label ? "active" : ""}
                onClick={() => setInvoiceFilter(item.label)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          <button className="secondary-btn" onClick={exportInvoices}>
            <Download size={16} />
            PDF/Excel
          </button>
        </div>
        <DataTable
          columns={["Faktura", "Sifariş", "Müştəri", "Məhsul", "Net", "ƏDV", "Cəmi", "Qalıq", "E-qaimə", "Əməliyyat"]}
          rows={visibleInvoices.map((invoice) => [
            <TwoLine title={invoice.id} subtitle={invoice.date} />,
            <div className="finance-source-cell">
              <button
                className="module-link-btn"
                type="button"
                onClick={() => onOpenSalesOrder?.(invoice.orderId)}
                data-testid="invoice-order-link"
              >
                {invoice.orderId}
              </button>
              <small>{invoice.contractId}</small>
            </div>,
            <TwoLine title={invoice.customer} subtitle={`FİN ${invoice.fin}`} />,
            invoice.products,
            money(invoice.netAmount),
            money(invoice.vatAmount),
            <strong>{money(invoice.totalAmount)}</strong>,
            invoice.balance > 0 ? money(invoice.balance) : "Yoxdur",
            <StatusBadge status={invoice.eTaxStatus} />,
            <button className="text-btn" onClick={() => setSelectedInvoice(invoice)}>
              Çap/PDF
            </button>,
          ])}
        />
      </Panel>
      {selectedInvoice && (
        <InvoicePrintModal
          invoice={selectedInvoice}
          invoiceSettings={invoiceSettings}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}