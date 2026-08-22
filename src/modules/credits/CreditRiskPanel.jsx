import { useState } from "react";
import { FileText, RefreshCw, ShieldAlert } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { DataTable, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { useCreditPortfolio } from "../../shared/hooks/useCreditPortfolio.js";
import { money } from "../../services/format.js";

const stages = ["current", "reminder", "soft_collection", "hard_collection", "legal", "restructured", "closed"];
export function CreditRiskPanel() {
  const { activeTenantId } = useAuth();
  const { contracts, loading, error, recalculate, setCollection, audit, restructure, requestAdjustment, decideAdjustment } = useCreditPortfolio(activeTenantId);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [message, setMessage] = useState("");
  const open = async credit => { setSelected(credit); setMessage(""); try { setHistory(await audit(credit.id)); } catch (nextError) { setMessage(nextError.message); } };
  return <Panel className="credit-risk-panel">
    <PanelHeader title="Risk və kolleksiya reyestri" subtitle={`${contracts.length} backend müqaviləsi · gecikmə, cərimə və kolleksiya mərhələsi`} icon={ShieldAlert}
      action={<button className="secondary-btn" type="button" onClick={recalculate} disabled={loading}><RefreshCw size={16} /> Gecikməni hesabla</button>} />
    {error && <div className="inline-alert danger">{error.message}</div>}
    <DataTable columns={["Müqavilə", "Müştəri", "Əsas məbləğ", "Risk", "Kolleksiya", "Gecikən taksit"]}
      rows={contracts.slice(0, 20).map((credit) => {
        const overdue = (credit.installments || []).filter((item) => item.status === "overdue");
        return [
          <button type="button" className="text-btn" onClick={() => open(credit)}><TwoLine title={credit.contract_no} subtitle={credit.status} /></button>,
          <TwoLine title={credit.customer?.name || "Müştəri"} subtitle={credit.customer?.fin || ""} />,
          money(Number(credit.principal || 0) - Number(credit.initial_payment || 0)),
          <TwoLine title={`${credit.risk_score || 0}/100`} subtitle={credit.last_risk_calculated_at ? "Yenilənib" : "Hesablanmayıb"} />,
          <select value={credit.collection_stage || "current"} onChange={(event) => setCollection(credit, event.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>,
          overdue.length ? <StatusBadge status={`${overdue.length} gecikmə`} /> : "—",
        ];
      })} />
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal-card credit-workflow-modal" role="dialog" onMouseDown={event => event.stopPropagation()}>
      <header className="modal-header"><div><h2>{selected.contract_no}</h2><p>Restrukturizasiya, güzəşt və tam audit tarixçəsi</p></div><button type="button" className="secondary-btn icon-only" onClick={() => setSelected(null)}>×</button></header>
      {message && <div className="inline-alert danger">{message}</div>}
      <div className="credit-workflow-grid">
        <form onSubmit={async event => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget)); try { await restructure({ creditId:selected.id,term:values.term,startDate:values.startDate,reason:values.reason }); setMessage("Yeni müqavilə və ödəniş cədvəli yaradıldı."); } catch(nextError){setMessage(nextError.message);} }} className="workflow-form">
          <h3>Restrukturizasiya</h3><label>Müddət<select name="term" defaultValue="12">{[2,3,4,5,6,12,18,24,36,48].map(term=><option key={term} value={term}>{term} ay</option>)}</select></label><label>Başlanğıc tarixi<input required name="startDate" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label><label>Səbəb<textarea required name="reason" /></label><button className="primary-btn">Yeni cədvəl yarat</button>
        </form>
        <form onSubmit={async event => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget)); try { await requestAdjustment({creditId:selected.id,type:values.type,amount:values.amount,reason:values.reason}); setMessage("Təsdiq gözləyən düzəliş yaradıldı."); setHistory(await audit(selected.id)); } catch(nextError){setMessage(nextError.message);} }} className="workflow-form">
          <h3>Qismən bağlanış / güzəşt</h3><label>Növ<select name="type"><option value="waiver">Güzəşt</option><option value="principal">Qismən bağlanış</option><option value="penalty">Cərimə düzəlişi</option></select></label><label>Məbləğ<input required min="0.01" step="0.01" name="amount" type="number" /></label><label>Səbəb<textarea required name="reason" /></label><button className="secondary-btn">Təsdiqə göndər</button>
        </form>
      </div>
      <h3><FileText size={17}/> Kredit audit timeline</h3><div className="credit-audit-list">{[
        ...(history?.payments||[]).map(row=>({id:`p-${row.id}`,at:row.paid_at,title:`Ödəniş ${row.receipt_no}`,detail:money(row.amount)})),
        ...(history?.collection||[]).map(row=>({id:`c-${row.id}`,at:row.created_at,title:`Kolleksiya: ${row.stage}`,detail:row.note||row.outcome})),
        ...(history?.adjustments||[]).map(row=>({id:`a-${row.id}`,adjustment:row,at:row.created_at,title:`Düzəliş: ${row.adjustment_type}`,detail:`${row.requested_amount ? money(row.requested_amount)+" · " : ""}${row.reason} · ${row.approval_status || "approved"}`})),
        ...(history?.restructures||[]).map(row=>({id:`r-${row.id}`,at:row.created_at,title:"Restrukturizasiya",detail:`${row.new_term_months} ay · ${row.reason}`})),
      ].sort((a,b)=>new Date(b.at)-new Date(a.at)).map(row=><div key={row.id}><small>{new Date(row.at).toLocaleString("az-AZ")}</small><b>{row.title}</b><span>{row.detail||"—"}</span>{row.adjustment?.approval_status==="pending" && <span className="audit-actions"><button className="secondary-btn" type="button" onClick={async()=>{await decideAdjustment({adjustmentId:row.adjustment.id,decision:"approved"});setHistory(await audit(selected.id));}}>Təsdiq et</button><button className="danger-btn" type="button" onClick={async()=>{await decideAdjustment({adjustmentId:row.adjustment.id,decision:"rejected"});setHistory(await audit(selected.id));}}>Rədd et</button></span>}</div>)}</div>
    </section></div>}
  </Panel>;
}
