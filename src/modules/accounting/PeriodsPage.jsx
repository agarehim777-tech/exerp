import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAccountingPeriods } from "../../shared/hooks/useAccountingPeriods.js";
import {
  badge, card, delBtn, input, msgBox, primaryBtn, secondaryBtn,
  statLabel, statTile, statValue, table, td, th,
} from "../../shared/ui/tokens.js";

const STATUS_LABEL = { open: "Açıq", locked: "Bağlı", closed: "Yekunlaşıb" };
const STATUS_TONE = { open: "green", locked: "amber", closed: "gray" };

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    name: start.toLocaleDateString("az-AZ", { year: "numeric", month: "long" }),
    start_date: iso(start),
    end_date: iso(end),
  };
}

export default function PeriodsPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const isAdmin = ["owner", "admin"].includes(activeMembership?.role);
  const { periods, loading, create, setStatus, remove } = useAccountingPeriods(tenantId);
  const [form, setForm] = useState(() => monthRange(0));
  const [msg, setMsg] = useState("");

  const stats = useMemo(() => ({
    total: periods.length,
    open: periods.filter((p) => p.status === "open").length,
    locked: periods.filter((p) => p.status !== "open").length,
  }), [periods]);

  const run = async (fn) => {
    setMsg("");
    try { await fn(); } catch (error) { setMsg(`Xəta: ${error.message}`); }
  };

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}><div style={statLabel}>Dövr sayı</div><div style={statValue}>{stats.total}</div></div>
        <div style={statTile}><div style={statLabel}>Açıq</div><div style={statValue}>{stats.open}</div></div>
        <div style={statTile}><div style={statLabel}>Bağlı</div><div style={statValue}>{stats.locked}</div></div>
      </div>

      {msg && <div style={msgBox}>{msg}</div>}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Dövr kilidi necə işləyir?</h3>
        <p style={{ fontSize: 13, color: "#5b6b62", margin: 0 }}>
          Dövr <b>Bağlı</b> statusuna keçəndə həmin tarix aralığına düşən jurnal yazılışları və satış
          fakturaları üçün yaratma, dəyişdirmə və silmə əməliyyatları verilənlər bazası səviyyəsində
          bloklanır. Bu, keçmiş hesabat dövrlərinin sonradan dəyişdirilməsinin qarşısını alır.
        </p>
      </div>

      {isAdmin && (
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Yeni dövr</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...input, minWidth: 180 }}
              placeholder="Dövr adı"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              style={input}
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
            <input
              style={input}
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
            <button style={secondaryBtn} onClick={() => setForm(monthRange(-1))}>Keçən ay</button>
            <button style={secondaryBtn} onClick={() => setForm(monthRange(0))}>Bu ay</button>
            <button
              style={primaryBtn}
              onClick={() => run(async () => {
                await create(form);
                setForm(monthRange(0));
              })}
            >
              + Dövr yarat
            </button>
          </div>
        </div>
      )}

      <div style={card}>
        <h3 style={{ marginTop: 0 }}>Mühasibat dövrləri ({periods.length})</h3>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Dövr</th><th style={th}>Başlanğıc</th><th style={th}>Bitmə</th>
              <th style={th}>Status</th><th style={th}>Bağlanma</th><th style={th} />
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <td style={td}><b>{period.name}</b></td>
                <td style={td}>{new Date(period.start_date).toLocaleDateString("az-AZ")}</td>
                <td style={td}>{new Date(period.end_date).toLocaleDateString("az-AZ")}</td>
                <td style={td}>
                  <span style={badge(STATUS_TONE[period.status])}>{STATUS_LABEL[period.status] || period.status}</span>
                </td>
                <td style={td}>{period.locked_at ? new Date(period.locked_at).toLocaleString("az-AZ") : "—"}</td>
                <td style={td}>
                  {isAdmin && (
                    <>
                      {period.status === "open" ? (
                        <button style={secondaryBtn} onClick={() => run(() => setStatus(period.id, "locked"))}>Bağla</button>
                      ) : (
                        <button style={secondaryBtn} onClick={() => run(() => setStatus(period.id, "open"))}>Aç</button>
                      )}
                      <button
                        style={delBtn}
                        onClick={() => window.confirm("Dövr silinsin?") && run(() => remove(period.id))}
                      >
                        Sil
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!periods.length && !loading && (
              <tr><td style={td} colSpan={6}>Dövr yaradılmayıb.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
