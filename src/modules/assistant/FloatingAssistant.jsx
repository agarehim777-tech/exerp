import React, { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { Send, Sparkles, Wrench, Loader2, Bot, User as UserIcon, X, MessageCircle } from "lucide-react";

const SUGGESTIONS = [
  "Dövriyyə?",
  "Az qalan məhsullar",
  "Son sifarişlər",
  "Top 5 müştəri",
];

export default function FloatingAssistant() {
  const { session, activeTenantId } = useAuth();
  const [token, setToken] = useState(session?.access_token || "");
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) setToken(data.session.access_token);
    });
  }, [session?.user?.id]);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-chat`;

  const { messages, sendMessage, status, error, stop } = useChat({
    id: `floating-assistant-${activeTenantId || "none"}`,
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
    if (open) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, status, open]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text) => {
    const t = (text ?? input).trim();
    if (!t || busy || !token) return;
    setInput("");
    sendMessage({ text: t });
  };

  return (
    <div className="floating-assistant">
      {open && (
        <div className="floating-assistant-panel">
          <div className="floating-assistant-header">
            <div className="floating-assistant-title">
              <div className="floating-assistant-avatar">
                <Sparkles size={16} />
              </div>
              <div>
                <div className="floating-assistant-name">ExERP AI</div>
                <div className="floating-assistant-sub">Sual verin, cavab alın</div>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="floating-assistant-close">
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="floating-assistant-thread">
            {messages.length === 0 && (
              <div className="floating-assistant-empty">
                <div className="floating-assistant-empty-title">Nə soruşmaq istərdiniz?</div>
                <div className="floating-assistant-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => submit(s)} className="floating-assistant-chip">
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
              <div className="floating-assistant-row" style={{ justifyContent: "flex-start" }}>
                <Avatar role="assistant" />
                <div className="floating-assistant-thinking">
                  <Loader2 size={12} className="spin" /> Düşünürəm…
                </div>
              </div>
            )}

            {error && (
              <div className="floating-assistant-error">Xəta: {String(error.message || error)}</div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="floating-assistant-composer"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeTenantId ? "Sual yazın..." : "Şirkət seçin"}
              disabled={!activeTenantId || !token}
              className="floating-assistant-input"
            />
            {busy ? (
              <button type="button" onClick={stop} className="floating-assistant-stop">
                <X size={14} />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim() || !activeTenantId} className="floating-assistant-send">
                <Send size={14} />
              </button>
            )}
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="floating-assistant-toggle"
        aria-label={open ? "AI köməkçini bağla" : "AI köməkçini aç"}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      <style>{`
        .floating-assistant {
          position: fixed;
          left: 16px;
          bottom: 16px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        .floating-assistant-toggle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, var(--color-primary, #10b981), var(--color-primary-dark, #059669));
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.35);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .floating-assistant-toggle:hover {
          transform: scale(1.05);
          box-shadow: 0 10px 30px rgba(16, 185, 129, 0.45);
        }
        .floating-assistant-panel {
          width: 360px;
          max-width: calc(100vw - 32px);
          max-height: 70vh;
          display: flex;
          flex-direction: column;
          background: var(--color-surface, #ffffff);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: 18px;
          box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
          overflow: hidden;
          animation: faPanelIn 0.25s ease-out;
        }
        @keyframes faPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .floating-assistant-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--color-border, #e2e8f0);
          background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04));
        }
        .floating-assistant-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .floating-assistant-avatar {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--color-primary, #10b981), var(--color-primary-dark, #059669));
          color: #fff;
          display: grid;
          place-items: center;
        }
        .floating-assistant-name {
          font-size: 14px;
          font-weight: 700;
          color: var(--color-text, #0f172a);
        }
        .floating-assistant-sub {
          font-size: 11px;
          color: var(--color-muted, #64748b);
        }
        .floating-assistant-close {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--color-muted, #64748b);
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .floating-assistant-close:hover {
          background: var(--color-muted-bg, #f1f5f9);
          color: var(--color-text, #0f172a);
        }
        .floating-assistant-thread {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 280px;
          max-height: 420px;
        }
        .floating-assistant-empty {
          text-align: center;
          padding: 18px 4px;
          color: var(--color-muted, #64748b);
        }
        .floating-assistant-empty-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 10px;
          color: var(--color-text, #334155);
        }
        .floating-assistant-suggestions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: center;
        }
        .floating-assistant-chip {
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid var(--color-border, #e2e8f0);
          background: var(--color-surface, #fff);
          color: var(--color-text, #0f172a);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .floating-assistant-chip:hover {
          background: var(--color-primary-soft, #ecfdf5);
          border-color: var(--color-primary, #10b981);
        }
        .floating-assistant-row {
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .floating-assistant-bubble {
          max-width: 82%;
          padding: 8px 12px;
          border-radius: 14px;
          font-size: 13px;
          line-height: 1.5;
        }
        .floating-assistant-bubble-user {
          background: var(--color-text, #0f172a);
          color: #fff;
          border-top-right-radius: 4px;
        }
        .floating-assistant-bubble-bot {
          background: var(--color-muted-bg, #f8fafc);
          color: var(--color-text, #0f172a);
          border: 1px solid var(--color-border, #e2e8f0);
          border-top-left-radius: 4px;
        }
        .floating-assistant-thinking {
          padding: 8px 12px;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: 14px;
          font-size: 12px;
          color: var(--color-muted, #64748b);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .floating-assistant-error {
          padding: 10px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          border-radius: 10px;
          font-size: 12px;
        }
        .floating-assistant-tool {
          margin-top: 6px;
          background: var(--color-muted-bg, #f1f5f9);
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 11px;
        }
        .floating-assistant-tool summary {
          cursor: pointer;
          display: inline-flex;
          gap: 4px;
          align-items: center;
          color: var(--color-text-secondary, #475569);
          font-weight: 600;
        }
        .floating-assistant-pre {
          margin: 6px 0 0;
          font-size: 10px;
          color: var(--color-text-secondary, #334155);
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 160px;
          overflow: auto;
        }
        .floating-assistant-composer {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 12px;
          border-top: 1px solid var(--color-border, #e2e8f0);
          background: var(--color-surface, #fff);
        }
        .floating-assistant-input {
          flex: 1;
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 13px;
          outline: none;
          background: var(--color-surface, #fff);
          color: var(--color-text, #0f172a);
        }
        .floating-assistant-input:focus {
          border-color: var(--color-primary, #10b981);
        }
        .floating-assistant-send,
        .floating-assistant-stop {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: none;
          display: grid;
          place-items: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .floating-assistant-send {
          background: linear-gradient(135deg, var(--color-primary, #10b981), var(--color-primary-dark, #059669));
          color: #fff;
        }
        .floating-assistant-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .floating-assistant-stop {
          background: #ef4444;
          color: #fff;
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 480px) {
          .floating-assistant {
            left: 10px;
            bottom: 10px;
          }
          .floating-assistant-panel {
            width: calc(100vw - 20px);
            max-height: 60vh;
          }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ m }) {
  const isUser = m.role === "user";
  const parts = m.parts || [];
  return (
    <div className="floating-assistant-row" style={{ justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && <Avatar role="assistant" />}
      <div className={`floating-assistant-bubble ${isUser ? "floating-assistant-bubble-user" : "floating-assistant-bubble-bot"}`}>
        {parts.map((p, i) => {
          if (p.type === "text") {
            return <div key={i} style={{ whiteSpace: "pre-wrap" }}>{p.text}</div>;
          }
          if (p.type?.startsWith("tool-")) {
            const name = p.type.replace(/^tool-/, "");
            const state = p.state;
            return (
              <details key={i} className="floating-assistant-tool">
                <summary>
                  <Wrench size={10} /> {name} · <span style={{ color: "#64748b" }}>{state}</span>
                </summary>
                {p.input && <pre className="floating-assistant-pre">Input: {JSON.stringify(p.input, null, 2)}</pre>}
                {p.output && <pre className="floating-assistant-pre">{JSON.stringify(p.output, null, 2).slice(0, 1200)}</pre>}
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
      width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center",
      background: isUser ? "#0f172a" : "linear-gradient(135deg,#10b981,#059669)",
      color: "#fff", flexShrink: 0,
    }}>
      {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
    </div>
  );
}
