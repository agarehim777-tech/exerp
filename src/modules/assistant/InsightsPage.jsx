import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [history, setHistory] = useState([]);

  const loadHistory = useCallback(async () => {
    if (!activeTenantId) return;
    const { data: rows } = await supabase
      .from("ai_insight_feedback")
      .select("insight_key,title,action,created_at")
      .eq("tenant_id", activeTenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory(rows || []);
  }, [activeTenantId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const generate = useCallback(async () => {
    if (!activeTenantId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: fnError } = await supabase.functions.invoke("erp-insights", {
        body: { tenantId: activeTenantId },
      });
      if (fnError) throw fnError;
      if (result?.error) throw new Error(result.error);
      setData(result);
      setFeedback({});
    } catch (nextError) {
      setError(nextError.message || String(nextError));
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  const react = async (insight, action) => {
    setFeedback((prev) => ({ ...prev, [insight.key]: action }));
    await supabase.from("ai_insight_feedback").insert({
      tenant_id: activeTenantId,
      insight_key: insight.key || insight.title?.slice(0, 40) || "insight",
      category: insight.category || "general",
      title: insight.title || null,
      action,
    });
    loadHistory();
  };

  const signals = data?.signals;

  return (
    <div className="stack" style={{ padding: 24, maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      <div style={S.header}>
        <div style={S.headerIcon}><Brain size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={S.title}>AI Agent v2 — Ağıllı tövsiyələr</div>
          <div style={S.sub}>Satış, satınalma, anbar qalıqları və vaxtı keçmiş borclar üzrə avtomatik təhlil. Rəyləriniz növbəti təhlildə nəzərə alınır.</div>
        </div>
        <button onClick={generate} disabled={loading || !activeTenantId} style={S.primaryBtn}>
          {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} Təhlil et
        </button>
      </div>

      {signals && (
        <div style={S.signalGrid}>
          <Signal label="Az qalan məhsul" value={signals.lowStockCount} tone="#b45309" />
          <Signal label="Vaxtı keçmiş kredit" value={`${Number(signals.overdueCreditTotal || 0).toFixed(2)} ₼`} tone="#b91c1c" />
          <Signal label="Vaxtı keçmiş faktura" value={`${Number(signals.overdueInvoiceTotal || 0).toFixed(2)} ₼`} tone="#b91c1c" />
          <Signal label="Açıq sifariş" value={signals.openOrderCount} tone="#0f766e" />
          <Signal label="Açıq satınalma" value={signals.openPurchaseOrderCount} tone="#4338ca" />
        </div>
      )}

      {error && <div style={S.error}><AlertTriangle size={16} /> {error}</div>}

      {!data && !loading && (
        <div style={S.empty}>
          <Zap size={28} color="#94a3b8" />
          <div style={{ fontWeight: 700, color: "#334155", marginTop: 8 }}>Hələ təhlil aparılmayıb</div>
          <div style={{ fontSize: 13, color: "#64748b" }}>“Təhlil et” düyməsi ilə şirkət datası üzrə tövsiyələr yaradın.</div>
        </div>
      )}

      {(data?.insights || []).map((insight, index) => {
        const tone = PRIORITY_TONE[insight.priority] || PRIORITY_TONE.medium;
        const state = feedback[insight.key];
        return (
          <div key={insight.key || index} style={{ ...S.card, borderColor: tone.border }}>
            <div style={S.cardHead}>
              <span style={{ ...S.badge, background: tone.bg, color: tone.color, borderColor: tone.border }}>{tone.label}</span>
              <span style={S.category}>{CATEGORY_LABELS[insight.category] || insight.category || "Ümumi"}</span>
              {insight.impact && <span style={S.impact}>{insight.impact}</span>}
            </div>
            <div style={S.cardTitle}>{insight.title}</div>
            <div style={S.cardDetail}>{insight.detail}</div>
            {insight.action && <div style={S.action}><strong>Addım:</strong> {insight.action}</div>}
            <div style={S.cardActions}>
              <button onClick={() => react(insight, "accepted")} disabled={!!state} style={{ ...S.smallBtn, ...(state === "accepted" ? S.smallBtnOn : {}) }}>
                <Check size={14} /> Qəbul et
              </button>
              <button onClick={() => react(insight, "done")} disabled={!!state} style={{ ...S.smallBtn, ...(state === "done" ? S.smallBtnOn : {}) }}>
                <Zap size={14} /> İcra olundu
              </button>
              <button onClick={() => react(insight, "dismissed")} disabled={!!state} style={{ ...S.smallBtn, ...(state === "dismissed" ? S.smallBtnOff : {}) }}>
                <ThumbsDown size={14} /> Uyğun deyil
              </button>
              {state && <span style={{ fontSize: 12, color: "#64748b" }}>Rəy yadda saxlanıldı — növbəti təhlildə nəzərə alınacaq.</span>}
            </div>
          </div>
        );
      })}

      {data && !data.insights?.length && (
        <div style={S.empty}>Model struktur cavab qaytarmadı. Yenidən cəhd edin.</div>
      )}

      {history.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Öyrənmə tarixçəsi</div>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {history.map((row, index) => (
              <div key={index} style={S.historyRow}>
                <span style={{ fontWeight: 600 }}>{row.title || row.insight_key}</span>
                <span style={{ color: row.action === "dismissed" ? "#b91c1c" : "#15803d" }}>
                  {row.action === "dismissed" ? "rədd edildi" : row.action === "done" ? "icra olundu" : "qəbul edildi"}
                </span>
                <span style={{ color: "#94a3b8", fontSize: 12 }}>{new Date(row.created_at).toLocaleDateString("az-AZ")}</span>
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
    <div style={S.signal}>
      <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
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
