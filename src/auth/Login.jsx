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
  const [authOpen, setAuthOpen] = useState(false);

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

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") setAuthOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn = mode === "signup"
      ? supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + next } })
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .fx, .fx * { box-sizing: border-box; }
        .fx { min-height: 100vh; width: 100%; font-family: 'Inter', system-ui, sans-serif; color: #e8fff5; -webkit-font-smoothing: antialiased;
              background: radial-gradient(ellipse at 20% 0%, #0f5f4d 0%, transparent 55%), radial-gradient(ellipse at 90% 100%, #0a3d33 0%, transparent 50%), linear-gradient(160deg, #0a2620 0%, #0d3830 40%, #114a3d 100%);
              position: relative; overflow-x: hidden; }
        .fx::before { content:''; position: absolute; inset: 0; background-image: radial-gradient(circle at 1px 1px, rgba(255,255,255,.04) 1px, transparent 0); background-size: 32px 32px; pointer-events: none; }

        /* Nav pill */
        .fx-nav-wrap { position: relative; padding: 1.25rem 1.5rem; display: flex; justify-content: center; }
        .fx-nav { display: flex; align-items: center; gap: .35rem; background: rgba(10,30,26,.55); backdrop-filter: blur(14px); border: 1px solid rgba(94,234,180,.14); border-radius: 999px; padding: .45rem .5rem; box-shadow: 0 20px 50px -20px rgba(0,0,0,.5); }
        .fx-logo { display:flex; align-items:center; gap:.55rem; padding: .35rem .9rem .35rem .5rem; font-weight: 800; font-size: 1.05rem; letter-spacing: -.01em; color: #fff; }
        .fx-logo-mark { width: 2rem; height: 2rem; border-radius: .55rem; background: linear-gradient(135deg,#34d399,#10b981); display:flex; align-items:center; justify-content:center; color:#052e26; font-weight: 900; font-size: 1rem; }
        .fx-logo-sub { color: #5eead4; font-weight: 700; margin-left: .1rem; }
        .fx-nav a { text-decoration:none; color: #a7d9c8; font-size: .85rem; font-weight: 500; padding: .55rem .95rem; border-radius: 999px; transition: all .18s; }
        .fx-nav a:hover { color:#fff; background: rgba(94,234,180,.08); }
        .fx-nav a.active { color:#5eead4; background: rgba(94,234,180,.1); }
        .fx-nav-cta { display:flex; gap:.4rem; margin-left:.4rem; }
        .fx-btn-ghost { background: transparent; border: 1px solid rgba(94,234,180,.2); color:#e8fff5; padding: .55rem 1rem; border-radius: 999px; font-family: inherit; font-size:.85rem; font-weight: 500; cursor:pointer; transition: all .18s; display:inline-flex; align-items:center; gap:.4rem; }
        .fx-btn-ghost:hover { border-color:#5eead4; background: rgba(94,234,180,.08); }
        .fx-btn-primary { background: linear-gradient(135deg,#34d399,#10b981); color:#052e26; border:0; padding: .6rem 1.15rem; border-radius: 999px; font-family: inherit; font-size:.88rem; font-weight: 700; cursor:pointer; transition: all .2s; display:inline-flex; align-items:center; gap:.45rem; box-shadow: 0 10px 30px -10px rgba(52,211,153,.6); }
        .fx-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 15px 35px -10px rgba(52,211,153,.75); }
        @media (max-width: 900px) { .fx-nav a:not(.fx-nav-home) { display:none; } }

        /* Hero */
        .fx-hero { display: grid; grid-template-columns: 1fr; gap: 3rem; max-width: 82rem; margin: 0 auto; padding: 3rem 1.5rem 5rem; align-items: center; position: relative; z-index: 1; }
        @media (min-width: 1024px) { .fx-hero { grid-template-columns: 1.05fr 1fr; padding: 5rem 2rem 6rem; gap: 4rem; } }
        .fx-chip { display:inline-flex; align-items:center; gap:.5rem; background: rgba(94,234,180,.08); border: 1px solid rgba(94,234,180,.2); color:#5eead4; padding: .5rem 1rem; border-radius: 999px; font-size: .8rem; font-weight: 500; margin-bottom: 1.75rem; }
        .fx-chip::before { content:''; width:.4rem; height:.4rem; border-radius:999px; background:#34d399; box-shadow: 0 0 10px #34d399; }
        .fx-h1 { font-size: clamp(2.6rem, 5.5vw, 4.5rem); font-weight: 800; line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 1.5rem; color: #fff; }
        .fx-h1 .accent { background: linear-gradient(135deg,#5eead4,#34d399); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .fx-lede { font-size: 1.05rem; line-height: 1.65; color: #a7d9c8; margin: 0 0 2rem; max-width: 32rem; }
        .fx-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-bottom: 2rem; }
        .fx-check-row { display: flex; flex-wrap: wrap; gap: 1.25rem 1.75rem; }
        .fx-check { display: inline-flex; align-items: center; gap: .5rem; font-size: .85rem; color: #a7d9c8; }
        .fx-check svg { color:#34d399; flex-shrink:0; }

        /* ERP mock */
        .fx-mock-wrap { position: relative; }
        .fx-mock-wrap::before { content:''; position:absolute; inset:-40px; background: radial-gradient(circle, rgba(52,211,153,.25) 0%, transparent 60%); filter: blur(30px); z-index:0; }
        .fx-mock { position: relative; z-index:1; background: #071a17; border: 1px solid rgba(94,234,180,.15); border-radius: 1rem; overflow: hidden; box-shadow: 0 40px 80px -20px rgba(0,0,0,.6); animation: fxFloat 6s ease-in-out infinite; }
        @keyframes fxFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .fx-mock-head { display:flex; align-items:center; gap:.5rem; padding: .75rem 1rem; border-bottom: 1px solid rgba(94,234,180,.1); background: rgba(0,0,0,.2); }
        .fx-dots { display:flex; gap:.35rem; }
        .fx-dots span { width:.6rem; height:.6rem; border-radius:999px; }
        .fx-dots span:nth-child(1){background:#ff5f57;} .fx-dots span:nth-child(2){background:#febc2e;} .fx-dots span:nth-child(3){background:#28c840;}
        .fx-mock-url { flex:1; margin-left:.5rem; height:1.4rem; background: rgba(255,255,255,.05); border-radius: .35rem; }
        .fx-mock-body { padding: 1.25rem; display:flex; flex-direction:column; gap: 1rem; }
        .fx-kpi-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; }
        .fx-kpi { background: rgba(94,234,180,.04); border: 1px solid rgba(94,234,180,.1); border-radius:.6rem; padding: .85rem; }
        .fx-kpi-lbl { font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: #5eead4; margin-bottom: .35rem; font-weight: 600; }
        .fx-kpi-val { font-size: 1.35rem; font-weight: 800; color: #fff; display:flex; align-items:baseline; gap:.35rem; letter-spacing: -.02em; }
        .fx-kpi-arrow { color: #34d399; font-size: .85rem; }
        .fx-kpi-val.blue { color: #60a5fa; }
        .fx-kpi-delta { font-size: .7rem; color: #86e5c4; margin-top: .25rem; }
        .fx-chart { display:flex; align-items:flex-end; gap:.35rem; height: 6.5rem; padding: .75rem; background: rgba(94,234,180,.04); border: 1px solid rgba(94,234,180,.1); border-radius: .6rem; }
        .fx-chart span { flex:1; background: linear-gradient(180deg, #34d399, #0d9488); border-radius: .3rem .3rem 0 0; opacity:.7; }
        .fx-chart span.hi { opacity: 1; box-shadow: 0 0 15px rgba(52,211,153,.6); }

        /* Auth modal */
        .fx-backdrop { position: fixed; inset: 0; background: rgba(4,15,13,.75); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1.25rem; animation: fxFade .2s ease both; }
        .fx-modal { width: 100%; max-width: 25rem; background: linear-gradient(180deg,#0f2a24,#0a1f1b); border: 1px solid rgba(94,234,180,.15); border-radius: 1rem; padding: 2rem; box-shadow: 0 40px 80px -20px rgba(0,0,0,.7); position: relative; animation: fxPop .3s cubic-bezier(.2,.9,.3,1.15) both; }
        .fx-modal-close { position: absolute; top: .85rem; right: .85rem; background: rgba(94,234,180,.08); border: 1px solid rgba(94,234,180,.15); color: #a7d9c8; width: 2rem; height: 2rem; border-radius: 999px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .18s; }
        .fx-modal-close:hover { background: rgba(94,234,180,.15); color:#fff; }
        .fx-modal-title { font-size: 1.6rem; font-weight: 800; letter-spacing: -.02em; color: #fff; margin: 0 0 .35rem; }
        .fx-modal-sub { color: #86a89c; font-size: .9rem; margin: 0 0 1.5rem; }
        .fx-field { margin-bottom: .85rem; }
        .fx-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: .4rem; }
        .fx-label { font-size: .72rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #86a89c; }
        .fx-link-sm { font-size: .78rem; font-weight: 500; color: #5eead4; background: 0; border: 0; cursor: pointer; padding: 0; }
        .fx-link-sm:hover { color:#fff; }
        .fx-input { width: 100%; padding: .8rem 1rem; background: rgba(0,0,0,.3); border: 1px solid rgba(94,234,180,.15); border-radius: .55rem; font-size: .95rem; font-family: inherit; color: #fff; outline: none; transition: all .15s; }
        .fx-input::placeholder { color: rgba(167,217,200,.4); }
        .fx-input:focus { border-color: #34d399; box-shadow: 0 0 0 3px rgba(52,211,153,.15); }
        .fx-submit { width: 100%; padding: .9rem; background: linear-gradient(135deg,#34d399,#10b981); color: #052e26; font-weight: 700; font-family: inherit; font-size: .95rem; border: 0; border-radius: .55rem; cursor: pointer; transition: all .2s; margin-top: .35rem; box-shadow: 0 10px 25px -10px rgba(52,211,153,.6); }
        .fx-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 15px 30px -10px rgba(52,211,153,.75); }
        .fx-submit:disabled { opacity: .6; cursor: not-allowed; }
        .fx-divider { position: relative; margin: 1.25rem 0; text-align: center; }
        .fx-divider::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(94,234,180,.15); }
        .fx-divider span { position: relative; background: #0c2521; padding: 0 .75rem; color: #86a89c; font-size: .7rem; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; }
        .fx-google { width: 100%; padding: .8rem; background: rgba(0,0,0,.25); border: 1px solid rgba(94,234,180,.15); color: #fff; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .75rem; transition: all .18s; font-family: inherit; font-size: .92rem; border-radius: .55rem; }
        .fx-google:hover { border-color: #34d399; background: rgba(0,0,0,.4); }
        .fx-foot { margin-top: 1.25rem; text-align: center; font-size: .88rem; color: #86a89c; }
        .fx-foot button { background: 0; border: 0; color: #5eead4; font-weight: 600; cursor: pointer; padding: 0; font-family: inherit; }
        .fx-alert { margin-top: .9rem; padding: .7rem .9rem; font-size: .85rem; border-radius: .5rem; border: 1px solid; }
        .fx-alert.err { background: rgba(220,50,50,.1); color: #fca5a5; border-color: rgba(220,50,50,.3); }
        .fx-alert.ok { background: rgba(52,211,153,.1); color: #86e5c4; border-color: rgba(52,211,153,.3); }

        @keyframes fxFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fxPop { from { opacity: 0; transform: scale(.96) translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      <main className="fx">
        <div className="fx-nav-wrap">
          <nav className="fx-nav">
            <div className="fx-logo">
              <span className="fx-logo-mark">E</span>
              Expert<span className="fx-logo-sub">ERP</span>
            </div>
            <a className="fx-nav-home active" href="#">Ana Səhifə</a>
            <a href="#imkanlar">Həllər</a>
            <a href="#modullar">Modullar</a>
            <a href="#qiymet">Qiymət</a>
            <a href="#elaqe">Əlaqə</a>
            <div className="fx-nav-cta">
              <button className="fx-btn-ghost" onClick={() => setAuthOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
                Daxil ol
              </button>
              <button className="fx-btn-primary" onClick={() => setAuthOpen(true)}>
                Demo Al
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </button>
            </div>
          </nav>
        </div>

        <section className="fx-hero">
          <div>
            <div className="fx-chip">Azərbaycan biznesi üçün ERP · Yerli komanda</div>
            <h1 className="fx-h1">
              <span className="accent">Azərbaycan biznesi</span> üçün ERP sistemi
              <br />CRM, anbar, HR və mühasibat bir platformada
            </h1>
            <p className="fx-lede">
              Expert ERP — CRM, maliyyə, anbar, HR və IFRS mühasibatı bir bulud platformasında.
              Lokal dəstək, e-taxes və e-qaimə inteqrasiyası. 3–7 gündə tətbiq.
            </p>
            <div className="fx-actions">
              <button className="fx-btn-primary" onClick={() => setAuthOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"/></svg>
                3 Gün Pulsuz Sına
              </button>
              <button className="fx-btn-ghost" onClick={() => document.getElementById('modullar')?.scrollIntoView({behavior:'smooth'})}>
                Bütün Modullara Bax →
              </button>
            </div>
            <div className="fx-check-row">
              {["3 gün tam giriş","Kart tələb olunmur","3–7 gündə quraşdırma","IFRS uyğun"].map(t => (
                <span key={t} className="fx-check">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div className="fx-mock-wrap" aria-hidden="true">
            <div className="fx-mock">
              <div className="fx-mock-head">
                <div className="fx-dots"><span/><span/><span/></div>
                <div className="fx-mock-url"/>
              </div>
              <div className="fx-mock-body">
                <div className="fx-kpi-grid">
                  <div className="fx-kpi">
                    <div className="fx-kpi-lbl">Gəlir</div>
                    <div className="fx-kpi-val"><span className="fx-kpi-arrow">▲</span>84,250</div>
                    <div className="fx-kpi-delta">↑ +12.4%</div>
                  </div>
                  <div className="fx-kpi">
                    <div className="fx-kpi-lbl">Sifarişlər</div>
                    <div className="fx-kpi-val">142</div>
                    <div className="fx-kpi-delta">↑ +8.1%</div>
                  </div>
                  <div className="fx-kpi">
                    <div className="fx-kpi-lbl">Müştərilər</div>
                    <div className="fx-kpi-val blue">328</div>
                    <div className="fx-kpi-delta">↑ +5.7%</div>
                  </div>
                </div>
                <div className="fx-chart">
                  {[45,60,40,72,55,90,62,78,50,85,68,95].map((h,i) => (
                    <span key={i} className={h >= 85 ? "hi" : ""} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {authOpen && (
          <div className="fx-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
            <div className="fx-modal" role="dialog" aria-modal="true">
              <button className="fx-modal-close" onClick={() => setAuthOpen(false)} aria-label="Bağla">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <h2 className="fx-modal-title">{isSignup ? "Hesab yaradın" : "Xoş gəlmisiniz"}</h2>
              <p className="fx-modal-sub">
                {isSignup ? "Expert ERP-ə qoşulmaq üçün məlumatlarınızı daxil edin." : "Sistemə daxil olmaq üçün məlumatlarınızı qeyd edin."}
              </p>

              <form onSubmit={submit} noValidate>
                <div className="fx-field">
                  <div className="fx-label-row"><label className="fx-label" htmlFor="fx-email">Email</label></div>
                  <input id="fx-email" className="fx-input" required type="email" autoComplete="email" placeholder="ad@sirket.az" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="fx-field">
                  <div className="fx-label-row">
                    <label className="fx-label" htmlFor="fx-pass">Şifrə</label>
                    {!isSignup && <button type="button" className="fx-link-sm" onClick={forgot}>Şifrəni unutmusunuz?</button>}
                  </div>
                  <input id="fx-pass" className="fx-input" required type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>

                <button disabled={busy} type="submit" className="fx-submit">
                  {busy ? "Gözləyin..." : isSignup ? "Qeydiyyatdan keç" : "Daxil ol"}
                </button>
              </form>

              <div className="fx-divider"><span>və ya</span></div>

              <button type="button" onClick={google} className="fx-google">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google ilə davam et
              </button>

              {error && <div className="fx-alert err">{error}</div>}
              {info && <div className="fx-alert ok">{info}</div>}

              <p className="fx-foot">
                {isSignup ? "Artıq hesabınız var? " : "Hesabınız yoxdur? "}
                <button type="button" onClick={() => { setMode(isSignup ? "signin" : "signup"); setError(null); setInfo(null); }}>
                  {isSignup ? "Daxil olun" : "Qeydiyyatdan keçin"}
                </button>
              </p>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
