import { Building2, Check, CircleAlert, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useState } from "react";
import { buildReceivableAgingSummary } from "../shared/lib/appDomain.jsx";
export default function ReceivablesPage({ rows, syncMeta, closures = [], onCloseDebt }) {
  const [typeFilter, setTypeFilter] = useState("Hamısı");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("Hamısı");
  const [riskFilter, setRiskFilter] = useState("Hamısı");
  const [collectionFilter, setCollectionFilter] = useState("Hamısı");
  const [agingFilter, setAgingFilter] = useState("Hamısı");
  const debtorRows = rows.filter((row) => row.type === "Debitor");
  const creditorRows = rows.filter((row) => row.type === "Kreditor");
  const overdueRows = rows.filter((row) => Number(row.overdueDays || 0) > 0);
  const highRiskRows = rows.filter((row) => ["Kritik", "Yüksək"].includes(row.riskCategory));
  const totalDebitor = total(debtorRows, "amount");
  const totalCreditor = total(creditorRows, "amount");
  const netPosition = totalDebitor - totalCreditor;
  const agingSummary = buildReceivableAgingSummary(rows);
  const sourceTypeOptions = ["Hamısı", ...new Set(rows.map((row) => row.sourceTypeLabel || row.sourceType).filter(Boolean))];
  const riskOptions = ["Hamısı", ...new Set(rows.map((row) => row.riskCategory).filter(Boolean))];
  const collectionOptions = ["Hamısı", ...new Set(rows.map((row) => row.collectionStatus).filter(Boolean))];
  const agingOptions = ["Hamısı", ...agingSummary.map((row) => row.bucket)];
  const visibleRows = rows.filter((row) => {
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
          <span>{visibleRows.length}/{rows.length} sətir</span>
        </div>
        <DataTable
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
              <button className="text-btn receivable-close-button" data-testid="receivable-close-button" onClick={() => onCloseDebt?.(row.id)}>
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
    </div>
  );
}