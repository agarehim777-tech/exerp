import React, { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { Send, Sparkles, Wrench, Loader2, Bot, User as UserIcon } from "lucide-react";

const SUGGESTIONS = [
  "Bu ay dövriyyə nə qədərdir?",
  "Az qalan məhsulları göstər",
  "Son 10 sifarişi ver",
  "Ən çox alıb-verən 5 müştəri kimdir?",
  "Cəmi neçə müştərimiz var?",
];

export default function AssistantPage() {
  const { session, activeTenantId } = useAuth();
  const [token, setToken] = useState(session?.access_token || "");
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) setToken(data.session.access_token);
    });
  }, [session?.user?.id]);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-chat`;

  const { messages, sendMessage, status, error, stop } = useChat({
    id: `assistant-${activeTenantId || "none"}`,
    transport: new DefaultChatTransport({
      api: url,
      headers: () => ({
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      }),
      body: () => ({ tenantId: activeTenantId }),
    }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text) => {
    const t = (text ?? input).trim();
    if (!t || busy || !token) return;
    setInput("");
    sendMessage({ text: t });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={styles.headerIcon}><Sparkles size={20} /></div>
        <div>
          <div style={styles.headerTitle}>ExERP AI köməkçisi</div>
          <div style={styles.headerSub}>Şirkət datası ilə birbaşa danışın — müştəri, məhsul, satış, statistika.</div>
        </div>
      </div>

      <div ref={scrollRef} style={styles.thread}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <div style={styles.emptyTitle}>Nə soruşmaq istərdiniz?</div>
            <div style={styles.suggestGrid}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)} style={styles.suggestion}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}

        {status === "submitted" && (
          <div style={{ ...styles.row, justifyContent: "flex-start" }}>
            <Avatar role="assistant" />
            <div style={styles.thinking}><Loader2 size={14} className="spin" /> Düşünürəm…</div>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>Xəta: {String(error.message || error)}</div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        style={styles.composer}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeTenantId ? "Sual yazın..." : "Əvvəlcə şirkət seçin"}
          disabled={!activeTenantId || !token}
          style={styles.input}
        />
        {busy ? (
          <button type="button" onClick={stop} style={{ ...styles.send, background: "#ef4444" }}>
            Dayandır
          </button>
        ) : (
          <button type="submit" disabled={!input.trim() || !activeTenantId} style={styles.send}>
            <Send size={16} /> Göndər
          </button>
        )}
      </form>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function MessageBubble({ m }) {
  const isUser = m.role === "user";
  const parts = m.parts || [];
  return (
    <div style={{ ...styles.row, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && <Avatar role="assistant" />}
      <div style={{ ...styles.bubble, ...(isUser ? styles.bubbleUser : styles.bubbleBot) }}>
        {parts.map((p, i) => {
          if (p.type === "text") {
            return <div key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{p.text}</div>;
          }
          if (p.type?.startsWith("tool-")) {
            const name = p.type.replace(/^tool-/, "");
            const state = p.state;
            return (
              <details key={i} style={styles.tool}>
                <summary style={styles.toolSummary}>
                  <Wrench size={12} /> {name} · <span style={{ color: "#64748b" }}>{state}</span>
                </summary>
                {p.input && <pre style={styles.pre}>Input: {JSON.stringify(p.input, null, 2)}</pre>}
                {p.output && <pre style={styles.pre}>{JSON.stringify(p.output, null, 2).slice(0, 2000)}</pre>}
              </details>
            );
          }
          return null;
        })}
      </div>
      {isUser && <Avatar role="user" />}
    </div>
  );
}

function Avatar({ role }) {
  const isUser = role === "user";
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center",
      background: isUser ? "#0f172a" : "linear-gradient(135deg,#10b981,#059669)",
      color: "#fff", flexShrink: 0,
    }}>
      {isUser ? <UserIcon size={16} /> : <Bot size={16} />}
    </div>
  );
}

const styles = {
  wrap: { display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", padding: 24, gap: 16, maxWidth: 960, margin: "0 auto", width: "100%" },
  header: { display: "flex", gap: 12, alignItems: "center", background: "#fff", padding: 16, borderRadius: 14, border: "1px solid #e2e8f0" },
  headerIcon: { width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", display: "grid", placeItems: "center" },
  headerTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a" },
  headerSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
  thread: { flex: 1, overflowY: "auto", background: "#f8fafc", borderRadius: 14, padding: 20, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 14 },
  empty: { textAlign: "center", padding: "32px 12px", color: "#64748b" },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: "#334155", marginBottom: 16 },
  suggestGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8, maxWidth: 700, margin: "0 auto" },
  suggestion: { padding: "10px 14px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, color: "#0f172a", textAlign: "left", transition: "all .15s" },
  row: { display: "flex", gap: 10, alignItems: "flex-start" },
  bubble: { maxWidth: "78%", padding: "10px 14px", borderRadius: 14, fontSize: 14 },
  bubbleUser: { background: "#0f172a", color: "#fff", borderTopRightRadius: 4 },
  bubbleBot: { background: "#fff", color: "#0f172a", border: "1px solid #e2e8f0", borderTopLeftRadius: 4 },
  thinking: { padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, fontSize: 13, color: "#64748b", display: "flex", gap: 8, alignItems: "center" },
  tool: { marginTop: 8, background: "#f1f5f9", borderRadius: 8, padding: "6px 10px", fontSize: 12 },
  toolSummary: { cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center", color: "#475569", fontWeight: 600 },
  pre: { margin: "6px 0 0", fontSize: 11, color: "#334155", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240, overflow: "auto" },
  errorBox: { padding: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 10, fontSize: 13 },
  composer: { display: "flex", gap: 8, background: "#fff", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0" },
  input: { flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 14, outline: "none" },
  send: { display: "inline-flex", gap: 6, alignItems: "center", background: "linear-gradient(135deg,#10b981,#059669)", color: "#fff", border: 0, padding: "10px 18px", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14 },
};
