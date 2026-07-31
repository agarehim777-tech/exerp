import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useAuditLogs } from "../../shared/hooks/useAuditLogs.js";
import {
  badge, card, input, msgBox, secondaryBtn, statLabel, statTile, statValue, table, td, th,
} from "../../shared/ui/tokens.js";

const TABLE_LABEL = {
  journal_entries: "Jurnal yazılışları",
  sales_invoices: "Satış fakturaları",
  invoice_payments: "Ödənişlər",
  orders: "Sifarişlər",
  customers: "Müştərilər",
  products: "Məhsullar",
  tenant_members: "İstifadəçilər",
  purchase_orders: "Satınalma sifarişləri",
  vendor_invoices: "Vendor fakturaları",
  stock_movements: "Anbar hərəkətləri",
  accounting_periods: "Mühasibat dövrləri",
};

const ACTION_LABEL = { INSERT: "Yaradıldı", UPDATE: "Dəyişdirildi", DELETE: "Silindi" };
const ACTION_TONE = { INSERT: "green", UPDATE: "amber", DELETE: "red" };

export default function AuditLogPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const isAdmin = ["owner", "admin"].includes(activeMembership?.role);
  const [tableFilter, setTableFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const { logs, loading, error, refresh } = useAuditLogs(tenantId, {
    table: tableFilter || undefined,
    action: actionFilter || undefined,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) =>
      JSON.stringify({ n: log.new_data, o: log.old_data, t: log.table_name }).toLowerCase().includes(q));
  }, [logs, search]);

  const stats = useMemo(() => ({
    total: logs.length,
    inserts: logs.filter((l) => l.action === "INSERT").length,
    updates: logs.filter((l) => l.action === "UPDATE").length,
    deletes: logs.filter((l) => l.action === "DELETE").length,
  }), [logs]);

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;
  if (!isAdmin) return <div style={card}>Audit izinə yalnız şirkət adminləri baxa bilər.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={statTile}><div style={statLabel}>Qeyd</div><div style={statValue}>{stats.total}</div></div>
        <div style={statTile}><div style={statLabel}>Yaradılıb</div><div style={statValue}>{stats.inserts}</div></div>
        <div style={statTile}><div style={statLabel}>Dəyişib</div><div style={statValue}>{stats.updates}</div></div>
        <div style={statTile}><div style={statLabel}>Silinib</div><div style={statValue}>{stats.deletes}</div></div>
      </div>

      {error && <div style={msgBox}>Xəta: {error.message}</div>}

      <div style={card}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <select style={input} value={tableFilter} onChange={(e) => setTableFilter(e.target.value)}>
            <option value="">Bütün cədvəllər</option>
            {Object.entries(TABLE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select style={input} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">Bütün əməliyyatlar</option>
            <option value="INSERT">Yaradıldı</option>
            <option value="UPDATE">Dəyişdirildi</option>
            <option value="DELETE">Silindi</option>
          </select>
          <input
            style={{ ...input, minWidth: 200 }}
            placeholder="Axtar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button style={secondaryBtn} onClick={refresh}>Yenilə</button>
        </div>

        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Vaxt</th><th style={th}>Cədvəl</th><th style={th}>Əməliyyat</th>
              <th style={th}>Qeyd</th><th style={th}>Dəyişən sahələr</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <AuditRow key={log.id} log={log} />
            ))}
            {!filtered.length && !loading && (
              <tr><td style={td} colSpan={5}>Audit qeydi yoxdur.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditRow({ log }) {
  const [open, setOpen] = useState(false);
  const changed = (log.changed_fields || []).filter((f) => !["updated_at", "created_at"].includes(f));

  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <td style={td}>{new Date(log.created_at).toLocaleString("az-AZ")}</td>
        <td style={td}>{TABLE_LABEL[log.table_name] || log.table_name}</td>
        <td style={td}><span style={badge(ACTION_TONE[log.action])}>{ACTION_LABEL[log.action] || log.action}</span></td>
        <td style={{ ...td, fontFamily: "monospace", fontSize: 11 }}>{String(log.record_id || "—").slice(0, 8)}</td>
        <td style={td}>{changed.length ? changed.join(", ") : "—"}</td>
      </tr>
      {open && (
        <tr>
          <td style={td} colSpan={5}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <pre style={preStyle}>{JSON.stringify(log.old_data, null, 2) || "—"}</pre>
              <pre style={preStyle}>{JSON.stringify(log.new_data, null, 2) || "—"}</pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const preStyle = {
  flex: 1,
  minWidth: 260,
  maxHeight: 240,
  overflow: "auto",
  background: "#faf8f0",
  border: "1px solid #ece5d0",
  borderRadius: 8,
  padding: 10,
  fontSize: 11,
  margin: 0,
};
