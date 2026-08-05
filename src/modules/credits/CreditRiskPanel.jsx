import { RefreshCw, ShieldAlert } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { DataTable, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useCreditPortfolio } from "../../shared/hooks/useCreditPortfolio.js";
import { money } from "../../services/format.js";

const stages = ["current", "reminder", "soft_collection", "hard_collection", "legal", "restructured", "closed"];
export function CreditRiskPanel() {
  const { activeTenantId } = useAuth();
  const { contracts, loading, error, recalculate, setCollection } = useCreditPortfolio(activeTenantId);
  return <Panel className="credit-risk-panel">
    <PanelHeader title="Risk və kolleksiya reyestri" subtitle={`${contracts.length} backend müqaviləsi · gecikmə, cərimə və kolleksiya mərhələsi`} icon={ShieldAlert}
      action={<button className="secondary-btn" type="button" onClick={recalculate} disabled={loading}><RefreshCw size={16} /> Gecikməni hesabla</button>} />
    {error && <div className="inline-alert danger">{error.message}</div>}
    <DataTable columns={["Müqavilə", "Müştəri", "Əsas məbləğ", "Risk", "Kolleksiya", "Gecikən taksit"]}
      rows={contracts.slice(0, 20).map((credit) => {
        const overdue = (credit.installments || []).filter((item) => item.status === "overdue");
        return [
          <TwoLine title={credit.contract_no} subtitle={credit.status} />,
          <TwoLine title={credit.customer?.name || "Müştəri"} subtitle={credit.customer?.fin || ""} />,
          money(Number(credit.principal || 0) - Number(credit.initial_payment || 0)),
          <TwoLine title={`${credit.risk_score || 0}/100`} subtitle={credit.last_risk_calculated_at ? "Yenilənib" : "Hesablanmayıb"} />,
          <select value={credit.collection_stage || "current"} onChange={(event) => setCollection(credit, event.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>,
          overdue.length ? <StatusBadge status={`${overdue.length} gecikmə`} /> : "—",
        ];
      })} />
  </Panel>;
}
