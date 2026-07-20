import React, { useState } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "./AuthProvider.jsx";
import { logger } from "../lib/logger";

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export default function TenantBootstrap() {
  const { user, isPlatformAdmin, refresh, signOut } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const base = (slug || slugify(name) || `sirket`).slice(0, 40);
    let finalSlug = base;
    let lastError = null;
    for (let i = 0; i < 4; i++) {
      const { error } = await supabase.rpc("create_tenant", { _name: name.trim(), _slug: finalSlug });
      if (!error) {
        setBusy(false);
        await refresh();
        return;
      }
      lastError = error;
      const isDup = error.code === "23505" || /duplicate key|tenants_slug_key/i.test(error.message);
      if (!isDup) break;
      finalSlug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    setBusy(false);
    logger.error("create_tenant failed", { message: lastError?.message });
    const msg = lastError?.message || "";
    if (/forbidden/i.test(msg)) {
      setError("İcazə yoxdur: yalnız platform administratoru yeni şirkət yarada bilər.");
    } else {
      setError(msg || "Xəta baş verdi");
    }
  }

  // Regular users (company admins/members without a tenant assignment yet)
  // are NOT allowed to create tenants — only platform administrators can.
  if (!isPlatformAdmin) {
    return (
      <main style={wrap}>
        <div style={card}>
          <h1 style={{ fontFamily: "Sora, sans-serif", margin: 0, fontSize: 22, color: "#064e3b" }}>
            Şirkət təyinatı gözlənilir
          </h1>
          <p style={{ color: "#5f7a70", marginTop: 10, fontSize: 14, lineHeight: 1.55 }}>
            Salam, <strong>{user?.email}</strong>. Sizin hesabınız hələ heç bir şirkətə təyin edilməyib.
          </p>
          <p style={{ color: "#5f7a70", marginTop: 8, fontSize: 14, lineHeight: 1.55 }}>
            Sistemə daxil ola bilmək üçün zəhmət olmasa <strong>ExERP platform administratoru</strong> ilə əlaqə saxlayın — o, sizin şirkətinizi yaradıb hesabınızı əlaqələndirəcək.
          </p>
          <button onClick={signOut} style={{ ...btn, marginTop: 18 }}>Çıxış</button>
        </div>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={{ fontFamily: "Sora, sans-serif", margin: 0, fontSize: 22, color: "#064e3b" }}>
          İlk şirkətinizi yaradın
        </h1>
        <p style={{ color: "#5f7a70", marginTop: 6, fontSize: 14 }}>
          Salam, {user?.email}. Platform administratoru kimi ilk şirkətinizi yaradın — sonra əlavə şirkətləri "Şirkətlər" bölməsindən idarə edə bilərsiniz.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 16 }}>
          <input
            required
            placeholder="Şirkət adı"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(slugify(e.target.value));
            }}
            style={input}
          />
          <input
            placeholder="URL adı (slug)"
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            style={input}
          />
          <button disabled={busy || !name.trim()} type="submit" style={btn}>
            {busy ? "Yaradılır…" : "Yarat və davam et"}
          </button>
        </form>
        {error && <p style={{ color: "#b23a3a", marginTop: 12, fontSize: 13 }}>{error}</p>}
        <button onClick={signOut} style={link}>Çıxış</button>
      </div>
    </main>
  );
}


const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e0", fontFamily: "Manrope, system-ui" };
const card = { background: "#fff", padding: 28, borderRadius: 22, boxShadow: "0 18px 44px rgba(6,78,59,0.14)", width: "min(440px, 92vw)", border: "1px solid #e6dfc9" };
const input = { padding: "12px 14px", border: "1px solid #d4c9a3", borderRadius: 12, fontSize: 14, fontFamily: "inherit" };
const btn = { padding: "12px 14px", borderRadius: 12, background: "linear-gradient(135deg,#0d7a5f,#064e3b)", color: "#f5f0e0", border: 0, cursor: "pointer", fontWeight: 700, fontFamily: "Sora, sans-serif" };
const link = { background: "none", border: 0, color: "#5f7a70", cursor: "pointer", marginTop: 14, fontSize: 13, padding: 0 };
