import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useBlobReconciliation } from "../../shared/hooks/useBlobReconciliation.js";
import { useOperationalHealth } from "../../shared/hooks/useOperationalHealth.js";
import { useRecoveryStatus } from "../../shared/hooks/useRecoveryStatus.js";
import { reconciliationToCsv } from "../../shared/lib/blobReconciliation.js";
import {
  badge, card, msgBox, primaryBtn, secondaryBtn,
  statLabel, statTile, statValue, tabBar, tabBtn, table, td, th,
} from "../../shared/ui/tokens.js";

const TABS = [
  ["operations", "Əməliyyat sağlamlığı"],
  ["serials", "Serial / IMEI"],
  ["reservations", "Rezerv"],
  ["production", "İstehsal"],
  ["notifications", "Bildiriş qaydaları"],
  ["recovery", "Backup və bərpa"],
];

const KIND_LABELS = {
  missing_in_db: "Bazada yoxdur",
  missing_in_blob: "Blob-da yoxdur",
  status_mismatch: "Status uyğunsuzluğu",
};

const SEV_LABELS = { ok: "Uyğun", warn: "Diqqət", error: "Uyğunsuz" };

function SevBadge({ severity }) {
  const tone = severity === "error" ? "#b23a3a" : severity === "warn" ? "#a16207" : "#047857";
  return <span style={{ ...badge, color: tone, borderColor: tone }}>{SEV_LABELS[severity] || severity}</span>;
}

function EmptyRow({ colSpan, text = "Uyğunsuzluq tapılmadı." }) {
  return (
    <tr>
      <td style={{ ...td, opacity: 0.6 }} colSpan={colSpan}>{text}</td>
    </tr>
  );
}

export default function DataReconciliationPage() {
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.tenant_id;
  const { report, loading, error, lastRunAt, refresh } = useBlobReconciliation(tenantId);
  const operations = useOperationalHealth(tenantId);
  const recovery = useRecoveryStatus();
  const [tab, setTab] = useState("operations");

  if (!tenantId) return <div style={card}>Aktiv şirkət seçilməyib.</div>;

  const downloadCsv = () => {
    if (!report) return;
    const blob = new Blob([reconciliationToCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barisdirma-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = report?.summary;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" style={primaryBtn} onClick={() => { refresh(); operations.refresh(); }} disabled={loading || operations.loading}>
            {loading || operations.loading ? "Yoxlanılır…" : "Sistemi yoxla"}
          </button>
          <button type="button" style={secondaryBtn} onClick={downloadCsv} disabled={!report}>
            CSV ixrac
          </button>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {lastRunAt ? `Son yoxlama: ${new Date(lastRunAt).toLocaleString("az-AZ")}` : "—"}
          </span>
        </div>
      </div>

      {error && <div style={msgBox}>Xəta: {error}</div>}
      {operations.error && <div style={msgBox}>Əməliyyat yoxlaması: {operations.error}</div>}

      {report && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={statTile}>
            <div style={statLabel}>Uyğunsuz (kritik)</div>
            <div style={{ ...statValue, color: s.errorCount ? "#b23a3a" : "#064e3b" }}>{s.errorCount}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Diqqət tələb edən</div>
            <div style={{ ...statValue, color: s.warnCount ? "#a16207" : "#064e3b" }}>{s.warnCount}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Serial (blob / baza)</div>
            <div style={statValue}>{report.serials.blobCount} / {report.serials.dbCount}</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Rezerv (aktiv / anbar)</div>
            <div style={statValue}>{report.reservations.totalActiveReserved} / {report.reservations.totalBalanceReserved}</div>
          </div>
        </div>
      )}

      <div style={tabBar}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} style={tabBtn(tab === key)}>{label}</button>
        ))}
      </div>

      {!report && !loading && <div style={card}>Məlumat yoxdur.</div>}

      {tab === "operations" && operations.report && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={statTile}><div style={statLabel}>Sistem statusu</div><div style={{ ...statValue, color: operations.report.summary.healthy ? "#047857" : "#b23a3a" }}>{operations.report.summary.healthy ? "Sağlam" : "Diqqət"}</div></div>
            <div style={statTile}><div style={statLabel}>Kritik</div><div style={statValue}>{operations.report.summary.critical}</div></div>
            <div style={statTile}><div style={statLabel}>Xəbərdarlıq</div><div style={statValue}>{operations.report.summary.warnings}</div></div>
            <div style={statTile}><div style={statLabel}>Yoxlama vaxtı</div><div style={{ ...statValue, fontSize: 14 }}>{new Date(operations.report.checkedAt).toLocaleString("az-AZ")}</div></div>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Satış, kredit, maliyyə və anbar əlaqələri</div>
            <table style={table}>
              <thead><tr><th style={th}>Modul</th><th style={th}>Problem</th><th style={th}>Detallar</th><th style={th}>Tövsiyə edilən düzəliş</th><th style={th}>Ciddilik</th></tr></thead>
              <tbody>
                {!operations.report.issues.length && <EmptyRow colSpan={5} text="Bütün əməliyyat əlaqələri uyğundur." />}
                {operations.report.issues.map((issue) => <tr key={issue.id}><td style={td}>{issue.domain}</td><td style={td}>{issue.title}</td><td style={td}>{issue.detail}</td><td style={td}>{issue.remedy}</td><td style={td}><SevBadge severity={issue.severity} /></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report && tab === "serials" && (
        <div style={card}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>IMEI / Serial</th>
                <th style={th}>Problem</th>
                <th style={th}>Blob statusu</th>
                <th style={th}>Baza statusu</th>
                <th style={th}>Ciddilik</th>
              </tr>
            </thead>
            <tbody>
              {report.serials.issues.length === 0 && <EmptyRow colSpan={5} />}
              {report.serials.issues.map((i) => (
                <tr key={`${i.kind}-${i.key}`}>
                  <td style={td}>{i.imei}</td>
                  <td style={td}>{KIND_LABELS[i.kind] || i.kind}</td>
                  <td style={td}>{i.blobStatus || "—"}</td>
                  <td style={td}>{i.dbStatus || "—"}</td>
                  <td style={td}><SevBadge severity={i.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report && tab === "reservations" && (
        <div style={card}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Məhsul</th>
                <th style={th}>Aktiv rezerv</th>
                <th style={th}>Anbar rezervi</th>
                <th style={th}>Bağlı sifariş</th>
                <th style={th}>Fərq</th>
                <th style={th}>Ciddilik</th>
              </tr>
            </thead>
            <tbody>
              {report.reservations.rows.length === 0 && <EmptyRow colSpan={6} />}
              {report.reservations.rows.map((r) => (
                <tr key={r.productId}>
                  <td style={td}>{r.product}</td>
                  <td style={td}>{r.activeReserved}</td>
                  <td style={td}>{r.balanceReserved}</td>
                  <td style={td}>{r.orderNos.length ? r.orderNos.join(', ') : '—'}</td>
                  <td style={{ ...td, color: r.diff ? "#b23a3a" : undefined }}>{r.diff}</td>
                  <td style={td}><SevBadge severity={r.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report && tab === "production" && (
        <div style={card}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Plan</th>
                <th style={th}>Problem</th>
                <th style={th}>Blob statusu</th>
                <th style={th}>Baza statusu</th>
                <th style={th}>Ciddilik</th>
              </tr>
            </thead>
            <tbody>
              {report.production.issues.length === 0 && <EmptyRow colSpan={5} />}
              {report.production.issues.map((i) => (
                <tr key={`${i.kind}-${i.key}`}>
                  <td style={td}>{i.name}</td>
                  <td style={td}>{KIND_LABELS[i.kind] || i.kind}</td>
                  <td style={td}>{i.blobStatus || "—"}</td>
                  <td style={td}>{i.dbStatus || "—"}</td>
                  <td style={td}><SevBadge severity={i.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report && tab === "notifications" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={card}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Qayda</th>
                  <th style={th}>Kanal</th>
                  <th style={th}>Status</th>
                  <th style={th}>Blob göndərişləri</th>
                  <th style={th}>Bazada göndəriş</th>
                  <th style={th}>Uğursuz</th>
                  <th style={th}>Ciddilik</th>
                </tr>
              </thead>
              <tbody>
                {report.notifications.rows.length === 0 && <EmptyRow colSpan={7} text="Qayda tapılmadı." />}
                {report.notifications.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.name}</td>
                    <td style={td}>{r.channel}</td>
                    <td style={td}>{r.status}</td>
                    <td style={td}>{r.blobSends}</td>
                    <td style={td}>{r.dbDeliveries}</td>
                    <td style={td}>{r.dbFailed}</td>
                    <td style={td}><SevBadge severity={r.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.notifications.orphanDeliveries.length > 0 && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Qaydası tapılmayan göndərişlər</div>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Şablon kodu</th>
                    <th style={th}>Sayı</th>
                  </tr>
                </thead>
                <tbody>
                  {report.notifications.orphanDeliveries.map((o) => (
                    <tr key={o.templateCode}>
                      <td style={td}>{o.templateCode}</td>
                      <td style={td}>{o.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "recovery" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <RecoveryTile title="Avtomatik backup" run={recovery.backup} loading={recovery.loading} />
            <RecoveryTile title="Restore drill" run={recovery.restore} loading={recovery.loading} />
            <div style={statTile}><div style={statLabel}>Saxlama müddəti</div><div style={statValue}>30 gün</div></div>
            <div style={statTile}><div style={statLabel}>Backup qrafiki</div><div style={{ ...statValue, fontSize: 15 }}>Hər gün 05:17</div></div>
          </div>
          {recovery.error && <div style={msgBox}>{recovery.error}</div>}
          <div style={card}>
            <div style={{ fontWeight: 700 }}>Bərpa hazırlığı</div>
            <p style={{ opacity: 0.72, marginBottom: 14 }}>Backup checksum ilə yoxlanılır; restore yalnız ayrıca staging bazasına icazə verir.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a style={secondaryBtn} href="https://github.com/agarehim777-tech/exerp/actions/workflows/backup-supabase.yml" target="_blank" rel="noreferrer">Backup tarixçəsi</a>
              <a style={secondaryBtn} href="https://github.com/agarehim777-tech/exerp/actions/workflows/restore-drill.yml" target="_blank" rel="noreferrer">Restore drill başladın</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryTile({ title, run, loading }) {
  const ok = run?.conclusion === "success";
  return <div style={statTile}><div style={statLabel}>{title}</div><div style={{ ...statValue, color: ok ? "#047857" : run ? "#b23a3a" : undefined }}>{loading ? "Yüklənir" : run ? (ok ? "Uğurlu" : run.status === "in_progress" ? "İşləyir" : "Uğursuz") : "Hələ yoxdur"}</div>{run?.created_at && <small>{new Date(run.created_at).toLocaleString("az-AZ")}</small>}</div>;
}

