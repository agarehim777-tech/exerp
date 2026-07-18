import React, { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";

export default function OAuthConsent() {
  const params = new URLSearchParams(window.location.search);
  const authorizationId = params.get("authorization_id") || "";
  const [details, setDetails] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      // @ts-ignore beta namespace
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve) {
    setBusy(true);
    setError(null);
    const res = approve
      // @ts-ignore beta namespace
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      // @ts-ignore beta namespace
      : await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (res.error) {
      setBusy(false);
      return setError(res.error.message);
    }
    const target = res.data?.redirect_url ?? res.data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect returned by the authorization server.");
    }
    window.location.href = target;
  }

  if (error)
    return (
      <main style={wrap}>
        <h1 style={h1}>Bağlantı yaradıla bilmədi</h1>
        <p style={{ color: "#b91c1c" }}>{error}</p>
      </main>
    );
  if (!details)
    return (
      <main style={wrap}>
        <p>Yüklənir…</p>
      </main>
    );

  const clientName = details.client?.name ?? "Xarici tətbiq";
  const scopes = Array.isArray(details.scopes) ? details.scopes : String(details.scope || "").split(/\s+/).filter(Boolean);

  return (
    <main style={wrap}>
      <h1 style={h1}>{clientName} hesabınıza qoşulsun?</h1>
      <p style={{ color: "#374151" }}>
        Bu, <strong>{clientName}</strong>-ə ERPAZ-ı sizin kimi istifadə etməyə imkan verəcək.
      </p>
      {details.client?.redirect_uri && (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Redirect URI: {details.client.redirect_uri}</p>
      )}
      {scopes.length > 0 && (
        <div style={{ margin: "12px 0", fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Tələb olunan icazələr:</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#374151" }}>
            {scopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <p style={{ fontSize: 12, color: "#6b7280" }}>
        Bu icazə tətbiqin öz permissions və backend qaydalarını dəyişmir.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button disabled={busy} onClick={() => decide(true)} style={primaryBtn}>Təsdiqlə</button>
        <button disabled={busy} onClick={() => decide(false)} style={secondaryBtn}>Ləğv et</button>
      </div>
    </main>
  );
}

const wrap = { maxWidth: 480, margin: "5rem auto", padding: "0 1rem", fontFamily: "system-ui" };
const h1 = { fontSize: "1.3rem", marginBottom: 12 };
const primaryBtn = { padding: "10px 16px", borderRadius: 8, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer", fontWeight: 600 };
const secondaryBtn = { padding: "10px 16px", borderRadius: 8, background: "#f3f4f6", color: "#111", border: "1px solid #e5e7eb", cursor: "pointer" };
