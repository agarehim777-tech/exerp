import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { useChartOfAccounts, useJournalEntries, fetchTrialBalance } from "../../shared/hooks/useAccounting.js";
import { ReconciliationPanel } from "../finance/ReconciliationPanel.jsx";
import { AccountingPeriodPanel } from "../finance/components/AccountingPeriodPanel.jsx";
import ConfirmActionDialog from "../../shared/components/ConfirmActionDialog.jsx";
import { Badge, Button, Card, DataTable, FormGrid, Input, Notice, PageStack, Select, TableActions, Tabs, Toolbar } from "../../shared/ui/primitives.jsx";

const TYPE_LABEL = { asset: "Aktiv", liability: "Öhdəlik", equity: "Kapital", revenue: "Gəlir", expense: "Xərc" };

export default function AccountingPage() {
  const { activeMembership } = useAuth();
  const { isAdmin } = usePermissions();
  const tenantId = activeMembership?.tenant_id;
  const [tab, setTab] = useState("coa");

  return (
    <PageStack>
      <Tabs value={tab} onChange={setTab} items={[["coa", "Hesablar planı"], ["journal", "Jurnal"], ["tb", "Trial Balance"], ["reconciliation", "Kassa / bank uzlaşdırması"], ["periods", "Period bağlanışı"]]} />
      {tab === "coa" && <ChartOfAccountsPanel isAdmin={isAdmin} />}
      {tab === "journal" && <JournalPanel isAdmin={isAdmin} />}
      {tab === "tb" && <TrialBalancePanel tenantId={tenantId} />}
      {tab === "reconciliation" && <ReconciliationPanel />}
      {tab === "periods" && <AccountingPeriodPanel tenantId={tenantId} canManage={isAdmin} />}
    </PageStack>
  );
}

function ChartOfAccountsPanel({ isAdmin }) {
  const { accounts, loading, seedDefaults, create, remove } = useChartOfAccounts();
  const [form, setForm] = useState({ code: "", name: "", type: "asset" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const doSeed = async () => {
    setBusy(true); setMsg("");
    try { await seedDefaults(); setMsg("Standart hesablar əlavə edildi"); }
    catch (e) { setMsg("Xəta: " + e.message); }
    setBusy(false);
  };

  const doCreate = async (e) => {
    e.preventDefault(); setBusy(true); setMsg("");
    try { await create(form); setForm({ code: "", name: "", type: "asset" }); }
    catch (er) { setMsg("Xəta: " + er.message); }
    setBusy(false);
  };

  return (
    <Card title={`Hesablar planı (${accounts.length})`} actions={isAdmin && accounts.length === 0 && <Button onClick={doSeed} disabled={busy}>Standart hesabları yüklə</Button>}>
      {msg && <Notice tone={msg.startsWith("Xəta") ? "danger" : "info"}>{msg}</Notice>}
      {isAdmin && (
        <FormGrid as="form" onSubmit={doCreate} className="ui-form-surface ui-spacer-top">
          <Input required placeholder="Kod" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <Input required placeholder="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(TYPE_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Button type="submit" disabled={busy}>+ Əlavə et</Button>
        </FormGrid>
      )}
      <DataTable columns={[{ key: "code", label: "Kod" }, { key: "name", label: "Ad" }, { key: "type", label: "Tip" }, ...(isAdmin ? [{ key: "actions", label: "" }] : [])]} rows={loading ? [] : accounts} emptyText={loading ? "Yüklənir…" : "Hesab yoxdur."} renderCell={(account, column) => column.key === "code" ? <strong>{account.code}</strong> : column.key === "type" ? TYPE_LABEL[account.type] : column.key === "actions" ? <Button variant="danger" size="compact" onClick={() => setPendingDelete(account)}>Sil</Button> : account[column.key]} />
      <ConfirmActionDialog open={Boolean(pendingDelete)} title="Hesab silinsin?" description={`${pendingDelete?.code || ''} ${pendingDelete?.name || ''} hesabı yalnız istifadə edilməyibsə silinəcək.`} confirmLabel="Hesabı sil" destructive onCancel={() => setPendingDelete(null)} onConfirm={async () => { try { await remove(pendingDelete.id); setPendingDelete(null); } catch (error) { setMsg(`Xəta: ${error.message}`); } }} />
    </Card>
  );
}

function JournalPanel({ isAdmin }) {
  const { entries, loading, createEntry, post, remove, reverse } = useJournalEntries();
  const { accounts } = useChartOfAccounts();
  const [showForm, setShowForm] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([{ account_id: "", debit: 0, credit: 0, memo: "" }, { account_id: "", debit: 0, credit: 0, memo: "" }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [reason, setReason] = useState("");

  const totals = useMemo(() => {
    const d = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return { d, c, balanced: d === c && d > 0 };
  }, [lines]);

  const addLine = () => setLines([...lines, { account_id: "", debit: 0, credit: 0, memo: "" }]);
  const upd = (i, field, val) => setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  const submit = async (e) => {
    e.preventDefault();
    if (!totals.balanced) { setMsg("Debet və kredit bərabər olmalıdır"); return; }
    setBusy(true); setMsg("");
    try {
      await createEntry({ entry_date: entryDate, reference, description,
        lines: lines.filter((l) => l.account_id && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)) });
      setShowForm(false); setReference(""); setDescription("");
      setLines([{ account_id: "", debit: 0, credit: 0, memo: "" }, { account_id: "", debit: 0, credit: 0, memo: "" }]);
    } catch (er) { setMsg("Xəta: " + er.message); }
    setBusy(false);
  };

  return (
    <Card title={`Jurnal yazılışları (${entries.length})`} actions={isAdmin && <Button onClick={() => setShowForm(!showForm)}>{showForm ? "Bağla" : "+ Yeni yazılış"}</Button>}>
      {msg && <Notice tone={msg.startsWith("Xəta") || msg.includes("bərabər") ? "danger" : "info"}>{msg}</Notice>}
      {showForm && (
        <form onSubmit={submit} className="ui-form-surface ui-spacer-top">
          <FormGrid>
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
            <Input placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            <Input placeholder="Təsvir" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormGrid>
          <div className="ui-table-wrap ui-spacer-top"><table className="ui-table">
            <thead><tr><th>Hesab</th><th className="is-numeric">Debet</th><th className="is-numeric">Kredit</th><th>Memo</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <Select value={l.account_id} onChange={(e) => upd(i, "account_id", e.target.value)} required>
                      <option value="">— Hesab seç —</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </Select>
                  </td>
                  <td><Input type="number" step="0.01" min="0" value={l.debit} onChange={(e) => upd(i, "debit", e.target.value)} /></td>
                  <td><Input type="number" step="0.01" min="0" value={l.credit} onChange={(e) => upd(i, "credit", e.target.value)} /></td>
                  <td><Input value={l.memo} onChange={(e) => upd(i, "memo", e.target.value)} /></td>
                </tr>
              ))}
              <tr>
                <td className="is-numeric"><strong>Cəm:</strong></td>
                <td className="is-numeric"><Badge tone={totals.balanced ? "success" : "danger"}>{totals.d.toFixed(2)}</Badge></td>
                <td className="is-numeric"><Badge tone={totals.balanced ? "success" : "danger"}>{totals.c.toFixed(2)}</Badge></td>
                <td>{totals.balanced ? "✓ balanslıdır" : "✗ balanssız"}</td>
              </tr>
            </tbody>
          </table></div>
          <TableActions><Button type="button" variant="secondary" onClick={addLine}>+ Sətir</Button><Button type="submit" disabled={busy || !totals.balanced}>Yarat</Button></TableActions>
        </form>
      )}
      <DataTable columns={[{ key: "entry_date", label: "Tarix" }, { key: "reference", label: "Ref" }, { key: "description", label: "Təsvir" }, { key: "total", label: "Cəm", align: "right" }, { key: "status", label: "Status" }, ...(isAdmin ? [{ key: "actions", label: "" }] : [])]} rows={loading ? [] : entries} emptyText={loading ? "Yüklənir…" : "Jurnal yazılışı yoxdur."} renderCell={(entry, column) => ({ entry_date: entry.entry_date, reference: entry.reference || "—", description: entry.description || "—", total: (entry.journal_lines || []).reduce((sum, line) => sum + Number(line.debit), 0).toFixed(2), status: <Badge tone={entry.posted ? "success" : "neutral"}>{entry.posted ? "Postlanıb" : "Layihə"}</Badge>, actions: <TableActions>{!entry.posted && <Button variant="secondary" size="compact" onClick={() => setPendingAction({ type: "post", entry })}>Postla</Button>}{!entry.posted && <Button variant="danger" size="compact" onClick={() => setPendingAction({ type: "delete", entry })}>Sil</Button>}{entry.posted && entry.source_type !== "journal_reversal" && <Button variant="danger" size="compact" onClick={() => { setReason(""); setPendingAction({ type: "reverse", entry }); }}>Əks yazılış</Button>}</TableActions> })[column.key]} />
      <ConfirmActionDialog open={Boolean(pendingAction)} title={pendingAction?.type === 'reverse' ? 'Əks jurnal yaradılsın?' : pendingAction?.type === 'post' ? 'Jurnal postlansın?' : 'Jurnal layihəsi silinsin?'} description={pendingAction?.type === 'reverse' ? 'Orijinal jurnal dəyişməyəcək; debet və kreditləri əks olan yeni jurnal yaradılacaq.' : pendingAction?.type === 'post' ? 'Postlandıqdan sonra jurnal dəyişdirilə və silinə bilməz.' : 'Yalnız post edilməmiş jurnal layihəsi silinəcək.'} confirmLabel={pendingAction?.type === 'reverse' ? 'Əks yazılış yarat' : pendingAction?.type === 'post' ? 'Postla' : 'Layihəni sil'} destructive={pendingAction?.type !== 'post'} reason={reason} onReasonChange={pendingAction?.type === 'reverse' ? setReason : undefined} reasonRequired={pendingAction?.type === 'reverse'} onCancel={() => setPendingAction(null)} onConfirm={async () => { try { if (pendingAction.type === 'post') await post(pendingAction.entry.id); else if (pendingAction.type === 'reverse') await reverse(pendingAction.entry.id, reason); else await remove(pendingAction.entry.id); setPendingAction(null); } catch (error) { setMsg(`Xəta: ${error.message}`); } }} />
    </Card>
  );
}

function TrialBalancePanel({ tenantId }) {
  const [from, setFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try { setRows(await fetchTrialBalance(tenantId, from, to)); }
    catch (e) { alert(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const totals = rows.reduce((a, r) => ({ d: a.d + Number(r.debit), c: a.c + Number(r.credit) }), { d: 0, c: 0 });

  return (
    <Card title="Trial Balance" actions={<Toolbar><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /><Button onClick={load}>Yenilə</Button></Toolbar>}>
      <DataTable columns={[{ key: "code", label: "Kod" }, { key: "name", label: "Hesab" }, { key: "type", label: "Tip" }, { key: "debit", label: "Debet", align: "right" }, { key: "credit", label: "Kredit", align: "right" }, { key: "balance", label: "Balans", align: "right" }]} rows={loading ? [] : rows} emptyText={loading ? "Yüklənir…" : "Məlumat yoxdur."} renderCell={(row, column) => column.key === "code" ? <strong>{row.code}</strong> : column.key === "type" ? TYPE_LABEL[row.type] : ["debit", "credit", "balance"].includes(column.key) ? Number(row[column.key]).toFixed(2) : row[column.key]} footer={<tfoot><tr><td colSpan={3} className="is-numeric"><strong>Cəm</strong></td><td className="is-numeric"><strong>{totals.d.toFixed(2)}</strong></td><td className="is-numeric"><strong>{totals.c.toFixed(2)}</strong></td><td className="is-numeric"><Badge tone={Math.abs(totals.d - totals.c) < 0.01 ? "success" : "danger"}>{Math.abs(totals.d - totals.c) < 0.01 ? "✓" : "✗ balanssız"}</Badge></td></tr></tfoot>} />
    </Card>
  );
}


