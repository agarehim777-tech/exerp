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
        @import url('https://fonts.googleapis.com/css2?family=Urbanist:wght@500;600;700;800;900&family=Epilogue:wght@300;400;500;600&display=swap');
        .ex * { box-sizing: border-box; }
        .ex { min-height: 100vh; width: 100%; background: radial-gradient(1200px 800px at 15% 10%, #1a2555 0%, transparent 60%), radial-gradient(1000px 700px at 90% 90%, #2a1650 0%, transparent 55%), #070b1f; color: #eaeaf5; font-family: 'Epilogue', system-ui, sans-serif; position: relative; overflow-x: hidden; }
        .ex-grid-bg { position: absolute; inset: 0; background-image: linear-gradient(rgba(180,150,80,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(180,150,80,.05) 1px, transparent 1px); background-size: 60px 60px; mask-image: radial-gradient(ellipse at center, black 40%, transparent 75%); pointer-events: none; }
        .ex-orb { position: absolute; border-radius: 9999px; filter: blur(90px); pointer-events: none; }
        .ex-orb-1 { top: -8rem; left: -6rem; width: 30rem; height: 30rem; background: #3b2b7a; opacity: .55; }
        .ex-orb-2 { bottom: -10rem; right: -8rem; width: 34rem; height: 34rem; background: #b8935a; opacity: .28; }

        .ex-nav { position: relative; z-index: 5; max-width: 78rem; margin: 0 auto; padding: 1.5rem 2rem; display: flex; align-items: center; justify-content: space-between; }
        .ex-logo { display: flex; align-items: center; gap: .75rem; }
        .ex-logo-mark { width: 2.6rem; height: 2.6rem; border-radius: .75rem; background: linear-gradient(135deg, #d4b262, #8c6b2f); display: flex; align-items: center; justify-content: center; color: #0b0f26; box-shadow: 0 8px 24px -8px rgba(212,178,98,.65), inset 0 1px 0 rgba(255,255,255,.35); }
        .ex-logo-text { font-family: 'Urbanist', sans-serif; font-weight: 900; font-size: 1.35rem; letter-spacing: -0.02em; color: #f5f2e8; }
        .ex-logo-text span { background: linear-gradient(90deg, #e6c77a, #b8935a); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .ex-nav-cta { display: flex; align-items: center; gap: 1rem; }
        .ex-nav-link { color: rgba(234,234,245,.7); font-size: .9rem; text-decoration: none; font-weight: 500; transition: color .2s; }
        .ex-nav-link:hover { color: #e6c77a; }
        .ex-btn-ghost { background: rgba(255,255,255,.05); border: 1px solid rgba(230,199,122,.25); color: #eaeaf5; padding: .6rem 1.15rem; border-radius: .7rem; font-family: 'Urbanist', sans-serif; font-weight: 600; font-size: .9rem; cursor: pointer; transition: all .2s; }
        .ex-btn-ghost:hover { border-color: #e6c77a; background: rgba(230,199,122,.08); }

        .ex-hero { position: relative; z-index: 5; max-width: 78rem; margin: 0 auto; padding: 4rem 2rem 5rem; display: grid; grid-template-columns: 1fr; gap: 3rem; align-items: center; animation: exFade 1s ease both; }
        @media (min-width: 1024px) { .ex-hero { grid-template-columns: 1.15fr 1fr; padding-top: 5rem; } }
        .ex-eyebrow { display: inline-flex; align-items: center; gap: .55rem; padding: .4rem .9rem; border-radius: 999px; background: rgba(230,199,122,.08); border: 1px solid rgba(230,199,122,.25); color: #e6c77a; font-size: .78rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 1.5rem; }
        .ex-eyebrow::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: #e6c77a; box-shadow: 0 0 12px #e6c77a; }
        .ex-title { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: clamp(2.5rem, 5vw, 4.25rem); line-height: 1.05; letter-spacing: -0.03em; margin: 0 0 1.5rem; color: #f5f2e8; }
        .ex-title em { font-style: normal; background: linear-gradient(120deg, #e6c77a 20%, #d4b262 50%, #a37f3c 90%); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .ex-lede { font-size: 1.15rem; line-height: 1.65; color: rgba(234,234,245,.72); margin: 0 0 2.25rem; max-width: 36rem; }
        .ex-actions { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 3rem; }
        .ex-btn-primary { background: linear-gradient(135deg, #e6c77a, #a37f3c); color: #0b0f26; padding: 1rem 1.75rem; border-radius: .8rem; font-family: 'Urbanist', sans-serif; font-weight: 700; font-size: 1rem; border: 0; cursor: pointer; display: inline-flex; align-items: center; gap: .6rem; box-shadow: 0 15px 40px -12px rgba(230,199,122,.55); transition: transform .2s, box-shadow .2s; }
        .ex-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 20px 50px -12px rgba(230,199,122,.7); }
        .ex-btn-outline { background: transparent; border: 1px solid rgba(255,255,255,.15); color: #eaeaf5; padding: 1rem 1.5rem; border-radius: .8rem; font-family: 'Urbanist', sans-serif; font-weight: 600; font-size: 1rem; cursor: pointer; transition: all .2s; }
        .ex-btn-outline:hover { border-color: #e6c77a; color: #e6c77a; }

        .ex-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; max-width: 34rem; }
        .ex-stat { padding: 1rem 1.15rem; border-radius: .9rem; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); backdrop-filter: blur(10px); }
        .ex-stat-num { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 1.5rem; color: #e6c77a; letter-spacing: -0.02em; }
        .ex-stat-lbl { font-size: .78rem; color: rgba(234,234,245,.6); margin-top: .15rem; }

        .ex-visual { position: relative; height: 100%; min-height: 26rem; display: flex; align-items: center; justify-content: center; }
        .ex-card-stack { position: relative; width: 100%; max-width: 26rem; }
        .ex-vcard { border-radius: 1.25rem; padding: 1.5rem; background: linear-gradient(140deg, rgba(30,25,70,.85), rgba(15,12,40,.85)); border: 1px solid rgba(230,199,122,.2); box-shadow: 0 30px 80px -30px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.05); backdrop-filter: blur(20px); }
        .ex-vcard-main { position: relative; z-index: 3; animation: exFloat 6s ease-in-out infinite; }
        .ex-vcard-back { position: absolute; top: -1.25rem; right: -1rem; z-index: 1; width: 90%; transform: rotate(4deg); opacity: .7; }
        .ex-vcard-front { position: absolute; bottom: -1rem; left: -1.5rem; z-index: 2; width: 75%; transform: rotate(-3deg); }
        .ex-vcard-title { font-family: 'Urbanist', sans-serif; font-weight: 700; font-size: .95rem; color: rgba(234,234,245,.6); margin: 0 0 1rem; letter-spacing: .05em; text-transform: uppercase; }
        .ex-vcard-num { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 2.25rem; color: #f5f2e8; letter-spacing: -0.02em; margin: 0; }
        .ex-vcard-delta { color: #7ee0a8; font-size: .85rem; font-weight: 600; margin-top: .35rem; }
        .ex-vbars { display: flex; align-items: flex-end; gap: .35rem; height: 3.5rem; margin-top: 1rem; }
        .ex-vbar { flex: 1; background: linear-gradient(180deg, #e6c77a, #a37f3c); border-radius: .25rem .25rem 0 0; opacity: .85; }
        .ex-mini-title { font-family: 'Urbanist', sans-serif; font-weight: 700; font-size: .8rem; color: rgba(234,234,245,.5); letter-spacing: .08em; text-transform: uppercase; margin: 0 0 .5rem; }
        .ex-mini-val { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 1.35rem; color: #f5f2e8; }

        .ex-features { position: relative; z-index: 5; max-width: 78rem; margin: 0 auto; padding: 2rem 2rem 5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
        .ex-feature { padding: 1.5rem; border-radius: 1rem; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); transition: all .3s; }
        .ex-feature:hover { border-color: rgba(230,199,122,.35); transform: translateY(-3px); background: rgba(230,199,122,.04); }
        .ex-feature-ico { width: 2.5rem; height: 2.5rem; border-radius: .65rem; background: rgba(230,199,122,.12); color: #e6c77a; display: flex; align-items: center; justify-content: center; margin-bottom: .85rem; }
        .ex-feature h3 { font-family: 'Urbanist', sans-serif; font-weight: 700; font-size: 1rem; color: #f5f2e8; margin: 0 0 .35rem; }
        .ex-feature p { font-size: .87rem; color: rgba(234,234,245,.6); margin: 0; line-height: 1.5; }

        /* Auth modal */
        .ex-backdrop { position: fixed; inset: 0; background: rgba(5,7,20,.75); backdrop-filter: blur(8px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 1.25rem; animation: exFade .25s ease both; }
        .ex-modal { width: 100%; max-width: 26rem; background: linear-gradient(160deg, #0f1130 0%, #1a1740 100%); border: 1px solid rgba(230,199,122,.2); border-radius: 1.25rem; padding: 2rem; box-shadow: 0 40px 100px -20px rgba(0,0,0,.8); animation: exPop .35s cubic-bezier(.2,.9,.3,1.2) both; position: relative; }
        .ex-modal-close { position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); color: rgba(234,234,245,.7); width: 2rem; height: 2rem; border-radius: .5rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
        .ex-modal-close:hover { background: rgba(255,255,255,.1); color: #e6c77a; border-color: rgba(230,199,122,.35); }
        .ex-modal-title { font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 1.55rem; color: #f5f2e8; margin: 0 0 .35rem; letter-spacing: -0.01em; }
        .ex-modal-sub { color: rgba(234,234,245,.65); font-size: .92rem; margin: 0 0 1.75rem; }
        .ex-field { margin-bottom: 1rem; }
        .ex-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: .45rem; }
        .ex-label { font-size: .78rem; font-weight: 600; color: rgba(234,234,245,.85); letter-spacing: .04em; text-transform: uppercase; }
        .ex-link-sm { font-size: .8rem; font-weight: 500; color: #e6c77a; background: 0; border: 0; cursor: pointer; padding: 0; }
        .ex-link-sm:hover { text-decoration: underline; }
        .ex-input { width: 100%; padding: .85rem 1rem; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: .7rem; font-size: .95rem; font-family: inherit; color: #f5f2e8; outline: none; transition: all .2s; }
        .ex-input::placeholder { color: rgba(234,234,245,.35); }
        .ex-input:focus { border-color: transparent; box-shadow: 0 0 0 2px rgba(230,199,122,.5); background: rgba(255,255,255,.06); }
        .ex-submit { width: 100%; padding: .95rem; background: linear-gradient(135deg, #e6c77a, #a37f3c); color: #0b0f26; font-weight: 700; font-family: 'Urbanist', sans-serif; border: 0; border-radius: .7rem; cursor: pointer; box-shadow: 0 10px 25px -10px rgba(230,199,122,.55); transition: all .2s; margin-top: .5rem; }
        .ex-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 15px 30px -10px rgba(230,199,122,.7); }
        .ex-submit:disabled { opacity: .6; cursor: not-allowed; }
        .ex-divider { position: relative; margin: 1.5rem 0; text-align: center; }
        .ex-divider::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,.1); }
        .ex-divider span { position: relative; background: #14143a; padding: 0 .75rem; color: rgba(234,234,245,.45); font-size: .7rem; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; }
        .ex-google { width: 100%; padding: .8rem; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); color: #f5f2e8; font-weight: 600; border-radius: .7rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .75rem; transition: all .2s; font-family: inherit; }
        .ex-google:hover { border-color: rgba(230,199,122,.4); background: rgba(230,199,122,.05); }
        .ex-foot { margin-top: 1.5rem; text-align: center; font-size: .88rem; color: rgba(234,234,245,.6); }
        .ex-foot button { background: 0; border: 0; color: #e6c77a; font-weight: 700; cursor: pointer; padding: 0; }
        .ex-foot button:hover { text-decoration: underline; }
        .ex-alert { margin-top: .9rem; padding: .7rem .9rem; border-radius: .6rem; font-size: .85rem; }
        .ex-alert.err { background: rgba(220,50,60,.1); color: #ffb0b6; border: 1px solid rgba(220,50,60,.3); }
        .ex-alert.ok { background: rgba(50,180,120,.1); color: #a8e8c8; border: 1px solid rgba(50,180,120,.3); }

        @keyframes exFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes exPop { from { opacity: 0; transform: scale(.94) translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes exFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>

      <main className="ex">
        <div className="ex-grid-bg" />
        <div className="ex-orb ex-orb-1" />
        <div className="ex-orb ex-orb-2" />

        <nav className="ex-nav">
          <div className="ex-logo">
            <div className="ex-logo-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
              </svg>
            </div>
            <span className="ex-logo-text">Ex<span>ERP</span></span>
          </div>
          <div className="ex-nav-cta">
            <a href="#imkanlar" className="ex-nav-link">İmkanlar</a>
            <button className="ex-btn-ghost" onClick={() => setAuthOpen(true)}>Daxil ol</button>
          </div>
        </nav>

        <section className="ex-hero">
          <div>
            <span className="ex-eyebrow">Expert ERP Platforması</span>
            <h1 className="ex-title">
              Şirkətinizin əməliyyatlarını <em>ekspert səviyyəsində</em> idarə edin.
            </h1>
            <p className="ex-lede">
              ExERP — maliyyə, satış, CRM, anbar və HR modullarını bir premium platformada birləşdirən ağıllı biznes idarəetmə ekosistemidir. Real-time analitika, tenant izolyasiyası və rol əsaslı təhlükəsizlik.
            </p>
            <div className="ex-actions">
              <button className="ex-btn-primary" onClick={() => setAuthOpen(true)}>
                Sistemə daxil ol
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </button>
              <a href="#imkanlar" className="ex-btn-outline" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                İmkanlarla tanış ol
              </a>
            </div>

            <div className="ex-stats">
              <div className="ex-stat">
                <div className="ex-stat-num">500+</div>
                <div className="ex-stat-lbl">Aktiv müəssisə</div>
              </div>
              <div className="ex-stat">
                <div className="ex-stat-num">99.9%</div>
                <div className="ex-stat-lbl">Uptime SLA</div>
              </div>
              <div className="ex-stat">
                <div className="ex-stat-num">24/7</div>
                <div className="ex-stat-lbl">Dəstək xətti</div>
              </div>
            </div>
          </div>

          <div className="ex-visual" aria-hidden="true">
            <div className="ex-card-stack">
              <div className="ex-vcard ex-vcard-back">
                <p className="ex-mini-title">Aylıq dövriyyə</p>
                <p className="ex-mini-val">₼ 248,590</p>
                <div className="ex-vbars">
                  {[40,60,45,75,55,80,65].map((h,i) => <div key={i} className="ex-vbar" style={{ height: `${h}%` }} />)}
                </div>
              </div>
              <div className="ex-vcard ex-vcard-main">
                <p className="ex-vcard-title">Ümumi Performans</p>
                <p className="ex-vcard-num">₼ 1.24M</p>
                <p className="ex-vcard-delta">▲ 18.4% keçən aya nisbətən</p>
                <div className="ex-vbars">
                  {[55,72,48,85,62,78,90,68,82].map((h,i) => <div key={i} className="ex-vbar" style={{ height: `${h}%` }} />)}
                </div>
              </div>
              <div className="ex-vcard ex-vcard-front">
                <p className="ex-mini-title">Aktiv sifariş</p>
                <p className="ex-mini-val">147</p>
              </div>
            </div>
          </div>
        </section>

        <section id="imkanlar" className="ex-features">
          {[
            { t: "Multi-tenant ERP", d: "Bir platformada saysız şirkət — tam izolyasiya, ayrı-ayrı hüquqlar.", i: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M14 9h1M14 13h1" },
            { t: "Real-time CRM", d: "Kanban pipeline, 360° müştəri görünüşü və avtomatik tapşırıqlar.", i: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
            { t: "Maliyyə & Mühasibat", d: "İkili yazılış, hesablar planı, balans, P&L və cash flow.", i: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
            { t: "Təhlükəsizlik Qatı", d: "RLS + rol əsaslı icazələr, audit log və HIBP qorunması.", i: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4" },
          ].map((f, i) => (
            <div key={i} className="ex-feature">
              <div className="ex-feature-ico">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.i} />
                </svg>
              </div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </section>

        {authOpen && (
          <div className="ex-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}>
            <div className="ex-modal" role="dialog" aria-modal="true">
              <button className="ex-modal-close" onClick={() => setAuthOpen(false)} aria-label="Bağla">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <h2 className="ex-modal-title">{isSignup ? "Hesab yaradın" : "Xoş gəlmisiniz"}</h2>
              <p className="ex-modal-sub">
                {isSignup ? "ExERP-ə qoşulmaq üçün məlumatlarınızı daxil edin." : "Sistemə daxil olmaq üçün məlumatlarınızı qeyd edin."}
              </p>

              <form onSubmit={submit} noValidate>
                <div className="ex-field">
                  <div className="ex-label-row"><label className="ex-label" htmlFor="ex-email">Email</label></div>
                  <input id="ex-email" className="ex-input" required type="email" autoComplete="email" placeholder="ad@sirket.az" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="ex-field">
                  <div className="ex-label-row">
                    <label className="ex-label" htmlFor="ex-pass">Şifrə</label>
                    {!isSignup && <button type="button" className="ex-link-sm" onClick={forgot}>Şifrəni unutmusunuz?</button>}
                  </div>
                  <input id="ex-pass" className="ex-input" required type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>

                <button disabled={busy} type="submit" className="ex-submit">
                  {busy ? "Gözləyin..." : isSignup ? "Qeydiyyatdan keç" : "Daxil ol"}
                </button>
              </form>

              <div className="ex-divider"><span>və ya</span></div>

              <button type="button" onClick={google} className="ex-google">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google ilə davam et
              </button>

              {error && <div className="ex-alert err">{error}</div>}
              {info && <div className="ex-alert ok">{info}</div>}

              <p className="ex-foot">
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
