import { Check, FileText, SlidersHorizontal } from "lucide-react";
import { contractTemplates } from "../../data.js";
import {
  DataTable,
  MetricCard,
  Panel,
  PanelHeader,
  StatusBadge,
} from "../../components/ui.jsx";
import { money } from "../../services/format.js";

export function ContractsPage({ contracts, onExport }) {
  return (
    <div className="stack">
      <section className="metric-grid three">
        <MetricCard label="Aktiv müqavilə" value={contracts.length} icon={FileText} tone="primary" />
        <MetricCard
          label="İmzalanıb"
          value={contracts.filter((contract) => contract.status === "İmzalanıb").length}
          trend="Bu ay"
          icon={Check}
          tone="success"
        />
        <MetricCard label="Şablon sayı" value={contractTemplates.length} icon={SlidersHorizontal} tone="info" />
      </section>
      <section className="template-grid">
        {contractTemplates.map((template) => (
          <Panel key={template.title}>
            <div className="template-card">
              <FileText size={22} />
              <h3>{template.title}</h3>
              <p>{template.desc}</p>
            </div>
          </Panel>
        ))}
      </section>
      <Panel>
        <PanelHeader title="Son Müqavilələr" subtitle="PDF/DOCX formatında ixrac" />
        <DataTable
          columns={["№", "Müştəri", "FİN", "Məhsul", "Məbləğ", "Status", "Əməliyyat"]}
          rows={contracts.map((contract) => [
            <strong>{contract.id}</strong>,
            contract.customer,
            contract.fin,
            contract.product,
            money(contract.amount),
            <StatusBadge status={contract.status} />,
            <button className="text-btn" onClick={() => onExport(contract.id)}>
              PDF
            </button>,
          ])}
        />
      </Panel>
    </div>
  );
}
