import { useEffect, useState, useMemo } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { useChartOfAccounts, useJournalEntries, fetchTrialBalance } from "../../shared/hooks/useAccounting.js";
import { ReconciliationPanel } from "../finance/ReconciliationPanel.jsx";
import { AccountingPeriodPanel } from "../finance/components/AccountingPeriodPanel.jsx";
import ConfirmActionDialog from "../../shared/components/ConfirmActionDialog.jsx";

const TYPE_LABEL = { asset: "Aktiv", liability: "Öhdəlik", equity: "Kapital", revenue: "Gəlir", expense: "Xərc" };

export default function AccountingPage() {
  const { activeMembership } = useAuth();
  const { isAdmin } = usePermissions();
  const tenantId = activeMembership?.tenant_id;
  const [tab, setTab] = useState("coa");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #e6dfc9", paddingBottom: 8 }}>
        {[["coa","Hesablar planı"],["journal","Jurnal"],["tb","Trial Balance"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l}</button>
        ))}
        <button onClick={() => setTab("reconciliation")} style={tabBtn(tab === "reconciliation")}>Kassa / bank uzlaşdırması</button>
        <button onClick={() => setTab("periods")} style={tabBtn(tab === "periods")}>Period bağlanışı</button>
      </div>
      {tab === "coa" && <ChartOfAccountsPanel isAdmin={isAdmin} />}
      {tab === "journal" && <JournalPanel isAdmin={isAdmin} />}
      {tab === "tb" && <TrialBalancePanel tenantId={tenantId} />}
      {tab === "reconciliation" && <ReconciliationPanel />}
      {tab === "periods" && <AccountingPeriodPanel tenantId={tenantId} canManage={isAdmin} />}
    </div>
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
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Hesablar planı ({accounts.length})</h3>
        {isAdmin && accounts.length === 0 && (
          <button onClick={doSeed} disabled={busy} style={primaryBtn}>Standart hesabları yüklə</button>
        )}
      </div>
      {msg && <div style={msgBox}>{msg}</div>}
      {isAdmin && (
        <form onSubmit={doCreate} style={{ display: "grid", gridTemplateColumns: "100px 1fr 140px auto", gap: 8, marginBottom: 12 }}>
          <input required placeholder="Kod" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={input} />
          <input required placeholder="Ad" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={input} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={input}>
            {Object.entries(TYPE_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="submit" disabled={busy} style={primaryBtn}>+ Əlavə et</button>
        </form>
      )}
      {loading ? <div>Yüklənir…</div> : (
        <table style={table}>
          <thead><tr><th style={th}>Kod</th><th style={th}>Ad</th><th style={th}>Tip</th>{isAdmin && <th style={th}></th>}</tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td style={td}><b>{a.code}</b></td>
                <td style={td}>{a.name}</td>
                <td style={td}>{TYPE_LABEL[a.type]}</td>
                {isAdmin && <td style={td}><button onClick={() => setPendingDelete(a)} style={delBtn}>Sil</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmActionDialog open={Boolean(pendingDelete)} title="Hesab silinsin?" description={`${pendingDelete?.code || ''} ${pendingDelete?.name || ''} hesabı yalnız istifadə edilməyibsə silinəcək.`} confirmLabel="Hesabı sil" destructive onCancel={() => setPendingDelete(null)} onConfirm={async () => { try { await remove(pendingDelete.id); setPendingDelete(null); } catch (error) { setMsg(`Xəta: ${error.message}`); } }} />
    </div>
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
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Jurnal yazılışları ({entries.length})</h3>
        {isAdmin && <button onClick={() => setShowForm(!showForm)} style={primaryBtn}>{showForm ? "Bağla" : "+ Yeni yazılış"}</button>}
      </div>
      {msg && <div style={msgBox}>{msg}</div>}
      {showForm && (
        <form onSubmit={submit} style={{ background: "#faf5e2", padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 200px 1fr", gap: 8, marginBottom: 8 }}>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} style={input} required />
            <input placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} style={input} />
            <input placeholder="Təsvir" value={description} onChange={(e) => setDescription(e.target.value)} style={input} />
          </div>
          <table style={table}>
            <thead><tr><th style={th}>Hesab</th><th style={th}>Debet</th><th style={th}>Kredit</th><th style={th}>Memo</th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={td}>
                    <select value={l.account_id} onChange={(e) => upd(i, "account_id", e.target.value)} style={input} required>
                      <option value="">— Hesab seç —</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </td>
                  <td style={td}><input type="number" step="0.01" min="0" value={l.debit} onChange={(e) => upd(i, "debit", e.target.value)} style={{ ...input, width: 100 }} /></td>
                  <td style={td}><input type="number" step="0.01" min="0" value={l.credit} onChange={(e) => upd(i, "credit", e.target.value)} style={{ ...input, width: 100 }} /></td>
                  <td style={td}><input value={l.memo} onChange={(e) => upd(i, "memo", e.target.value)} style={input} /></td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>Cəm:</td>
                <td style={{ ...td, color: totals.balanced ? "#064e3b" : "#b23a3a" }}><b>{totals.d.toFixed(2)}</b></td>
                <td style={{ ...td, color: totals.balanced ? "#064e3b" : "#b23a3a" }}><b>{totals.c.toFixed(2)}</b></td>
                <td style={td}>{totals.balanced ? "✓ balanslıdır" : "✗ balanssız"}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={addLine} style={secondaryBtn}>+ Sətir</button>
            <button type="submit" disabled={busy || !totals.balanced} style={primaryBtn}>Yarat</button>
          </div>
        </form>
      )}
      {loading ? <div>Yüklənir…</div> : (
        <table style={table}>
          <thead><tr><th style={th}>Tarix</th><th style={th}>Ref</th><th style={th}>Təsvir</th><th style={th}>Cəm</th><th style={th}>Status</th>{isAdmin && <th style={th}></th>}</tr></thead>
          <tbody>
            {entries.map((e) => {
              const total = (e.journal_lines || []).reduce((s, l) => s + Number(l.debit), 0);
              return (
                <tr key={e.id}>
                  <td style={td}>{e.entry_date}</td>
                  <td style={td}>{e.reference || "—"}</td>
                  <td style={td}>{e.description || "—"}</td>
                  <td style={td}>{total.toFixed(2)}</td>
                  <td style={td}>{e.posted ? <span style={badgeGreen}>Postlanıb</span> : <span style={badgeGray}>Layihə</span>}</td>
                  {isAdmin && (
                    <td style={td}>
                      {!e.posted && <button onClick={() => setPendingAction({ type: 'post', entry: e })} style={secondaryBtn}>Postla</button>}
                      {!e.posted && <button onClick={() => setPendingAction({ type: 'delete', entry: e })} style={delBtn}>Sil</button>}
                      {e.posted && e.source_type !== 'journal_reversal' && <button onClick={() => { setReason(''); setPendingAction({ type: 'reverse', entry: e }); }} style={delBtn}>Əks yazılış</button>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <ConfirmActionDialog open={Boolean(pendingAction)} title={pendingAction?.type === 'reverse' ? 'Əks jurnal yaradılsın?' : pendingAction?.type === 'post' ? 'Jurnal postlansın?' : 'Jurnal layihəsi silinsin?'} description={pendingAction?.type === 'reverse' ? 'Orijinal jurnal dəyişməyəcək; debet və kreditləri əks olan yeni jurnal yaradılacaq.' : pendingAction?.type === 'post' ? 'Postlandıqdan sonra jurnal dəyişdirilə və silinə bilməz.' : 'Yalnız post edilməmiş jurnal layihəsi silinəcək.'} confirmLabel={pendingAction?.type === 'reverse' ? 'Əks yazılış yarat' : pendingAction?.type === 'post' ? 'Postla' : 'Layihəni sil'} destructive={pendingAction?.type !== 'post'} reason={reason} onReasonChange={pendingAction?.type === 'reverse' ? setReason : undefined} reasonRequired={pendingAction?.type === 'reverse'} onCancel={() => setPendingAction(null)} onConfirm={async () => { try { if (pendingAction.type === 'post') await post(pendingAction.entry.id); else if (pendingAction.type === 'reverse') await reverse(pendingAction.entry.id, reason); else await remove(pendingAction.entry.id); setPendingAction(null); } catch (error) { setMsg(`Xəta: ${error.message}`); } }} />
    </div>
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
    <div style={card}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <h3 style={{ margin: 0, flex: 1 }}>Trial Balance</h3>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
        <button onClick={load} style={primaryBtn}>Yenilə</button>
      </div>
      {loading ? <div>Yüklənir…</div> : (
        <table style={table}>
          <thead><tr><th style={th}>Kod</th><th style={th}>Hesab</th><th style={th}>Tip</th><th style={th}>Debet</th><th style={th}>Kredit</th><th style={th}>Balans</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account_id}>
                <td style={td}><b>{r.code}</b></td>
                <td style={td}>{r.name}</td>
                <td style={td}>{TYPE_LABEL[r.type]}</td>
                <td style={td}>{Number(r.debit).toFixed(2)}</td>
                <td style={td}>{Number(r.credit).toFixed(2)}</td>
                <td style={{ ...td, fontWeight: 600 }}>{Number(r.balance).toFixed(2)}</td>
              </tr>
            ))}
            <tr style={{ background: "#faf5e2" }}>
              <td colSpan={3} style={{ ...td, textAlign: "right", fontWeight: 700 }}>Cəm</td>
              <td style={{ ...td, fontWeight: 700 }}>{totals.d.toFixed(2)}</td>
              <td style={{ ...td, fontWeight: 700 }}>{totals.c.toFixed(2)}</td>
              <td style={td}>{Math.abs(totals.d - totals.c) < 0.01 ? "✓" : "✗ balanssız"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

const card = { background: "#fff", border: "1px solid #e6dfc9", borderRadius: 12, padding: 20, boxShadow: "0 4px 18px rgba(6,78,59,0.06)" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "8px 10px", background: "#f0e6c8", color: "#5a4a1e", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #e6dfc9" };
const td = { padding: "8px 10px", borderBottom: "1px solid #f0ecdb" };
const input = { padding: "6px 10px", borderRadius: 6, border: "1px solid #d4c9a3", fontSize: 13, background: "#fff" };
const primaryBtn = { background: "#064e3b", color: "#fbe89a", border: 0, padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 };
const secondaryBtn = { background: "#f0e6c8", color: "#5a4a1e", border: 0, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 };
const delBtn = { background: "none", color: "#b23a3a", border: "1px solid #e6c8c8", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, marginLeft: 4 };
const msgBox = { background: "#faf5e2", color: "#5a4a1e", padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 };
const tabBtn = (active) => ({ background: active ? "#064e3b" : "transparent", color: active ? "#fbe89a" : "#064e3b", border: 0, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 });
const badgeGreen = { background: "#064e3b", color: "#fbe89a", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 };
const badgeGray = { background: "#e6dfc9", color: "#5a4a1e", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 };

