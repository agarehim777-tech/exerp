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

const MODULES = [
  { k: "CRM", d: "Müştəri münasibətləri, pipeline, tapşırıqlar", i: "M3 3h18v4H3zM3 10h11v11H3zM17 10h4v11h-4z" },
  { k: "Satış", d: "Kotirovka → Sifariş → Göndərmə axını", i: "M3 3v18h18M7 15l4-4 4 4 5-6" },
  { k: "Anbar", d: "Stok, hərəkət, inventar auditi", i: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" },
  { k: "Mühasibat", d: "IFRS, ikili yazılış, hesab planı", i: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" },
  { k: "HR", d: "Kadr, davamiyyət, əməkhaqqı", i: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75" },
  { k: "Satınalma", d: "PO → GRN → Faktura 3-way match", i: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" },
];

const METRICS = [
  { v: "3–7", l: "gündə tətbiq" },
  { v: "99.9%", l: "uptime SLA" },
  { v: "24/7", l: "yerli dəstək" },
  { v: "IFRS", l: "sertifikatlı" },
];

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
    setError(null); setInfo(null);
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
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&display=swap');
        .xp, .xp * { box-sizing: border-box; }
        .xp {
          /* Typography scale */
          --fs-display: clamp(2.5rem, 5vw, 4.25rem);
          --fs-h2: clamp(1.75rem, 3vw, 2.375rem);
          --fs-h3: 1.5rem;
          --fs-h4: 1.0625rem;
          --fs-lead: 1.0625rem;
          --fs-base: 0.9375rem;
          --fs-sm: 0.8125rem;
          --fs-xs: 0.75rem;
          --fs-2xs: 0.6875rem;
          --lh-tight: 1.05;
          --lh-snug: 1.2;
          --lh-normal: 1.55;
          --lh-loose: 1.7;
          --ls-display: -0.02em;
          --ls-tight: -0.015em;
          --ls-wide: 0.1em;
          --ls-widest: 0.18em;

          min-height: 100vh; font-family: 'Inter', system-ui, sans-serif;
          font-size: var(--fs-base); line-height: var(--lh-normal);
          color: #e6f2ec; -webkit-font-smoothing: antialiased;
          background: #061511;
          background-image:
            radial-gradient(1200px 600px at 85% -10%, rgba(201,168,76,.10), transparent 60%),
            radial-gradient(900px 500px at 10% 20%, rgba(13,122,95,.35), transparent 60%),
            linear-gradient(180deg, #061511 0%, #06201a 50%, #041a15 100%);
          position: relative; overflow-x: hidden;
        }
        .xp::before { content:''; position:absolute; inset:0; pointer-events:none;
          background: linear-gradient(rgba(230,242,236,.04) 1px, transparent 1px) 0 0/100% 64px,
                      linear-gradient(90deg, rgba(230,242,236,.04) 1px, transparent 1px) 0 0/64px 100%;
          mask-image: radial-gradient(ellipse at 50% 30%, #000 40%, transparent 80%);
        }

        /* Top bar */
        .xp-top { position: relative; z-index: 2; display:flex; align-items:center; justify-content:space-between; padding: 1.5rem 2.5rem; }
        .xp-brand { display:flex; align-items:center; gap:.7rem; }
        .xp-mark { width:2.2rem; height:2.2rem; border-radius:.5rem; background:linear-gradient(135deg,#c9a84c,#8a6f2a); color:#0b1f1a; display:flex; align-items:center; justify-content:center; font-weight:900; font-family:'Instrument Serif',serif; font-size:1.25rem; line-height:1; box-shadow: 0 8px 24px -8px rgba(201,168,76,.5);}
        .xp-brand b { font-size: var(--fs-base); letter-spacing:.02em; color:#fff; font-weight:700; line-height:1.2; }
        .xp-brand span { color:#c9a84c; font-weight:600; margin-left:.15rem; font-size: var(--fs-base); }
        .xp-links { display:flex; gap:.25rem; }
        .xp-links a { color:#9fb8ae; text-decoration:none; font-size:var(--fs-sm); font-weight:500; padding:.5rem .85rem; border-radius:.4rem; transition:.15s; }
        .xp-links a:hover { color:#fff; background: rgba(255,255,255,.04); }
        .xp-top-cta { display:flex; gap:.5rem; align-items:center; }
        .xp-ghost { background:transparent; border:1px solid rgba(230,242,236,.18); color:#e6f2ec; padding:.55rem 1rem; border-radius:.45rem; font:inherit; font-size:var(--fs-sm); font-weight:500; cursor:pointer; transition:.15s; white-space:nowrap; }
        .xp-ghost:hover { border-color:#c9a84c; color:#c9a84c; }
        .xp-cta { background:#c9a84c; color:#0b1f1a; border:0; padding:.6rem 1.1rem; border-radius:.45rem; font:inherit; font-size:var(--fs-sm); font-weight:700; cursor:pointer; transition:.2s; box-shadow: 0 10px 30px -12px rgba(201,168,76,.6); white-space:nowrap;}
        .xp-cta:hover { background:#d9ba5e; transform: translateY(-1px); }
        @media(max-width:900px){ .xp-links{ display:none;} .xp-top{padding:1rem 1.25rem;} }
        @media(max-width:520px){ .xp-brand div{ display:none;} }

        /* Hero */
        .xp-hero { position:relative; z-index:1; max-width:76rem; margin:0 auto; padding: 4rem 2rem 3rem; text-align:center; }
        .xp-eyebrow { display:inline-flex; align-items:center; gap:.55rem; padding:.4rem .9rem; border:1px solid rgba(201,168,76,.35); border-radius:999px; color:#c9a84c; font-size:var(--fs-xs); font-weight:500; margin-bottom:1.75rem; background: rgba(201,168,76,.06); }
        .xp-eyebrow i { width:.4rem; height:.4rem; border-radius:999px; background:#c9a84c; box-shadow:0 0 10px #c9a84c; }
        .xp-h1 { font-family:'Instrument Serif', serif; font-weight:400; font-size: var(--fs-display); line-height: var(--lh-tight); letter-spacing: var(--ls-display); margin: 0 0 1.5rem; color:#fff; }
        .xp-h1 em { font-style: italic; color:#c9a84c; font-family:'Instrument Serif', serif; }
        .xp-lede { max-width: 38rem; margin: 0 auto 2.25rem; font-size: var(--fs-lead); line-height:1.65; color:#9fb8ae; }
        .xp-hero-cta { display:inline-flex; gap:.6rem; flex-wrap:wrap; justify-content:center; }

        /* Metrics strip */
        .xp-metrics { max-width: 60rem; margin: 3rem auto 0; display:grid; grid-template-columns: repeat(4,1fr); gap:0; border-top: 1px solid rgba(230,242,236,.08); border-bottom: 1px solid rgba(230,242,236,.08); padding: 1.5rem 0; }
        .xp-metric { text-align:center; border-right:1px solid rgba(230,242,236,.08); }
        .xp-metric:last-child { border-right:0; }
        .xp-metric b { display:block; font-family:'Instrument Serif',serif; font-weight:400; font-size:var(--fs-h3); color:#c9a84c; line-height:1; margin-bottom:.4rem; }
        .xp-metric span { font-size:var(--fs-2xs); color:#9fb8ae; text-transform:uppercase; letter-spacing:var(--ls-wide); }
        @media(max-width:700px){ .xp-metrics{ grid-template-columns:repeat(2,1fr); gap:1rem 0;} .xp-metric{ border-right:0;} .xp-metric:nth-child(odd){ border-right:1px solid rgba(230,242,236,.08);} }

        /* Modules */
        .xp-sec { position:relative; z-index:1; max-width:76rem; margin:0 auto; padding: 4rem 2rem; }
        .xp-sec-h { text-align:center; margin-bottom:2.5rem; }
        .xp-sec-lbl { color:#c9a84c; font-size:var(--fs-2xs); font-weight:600; letter-spacing:var(--ls-wide); text-transform:uppercase; margin-bottom:.75rem; }
        .xp-sec-t { font-family:'Instrument Serif',serif; font-weight:400; font-size: var(--fs-h2); line-height: var(--lh-snug); color:#fff; margin:0; letter-spacing: var(--ls-tight); }
        .xp-mods { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; }
        @media(max-width:900px){ .xp-mods{ grid-template-columns:repeat(2,1fr);} }
        @media(max-width:560px){ .xp-mods{ grid-template-columns:1fr;} }
        .xp-mod { position:relative; background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01)); border:1px solid rgba(230,242,236,.08); border-radius:.75rem; padding: 1.6rem 1.4rem; transition:.25s; overflow:hidden; }
        .xp-mod::after { content:''; position:absolute; inset:0; border-radius:.75rem; padding:1px; background:linear-gradient(135deg, rgba(201,168,76,.4), transparent 50%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity:0; transition:.25s; }
        .xp-mod:hover { transform:translateY(-3px); border-color:rgba(201,168,76,.3); }
        .xp-mod:hover::after { opacity:1; }
        .xp-mod-i { width:2.4rem; height:2.4rem; border-radius:.5rem; background: rgba(201,168,76,.1); border:1px solid rgba(201,168,76,.25); color:#c9a84c; display:flex; align-items:center; justify-content:center; margin-bottom:1rem; }
        .xp-mod b { display:block; color:#fff; font-size:var(--fs-h4); font-weight:600; margin-bottom:.35rem; letter-spacing: var(--ls-tight); line-height:1.3; }
        .xp-mod p { margin:0; color:#9fb8ae; font-size:var(--fs-base); line-height:var(--lh-normal); }

        /* Terminal preview */
        .xp-term-wrap { max-width:56rem; margin: 0 auto; position:relative; }
        .xp-term-wrap::before{ content:''; position:absolute; inset:-40px; background:radial-gradient(circle, rgba(201,168,76,.15),transparent 60%); filter:blur(30px); }
        .xp-term { position:relative; background:#03110d; border:1px solid rgba(230,242,236,.1); border-radius:.75rem; font-family: 'JetBrains Mono', ui-monospace, monospace; overflow:hidden; box-shadow: 0 40px 100px -30px rgba(0,0,0,.7); }
        .xp-term-h { display:flex; align-items:center; gap:.4rem; padding:.7rem 1rem; border-bottom:1px solid rgba(230,242,236,.08); background: rgba(0,0,0,.3); }
        .xp-term-h span { width:.6rem; height:.6rem; border-radius:999px; background:rgba(230,242,236,.15); }
        .xp-term-h b { margin-left:.75rem; color:#9fb8ae; font-family:'Inter',sans-serif; font-size:var(--fs-xs); font-weight:500; letter-spacing:.05em; }
        .xp-term-body { padding: 1.5rem; font-size:var(--fs-sm); line-height:var(--lh-loose); color:#9fb8ae; }
        .xp-term-body .p { color:#c9a84c; }
        .xp-term-body .c { color:#e6f2ec; }
        .xp-term-body .g { color:#5cbd9e; }
        .xp-term-body .m { color:#7fa8d4; }

        /* Footer CTA */
        .xp-cta-band { text-align:center; padding: 2rem 2rem 4rem; }
        .xp-cta-band h2 { font-family:'Instrument Serif',serif; font-weight:400; font-size: var(--fs-h2); line-height: var(--lh-snug); color:#fff; margin:0 0 1rem; letter-spacing: var(--ls-tight); }
        .xp-cta-band p { color:#9fb8ae; max-width:34rem; margin:0 auto 2rem; font-size: var(--fs-base); }

        .xp-foot { border-top:1px solid rgba(230,242,236,.08); padding: 2rem; text-align:center; color:#5f7a70; font-size:var(--fs-xs); }

        /* Modal */
        .xp-bd { position:fixed; inset:0; background:rgba(3,10,8,.8); backdrop-filter:blur(10px); z-index:100; display:flex; align-items:center; justify-content:center; padding:1.25rem; animation: xpFade .2s both; }
        .xp-mod-x { width:100%; max-width:24rem; background: linear-gradient(180deg,#0a2620,#061511); border:1px solid rgba(201,168,76,.2); border-radius:.75rem; padding:2rem; position:relative; animation: xpPop .3s cubic-bezier(.2,.9,.3,1.15) both; }
        .xp-x { position:absolute; top:.85rem; right:.85rem; background:rgba(255,255,255,.05); border:1px solid rgba(230,242,236,.1); color:#9fb8ae; width:2rem; height:2rem; border-radius:999px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .xp-x:hover { color:#fff; }
        .xp-mt { font-family:'Instrument Serif',serif; font-weight:400; font-size:var(--fs-h3); line-height:var(--lh-snug); color:#fff; margin:0 0 .35rem; letter-spacing: var(--ls-tight); }
        .xp-ms { color:#9fb8ae; font-size:var(--fs-base); margin:0 0 1.5rem; }
        .xp-f { margin-bottom:.85rem; }
        .xp-lr { display:flex; justify-content:space-between; align-items:center; margin-bottom:.4rem; }
        .xp-l { font-size:var(--fs-2xs); font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:#9fb8ae; }
        .xp-ls { font-size:var(--fs-xs); color:#c9a84c; background:0; border:0; cursor:pointer; padding:0; font-family:inherit;}
        .xp-ls:hover{ color:#fff; }
        .xp-in { width:100%; padding:.8rem 1rem; background:rgba(0,0,0,.35); border:1px solid rgba(230,242,236,.12); border-radius:.45rem; color:#fff; font:inherit; font-size:var(--fs-base); outline:none; transition:.15s; }
        .xp-in::placeholder{ color:rgba(159,184,174,.5);}
        .xp-in:focus{ border-color:#c9a84c; box-shadow: 0 0 0 3px rgba(201,168,76,.15);}
        .xp-sub { width:100%; padding:.9rem; background:#c9a84c; color:#0b1f1a; font:inherit; font-weight:700; font-size:var(--fs-base); border:0; border-radius:.45rem; cursor:pointer; margin-top:.4rem; transition:.2s; }
        .xp-sub:hover:not(:disabled){ background:#d9ba5e; }
        .xp-sub:disabled{ opacity:.6; cursor:not-allowed; }
        .xp-dv { position:relative; margin:1.25rem 0; text-align:center; }
        .xp-dv::before{ content:''; position:absolute; top:50%; left:0; right:0; height:1px; background:rgba(230,242,236,.1);}
        .xp-dv span{ position:relative; background:#0a2620; padding:0 .75rem; color:#9fb8ae; font-size:var(--fs-2xs); letter-spacing:var(--ls-widest); text-transform:uppercase; font-weight:600;}
        .xp-g { width:100%; padding:.8rem; background:rgba(0,0,0,.3); border:1px solid rgba(230,242,236,.12); color:#fff; border-radius:.45rem; font:inherit; font-size:var(--fs-base); cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.75rem; transition:.15s;}
        .xp-g:hover{ border-color:#c9a84c;}
        .xp-ft { margin-top:1.25rem; text-align:center; font-size:var(--fs-sm); color:#9fb8ae;}
        .xp-ft button { background:0; border:0; color:#c9a84c; font-weight:600; cursor:pointer; font-family:inherit; font-size:inherit;}
        .xp-al { margin-top:.9rem; padding:.7rem .9rem; font-size:var(--fs-sm); border-radius:.4rem; border:1px solid;}
        .xp-al.e{ background:rgba(220,50,50,.1); color:#fca5a5; border-color:rgba(220,50,50,.3);}
        .xp-al.o{ background:rgba(92,189,158,.1); color:#7fd4b2; border-color:rgba(92,189,158,.3);}
        @keyframes xpFade { from{opacity:0;} to{opacity:1;} }
        @keyframes xpPop { from{opacity:0; transform:scale(.96) translateY(6px);} to{opacity:1; transform:none;} }
      `}</style>

      <main className="xp">
        <header className="xp-top">
          <div className="xp-brand">
            <span className="xp-mark">E</span>
            <div><b>ExERP</b><span> · Studio</span></div>
          </div>
          <nav className="xp-links">
            <a href="#mods">Modullar</a>
            <a href="#preview">İnteqrasiya</a>
            <a href="#qiymet">Qiymət</a>
            <a href="#elaqe">Əlaqə</a>
          </nav>
          <div className="xp-top-cta">
            <button className="xp-ghost" onClick={() => setAuthOpen(true)}>Daxil ol</button>
            <button className="xp-cta" onClick={() => setAuthOpen(true)}>Demo istə →</button>
          </div>
        </header>

        <section className="xp-hero">
          <div className="xp-eyebrow"><i/>Azərbaycan biznesi üçün, yerli komanda</div>
          <h1 className="xp-h1">
            Bir platforma —<br/>
            <em>bütün</em> əməliyyatlarınız
          </h1>
          <p className="xp-lede">
            ExERP CRM, satış, anbar, mühasibat və HR modullarını vahid bulud sistemində birləşdirir.
            IFRS uyğun, e-taxes və e-qaimə inteqrasiyalı, 3–7 gündə hazır.
          </p>
          <div className="xp-hero-cta">
            <button className="xp-cta" onClick={() => setAuthOpen(true)}>3 gün pulsuz sına →</button>
            <button className="xp-ghost" onClick={() => document.getElementById('mods')?.scrollIntoView({behavior:'smooth'})}>Modullara bax</button>
          </div>

          <div className="xp-metrics">
            {METRICS.map(m => (
              <div key={m.l} className="xp-metric"><b>{m.v}</b><span>{m.l}</span></div>
            ))}
          </div>
        </section>

        <section className="xp-sec" id="mods">
          <div className="xp-sec-h">
            <div className="xp-sec-lbl">Modullar</div>
            <h2 className="xp-sec-t">Şirkətinizə lazım olan hər şey</h2>
          </div>
          <div className="xp-mods">
            {MODULES.map(m => (
              <article key={m.k} className="xp-mod">
                <div className="xp-mod-i">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={m.i}/></svg>
                </div>
                <b>{m.k}</b>
                <p>{m.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="xp-sec" id="preview">
          <div className="xp-sec-h">
            <div className="xp-sec-lbl">API · MCP</div>
            <h2 className="xp-sec-t">Sisteminizlə birbaşa danışın</h2>
          </div>
          <div className="xp-term-wrap">
            <div className="xp-term">
              <div className="xp-term-h">
                <span/><span/><span/>
                <b>exerp · mcp · orders.list</b>
              </div>
              <div className="xp-term-body">
                <div><span className="p">$</span> <span className="c">exerp query</span> <span className="g">"son 7 gündə 10 000 AZN-dən yuxarı sifarişlər"</span></div>
                <div>&nbsp;</div>
                <div><span className="m">→</span> 14 nəticə tapıldı · 187 400 AZN cəm</div>
                <div><span className="m">→</span> INV-1204  ·  12 800 AZN  ·  <span className="g">ödənilib</span></div>
                <div><span className="m">→</span> INV-1211  ·  18 200 AZN  ·  <span className="g">ödənilib</span></div>
                <div><span className="m">→</span> INV-1217  ·  22 500 AZN  ·  gözləyir</div>
                <div>&nbsp;</div>
                <div><span className="p">$</span> <span className="c">_</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="xp-cta-band" id="qiymet">
          <h2>Şirkətinizi rəqəmsallaşdırmağa hazırsınız?</h2>
          <p>3 günlük tam funksional sınaq. Kart tələb olunmur, quraşdırma bizdən.</p>
          <button className="xp-cta" onClick={() => setAuthOpen(true)}>Demo istə →</button>
        </section>

        <footer className="xp-foot" id="elaqe">© {new Date().getFullYear()} ExERP · Bakı, Azərbaycan</footer>

        {authOpen && (
          <div className="xp-bd" onClick={(e)=>{ if(e.target===e.currentTarget) setAuthOpen(false);}}>
            <div className="xp-mod-x" role="dialog" aria-modal="true">
              <button className="xp-x" onClick={()=>setAuthOpen(false)} aria-label="Bağla">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <h2 className="xp-mt">{isSignup ? "Hesab yaradın" : "Xoş gəlmisiniz"}</h2>
              <p className="xp-ms">{isSignup ? "ExERP-ə qoşulmaq üçün məlumatlarınızı daxil edin." : "Sistemə daxil olmaq üçün məlumatlarınızı qeyd edin."}</p>
              <form onSubmit={submit} noValidate>
                <div className="xp-f">
                  <div className="xp-lr"><label className="xp-l" htmlFor="xp-e">Email</label></div>
                  <input id="xp-e" className="xp-in" required type="email" autoComplete="email" placeholder="ad@sirket.az" value={email} onChange={(e)=>setEmail(e.target.value)}/>
                </div>
                <div className="xp-f">
                  <div className="xp-lr">
                    <label className="xp-l" htmlFor="xp-p">Şifrə</label>
                    {!isSignup && <button type="button" className="xp-ls" onClick={forgot}>Şifrəni unutmusunuz?</button>}
                  </div>
                  <input id="xp-p" className="xp-in" required type="password" autoComplete={isSignup ? "new-password" : "current-password"} placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)}/>
                </div>
                <button disabled={busy} type="submit" className="xp-sub">{busy ? "Gözləyin..." : isSignup ? "Qeydiyyatdan keç" : "Daxil ol"}</button>
              </form>
              <div className="xp-dv"><span>və ya</span></div>
              <button type="button" onClick={google} className="xp-g">
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google ilə davam et
              </button>
              {error && <div className="xp-al e">{error}</div>}
              {info && <div className="xp-al o">{info}</div>}
              <p className="xp-ft">
                {isSignup ? "Artıq hesabınız var? " : "Hesabınız yoxdur? "}
                <button type="button" onClick={()=>{ setMode(isSignup?"signin":"signup"); setError(null); setInfo(null);}}>
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
