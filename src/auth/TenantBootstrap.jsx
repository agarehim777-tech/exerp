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
  const { user, refresh, signOut } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const finalSlug = (slug || slugify(name) || `sirket-${Date.now().toString(36)}`).slice(0, 48);
    const { error } = await supabase.rpc("create_tenant", { _name: name.trim(), _slug: finalSlug });
    setBusy(false);
    if (error) {
      logger.error("create_tenant failed", { message: error.message });
      setError(error.message);
      return;
    }
    await refresh();
  }

  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={{ fontFamily: "Sora, sans-serif", margin: 0, fontSize: 22, color: "#064e3b" }}>
          Şirkətinizi yaradın
        </h1>
        <p style={{ color: "#5f7a70", marginTop: 6, fontSize: 14 }}>
          Salam, {user?.email}. Davam etmək üçün ilk şirkətinizi yaradın — siz onun sahibi (owner) olacaqsınız.
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
