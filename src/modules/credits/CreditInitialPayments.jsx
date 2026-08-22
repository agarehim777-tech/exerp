import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { money } from "../../services/format.js";

function formatStamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("az-AZ", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Kredit üzrə beh və ilkin ödənişlərin ayrı-ayrı tarixçəsi.
 * Mənbə: audit_events (credits modulu) — hər sətir tarix, məbləğ və qeyd göstərir.
 */
export function useCreditInitialPayments(creditId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!creditId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error: queryError } = await supabase
        .from("audit_events")
        .select("id,action,detail,payload,created_at")
        .eq("module", "credits")
        .in("action", ["create_draft", "initial_payment"])
        .contains("payload", { credit_id: creditId })
        .order("created_at", { ascending: true });
      if (queryError) throw queryError;
      const mapped = (data || [])
        .map((row) => {
          const payload = row.payload || {};
          const amount =
            row.action === "create_draft"
              ? Number(payload.paid_initial || 0)
              : Number(payload.amount || 0);
          if (amount <= 0) return null;
          return {
            id: row.id,
            date: row.created_at,
            amount,
            kind: row.action === "create_draft" ? "Beh (satış anında)" : "Əlavə ilkin ödəniş",
            note: payload.note || row.detail || "",
            paidTotal: Number(payload.paid_initial || 0),
            target: Number(payload.required_initial || 0),
          };
        })
        .filter(Boolean);
      setRows(mapped);
      setError(null);
    } catch (nextError) {
      setError(nextError);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [creditId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}

export function CreditInitialPaymentsHistory({ creditId, refreshKey = 0 }) {
  const { rows, loading, error, refresh } = useCreditInitialPayments(creditId);

  useEffect(() => {
    if (refreshKey) refresh();
  }, [refreshKey, refresh]);

  const collected = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return (
    <div className="credit-schedule-preview">
      <strong>Beh / ilkin ödəniş tarixçəsi</strong>
      {loading ? <p className="form-help">Yüklənir…</p> : null}
      {error ? <p className="form-help">Tarixçə oxunmadı: {error.message}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="form-help">Hələ ilkin ödəniş qeydə alınmayıb.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className="credit-schedule-preview-scroll">
          <table className="credit-schedule-preview-table">
            <thead>
              <tr>
                <th>Tarix</th>
                <th>Növ</th>
                <th>Məbləğ</th>
                <th>Qeyd</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatStamp(row.date)}</td>
                  <td>{row.kind}</td>
                  <td>{money(row.amount)}</td>
                  <td>{row.note}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}><strong>Cəmi yığılıb</strong></td>
                <td colSpan={2}><strong>{money(collected)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default CreditInitialPaymentsHistory;
