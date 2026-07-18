import React, { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";

function sanitizeNext(raw) {
  if (!raw) return "/";
  try {
    // Only allow same-origin relative paths
    if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  } catch {
    return "/";
  }
}

export default function Login() {
  const next = sanitizeNext(new URLSearchParams(window.location.search).get("next"));
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(next);
    });
  }, [next]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn =
      mode === "signup"
        ? supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + next },
          })
        : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setBusy(false);
    if (error) return setError(error.message);
    window.location.replace(next);
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + next },
    });
    if (error) setError(error.message);
  }

  return (
    <main style={{ maxWidth: 380, margin: "6rem auto", fontFamily: "system-ui", padding: "0 1rem" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>
        {mode === "signup" ? "Qeydiyyat" : "Daxil ol"}
      </h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
        <input required type="password" placeholder="Şifrə" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
        <button disabled={busy} type="submit" style={primaryBtn}>
          {busy ? "..." : mode === "signup" ? "Qeydiyyatdan keç" : "Daxil ol"}
        </button>
      </form>
      <button onClick={google} style={{ ...primaryBtn, marginTop: 10, background: "#fff", color: "#111", border: "1px solid #ddd" }}>
        Google ilə davam et
      </button>
      <p style={{ marginTop: 12, fontSize: 13 }}>
        <button onClick={() => setMode(mode === "signup" ? "signin" : "signup")} style={{ background: "none", border: 0, color: "#2563eb", cursor: "pointer", padding: 0 }}>
          {mode === "signup" ? "Hesabınız var? Daxil olun" : "Hesabınız yoxdur? Qeydiyyat"}
        </button>
      </p>
      {error && <p style={{ color: "#b91c1c", marginTop: 10 }}>{error}</p>}
    </main>
  );
}

const inputStyle = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 };
const primaryBtn = { padding: "10px 12px", borderRadius: 8, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer", fontWeight: 600 };
