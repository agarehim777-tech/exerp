import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, LockKeyhole, RotateCcw, TriangleAlert } from "lucide-react";
import { Panel, PanelHeader, StatusBadge } from "../../../components/ui.jsx";
import {
  listAccountingPeriodLocks,
  lockAccountingPeriod,
  reopenAccountingPeriod,
} from "../../../services/coreOperations.js";

function dayRange(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { start: "1900-01-01", end: date };
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("az-AZ", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function periodErrorMessage(error, fallback) {
  const message = error?.message || "";
  if (/accounting_period_locks|schema cache|PGRST205/i.test(message)) {
    return "Period bağlanışı bazada aktiv deyil. Son Supabase migration-ını tətbiq edin.";
  }
  if (/permission_denied/i.test(message)) return "Bu əməliyyat üçün şirkət administratoru icazəsi tələb olunur.";
  return message || fallback;
}

export function AccountingPeriodPanel({ tenantId, canManage = false, expenses = [], notify }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [locks, setLocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const range = dayRange(selectedDate);
  const pendingExpenses = expenses.filter((item) => {
    const date = String(item.expenseDate || item.date || "").slice(0, 10);
    return range && date && date <= range.end && /gözləyir|pending/i.test(item.status || "");
  }).length;
  const currentLock = locks.find((item) => (
    item.status === "locked"
    && item.period_start <= range?.start
    && range?.end <= item.period_end
  ));

  async function loadLocks() {
    if (!tenantId) return;
    try {
      setError("");
      setLocks(await listAccountingPeriodLocks(tenantId));
    } catch (loadError) {
      setError(periodErrorMessage(loadError, "Period tarixçəsi yüklənmədi"));
    }
  }

  useEffect(() => { loadLocks(); }, [tenantId]);

  async function closePeriod() {
    if (!range || !confirmed || reason.trim().length < 3) return;
    setLoading(true);
    setError("");
    try {
      await lockAccountingPeriod({ tenantId, periodStart: range.start, periodEnd: range.end, reason: reason.trim() });
      setConfirmed(false);
      setReason("");
      await loadLocks();
      notify?.("Seçilmiş tarix daxil olmaqla bütün keçmiş maliyyə dövrü bağlandı.", "success");
    } catch (closeError) {
      setError(periodErrorMessage(closeError, "Period bağlanmadı"));
    } finally {
      setLoading(false);
    }
  }

  async function reopenPeriod(lock) {
    const reopenReason = window.prompt("Periodun yenidən açılma səbəbini yazın:");
    if (!reopenReason || reopenReason.trim().length < 3) return;
    setLoading(true);
    setError("");
    try {
      await reopenAccountingPeriod({ tenantId, periodLockId: lock.id, reason: reopenReason.trim() });
      await loadLocks();
      notify?.("Maliyyə periodu yenidən açıldı və audit qeydi yaradıldı.", "success");
    } catch (reopenError) {
      setError(periodErrorMessage(reopenError, "Period yenidən açılmadı"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel className="accounting-period-panel">
      <PanelHeader
        title="Period bağlanışı"
        subtitle="Seçilmiş tarix daxil olmaqla həmin günə qədər bütün keçmiş maliyyə əməliyyatları bloklanır."
        icon={CalendarClock}
      />
      <div className="accounting-period-layout">
        <div className="accounting-period-form">
          <label className="field">
            <span>Bağlanış tarixi</span>
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
          <label className="field full">
            <span>Bağlanış səbəbi</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Məsələn: Bu tarixədək kassa və maliyyə bağlanışı" />
          </label>
          <div className={`period-readiness ${pendingExpenses ? "warning" : "ready"}`}>
            {pendingExpenses ? <TriangleAlert size={18} /> : <CheckCircle2 size={18} />}
            <div>
              <strong>{pendingExpenses ? `${pendingExpenses} təsdiq gözləyən xərc var` : "İlkin yoxlama tamamdır"}</strong>
              <span>{pendingExpenses ? "Bağlamadan əvvəl seçilmiş tarixədək gözləyən xərcləri yoxlayın." : "Seçilmiş tarixədək gözləyən xərc tapılmadı."}</span>
            </div>
          </div>
          <label className="period-confirmation">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Seçilmiş tarix daxil olmaqla bütün keçmiş dövrün bloklanacağını təsdiq edirəm.</span>
          </label>
          {error && <div className="period-error" role="alert">{error}</div>}
          <button
            className="primary-btn"
            type="button"
            onClick={closePeriod}
            disabled={!tenantId || !canManage || !confirmed || reason.trim().length < 3 || loading || Boolean(currentLock)}
          >
            <LockKeyhole size={17} /> {currentLock ? "Bu tarixədək artıq bağlıdır" : loading ? "İcra olunur..." : "Bu tarixədək bağla"}
          </button>
          {!canManage && <small className="period-permission-note">Bu əməliyyat üçün Maliyyə idarəetməsi icazəsi tələb olunur.</small>}
        </div>

        <div className="accounting-period-history">
          <h3>Bağlanış tarixçəsi</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Tarix</th><th>Status</th><th>Səbəb</th><th>Əməliyyat</th></tr></thead>
              <tbody>
                {locks.map((lock) => (
                  <tr key={lock.id}>
                    <td>{lock.period_start === "1900-01-01"
                      ? `${formatDate(lock.period_end)} tarixinədək`
                      : lock.period_start === lock.period_end
                      ? formatDate(lock.period_start)
                      : `${formatDate(lock.period_start)} - ${formatDate(lock.period_end)}`}</td>
                    <td><StatusBadge status={lock.status === "locked" ? "Bağlı" : "Yenidən açılıb"} /></td>
                    <td>{lock.reason || "-"}</td>
                    <td>
                      {lock.status === "locked" && canManage ? (
                        <button className="secondary-btn compact" type="button" onClick={() => reopenPeriod(lock)} disabled={loading}>
                          <RotateCcw size={14} /> Yenidən aç
                        </button>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!locks.length && !error && <div className="period-empty">Hələ bağlanmış period yoxdur.</div>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
