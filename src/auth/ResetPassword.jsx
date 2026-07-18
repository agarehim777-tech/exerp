import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and fires a PASSWORD_RECOVERY event
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also allow the page to work if a session already exists
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setOk(true);
    setTimeout(() => nav("/login", { replace: true }), 1500);
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={{ fontFamily: "Sora, sans-serif", margin: 0, fontSize: 22, color: "#064e3b" }}>
          Şifrəni yenilə
        </h1>
        {!ready ? (
          <p style={{ marginTop: 12, fontSize: 14, color: "#5f7a70" }}>
            Emailinizə göndərilən linkə klikləyin. Bu səhifə həmin linkdən açılmalıdır.
          </p>
        ) : ok ? (
          <p style={{ marginTop: 12, fontSize: 14, color: "#0d7a5f" }}>
            Şifrə yeniləndi. Girişə yönləndirilirsiniz…
          </p>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <input
              required
              type="password"
              minLength={8}
              placeholder="Yeni şifrə (min 8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={input}
            />
            <button disabled={busy} type="submit" style={btn}>
              {busy ? "Yenilənir…" : "Şifrəni yadda saxla"}
            </button>
          </form>
        )}
        {error && <p style={{ color: "#b23a3a", marginTop: 12, fontSize: 13 }}>{error}</p>}
      </div>
    </main>
  );
}

const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e0", fontFamily: "Manrope, system-ui" };
const card = { background: "#fff", padding: 28, borderRadius: 22, boxShadow: "0 18px 44px rgba(6,78,59,0.14)", width: "min(420px, 92vw)", border: "1px solid #e6dfc9" };
const input = { padding: "12px 14px", border: "1px solid #d4c9a3", borderRadius: 12, fontSize: 14, fontFamily: "inherit" };
const btn = { padding: "12px 14px", borderRadius: 12, background: "linear-gradient(135deg,#0d7a5f,#064e3b)", color: "#f5f0e0", border: 0, cursor: "pointer", fontWeight: 700, fontFamily: "Sora, sans-serif" };
