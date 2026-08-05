import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Save } from "lucide-react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { DataTable, Panel, PanelHeader, StatusBadge, TwoLine } from "../../components/ui.jsx";
import { listReconciliations, saveReconciliation } from "../../services/enterpriseWorkflows.js";
import { money } from "../../services/format.js";

const today = () => new Date().toISOString().slice(0, 10);
export function ReconciliationPanel() {
  const { activeTenantId } = useAuth();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ period_start: today(), period_end: today(), statement_balance: 0, ledger_balance: 0, status: "draft" });
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!activeTenantId) return;
    try { setRows(await listReconciliations({ tenantId: activeTenantId })); setError(""); }
    catch (nextError) { setError(nextError.message); }
  }, [activeTenantId]);
  useEffect(() => { load(); }, [load]);
  async function submit(event) {
    event.preventDefault();
    await saveReconciliation({ tenantId: activeTenantId, reconciliation: { ...form, statement_balance: Number(form.statement_balance), ledger_balance: Number(form.ledger_balance) } });
    await load();
  }
  return <Panel className="finance-reconciliation-panel">
    <PanelHeader title="Kassa vЙ™ bank uzlaЕџdД±rmasД±" subtitle="Statement qalД±ДџД± ilЙ™ ERP ledger qalД±ДџД±nД± mГјqayisЙ™ edin" icon={RefreshCw} />
    {error && <div className="inline-alert danger">{error}</div>}
    <form className="production-form-grid" onSubmit={submit}>
      <label><span>BaЕџlanДџД±c</span><input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></label>
      <label><span>Son tarix</span><input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></label>
      <label><span>Bank/kassa Г§Д±xarД±ЕџД±</span><input type="number" step="0.01" value={form.statement_balance} onChange={(e) => setForm({ ...form, statement_balance: e.target.value })} /></label>
      <label><span>ERP ledger</span><input type="number" step="0.01" value={form.ledger_balance} onChange={(e) => setForm({ ...form, ledger_balance: e.target.value })} /></label>
      <button className="primary-btn" type="submit"><Save size={16} /> UzlaЕџdД±rma yarat</button>
    </form>
    <DataTable columns={["Period", "Г‡Д±xarД±Еџ", "Ledger", "FЙ™rq", "Status"]} rows={rows.map((row) => [
      <TwoLine title={`${row.period_start} вЂ” ${row.period_end}`} subtitle={row.id.slice(0, 8)} />,
      money(row.statement_balance), money(row.ledger_balance),
      <strong>{money(row.difference)}</strong>, <StatusBadge status={row.status} />,
    ])} />
    {!rows.length && !error && <div className="finance-signal-empty"><CheckCircle2 size={16} /> UzlaЕџdД±rma qeydi yoxdur</div>}
  </Panel>;
}

