import { Badge, Button, Input, Table } from '../../shared/ui/primitives';
import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { toLocalIsoDate } from "../../services/date.js";
import { useBlobReconciliation } from "../../shared/hooks/useBlobReconciliation.js";
import { useOperationalHealth } from "../../shared/hooks/useOperationalHealth.js";
import { useRecoveryStatus } from "../../shared/hooks/useRecoveryStatus.js";
import { reconciliationToCsv } from "../../shared/lib/blobReconciliation.js";
import { supabase } from "../../integrations/supabase/client.js";
import { createIdempotencyKey } from "../../services/coreOperations.js";


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
  const tone = severity === "error" ? "danger" : severity === "warn" ? "warning" : "success";
  return <Badge tone={tone}>{SEV_LABELS[severity] || severity}</Badge>;
}

function EmptyRow({ colSpan, text = "Uyğunsuzluq tapılmadı." }) {
  return (
    <tr>
      <td className={["",'ui-muted'].filter(Boolean).join(' ')} colSpan={colSpan}>{text}</td>
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
  const [serverReport, setServerReport] = useState(null);
  const [repairReason, setRepairReason] = useState("");
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState("");

  if (!tenantId) return <div className={"ui-card"}>Aktiv şirkət seçilməyib.</div>;

  const downloadCsv = () => {
    if (!report) return;
    const blob = new Blob([reconciliationToCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barisdirma-${toLocalIsoDate()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = report?.summary;
  const runServerScan = async () => {
    setServerBusy(true); setServerError("");
    const { data, error: scanError } = await supabase.rpc("scan_erp_integrity", { _tenant_id: tenantId });
    setServerBusy(false);
    if (scanError) { setServerError(scanError.message); return; }
    setServerReport(data);
  };
  const repairIssue = async (issue) => {
    if (repairReason.trim().length < 3) { setServerError("Düzəlişi təsdiqləmək üçün səbəb yazın."); return; }
    setServerBusy(true); setServerError("");
    const { error: repairError } = await supabase.rpc("repair_erp_integrity_issue", {
      _tenant_id: tenantId, _order_id: issue.order_id, _reason: repairReason.trim(),
      _request_key: createIdempotencyKey(`reconciliation:${issue.order_id}`),
    });
    if (repairError) { setServerBusy(false); setServerError(repairError.message); return; }
    setRepairReason("");
    await runServerScan();
    operations.refresh();
  };

  return (
    <div className="u-display-grid u-gap-16px">
      <div className={"ui-card"}>
        <div className="u-display-flex u-gap-12px u-align-items-center u-flex-wrap-wrap">
          <Button type="button" className={"ui-button ui-button-primary"} onClick={() => { refresh(); operations.refresh(); runServerScan(); }} disabled={loading || operations.loading || serverBusy}>
            {loading || operations.loading || serverBusy ? "Yoxlanılır…" : "Sistemi yoxla"}
          </Button>
          <Button type="button" className={"ui-button ui-button-secondary"} onClick={downloadCsv} disabled={!report}>
            CSV ixrac
          </Button>
          <span className="u-font-size-12px u-opacity-0_7">
            {lastRunAt ? `Son yoxlama: ${new Date(lastRunAt).toLocaleString("az-AZ")}` : "—"}
          </span>
        </div>
      </div>

      {error && <div className={"ui-notice ui-notice-warning"}>Xəta: {error}</div>}
      {operations.error && <div className={"ui-notice ui-notice-warning"}>Əməliyyat yoxlaması: {operations.error}</div>}
      {serverError && <div className={"ui-notice ui-notice-warning"}>Server reconciliation: {serverError}</div>}

      {report && (
        <div className="u-display-flex u-gap-12px u-flex-wrap-wrap">
          <div className={"ui-stat-card"}>
            <div className={"ui-stat-label"}>Uyğunsuz (kritik)</div>
            <div className={["ui-stat-value",(s.errorCount ? 'amount-due' : 'amount-positive')].filter(Boolean).join(' ')}>{s.errorCount}</div>
          </div>
          <div className={"ui-stat-card"}>
            <div className={"ui-stat-label"}>Diqqət tələb edən</div>
            <div className={["ui-stat-value",(s.warnCount ? 'amount-due' : 'amount-positive')].filter(Boolean).join(' ')}>{s.warnCount}</div>
          </div>
          <div className={"ui-stat-card"}>
            <div className={"ui-stat-label"}>Serial (blob / baza)</div>
            <div className={"ui-stat-value"}>{report.serials.blobCount} / {report.serials.dbCount}</div>
          </div>
          <div className={"ui-stat-card"}>
            <div className={"ui-stat-label"}>Rezerv (aktiv / anbar)</div>
            <div className={"ui-stat-value"}>{report.reservations.totalActiveReserved} / {report.reservations.totalBalanceReserved}</div>
          </div>
        </div>
      )}

      <div className={"ui-tabs"}>
        {TABS.map(([key, label]) => (
          <Button key={key} type="button" onClick={() => setTab(key)} className={tab === key ? 'ui-button ui-button-tab active' : 'ui-button ui-button-tab'}>{label}</Button>
        ))}
      </div>

      {!report && !loading && <div className={"ui-card"}>Məlumat yoxdur.</div>}

      {tab === "operations" && operations.report && (
        <div className="u-display-grid u-gap-16px">
          <div className="u-display-flex u-gap-12px u-flex-wrap-wrap">
            <div className={"ui-stat-card"}><div className={"ui-stat-label"}>Sistem statusu</div><div className={["ui-stat-value",(operations.report.summary.healthy ? 'amount-due' : 'amount-positive')].filter(Boolean).join(' ')}>{operations.report.summary.healthy ? "Sağlam" : "Diqqət"}</div></div>
            <div className={"ui-stat-card"}><div className={"ui-stat-label"}>Kritik</div><div className={"ui-stat-value"}>{operations.report.summary.critical}</div></div>
            <div className={"ui-stat-card"}><div className={"ui-stat-label"}>Xəbərdarlıq</div><div className={"ui-stat-value"}>{operations.report.summary.warnings}</div></div>
            <div className={"ui-stat-card"}><div className={"ui-stat-label"}>Yoxlama vaxtı</div><div className={["ui-stat-value",'ui-small-value'].filter(Boolean).join(' ')}>{new Date(operations.report.checkedAt).toLocaleString("az-AZ")}</div></div>
          </div>
          <div className={"ui-card"}>
            <div className="u-font-weight-700 u-margin-bottom-10px">Satış, kredit, maliyyə və anbar əlaqələri</div>
            <Table className={"ui-table"}>
              <thead><tr><th className={""}>Modul</th><th className={""}>Problem</th><th className={""}>Detallar</th><th className={""}>Tövsiyə edilən düzəliş</th><th className={""}>Ciddilik</th></tr></thead>
              <tbody>
                {!operations.report.issues.length && <EmptyRow colSpan={5} text="Bütün əməliyyat əlaqələri uyğundur." />}
                {operations.report.issues.map((issue) => <tr key={issue.id}><td className={""}>{issue.domain}</td><td className={""}>{issue.title}</td><td className={""}>{issue.detail}</td><td className={""}>{issue.remedy}</td><td className={""}><SevBadge severity={issue.severity} /></td></tr>)}
              </tbody>
            </Table>
          </div>
          {serverReport && (
            <div className={"ui-card"}>
              <div className="u-font-weight-700 u-margin-bottom-10px">Database lifecycle preview</div>
              <p className="u-opacity-0_72">Yoxlama məlumatı dəyişmir. Düzəliş yalnız səbəb yazıldıqdan və ayrıca düymə basıldıqdan sonra tətbiq edilir.</p>
              <Input value={repairReason} onChange={(event) => setRepairReason(event.target.value)} placeholder="Təsdiqli düzəliş səbəbi" className="u-width-100 u-margin-bottom-10px" />
              <Table className={"ui-table"}>
                <thead><tr><th className={""}>Sifariş</th><th className={""}>Uyğunsuzluq</th><th className={""}>Say</th><th className={""}>Əməliyyat</th></tr></thead>
                <tbody>
                  {!(serverReport.issues || []).length && <EmptyRow colSpan={4} text="Database səviyyəsində kritik uyğunsuzluq yoxdur." />}
                  {(serverReport.issues || []).map((issue) => <tr key={`${issue.type}:${issue.order_id}`}><td className={""}>{issue.order_no}</td><td className={""}>{issue.type}</td><td className={""}>{issue.count}</td><td className={""}><Button type="button" className={"ui-button ui-button-secondary"} disabled={serverBusy} onClick={() => repairIssue(issue)}>Təsdiqli düzəliş</Button></td></tr>)}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      )}

      {report && tab === "serials" && (
        <div className={"ui-card"}>
          <Table className={"ui-table"}>
            <thead>
              <tr>
                <th className={""}>IMEI / Serial</th>
                <th className={""}>Problem</th>
                <th className={""}>Blob statusu</th>
                <th className={""}>Baza statusu</th>
                <th className={""}>Ciddilik</th>
              </tr>
            </thead>
            <tbody>
              {report.serials.issues.length === 0 && <EmptyRow colSpan={5} />}
              {report.serials.issues.map((i) => (
                <tr key={`${i.kind}-${i.key}`}>
                  <td className={""}>{i.imei}</td>
                  <td className={""}>{KIND_LABELS[i.kind] || i.kind}</td>
                  <td className={""}>{i.blobStatus || "—"}</td>
                  <td className={""}>{i.dbStatus || "—"}</td>
                  <td className={""}><SevBadge severity={i.severity} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {report && tab === "reservations" && (
        <div className={"ui-card"}>
          <Table className={"ui-table"}>
            <thead>
              <tr>
                <th className={""}>Məhsul</th>
                <th className={""}>Aktiv rezerv</th>
                <th className={""}>Anbar rezervi</th>
                <th className={""}>Bağlı sifariş</th>
                <th className={""}>Fərq</th>
                <th className={""}>Ciddilik</th>
              </tr>
            </thead>
            <tbody>
              {report.reservations.rows.length === 0 && <EmptyRow colSpan={6} />}
              {report.reservations.rows.map((r) => (
                <tr key={r.productId}>
                  <td className={""}>{r.product}</td>
                  <td className={""}>{r.activeReserved}</td>
                  <td className={""}>{r.balanceReserved}</td>
                  <td className={""}>{r.orderNos.length ? r.orderNos.join(', ') : '—'}</td>
                  <td className={["",(r.diff ? 'amount-due' : 'amount-positive')].filter(Boolean).join(' ')}>{r.diff}</td>
                  <td className={""}><SevBadge severity={r.severity} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {report && tab === "production" && (
        <div className={"ui-card"}>
          <Table className={"ui-table"}>
            <thead>
              <tr>
                <th className={""}>Plan</th>
                <th className={""}>Problem</th>
                <th className={""}>Blob statusu</th>
                <th className={""}>Baza statusu</th>
                <th className={""}>Ciddilik</th>
              </tr>
            </thead>
            <tbody>
              {report.production.issues.length === 0 && <EmptyRow colSpan={5} />}
              {report.production.issues.map((i) => (
                <tr key={`${i.kind}-${i.key}`}>
                  <td className={""}>{i.name}</td>
                  <td className={""}>{KIND_LABELS[i.kind] || i.kind}</td>
                  <td className={""}>{i.blobStatus || "—"}</td>
                  <td className={""}>{i.dbStatus || "—"}</td>
                  <td className={""}><SevBadge severity={i.severity} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {report && tab === "notifications" && (
        <div className="u-display-grid u-gap-16px">
          <div className={"ui-card"}>
            <Table className={"ui-table"}>
              <thead>
                <tr>
                  <th className={""}>Qayda</th>
                  <th className={""}>Kanal</th>
                  <th className={""}>Status</th>
                  <th className={""}>Blob göndərişləri</th>
                  <th className={""}>Bazada göndəriş</th>
                  <th className={""}>Uğursuz</th>
                  <th className={""}>Ciddilik</th>
                </tr>
              </thead>
              <tbody>
                {report.notifications.rows.length === 0 && <EmptyRow colSpan={7} text="Qayda tapılmadı." />}
                {report.notifications.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={""}>{r.name}</td>
                    <td className={""}>{r.channel}</td>
                    <td className={""}>{r.status}</td>
                    <td className={""}>{r.blobSends}</td>
                    <td className={""}>{r.dbDeliveries}</td>
                    <td className={""}>{r.dbFailed}</td>
                    <td className={""}><SevBadge severity={r.severity} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {report.notifications.orphanDeliveries.length > 0 && (
            <div className={"ui-card"}>
              <div className="u-font-weight-600 u-margin-bottom-8px">Qaydası tapılmayan göndərişlər</div>
              <Table className={"ui-table"}>
                <thead>
                  <tr>
                    <th className={""}>Şablon kodu</th>
                    <th className={""}>Sayı</th>
                  </tr>
                </thead>
                <tbody>
                  {report.notifications.orphanDeliveries.map((o) => (
                    <tr key={o.templateCode}>
                      <td className={""}>{o.templateCode}</td>
                      <td className={""}>{o.count}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      )}

      {tab === "recovery" && (
        <div className="u-display-grid u-gap-16px">
          <div className="u-display-flex u-gap-12px u-flex-wrap-wrap">
            <RecoveryTile title="Avtomatik backup" run={recovery.backup} loading={recovery.loading} />
            <RecoveryTile title="Restore drill" run={recovery.restore} loading={recovery.loading} />
            <div className={"ui-stat-card"}><div className={"ui-stat-label"}>Saxlama müddəti</div><div className={"ui-stat-value"}>30 gün</div></div>
            <div className={"ui-stat-card"}><div className={"ui-stat-label"}>Backup qrafiki</div><div className={["ui-stat-value",'ui-small-value'].filter(Boolean).join(' ')}>Hər gün 05:17</div></div>
          </div>
          {recovery.error && <div className={"ui-notice ui-notice-warning"}>{recovery.error}</div>}
          <div className={"ui-card"}>
            <div className="u-font-weight-700">Bərpa hazırlığı</div>
            <p className="u-opacity-0_72 u-margin-bottom-14px">Backup checksum ilə yoxlanılır; restore yalnız ayrıca staging bazasına icazə verir.</p>
            <div className="u-display-flex u-gap-8px u-flex-wrap-wrap">
              <a className={"ui-button ui-button-secondary"} href="https://github.com/agarehim777-tech/exerp/actions/workflows/backup-supabase.yml" target="_blank" rel="noreferrer">Backup tarixçəsi</a>
              <a className={"ui-button ui-button-secondary"} href="https://github.com/agarehim777-tech/exerp/actions/workflows/restore-drill.yml" target="_blank" rel="noreferrer">Restore drill başladın</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecoveryTile({ title, run, loading }) {
  const ok = run?.conclusion === "success";
  return <div className={"ui-stat-card"}><div className={"ui-stat-label"}>{title}</div><div className={["ui-stat-value",(ok ? 'amount-due' : 'amount-positive')].filter(Boolean).join(' ')}>{loading ? "Yüklənir" : run ? (ok ? "Uğurlu" : run.status === "in_progress" ? "İşləyir" : "Uğursuz") : "Hələ yoxdur"}</div>{run?.created_at && <small>{new Date(run.created_at).toLocaleString("az-AZ")}</small>}</div>;
}

