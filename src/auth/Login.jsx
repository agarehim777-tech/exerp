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
    function onKey(e) {
      if (e.key === "Escape") setAuthOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Work+Sans:wght@300;400;500;600;700&display=swap');
        .pp, .pp * { box-sizing: border-box; }
        .pp { min-height: 100vh; width: 100%; background: #f5f3ee; color: #2d2d2d; font-family: 'Work Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; display: flex; flex-direction: column; }
        .pp a { color: inherit; }

        /* Top bar */
        .pp-nav { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 2rem; border-bottom: 1px solid #e8e4dd; }
        .pp-nav-left { display: flex; align-items: center; gap: 3rem; }
        .pp-logo { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.65rem; color: #0d0d0d; letter-spacing: -0.02em; line-height: 1; }
        .pp-nav-links { display: none; gap: 2rem; font-size: .88rem; font-weight: 500; color: #2d2d2d; }
        .pp-nav-links a { text-decoration: none; opacity: .8; transition: opacity .18s; }
        .pp-nav-links a:hover { opacity: 1; }
        @media (min-width: 768px) { .pp-nav-links { display: flex; } }
        .pp-nav-btn { padding: .55rem 1.15rem; font-size: .85rem; font-weight: 500; font-family: inherit; background: transparent; color: #0d0d0d; border: 1px solid #2d2d2d; cursor: pointer; transition: all .18s; }
        .pp-nav-btn:hover { background: #0d0d0d; color: #f5f3ee; }

        /* Hero split */
        .pp-hero { flex: 1; display: grid; grid-template-columns: 1fr; }
        @media (min-width: 1024px) { .pp-hero { grid-template-columns: 1fr 1fr; } }
        .pp-hero-left { padding: 3rem 2rem; display: flex; flex-direction: column; justify-content: center; border-right: 1px solid #e8e4dd; animation: ppRise .7s ease both; }
        @media (min-width: 1024px) { .pp-hero-left { padding: 5rem; } }
        .pp-hero-inner { max-width: 36rem; }
        .pp-title { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: clamp(3rem, 6vw, 5.75rem); line-height: .92; letter-spacing: -0.015em; color: #0d0d0d; margin: 0 0 1.75rem; }
        .pp-title em { font-style: italic; }
        .pp-lede { font-size: 1.15rem; line-height: 1.65; opacity: .8; margin: 0 0 2.25rem; max-width: 30rem; }
        .pp-actions { display: flex; flex-wrap: wrap; gap: .85rem; margin-bottom: 3.25rem; }
        .pp-btn-primary { padding: 1rem 1.75rem; background: #0d0d0d; color: #f5f3ee; font-family: inherit; font-weight: 500; font-size: 1rem; border: 0; cursor: pointer; transition: background .18s; display: inline-flex; align-items: center; gap: .6rem; }
        .pp-btn-primary:hover { background: #2d2d2d; }
        .pp-btn-outline { padding: 1rem 1.5rem; background: transparent; color: #0d0d0d; border: 1px solid #e8e4dd; font-family: inherit; font-weight: 500; font-size: 1rem; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; transition: background .18s; }
        .pp-btn-outline:hover { background: #e8e4dd; }
        .pp-trust { padding-top: 1.75rem; border-top: 1px solid #e8e4dd; display: flex; align-items: center; gap: 1.75rem; flex-wrap: wrap; opacity: .55; }
        .pp-trust-lbl { font-size: .7rem; letter-spacing: .18em; text-transform: uppercase; font-weight: 600; }
        .pp-trust-names { display: flex; gap: 1.5rem; font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.05rem; flex-wrap: wrap; }

        /* Right ERP surface */
        .pp-hero-right { background: rgba(232,228,221,.5); padding: 2.5rem 2rem; display: flex; align-items: center; justify-content: center; overflow: hidden; animation: ppRise .9s ease both; }
        @media (min-width: 1024px) { .pp-hero-right { padding: 3rem; } }
        .pp-ui { width: 100%; max-width: 34rem; background: #f5f3ee; border: 1px solid #e8e4dd; box-shadow: 0 30px 60px -30px rgba(13,13,13,.18); }
        .pp-ui-head { padding: .85rem 1rem; border-bottom: 1px solid #e8e4dd; background: rgba(255,255,255,.5); display: flex; align-items: center; justify-content: space-between; }
        .pp-dots { display: flex; gap: .4rem; }
        .pp-dots span { width: .5rem; height: .5rem; border-radius: 999px; background: rgba(45,45,45,.15); }
        .pp-ui-label { font-family: 'Instrument Serif', serif; font-style: italic; font-size: .68rem; letter-spacing: .2em; text-transform: uppercase; opacity: .45; font-weight: 500; }
        .pp-ui-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 2rem; }
        .pp-kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
        .pp-kpi { padding: 1rem; border: 1px solid #e8e4dd; }
        .pp-kpi.dark { background: #0d0d0d; color: #f5f3ee; border-color: #0d0d0d; }
        .pp-kpi-lbl { font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; opacity: .55; margin-bottom: .35rem; font-weight: 500; }
        .pp-kpi.dark .pp-kpi-lbl { opacity: .65; }
        .pp-kpi-val { font-family: 'Instrument Serif', serif; font-size: 1.55rem; line-height: 1; }
        .pp-sec-head { display: flex; justify-content: space-between; align-items: end; border-bottom: 1px solid #e8e4dd; padding-bottom: .5rem; margin-bottom: .5rem; }
        .pp-sec-title { font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 600; }
        .pp-sec-more { font-size: .62rem; letter-spacing: .08em; opacity: .4; }
        .pp-txn { display: flex; justify-content: space-between; font-size: .88rem; padding: .3rem 0; }
        .pp-txn-name { opacity: .8; }
        .pp-txn-val { font-weight: 500; }
        .pp-txn-val.pending { font-style: italic; opacity: .4; font-family: 'Instrument Serif', serif; }
        .pp-chart { height: 7.5rem; border: 1px solid #e8e4dd; display: flex; align-items: flex-end; padding: 1rem; gap: .3rem; }
        .pp-chart span { flex: 1; background: #2d2d2d; }
        .pp-chart span.peak { background: #0d0d0d; }

        /* Modules strip */
        .pp-modules { border-top: 1px solid #e8e4dd; padding: 2.25rem 2rem; }
        .pp-modules-row { max-width: 78rem; margin: 0 auto; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2rem; opacity: .6; }
        .pp-mod { cursor: default; }
        .pp-mod-num { display: block; font-size: .65rem; letter-spacing: .2em; text-transform: uppercase; margin-bottom: .35rem; font-weight: 500; transition: color .2s; }
        .pp-mod:hover .pp-mod-num { color: #0d0d0d; }
        .pp-mod-name { font-family: 'Instrument Serif', serif; font-style: italic; font-size: 1.15rem; color: #0d0d0d; }

        /* Auth modal */
        .pp-backdrop { position: fixed; inset: 0; background: rgba(13,13,13,.45); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1.25rem; animation: ppFade .2s ease both; }
        .pp-modal { width: 100%; max-width: 26rem; background: #f5f3ee; border: 1px solid #e8e4dd; padding: 2.25rem; box-shadow: 0 40px 80px -20px rgba(13,13,13,.4); position: relative; animation: ppPop .3s cubic-bezier(.2,.9,.3,1.15) both; }
        .pp-modal-close { position: absolute; top: .85rem; right: .85rem; background: transparent; border: 1px solid #e8e4dd; color: #2d2d2d; width: 2rem; height: 2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .18s; }
        .pp-modal-close:hover { background: #0d0d0d; color: #f5f3ee; border-color: #0d0d0d; }
        .pp-modal-title { font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 2rem; color: #0d0d0d; margin: 0 0 .35rem; line-height: 1.05; }
        .pp-modal-sub { color: rgba(45,45,45,.7); font-size: .92rem; margin: 0 0 1.75rem; }
        .pp-field { margin-bottom: 1rem; }
        .pp-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: .4rem; }
        .pp-label { font-size: .68rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #2d2d2d; }
        .pp-link-sm { font-size: .78rem; font-weight: 500; color: #0d0d0d; background: 0; border: 0; cursor: pointer; padding: 0; text-decoration: underline; text-decoration-color: rgba(13,13,13,.3); text-underline-offset: 3px; }
        .pp-link-sm:hover { text-decoration-color: #0d0d0d; }
        .pp-input { width: 100%; padding: .85rem 1rem; background: #fff; border: 1px solid #e8e4dd; font-size: .95rem; font-family: inherit; color: #0d0d0d; outline: none; transition: border-color .15s, box-shadow .15s; }
        .pp-input::placeholder { color: rgba(45,45,45,.4); }
        .pp-input:focus { border-color: #0d0d0d; box-shadow: 0 0 0 3px rgba(13,13,13,.08); }
        .pp-submit { width: 100%; padding: .95rem; background: #0d0d0d; color: #f5f3ee; font-weight: 500; font-family: inherit; font-size: .95rem; border: 0; cursor: pointer; transition: background .18s; margin-top: .5rem; }
        .pp-submit:hover:not(:disabled) { background: #2d2d2d; }
        .pp-submit:disabled { opacity: .6; cursor: not-allowed; }
        .pp-divider { position: relative; margin: 1.5rem 0; text-align: center; }
        .pp-divider::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #e8e4dd; }
        .pp-divider span { position: relative; background: #f5f3ee; padding: 0 .75rem; color: rgba(45,45,45,.45); font-size: .68rem; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; }
        .pp-google { width: 100%; padding: .85rem; background: #fff; border: 1px solid #e8e4dd; color: #0d0d0d; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .75rem; transition: all .18s; font-family: inherit; font-size: .92rem; }
        .pp-google:hover { border-color: #0d0d0d; background: #f5f3ee; }
        .pp-foot { margin-top: 1.5rem; text-align: center; font-size: .88rem; color: rgba(45,45,45,.7); }
        .pp-foot button { background: 0; border: 0; color: #0d0d0d; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 3px; font-family: inherit; }
        .pp-alert { margin-top: .9rem; padding: .7rem .9rem; font-size: .85rem; border: 1px solid; }
        .pp-alert.err { background: rgba(180,40,40,.06); color: #7a1f1f; border-color: rgba(180,40,40,.25); }
        .pp-alert.ok { background: rgba(40,120,70,.06); color: #1f5a35; border-color: rgba(40,120,70,.25); }

        @keyframes ppFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ppRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes ppPop { from { opacity: 0; transform: scale(.96) translateY(6px); } to { opacity: 1; transform: none; } }
      `}</style>

      <main className="pp">
        <nav className="pp-nav">
          <div className="pp-nav-left">
            <span className="pp-logo">ExERP</span>
            <div className="pp-nav-links">
              <a href="#imkanlar">İmkanlar</a>
              <a href="#modullar">Modullar</a>
              <a href="#qiymet">Qiymət</a>
            </div>
          </div>
          <button className="pp-nav-btn" onClick={() => setAuthOpen(true)}>Daxil ol</button>
        </nav>

        <section className="pp-hero">
          <div className="pp-hero-left">
            <div className="pp-hero-inner">
              <h1 className="pp-title">
                Müasir biznesin<br /><em>rəqəmsal onurğası.</em>
              </h1>
              <p className="pp-lede">
                Maliyyə, satış, anbar və kadr idarəçiliyini vahid, intellektual ekosistemdə birləşdirin. Mürəkkəbliyi sadəliyə çevirin.
              </p>
              <div className="pp-actions">
                <button className="pp-btn-primary" onClick={() => setAuthOpen(true)}>
                  Sistemə daxil ol
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
                <a href="#imkanlar" className="pp-btn-outline">İmkanlarla tanış ol</a>
              </div>
              <div className="pp-trust">
                <div className="pp-trust-lbl">Etibar edirlər</div>
                <div className="pp-trust-names">
                  <span>Paşa Holding</span>
                  <span>SOCAR</span>
                  <span>Azersun</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pp-hero-right" aria-hidden="true">
            <div className="pp-ui">
              <div className="pp-ui-head">
                <div className="pp-dots"><span/><span/><span/></div>
                <div className="pp-ui-label">İdarəetmə Paneli</div>
              </div>
              <div className="pp-ui-body">
                <div className="pp-kpi-row">
                  <div className="pp-kpi">
                    <div className="pp-kpi-lbl">Gəlirlər</div>
                    <div className="pp-kpi-val">₼ 142,500</div>
                  </div>
                  <div className="pp-kpi">
                    <div className="pp-kpi-lbl">Xərclər</div>
                    <div className="pp-kpi-val">₼ 89,200</div>
                  </div>
                  <div className="pp-kpi dark">
                    <div className="pp-kpi-lbl">Mənfəət</div>
                    <div className="pp-kpi-val">+12.4%</div>
                  </div>
                </div>

                <div>
                  <div className="pp-sec-head">
                    <span className="pp-sec-title">Son Əməliyyatlar</span>
                    <span className="pp-sec-more">Bax hamısı</span>
                  </div>
                  <div className="pp-txn"><span className="pp-txn-name">Anbar mədaxili #4029</span><span className="pp-txn-val">− ₼ 1,200.00</span></div>
                  <div className="pp-txn"><span className="pp-txn-name">Xidmət haqqı: Terminal A</span><span className="pp-txn-val">+ ₼ 450.00</span></div>
                  <div className="pp-txn"><span className="pp-txn-name">Kadr: Yeni müqavilə #12</span><span className="pp-txn-val pending">Gözləmədə</span></div>
                </div>

                <div className="pp-chart">
                  {[40,60,35,90,55,70,45].map((h,i) => (
                    <span key={i} className={h === 90 ? "peak" : ""} style={{ height: `${h}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="modullar" className="pp-modules">
          <div className="pp-modules-row">
            {[
              { n: "01", t: "Maliyyə" },
              { n: "02", t: "CRM" },
              { n: "03", t: "Satış" },
              { n: "04", t: "Anbar" },
              { n: "05", t: "HR" },
              { n: "06", t: "Mühasibat" },
            ].map((m) => (
              <div key={m.n} className="pp-mod">
                <span className="pp-mod-num">{m.n}</span>
                <span className="pp-mod-name">{m.t}</span>
              </div>
            ))}
          </div>
        </section>

        {authOpen && (
          <div className="pp-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
            <div className="pp-modal" role="dialog" aria-modal="true">
              <button className="pp-modal-close" onClick={() => setAuthOpen(false)} aria-label="Bağla">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <h2 className="pp-modal-title">{isSignup ? "Hesab yaradın" : "Xoş gəlmisiniz"}</h2>
              <p className="pp-modal-sub">
                {isSignup ? "ExERP-ə qoşulmaq üçün məlumatlarınızı daxil edin." : "Sistemə daxil olmaq üçün məlumatlarınızı qeyd edin."}
              </p>

              <form onSubmit={submit} noValidate>
                <div className="pp-field">
                  <div className="pp-label-row"><label className="pp-label" htmlFor="pp-email">Email</label></div>
                  <input id="pp-email" className="pp-input" required type="email" autoComplete="email" placeholder="ad@sirket.az" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="pp-field">
                  <div className="pp-label-row">
                    <label className="pp-label" htmlFor="pp-pass">Şifrə</label>
                    {!isSignup && <button type="button" className="pp-link-sm" onClick={forgot}>Şifrəni unutmusunuz?</button>}
                  </div>
                  <input id="pp-pass" className="pp-input" required type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>

                <button disabled={busy} type="submit" className="pp-submit">
                  {busy ? "Gözləyin..." : isSignup ? "Qeydiyyatdan keç" : "Daxil ol"}
                </button>
              </form>

              <div className="pp-divider"><span>və ya</span></div>

              <button type="button" onClick={google} className="pp-google">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google ilə davam et
              </button>

              {error && <div className="pp-alert err">{error}</div>}
              {info && <div className="pp-alert ok">{info}</div>}

              <p className="pp-foot">
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
