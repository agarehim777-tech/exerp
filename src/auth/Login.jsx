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

function appUrl(path = "/") {
  const base = import.meta.env.BASE_URL || "/";
  const relativePath = String(path).replace(/^\/+/, "");
  return new URL(`${base}${relativePath}`, window.location.origin).toString();
}

const MODULES = [
  { k: "CRM", d: "Müştəri münasibətləri, pipeline, tapşırıqlar", i: "M3 3h18v4H3zM3 10h11v11H3zM17 10h4v11h-4z" },
  { k: "Satış", d: "Sifariş → Göndərmə → Faktura axını", i: "M3 3v18h18M7 15l4-4 4 4 5-6" },
  { k: "Anbar", d: "Stok, hərəkət, inventar auditi", i: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10" },
  { k: "Mühasibat", d: "IFRS, ikili yazılış, hesab planı", i: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" },
  { k: "HR", d: "Kadr, davamiyyət, əməkhaqqı", i: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M17 3.13a4 4 0 0 1 0 7.75" },
  { k: "Satınalma", d: "PO → GRN → Faktura 3-way match", i: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" },
];

const METRICS = [
  { v: "1 baza", l: "vahid məlumat axını" },
  { v: "RBAC", l: "rol əsaslı giriş" },
  { v: "Audit", l: "dəyişiklik tarixçəsi" },
  { v: "AZN", l: "yerli biznes uyğunluğu" },
];

const FLOW = ["Satış", "Rezerv", "Təhvil", "Kredit", "Kassa", "Mühasibat"];

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
      redirectTo: appUrl("/reset-password"),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setInfo("Şifrə bərpası linki emailinizə göndərildi.");
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(appUrl(next));
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
      ? supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl(next) } })
      : supabase.auth.signInWithPassword({ email, password });
    const { data, error } = await fn;
    setBusy(false);
    if (error) return setError(error.message);
    if (mode === "signup" && !data?.session) {
      setMode("signin");
      setInfo("Hesab yaradıldı. Emailinizə göndərilən təsdiq linkini açın, sonra daxil olun.");
      return;
    }
    window.location.replace(appUrl(next));
  }

  async function google() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: appUrl(next) },
    });
    if (error) setError(error.message);
  }

  const isSignup = mode === "signup";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@500;600;700&display=swap');
        .xp, .xp * { box-sizing: border-box; }
        .xp {
          /* Typography scale */
          --fs-display: 3.75rem;
          --fs-h2: 2.375rem;
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
          --ls-display: 0;
          --ls-tight: 0;
          --ls-wide: 0.1em;
          --ls-widest: 0.18em;

          min-height: 100vh; font-family: 'Inter', system-ui, sans-serif;
          font-size: var(--fs-base); line-height: var(--lh-normal);
          color: #e6f2ec; -webkit-font-smoothing: antialiased;
          background: #07120f;
          position: relative; overflow-x: hidden;
        }
        .xp::before { content:''; position:absolute; inset:0; pointer-events:none;
          background: linear-gradient(rgba(230,242,236,.035) 1px, transparent 1px) 0 0/100% 72px,
                      linear-gradient(90deg, rgba(230,242,236,.035) 1px, transparent 1px) 0 0/72px 100%;
          opacity:.65;
        }

        /* Top bar */
        .xp-top { position: relative; z-index: 2; width:min(100% - 2rem,76rem); min-height:4.75rem; margin:0 auto; display:flex; align-items:center; justify-content:space-between; padding: .8rem 0; border-bottom:1px solid rgba(230,242,236,.08); }
        .xp-brand { display:flex; align-items:center; gap:.7rem; }
        .xp-mark { width:2.25rem; height:2.25rem; border-radius:.45rem; background:#c9a84c; color:#0b1f1a; display:flex; align-items:center; justify-content:center; font-weight:800; font-family:'Sora',sans-serif; font-size:.95rem; line-height:1; box-shadow:0 10px 26px -12px rgba(201,168,76,.65);}
        .xp-brand b { font-family:'Sora',sans-serif; font-size: var(--fs-base); color:#fff; font-weight:700; line-height:1.2; }
        .xp-brand span { color:#c9a84c; font-weight:600; margin-left:.15rem; font-size: var(--fs-base); }
        .xp-links { display:flex; gap:.25rem; }
        .xp-links a { color:#9fb8ae; text-decoration:none; font-size:var(--fs-sm); font-weight:500; padding:.5rem .85rem; border-radius:.4rem; transition:.15s; }
        .xp-links a:hover { color:#fff; background: rgba(255,255,255,.04); }
        .xp-top-cta { display:flex; gap:.5rem; align-items:center; }
        .xp-ghost { min-height:2.55rem; background:rgba(255,255,255,.025); border:1px solid rgba(230,242,236,.18); color:#e6f2ec; padding:.55rem 1rem; border-radius:.4rem; font:inherit; font-size:var(--fs-sm); font-weight:600; cursor:pointer; transition:.15s; white-space:nowrap; }
        .xp-ghost:hover { border-color:#c9a84c; color:#c9a84c; }
        .xp-cta { min-height:2.55rem; background:#d2b45a; color:#102019; border:1px solid #d2b45a; padding:.6rem 1.1rem; border-radius:.4rem; font:inherit; font-size:var(--fs-sm); font-weight:700; cursor:pointer; transition:.2s; box-shadow:0 12px 30px -16px rgba(210,180,90,.8); white-space:nowrap;}
        .xp-cta:hover { background:#d9ba5e; transform: translateY(-1px); }
        @media(max-width:900px){ .xp{--fs-display:3.15rem;} .xp-links{ display:none;} .xp-top{width:calc(100% - 2rem); min-height:4.25rem; padding:.65rem 0;} }
        @media(max-width:520px){ .xp-brand div{ display:none;} }

        /* Hero */
        .xp-hero { position:relative; z-index:1; max-width:76rem; margin:0 auto; padding: 2.6rem 2rem 2rem; text-align:center; }
        .xp-eyebrow { display:inline-flex; align-items:center; gap:.55rem; padding:.42rem .8rem; border:1px solid rgba(201,168,76,.3); border-radius:999px; color:#d8be70; font-size:var(--fs-xs); font-weight:600; margin-bottom:1.35rem; background:#101c18; }
        .xp-eyebrow i { width:.4rem; height:.4rem; border-radius:999px; background:#c9a84c; box-shadow:0 0 10px #c9a84c; }
        .xp-h1 { max-width:58rem; margin:0 auto 1.2rem; font-family:'Sora',sans-serif; font-weight:600; font-size:var(--fs-display); line-height:1.12; letter-spacing:0; color:#f7faf8; text-wrap:balance; }
        .xp-h1 em { font-style:normal; color:#d5bc72; font-family:inherit; }
        .xp-lede { max-width: 46rem; margin: 0 auto 1.5rem; font-size: 1rem; line-height:1.7; color:#aec2ba; text-wrap:balance; }
        .xp-hero-cta { display:inline-flex; gap:.6rem; flex-wrap:wrap; justify-content:center; }

        /* Product preview */
        .xp-product { max-width:68rem; margin:2rem auto 0; text-align:left; border:1px solid rgba(230,242,236,.16); border-radius:.5rem; overflow:hidden; background:#f4f7f6; color:#10241e; box-shadow:0 36px 90px -34px rgba(0,0,0,.9); }
        .xp-product-bar { min-height:3rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.65rem .9rem; background:#fff; border-bottom:1px solid #dce5e1; }
        .xp-product-brand { display:flex; align-items:center; gap:.55rem; font-size:.8rem; font-weight:700; }
        .xp-product-logo { width:1.75rem; height:1.75rem; display:grid; place-items:center; border-radius:.35rem; background:#0b4b3b; color:#fff; }
        .xp-product-actions { display:flex; gap:.45rem; }
        .xp-product-actions span { width:1.85rem; height:1.85rem; display:grid; place-items:center; border:1px solid #dce5e1; border-radius:.35rem; color:#527067; font-size:.72rem; }
        .xp-product-body { display:grid; grid-template-columns:10rem 1fr; min-height:24rem; }
        .xp-product-nav { background:#0b241d; padding:.8rem .65rem; color:#9fb8ae; }
        .xp-product-nav b { display:block; color:#fff; font-size:.68rem; text-transform:uppercase; letter-spacing:.1em; padding:.5rem .6rem .7rem; }
        .xp-product-nav span { display:block; padding:.55rem .65rem; border-radius:.3rem; font-size:.72rem; margin-bottom:.15rem; }
        .xp-product-nav span:first-of-type { background:#164b3d; color:#fff; }
        .xp-product-main { padding:1.25rem; min-width:0; }
        .xp-product-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:1rem; }
        .xp-product-head h3 { margin:0 0 .2rem; font-size:1.05rem; }
        .xp-product-head p { margin:0; color:#6b8179; font-size:.72rem; }
        .xp-live { display:inline-flex; align-items:center; gap:.35rem; padding:.35rem .55rem; background:#e6f7ef; color:#137052; border-radius:.3rem; font-size:.68rem; font-weight:700; }
        .xp-live::before { content:''; width:.38rem; height:.38rem; border-radius:50%; background:#20a775; }
        .xp-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:.65rem; margin-bottom:.8rem; }
        .xp-kpi { background:#fff; border:1px solid #dfe7e4; border-radius:.4rem; padding:.8rem; min-width:0; }
        .xp-kpi small { display:block; color:#72867f; font-size:.64rem; margin-bottom:.35rem; }
        .xp-kpi strong { display:block; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .xp-kpi i { display:block; font-style:normal; color:#1b8b68; font-size:.62rem; margin-top:.3rem; }
        .xp-product-grid { display:grid; grid-template-columns:1.45fr .8fr; gap:.65rem; }
        .xp-chart, .xp-activity { background:#fff; border:1px solid #dfe7e4; border-radius:.4rem; padding:.85rem; min-width:0; }
        .xp-panel-title { font-size:.72rem; font-weight:700; margin-bottom:.8rem; }
        .xp-bars { height:8.6rem; display:flex; align-items:flex-end; gap:.55rem; border-bottom:1px solid #e4ebe8; }
        .xp-bars span { flex:1; min-width:.45rem; background:#19775c; border-radius:.2rem .2rem 0 0; }
        .xp-bars span:nth-child(2n) { background:#d2ad48; }
        .xp-activity ul { list-style:none; margin:0; padding:0; }
        .xp-activity li { display:grid; grid-template-columns:.5rem 1fr; gap:.45rem; padding:.42rem 0; border-bottom:1px solid #edf1ef; color:#60776f; font-size:.66rem; }
        .xp-activity li::before { content:''; width:.42rem; height:.42rem; border-radius:50%; background:#278c6d; margin-top:.22rem; }
        .xp-product-note { display:flex; align-items:center; justify-content:center; gap:.5rem; padding:.65rem 1rem; background:#0a1d17; color:#a8bdb5; font-size:.7rem; }
        .xp-product-note b { color:#d8b552; }

        .xp-flow { max-width:68rem; margin:1rem auto 0; display:grid; grid-template-columns:repeat(6,1fr); border:1px solid rgba(230,242,236,.1); border-radius:.45rem; overflow:hidden; background:rgba(3,17,13,.7); }
        .xp-flow span { position:relative; padding:.8rem .5rem; color:#c2d2cc; font-size:.7rem; font-weight:600; border-right:1px solid rgba(230,242,236,.09); }
        .xp-flow span:last-child { border-right:0; }
        .xp-flow span:not(:last-child)::after { content:'›'; position:absolute; right:-.28rem; top:50%; transform:translateY(-50%); z-index:2; color:#c9a84c; background:#061511; padding:0 .1rem; font-size:1rem; }

        /* Metrics strip */
        .xp-metrics { max-width: 60rem; margin: 2rem auto 0; display:grid; grid-template-columns: repeat(4,1fr); gap:0; border-top: 1px solid rgba(230,242,236,.08); border-bottom: 1px solid rgba(230,242,236,.08); padding: 1.25rem 0; }
        .xp-metric { text-align:center; border-right:1px solid rgba(230,242,236,.08); }
        .xp-metric:last-child { border-right:0; }
        .xp-metric b { display:block; font-family:'Sora',sans-serif; font-weight:600; font-size:1.25rem; color:#d5bc72; line-height:1; margin-bottom:.4rem; }
        .xp-metric span { font-size:var(--fs-2xs); color:#9fb8ae; text-transform:uppercase; letter-spacing:var(--ls-wide); }
        @media(max-width:900px){ .xp-product-body{grid-template-columns:7.5rem 1fr;} .xp-kpis{grid-template-columns:repeat(2,1fr);} }
        @media(max-width:700px){
          .xp { --fs-display:2.35rem; --fs-h2:1.9rem; }
          .xp-hero{padding:1.8rem 1rem 1.5rem;}
          .xp-product{margin-top:1.8rem;}
          .xp-product-body{grid-template-columns:1fr; min-height:0;}
          .xp-product-nav{display:none;}
          .xp-product-main{padding:.8rem;}
          .xp-product-grid{grid-template-columns:1fr;}
          .xp-activity{display:none;}
          .xp-bars{height:6rem;}
          .xp-flow{grid-template-columns:repeat(3,1fr);}
          .xp-flow span:nth-child(3){border-right:0;}
          .xp-flow span:nth-child(-n+3){border-bottom:1px solid rgba(230,242,236,.09);}
          .xp-metrics{ grid-template-columns:repeat(2,1fr); gap:1rem 0;}
          .xp-metric{ border-right:0;}
          .xp-metric:nth-child(odd){ border-right:1px solid rgba(230,242,236,.08);}
        }

        /* Modules */
        .xp-sec { position:relative; z-index:1; max-width:76rem; margin:0 auto; padding: 4rem 2rem; }
        .xp-sec-h { text-align:center; margin-bottom:2.5rem; }
        .xp-sec-lbl { color:#c9a84c; font-size:var(--fs-2xs); font-weight:600; letter-spacing:var(--ls-wide); text-transform:uppercase; margin-bottom:.75rem; }
        .xp-sec-t { font-family:'Sora',sans-serif; font-weight:600; font-size: var(--fs-h2); line-height: var(--lh-snug); color:#fff; margin:0; letter-spacing:0; }
        .xp-mods { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; }
        @media(max-width:900px){ .xp-mods{ grid-template-columns:repeat(2,1fr);} }
        @media(max-width:560px){ .xp-mods{ grid-template-columns:1fr;} }
        .xp-mod { position:relative; background:#0b1915; border:1px solid rgba(230,242,236,.09); border-radius:.5rem; padding: 1.6rem 1.4rem; transition:.25s; overflow:hidden; }
        .xp-mod::after { content:''; position:absolute; inset:0; border-radius:.75rem; padding:1px; background:linear-gradient(135deg, rgba(201,168,76,.4), transparent 50%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity:0; transition:.25s; }
        .xp-mod:hover { transform:translateY(-3px); border-color:rgba(201,168,76,.3); }
        .xp-mod:hover::after { opacity:1; }
        .xp-mod-i { width:2.4rem; height:2.4rem; border-radius:.5rem; background: rgba(201,168,76,.1); border:1px solid rgba(201,168,76,.25); color:#c9a84c; display:flex; align-items:center; justify-content:center; margin-bottom:1rem; }
        .xp-mod b { display:block; color:#fff; font-size:var(--fs-h4); font-weight:600; margin-bottom:.35rem; letter-spacing: var(--ls-tight); line-height:1.3; }
        .xp-mod p { margin:0; color:#9fb8ae; font-size:var(--fs-base); line-height:var(--lh-normal); }

        /* Terminal preview */
        .xp-term-wrap { max-width:56rem; margin: 0 auto; position:relative; }
        .xp-term-wrap::before{ display:none; }
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
        .xp-cta-band h2 { font-family:'Sora',sans-serif; font-weight:600; font-size: var(--fs-h2); line-height: var(--lh-snug); color:#fff; margin:0 0 1rem; letter-spacing:0; }
        .xp-cta-band p { color:#9fb8ae; max-width:34rem; margin:0 auto 2rem; font-size: var(--fs-base); }

        .xp-foot { border-top:1px solid rgba(230,242,236,.08); padding: 2rem; text-align:center; color:#5f7a70; font-size:var(--fs-xs); }

        /* Modal */
        .xp-bd { position:fixed; inset:0; background:rgba(3,10,8,.8); backdrop-filter:blur(10px); z-index:100; display:flex; align-items:center; justify-content:center; padding:1.25rem; }
        .xp-mod-x { width:100%; max-width:24rem; background:#0a211b; border:1px solid rgba(201,168,76,.2); border-radius:.5rem; padding:2rem; position:relative; }
        .xp-x { position:absolute; top:.85rem; right:.85rem; background:rgba(255,255,255,.05); border:1px solid rgba(230,242,236,.1); color:#9fb8ae; width:2rem; height:2rem; border-radius:999px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .xp-x:hover { color:#fff; }
        .xp-mt { font-family:'Sora',sans-serif; font-weight:600; font-size:var(--fs-h3); line-height:var(--lh-snug); color:#fff; margin:0 0 .35rem; letter-spacing:0; }
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
      `}</style>

      <main className="xp">
        <header className="xp-top">
          <div className="xp-brand">
            <span className="xp-mark">E</span>
            <div><b>ExERP</b><span> · Studio</span></div>
          </div>
          <nav className="xp-links">
            <a href="#mods">Modullar</a>
            <a href="#preview">Platforma</a>
            <a href="#qiymet">Qiymət</a>
            <a href="#elaqe">Əlaqə</a>
          </nav>
          <div className="xp-top-cta">
            <button className="xp-ghost" onClick={() => setAuthOpen(true)}>Daxil ol</button>
            <button className="xp-cta" onClick={() => setAuthOpen(true)}>Demo sifariş et</button>
          </div>
        </header>

        <section className="xp-hero">
          <div className="xp-eyebrow"><i/>Azərbaycan biznesi üçün vahid ERP platforması</div>
          <h1 className="xp-h1">
            Satışdan maliyyəyə<br/>
            <em>bütün biznesiniz</em> bir sistemdə
          </h1>
          <p className="xp-lede">
            CRM, satış, kredit, anbar, maliyyə, satınalma və HR əməliyyatlarını vahid məlumat bazasında idarə edin.
            Hər əməliyyat növbəti modula avtomatik ötürülsün, rəhbərlik isə nəticəni real vaxtda görsün.
          </p>
          <div className="xp-hero-cta">
            <button className="xp-cta" onClick={() => setAuthOpen(true)}>Demo sifariş et</button>
            <button className="xp-ghost" onClick={() => document.getElementById('mods')?.scrollIntoView({behavior:'smooth'})}>Modullara bax</button>
          </div>

          <div className="xp-product" id="preview" aria-label="ExERP idarəetmə panelinin nümunə görünüşü">
            <div className="xp-product-bar">
              <div className="xp-product-brand"><span className="xp-product-logo">E</span> ExERP idarəetmə paneli</div>
              <div className="xp-product-actions"><span>⌕</span><span>◌</span><span>KS</span></div>
            </div>
            <div className="xp-product-body">
              <aside className="xp-product-nav">
                <b>İdarəetmə</b>
                <span>İcmal</span><span>Satış</span><span>Kreditlər</span><span>Anbar</span><span>Maliyyə</span><span>Hesabatlar</span>
              </aside>
              <div className="xp-product-main">
                <div className="xp-product-head">
                  <div><h3>Biznes icmalı</h3><p>Əsas göstəricilər və əməliyyat nəzarəti</p></div>
                  <span className="xp-live">Canlı məlumat</span>
                </div>
                <div className="xp-kpis">
                  <div className="xp-kpi"><small>Aylıq satış</small><strong>184 320 ₼</strong><i>+12.4% artım</i></div>
                  <div className="xp-kpi"><small>Brüt mənfəət</small><strong>47 860 ₼</strong><i>26% marja</i></div>
                  <div className="xp-kpi"><small>Aktiv kredit</small><strong>126</strong><i>8 ödəniş bu gün</i></div>
                  <div className="xp-kpi"><small>Stok riski</small><strong>7 məhsul</strong><i>Minimum qalıq</i></div>
                </div>
                <div className="xp-product-grid">
                  <div className="xp-chart"><div className="xp-panel-title">Gəlir və xərc dinamikası</div><div className="xp-bars"><span style={{height:'42%'}}/><span style={{height:'28%'}}/><span style={{height:'58%'}}/><span style={{height:'36%'}}/><span style={{height:'72%'}}/><span style={{height:'45%'}}/><span style={{height:'88%'}}/><span style={{height:'54%'}}/></div></div>
                  <div className="xp-activity"><div className="xp-panel-title">Son əməliyyatlar</div><ul><li>Satış sifarişi təsdiqləndi</li><li>Kredit ödənişi kassaya düşdü</li><li>Anbar təhvili tamamlandı</li><li>Satınalma mədaxili yaradıldı</li></ul></div>
                </div>
              </div>
            </div>
            <div className="xp-product-note"><b>Vahid axın:</b> satış, stok, kredit və maliyyə bir-birinə bağlı işləyir</div>
          </div>

          <div className="xp-flow" aria-label="Əməliyyat axını">
            {FLOW.map(step => <span key={step}>{step}</span>)}
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

        <section className="xp-sec" id="integration">
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
          <button className="xp-cta" onClick={() => setAuthOpen(true)}>Demo sifariş et</button>
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
