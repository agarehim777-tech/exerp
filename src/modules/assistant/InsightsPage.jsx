import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useTenantRequestScope } from '../../shared/hooks/useTenantRequestScope';
import { AlertTriangle, Brain, Check, Loader2, RefreshCw, ThumbsDown, Zap } from "lucide-react";

const CATEGORY_LABELS = {
  sales: "Satış",
  procurement: "Satınalma",
  inventory: "Anbar",
  receivables: "Debitor borclar",
  hr: "HR",
  general: "Ümumi",
};

const PRIORITY_TONE = {
  high: { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c", label: "Yüksək" },
  medium: { bg: "#fffbeb", border: "#fde68a", color: "#b45309", label: "Orta" },
  low: { bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d", label: "Aşağı" },
};

export default function InsightsPage() {
  const { activeTenantId } = useAuth();
  const { scope, begin } = useTenantRequestScope(activeTenantId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [storedData, setData] = useState(null);
  const [dataScope, setDataScope] = useState(null);
  const data = dataScope === scope ? storedData : null;
  const [feedback, setFeedback] = useState({});
  const [storedHistory, setHistory] = useState([]);
  const [historyScope, setHistoryScope] = useState(null);
  const history = historyScope === scope ? storedHistory : [];
  const [pendingFeedback, setPendingFeedback] = useState({});
  useEffect(() => {
    setData(null); setFeedback({}); setHistory([]); setError(null);
    setLoading(false); setPendingFeedback({});
  }, [scope]);

  const loadHistory = useCallback(async () => {
    if (!activeTenantId) return;
    const isCurrent = begin('history');
    const { data: rows, error: historyError } = await supabase
      .from("ai_insight_feedback")
      .select("insight_key,title,action,created_at")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!isCurrent()) return;
    if (historyError) { setError(historyError.message); return; }
    setHistory(rows || []);
    setHistoryScope(scope);
  }, [activeTenantId, begin, scope]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const generate = useCallback(async () => {
    if (!activeTenantId) return;
    const isCurrent = begin('generate');
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("erp-insights", {
        body: { tenantId: activeTenantId },
      });
      if (!isCurrent()) return;
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
      setDataScope(scope);
      setFeedback({});
    } catch (nextError) {
      if (!isCurrent()) return;
      setError(nextError.message || String(nextError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [activeTenantId, begin, scope]);

  const react = async (insight, action) => {
    if (!activeTenantId || pendingFeedback[insight.key]) return;
    const isCurrent = begin(`feedback:${insight.key}`);
    setPendingFeedback((prev) => ({ ...prev, [insight.key]: true }));
    setError(null);
    try {
      const { error: writeError } = await supabase.from("ai_insight_feedback").insert({
        tenant_id: activeTenantId,
        insight_key: insight.key || insight.title?.slice(0, 40) || "insight",
        category: insight.category || "general",
        title: insight.title || null,
        action,
      });
      if (!isCurrent()) return;
      if (writeError) throw writeError;
      setFeedback((prev) => ({ ...prev, [insight.key]: action }));
      await loadHistory();
    } catch (writeError) {
      if (isCurrent()) setError(writeError.message || String(writeError));
    } finally {
      if (isCurrent()) setPendingFeedback((prev) => ({ ...prev, [insight.key]: false }));
    }
  };

  const signals = data?.signals;

  return (
    <div className="stack u-padding-24px u-max-width-1100px u-margin-0_auto u-width-100" >
      <div className="insights-page--s-header">
        <div className="insights-page--s-header-icon"><Brain size={20} /></div>
        <div className="u-flex-1">
          <div className="insights-page--s-title">AI Agent v2 — Ağıllı tövsiyələr</div>
          <div className="insights-page--s-sub">Satış, satınalma, anbar qalıqları və vaxtı keçmiş borclar üzrə avtomatik təhlil. Rəyləriniz növbəti təhlildə nəzərə alınır.</div>
        </div>
        <button onClick={generate} disabled={loading || !activeTenantId} className="insights-page--s-primary-btn">
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} Təhlil et
        </button>
      </div>

      {signals && (
        <div className="insights-page--s-signal-grid">
          <Signal label="Az qalan məhsul" value={signals.lowStockCount} tone="#b45309" />
          <Signal label="Vaxtı keçmiş kredit" value={`${Number(signals.overdueCreditTotal || 0).toFixed(2)} ₼`} tone="#b91c1c" />
          <Signal label="Vaxtı keçmiş faktura" value={`${Number(signals.overdueInvoiceTotal || 0).toFixed(2)} ₼`} tone="#b91c1c" />
          <Signal label="Açıq sifariş" value={signals.openOrderCount} tone="#0f766e" />
          <Signal label="Açıq satınalma" value={signals.openPurchaseOrderCount} tone="#4338ca" />
        </div>
      )}

      {error && <div className="insights-page--s-error"><AlertTriangle size={16} /> {error}</div>}

      {!data && !loading && (
        <div className="insights-page--s-empty">
          <Zap size={28} color="#94a3b8" />
          <div className="u-font-weight-700 u-color-text_primary u-margin-top-8px">Hələ təhlil aparılmayıb</div>
          <div className="u-font-size-13px u-color-text_secondary">“Təhlil et” düyməsi ilə şirkət datası üzrə tövsiyələr yaradın.</div>
        </div>
      )}

      {(data?.insights || []).map((insight, index) => {
        const tone = PRIORITY_TONE[insight.priority] || PRIORITY_TONE.medium;
        const state = feedback[insight.key];
        return (
          <div key={insight.key || index} style={{ ...S.card, borderColor: tone.border }}>
            <div className="insights-page--s-card-head">
              <span style={{ ...S.badge, background: tone.bg, color: tone.color, borderColor: tone.border }}>{tone.label}</span>
              <span className="insights-page--s-category">{CATEGORY_LABELS[insight.category] || insight.category || "Ümumi"}</span>
              {insight.impact && <span className="insights-page--s-impact">{insight.impact}</span>}
            </div>
            <div className="insights-page--s-card-title">{insight.title}</div>
            <div className="insights-page--s-card-detail">{insight.detail}</div>
            {insight.action && <div className="insights-page--s-action"><strong>Addım:</strong> {insight.action}</div>}
            <div className="insights-page--s-card-actions">
              <button onClick={() => react(insight, "accepted")} disabled={!!state || !!pendingFeedback[insight.key]} style={{ ...S.smallBtn, ...(state === "accepted" ? S.smallBtnOn : {}) }}>
                <Check size={14} /> Qəbul et
              </button>
              <button onClick={() => react(insight, "done")} disabled={!!state || !!pendingFeedback[insight.key]} style={{ ...S.smallBtn, ...(state === "done" ? S.smallBtnOn : {}) }}>
                <Zap size={14} /> İcra olundu
              </button>
              <button onClick={() => react(insight, "dismissed")} disabled={!!state || !!pendingFeedback[insight.key]} style={{ ...S.smallBtn, ...(state === "dismissed" ? S.smallBtnOff : {}) }}>
                <ThumbsDown size={14} /> Uyğun deyil
              </button>
              {state && <span className="u-font-size-12px u-color-text_secondary">Rəy yadda saxlanıldı — növbəti təhlildə nəzərə alınacaq.</span>}
            </div>
          </div>
        );
      })}

      {data && !data.insights?.length && (
        <div className="insights-page--s-empty">Model struktur cavab qaytarmadı. Yenidən cəhd edin.</div>
      )}

      {history.length > 0 && (
        <div className="insights-page--s-card">
          <div className="insights-page--s-card-title">Öyrənmə tarixçəsi</div>
          <div className="u-display-grid u-gap-6px u-margin-top-8px">
            {history.map((row, index) => (
              <div key={index} className="insights-page--s-history-row">
                <span className="u-font-weight-600">{row.title || row.insight_key}</span>
                <span style={{ color: row.action === "dismissed" ? "#b91c1c" : "#15803d" }}>
                  {row.action === "dismissed" ? "rədd edildi" : row.action === "done" ? "icra olundu" : "qəbul edildi"}
                </span>
                <span className="u-color-text_secondary u-font-size-12px">{new Date(row.created_at).toLocaleDateString("az-AZ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`.spin { animation: spin 1s linear infinite } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function Signal({ label, value, tone }) {
  return (
    <div className="insights-page--s-signal">
      <span className="u-font-size-12px u-color-text_secondary">{label}</span>
      <strong style={{ fontSize: 18, color: tone }}>{value}</strong>
    </div>
  );
}

const S = {
  header: { display: "flex", gap: 12, alignItems: "center", background: "#fff", padding: 16, borderRadius: 14, border: "1px solid #e2e8f0" },
  headerIcon: { width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#4338ca)", color: "#fff", display: "grid", placeItems: "center" },
  title: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  sub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  primaryBtn: { display: "inline-flex", gap: 8, alignItems: "center", padding: "10px 16px", borderRadius: 10, border: "none", background: "#4338ca", color: "#fff", fontWeight: 700, cursor: "pointer" },
  signalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 },
  signal: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, display: "grid", gap: 4 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 },
  cardHead: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  badge: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, border: "1px solid" },
  category: { fontSize: 12, color: "#475569", fontWeight: 600 },
  impact: { marginLeft: "auto", fontSize: 12, color: "#0f766e", fontWeight: 700 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: "#0f172a", marginTop: 8 },
  cardDetail: { fontSize: 13, color: "#475569", marginTop: 4, lineHeight: 1.55 },
  action: { fontSize: 13, color: "#0f172a", marginTop: 8, background: "#f8fafc", borderRadius: 8, padding: "8px 10px" },
  cardActions: { display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" },
  smallBtn: { display: "inline-flex", gap: 6, alignItems: "center", padding: "7px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13 },
  smallBtnOn: { background: "#dcfce7", borderColor: "#86efac", color: "#166534" },
  smallBtnOff: { background: "#fee2e2", borderColor: "#fecaca", color: "#b91c1c" },
  empty: { background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 14, padding: 32, textAlign: "center", color: "#64748b" },
  error: { display: "flex", gap: 8, alignItems: "center", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", padding: 12, borderRadius: 10, fontSize: 13 },
  historyRow: { display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f1f5f9" },
};
