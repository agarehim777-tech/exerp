import { Building2, Check, CircleAlert, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useState } from "react";
import { buildReceivableAgingSummary } from "../shared/lib/appDomain.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useOrders } from "../shared/hooks/useOrders.js";
export default function ReceivablesPage({ rows, syncMeta, closures = [], onCloseDebt, onOpenSalesOrder }) {
  const { activeTenantId } = useAuth();
  const { orders: realOrders } = useOrders(activeTenantId);
  const [typeFilter, setTypeFilter] = useState("Hamısı");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("Hamısı");
  const [riskFilter, setRiskFilter] = useState("Hamısı");
  const [collectionFilter, setCollectionFilter] = useState("Hamısı");
  const [agingFilter, setAgingFilter] = useState("Hamısı");
  const [selectedDebt, setSelectedDebt] = useState(null);
  const effectiveRows = realOrders.filter(order => order.status !== "cancelled").map(order => {
    const amount = Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0));
    return {
      id: `DB-ORD-${order.id}`, type: "Debitor", party: order.customer?.name || "Müştəri qeyd edilməyib",
      source: order.order_no, sourceType: "order", sourceTypeLabel: "Satış sifarişi", amount,
      orderBalance: amount, creditBalance: 0, customerDebt: 0, overdueDays: 0,
      owner: "Satış", status: amount > 0 ? "Aktiv" : "Bağlandı", detail: `${order.order_no} · ${order.items?.map(item => item.description).filter(Boolean).join(", ") || "Sifariş"}`,
      orderIds: [order.id], openOrderIds: [order.id], creditIds: [], contractIds: [], closingMode: "cash-in",
      agingBucket: "Cari", riskCategory: "Sağlam", collectionStatus: "İzləmədə", nextAction: amount > 0 ? "Ödənişi izlə" : "Bağlanıb",
    };
  }).filter(row => row.amount > 0);
  const debtorRows = effectiveRows.filter((row) => row.type === "Debitor");
  const creditorRows = effectiveRows.filter((row) => row.type === "Kreditor");
  const overdueRows = effectiveRows.filter((row) => Number(row.overdueDays || 0) > 0);
  const highRiskRows = effectiveRows.filter((row) => ["Kritik", "Yüksək"].includes(row.riskCategory));
  const totalDebitor = total(debtorRows, "amount");
  const totalCreditor = total(creditorRows, "amount");
  const netPosition = totalDebitor - totalCreditor;
  const agingSummary = buildReceivableAgingSummary(effectiveRows);
  const sourceTypeOptions = ["Hamısı", ...new Set(effectiveRows.map((row) => row.sourceTypeLabel || row.sourceType).filter(Boolean))];
  const riskOptions = ["Hamısı", ...new Set(effectiveRows.map((row) => row.riskCategory).filter(Boolean))];
  const collectionOptions = ["Hamısı", ...new Set(effectiveRows.map((row) => row.collectionStatus).filter(Boolean))];
  const agingOptions = ["Hamısı", ...agingSummary.map((row) => row.bucket)];
  const visibleRows = effectiveRows.filter((row) => {
    const matchesType = typeFilter === "Hamısı" || row.type === typeFilter;
    const rowSourceType = row.sourceTypeLabel || row.sourceType;
    const matchesSourceType = sourceTypeFilter === "Hamısı" || rowSourceType === sourceTypeFilter;
    const matchesRisk = riskFilter === "Hamısı" || row.riskCategory === riskFilter;
    const matchesCollection = collectionFilter === "Hamısı" || row.collectionStatus === collectionFilter;
    const matchesAging = agingFilter === "Hamısı" || row.agingBucket === agingFilter;
    return matchesType && matchesSourceType && matchesRisk && matchesCollection && matchesAging;
  });

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Debitor borcu" value={money(totalDebitor)} trend={`${debtorRows.length} borc sətri`} icon={Wallet} tone="primary" />
        <MetricCard label="Kreditor borcu" value={money(totalCreditor)} trend={`${creditorRows.length} borc sətri`} icon={Building2} tone="warning" />
        <MetricCard label="Net mövqe" value={money(netPosition)} icon={TrendingUp} tone={netPosition >= 0 ? "success" : "danger"} />
        <MetricCard label="Risk portfeli" value={highRiskRows.length} trend={money(total(highRiskRows, "amount"))} icon={CircleAlert} tone={highRiskRows.length ? "danger" : "success"} />
      </section>
      <section className="receivable-aging-grid" data-testid="receivable-aging-panel">
        {agingSummary.map((bucket) => (
          <div key={bucket.bucket} className={`aging-bucket ${bucket.count > 0 ? "active" : ""}`}>
            <span>{bucket.bucket}</span>
            <strong>{money(bucket.amount)}</strong>
            <small>{bucket.count} borc sətri</small>
          </div>
        ))}
      </section>
      {syncMeta && (
        <Panel className="module-action-panel">
          <PanelHeader title="Son balans yenilənməsi" subtitle="Satış, kredit və vendor məlumatlarından son sinxron nəticə" icon={RefreshCw} />
          <div className="db-status-grid">
            <div>
              <span>Vaxt</span>
              <strong>{syncMeta.at}</strong>
            </div>
            <div>
              <span>Debitor</span>
              <strong>{money(syncMeta.debtorTotal)}</strong>
            </div>
            <div>
              <span>Kreditor</span>
              <strong>{money(syncMeta.creditorTotal)}</strong>
            </div>
            <div>
              <span>Gecikmə</span>
              <strong>{syncMeta.overdueCount}</strong>
            </div>
          </div>
        </Panel>
      )}
      <Panel className="receivable-control-panel" data-testid="receivable-control-panel">
        <PanelHeader
          title="Debitor/Kreditor reyestri"
          subtitle="Aging, kolleksiya statusu, risk kateqoriyası və bağlanış workflow-u"
          icon={Wallet}
        />
        <div className="receivable-filter-bar">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            {["Hamısı", "Debitor", "Kreditor"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
            {sourceTypeOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            {riskOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>
            {collectionOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value)}>
            {agingOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span>{visibleRows.length}/{effectiveRows.length} sətir</span>
        </div>
        <DataTable
          onRowClick={(index) => setSelectedDebt(visibleRows[index])}
          columns={["Tip", "Tərəf", "Mənbə", "Məbləğ", "Aging", "Risk", "Kolleksiya", "Növbəti addım", "Məsul", "Bağlanış"]}
          rows={visibleRows.map((row) => [
            <StatusBadge status={row.type} />,
            <TwoLine title={row.party} subtitle={row.detail} />,
            <TwoLine title={row.source} subtitle={row.sourceTypeLabel || row.sourceType || "Mənbə"} />,
            <strong>{money(row.amount)}</strong>,
            <TwoLine title={row.agingBucket} subtitle={Number(row.overdueDays || 0) > 0 ? `${row.overdueDays} gün` : "Gecikmə yoxdur"} />,
            <StatusBadge status={row.riskCategory} />,
            <StatusBadge status={row.collectionStatus} />,
            row.nextAction,
            row.owner,
            Number(row.amount || 0) > 0 ? (
              <button className="text-btn receivable-close-button" data-testid="receivable-close-button" onClick={(event) => { event.stopPropagation(); onCloseDebt?.(row.id); }}>
                Bağla
              </button>
            ) : (
              <StatusBadge status="Bağlandı" />
            ),
          ])}
        />
      </Panel>
      <Panel className="receivable-closure-panel">
        <PanelHeader title="Bağlanış tarixçəsi" subtitle="Debitor kassa mədaxili və kreditor ödəniş çıxışları audit izi ilə saxlanılır" icon={Check} />
        {closures.length === 0 ? (
          <EmptyState title="Borc bağlanışı hələ yoxdur" />
        ) : (
          <DataTable
            columns={["ID", "Tip", "Tərəf", "Məbləğ", "Aging", "Risk", "Tarix", "Status"]}
            rows={closures.slice(0, 8).map((row) => [
              <strong>{row.id}</strong>,
              row.type,
              row.party,
              money(row.amount),
              row.agingBucket,
              <StatusBadge status={row.riskCategory} />,
              row.at,
              <StatusBadge status={row.collectionStatus || "Bağlandı"} />,
            ])}
          />
        )}
      </Panel>
      {selectedDebt && <DebtDetail row={selectedDebt} onClose={() => setSelectedDebt(null)} onOpenSalesOrder={onOpenSalesOrder} />}
    </div>
  );
}

function DebtDetail({ row, onClose, onOpenSalesOrder }) {
  const orderId = row.openOrderIds?.[0] || row.orderIds?.[0];
  const detailRows = [
    ["Tip", row.type], ["Tərəf", row.party], ["Mənbə", row.source],
    ["Mənbə növü", row.sourceTypeLabel || row.sourceType], ["Qalıq borc", money(row.amount)],
    ["Sifariş qalığı", money(row.orderBalance || 0)], ["Kredit qalığı", money(row.creditBalance || 0)],
    ["Manual borc", money(row.customerDebt || 0)], ["Aging", row.agingBucket],
    ["Gecikmə", Number(row.overdueDays || 0) > 0 ? `${row.overdueDays} gün` : "Gecikmə yoxdur"],
    ["Risk", row.riskCategory], ["Kolleksiya", row.collectionStatus],
    ["Məsul", row.owner], ["Növbəti addım", row.nextAction], ["Ətraflı", row.detail],
  ];
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,.45)", display: "flex", justifyContent: "flex-end" }}>
    <aside onClick={event => event.stopPropagation()} style={{ width: 480, maxWidth: "100%", height: "100%", overflowY: "auto", background: "#fff", padding: 20, boxSizing: "border-box", boxShadow: "-10px 0 30px rgba(15,23,42,.16)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
        <div><small style={{ color: "#64748b", fontWeight: 700 }}>BORC MƏLUMATI</small><h2 style={{ margin: "5px 0" }}>{row.party}</h2><StatusBadge status={row.type} /></div>
        <button type="button" onClick={onClose} style={{ border: 0, background: "transparent", fontSize: 25, cursor: "pointer" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9 }}>
        {detailRows.map(([label, value]) => <div key={label} style={{ padding: 11, border: "1px solid #e2e8f0", borderRadius: 9, background: "#f8fafc" }}><small style={{ display: "block", color: "#64748b", marginBottom: 4 }}>{label}</small><strong style={{ overflowWrap: "anywhere" }}>{value || "—"}</strong></div>)}
      </div>
      {orderId && <button type="button" onClick={() => { onClose(); onOpenSalesOrder?.(orderId); }} style={{ width: "100%", marginTop: 14, padding: 10, border: 0, borderRadius: 9, background: "#075e4b", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Əlaqəli sifarişə bax</button>}
    </aside>
  </div>;
}
