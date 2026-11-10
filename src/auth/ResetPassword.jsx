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
    <main className="reset-password-wrap">
      <div className="reset-password-card">
        <h1 className="u-font-family-Sora_sans_serif u-margin-0 u-font-size-22px u-color-text_primary">
          Şifrəni yenilə
        </h1>
        {!ready ? (
          <p className="u-margin-top-12px u-font-size-14px u-color-5f7a70">
            Emailinizə göndərilən linkə klikləyin. Bu səhifə həmin linkdən açılmalıdır.
          </p>
        ) : ok ? (
          <p className="u-margin-top-12px u-font-size-14px u-color-0d7a5f">
            Şifrə yeniləndi. Girişə yönləndirilirsiniz…
          </p>
        ) : (
          <form onSubmit={submit} className="u-display-grid u-gap-10px u-margin-top-16px">
            <input
              required
              type="password"
              minLength={8}
              placeholder="Yeni şifrə (min 8)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
 className="reset-password-input"
 />
            <button disabled={busy} type="submit" className="reset-password-btn">
              {busy ? "Yenilənir…" : "Şifrəni yadda saxla"}
            </button>
          </form>
        )}
        {error && <p className="u-color-b23a3a u-margin-top-12px u-font-size-13px">{error}</p>}
      </div>
    </main>
  );
}

