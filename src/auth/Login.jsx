import React, { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";

function sanitizeNext(raw) {
  if (!raw) return "/";
  try {
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
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function forgot() {
    setError(null);
    setInfo(null);
    if (!email) return setError("Əvvəlcə emailinizi daxil edin.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setBusy(false);
    if (error) return setError(error.message);
    setInfo("Şifrə bərpası linki emailinizə göndərildi.");
  }

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

  const isSignup = mode === "signup";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700;800&family=Epilogue:wght@300;400;500;600&display=swap');
        .erp-login * { box-sizing: border-box; }
        .erp-login { min-height: 100vh; width: 100%; display: flex; background: #f5f0e0; font-family: 'Epilogue', system-ui, sans-serif; color: #0f172a; }
        .erp-brand { display: none; }
        @media (min-width: 1024px) {
          .erp-brand { display: flex; width: 50%; background: #064e3b; position: relative; overflow: hidden; align-items: center; justify-content: center; padding: 3rem; }
        }
        .erp-brand-bg-dots { position: absolute; inset: 0; opacity: 0.10; background-image: radial-gradient(circle at 2px 2px, #c9a84c 1px, transparent 0); background-size: 40px 40px; }
        .erp-brand-blob-1 { position: absolute; bottom: -6rem; left: -6rem; width: 24rem; height: 24rem; background: #0d7a5f; border-radius: 9999px; filter: blur(80px); opacity: 0.5; }
        .erp-brand-blob-2 { position: absolute; top: -6rem; right: -6rem; width: 24rem; height: 24rem; background: #c9a84c; border-radius: 9999px; filter: blur(80px); opacity: 0.15; }
        .erp-brand-inner { position: relative; z-index: 10; width: 100%; max-width: 32rem; animation: fadeUp .8s ease both; }
        .erp-logo-row { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.5rem; }
        .erp-logo-mark { width: 3rem; height: 3rem; background: linear-gradient(135deg, #c9a84c, #a68a3d); border-radius: .85rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px -8px rgba(201,168,76,.55); color: #064e3b; }
        .erp-logo-text { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 1.75rem; letter-spacing: -0.02em; color: #f5f0e0; }
        .erp-logo-text span { color: #c9a84c; }
        .erp-headline { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 2.5rem; line-height: 1.1; color: #f5f0e0; margin: 0 0 1rem; letter-spacing: -0.02em; }
        .erp-headline em { font-style: normal; color: #c9a84c; }
        .erp-subtitle { color: #7dd3b8; font-size: 1.05rem; font-weight: 500; margin: 0 0 2.5rem; }
        .erp-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .erp-chip { background: rgba(255,255,255,.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.1); padding: 1rem 1.1rem; border-radius: 1rem; }
        .erp-chip-num { color: #c9a84c; font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 1.6rem; margin-bottom: .15rem; }
        .erp-chip-lbl { color: rgba(245,240,224,.7); font-size: .85rem; }
        .erp-chip-wide { grid-column: span 2; background: linear-gradient(90deg, rgba(13,122,95,.35), transparent); border: none; border-left: 3px solid #c9a84c; border-radius: 0 1rem 1rem 0; display: flex; align-items: center; gap: 1rem; color: #f5f0e0; font-weight: 500; }
        .erp-chip-wide svg { color: #c9a84c; flex-shrink: 0; }

        .erp-form-wrap { width: 100%; display: flex; align-items: center; justify-content: center; padding: 2rem 1.25rem; }
        @media (min-width: 1024px) { .erp-form-wrap { width: 50%; padding: 3rem; } }
        .erp-form-card { width: 100%; max-width: 26rem; animation: fadeUp .7s ease both; animation-delay: .1s; }
        .erp-mobile-logo { display: flex; margin-bottom: 2rem; }
        @media (min-width: 1024px) { .erp-mobile-logo { display: none; } }
        .erp-mobile-logo .erp-logo-text { color: #064e3b; font-size: 1.5rem; }
        .erp-title { font-family: 'Urbanist', sans-serif; font-weight: 700; font-size: 1.85rem; color: #064e3b; margin: 0 0 .35rem; letter-spacing: -0.01em; }
        .erp-lede { color: #64748b; margin: 0 0 2rem; }
        .erp-field { margin-bottom: 1.15rem; }
        .erp-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
        .erp-label { font-size: .82rem; font-weight: 600; color: #064e3b; }
        .erp-link-sm { font-size: .82rem; font-weight: 500; color: #0d7a5f; background: none; border: 0; cursor: pointer; padding: 0; transition: color .2s; }
        .erp-link-sm:hover { color: #c9a84c; }
        .erp-input { width: 100%; padding: .85rem 1rem; background: #fff; border: 1px solid #e5e7eb; border-radius: .85rem; font-size: .95rem; font-family: inherit; color: #0f172a; outline: none; transition: all .2s; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
        .erp-input::placeholder { color: #94a3b8; }
        .erp-input:focus { border-color: transparent; box-shadow: 0 0 0 3px rgba(201,168,76,.35), 0 1px 2px rgba(0,0,0,.05); }
        .erp-btn-primary { width: 100%; padding: 1rem; background: #064e3b; color: #fff; font-weight: 700; font-family: 'Urbanist', sans-serif; letter-spacing: .01em; border: 0; border-radius: .85rem; cursor: pointer; box-shadow: 0 10px 25px -10px rgba(6,78,59,.55); transition: all .25s; margin-top: .35rem; }
        .erp-btn-primary:hover:not(:disabled) { background: #0d7a5f; transform: translateY(-1px); box-shadow: 0 15px 30px -10px rgba(6,78,59,.55); }
        .erp-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .erp-divider { position: relative; margin: 1.75rem 0; text-align: center; }
        .erp-divider::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #e5e7eb; }
        .erp-divider span { position: relative; background: #f5f0e0; padding: 0 .85rem; color: #94a3b8; font-size: .72rem; font-weight: 600; letter-spacing: .15em; text-transform: uppercase; }
        .erp-btn-google { width: 100%; padding: .85rem; background: #fff; border: 1px solid #e5e7eb; color: #334155; font-weight: 600; border-radius: .85rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .75rem; transition: all .2s; font-family: inherit; }
        .erp-btn-google:hover { border-color: #c9a84c; background: #fefdf8; }
        .erp-foot { margin-top: 2rem; text-align: center; font-size: .9rem; color: #64748b; }
        .erp-foot button { background: none; border: 0; color: #c9a84c; font-weight: 700; cursor: pointer; padding: 0; }
        .erp-foot button:hover { text-decoration: underline; }
        .erp-alert { margin-top: 1rem; padding: .75rem 1rem; border-radius: .75rem; font-size: .87rem; }
        .erp-alert.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .erp-alert.ok { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
      `}</style>

      <main className="erp-login">
        {/* Left brand panel */}
        <aside className="erp-brand" aria-hidden="true">
          <div className="erp-brand-bg-dots" />
          <div className="erp-brand-blob-1" />
          <div className="erp-brand-blob-2" />
          <div className="erp-brand-inner">
            <div className="erp-logo-row">
              <div className="erp-logo-mark">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21V5a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v16" />
                  <path d="M3 21h18M9 7h1M9 11h1M14 7h1M14 11h1M9 21v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" />
                </svg>
              </div>
              <span className="erp-logo-text">PRESTIGE<span>ERP</span></span>
            </div>

            <h1 className="erp-headline">
              Biznesinizi <em>qızıl standartlarla</em> idarə edin.
            </h1>
            <p className="erp-subtitle">
              Tam inteqrasiya olunmuş multi-tenant ERP ekosistemi — maliyyə, satış, CRM və resurslar bir platformada.
            </p>

            <div className="erp-chips">
              <div className="erp-chip">
                <div className="erp-chip-num">500+</div>
                <div className="erp-chip-lbl">Aktiv müəssisə</div>
              </div>
              <div className="erp-chip">
                <div className="erp-chip-num">99.9%</div>
                <div className="erp-chip-lbl">Uptime zəmanəti</div>
              </div>
              <div className="erp-chip erp-chip-wide">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                <span>RLS + rol əsaslı təhlükəsizlik qatı</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right form panel */}
        <section className="erp-form-wrap">
          <div className="erp-form-card">
            <div className="erp-mobile-logo">
              <span className="erp-logo-text">PRESTIGE<span>ERP</span></span>
            </div>

            <h2 className="erp-title">{isSignup ? "Hesab yaradın" : "Xoş gəlmisiniz"}</h2>
            <p className="erp-lede">
              {isSignup
                ? "ERP platformasına qoşulmaq üçün məlumatlarınızı daxil edin."
                : "Sistemə daxil olmaq üçün məlumatlarınızı qeyd edin."}
            </p>

            <form onSubmit={submit} noValidate>
              <div className="erp-field">
                <div className="erp-label-row">
                  <label className="erp-label" htmlFor="erp-email">Email ünvanı</label>
                </div>
                <input
                  id="erp-email"
                  className="erp-input"
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="ad@sirket.az"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="erp-field">
                <div className="erp-label-row">
                  <label className="erp-label" htmlFor="erp-pass">Şifrə</label>
                  {!isSignup && (
                    <button type="button" className="erp-link-sm" onClick={forgot}>
                      Şifrəni unutmusunuz?
                    </button>
                  )}
                </div>
                <input
                  id="erp-pass"
                  className="erp-input"
                  required
                  type="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button disabled={busy} type="submit" className="erp-btn-primary">
                {busy ? "Gözləyin..." : isSignup ? "Qeydiyyatdan keç" : "Daxil ol"}
              </button>
            </form>

            <div className="erp-divider"><span>və ya</span></div>

            <button type="button" onClick={google} className="erp-btn-google">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google ilə davam et
            </button>

            {error && <div className="erp-alert err">{error}</div>}
            {info && <div className="erp-alert ok">{info}</div>}

            <p className="erp-foot">
              {isSignup ? "Artıq hesabınız var? " : "Hesabınız yoxdur? "}
              <button type="button" onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(null); setInfo(null); }}>
                {isSignup ? "Daxil olun" : "Qeydiyyatdan keçin"}
              </button>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
