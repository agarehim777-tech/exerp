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

function assistantErrorMessage(error) {
  const message = String(error?.message || error || "");
  if (/failed to fetch/i.test(message)) {
    return "AI xidməti ilə əlaqə qurulmadı. Bir qədər sonra yenidən cəhd edin.";
  }
  if (/AI_PROVIDER_NOT_CONFIGURED|LOVABLE_API_KEY|konfiqurasiya edilməyib/i.test(message)) {
    return "AI xidməti administrator tərəfindən konfiqurasiya edilməlidir.";
  }
  if (/401|sessiya/i.test(message)) {
    return "Sessiya bitib. Yenidən daxil olun.";
  }
  return message || "AI sorğusu tamamlanmadı.";
}

export default function AssistantPage() {
  const { session, activeTenantId } = useAuth();
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/erp-chat`;

  const { messages, sendMessage, status, error, stop } = useChat({
    id: `assistant-${activeTenantId || "none"}`,
    transport: new DefaultChatTransport({
      api: url,
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        const fresh = data.session?.access_token || session?.access_token || "";
        return {
          Authorization: `Bearer ${fresh}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        };
      },
      body: () => ({ tenantId: activeTenantId }),
    }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text) => {
    const t = (text ?? input).trim();
    if (!t || busy || !activeTenantId || !session?.access_token) return;
    setInput("");
    sendMessage({ text: t });
  };

  return (
    <div className="assistant-page-styles-wrap">
      <div className="assistant-page-styles-header">
        <div className="assistant-page-styles-header-icon"><Sparkles size={20} /></div>
        <div>
          <div className="assistant-page-styles-header-title">ExERP AI köməkçisi</div>
          <div className="assistant-page-styles-header-sub">Şirkət datası ilə birbaşa danışın — müştəri, məhsul, satış, statistika.</div>
        </div>
      </div>

      <div ref={scrollRef} className="assistant-page-styles-thread">
        {messages.length === 0 && (
          <div className="assistant-page-styles-empty">
            <div className="assistant-page-styles-empty-title">Nə soruşmaq istərdiniz?</div>
            <div className="assistant-page-styles-suggest-grid">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => submit(s)} className="assistant-page-styles-suggestion">
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
          <div className="assistant-page-styles-row sx-fa4778e">
            <Avatar role="assistant" />
            <div className="assistant-page-styles-thinking"><Loader2 size={14} className="spin" /> Düşünürəm…</div>
          </div>
        )}

        {error && (
          <div className="assistant-page-styles-error-box">Xəta: {assistantErrorMessage(error)}</div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
 className="assistant-page-styles-composer"
 >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeTenantId ? "Sual yazın..." : "Əvvəlcə şirkət seçin"}
          disabled={!activeTenantId || !session?.access_token}
 className="assistant-page-styles-input"
 />
        {busy ? (
          <button type="button" onClick={stop} className="assistant-page-styles-send sx-82b6eff">
            Dayandır
          </button>
        ) : (
          <button type="submit" disabled={!input.trim() || !activeTenantId} className="assistant-page-styles-send">
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
    <div className={`assistant-page-styles-row ${isUser ? "sx-36b745a" : "sx-fa4778e"}`}>
      {!isUser && <Avatar role="assistant" />}
      <div className={`assistant-page-styles-bubble ${isUser ? "assistant-page-styles-bubble-user" : "assistant-page-styles-bubble-bot"}`}>
        {parts.map((p, i) => {
          if (p.type === "text") {
            return <div key={i} className="u-white-space-pre_wrap u-line-height-1_55">{p.text}</div>;
          }
          if (p.type?.startsWith("tool-")) {
            const name = p.type.replace(/^tool-/, "");
            const state = p.state;
            return (
              <details key={i} className="assistant-page-styles-tool">
                <summary className="assistant-page-styles-tool-summary">
                  <Wrench size={12} /> {name} · <span className="u-color-text_secondary">{state}</span>
                </summary>
                {p.input && <pre className="assistant-page-styles-pre">Input: {JSON.stringify(p.input, null, 2)}</pre>}
                {p.output && <pre className="assistant-page-styles-pre">{JSON.stringify(p.output, null, 2).slice(0, 2000)}</pre>}
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
    <div className={`sx-f128df3 sx-1e7da8c sx-3c85720 sx-998b746 sx-9906a51 ${isUser ? "sx-bf1a6ab" : "sx-ef4ac23"} sx-4eb23a8 sx-5cd105e`}>
      {isUser ? <UserIcon size={16} /> : <Bot size={16} />}
    </div>
  );
}

