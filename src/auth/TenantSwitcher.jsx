import React, { useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { supabase } from "../integrations/supabase/client";

export default function TenantSwitcher() {
  const { memberships, activeTenantId, setActiveTenant, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const active = memberships.find((m) => m.tenant_id === activeTenantId);

  async function switchTo(id) {
    setBusy(id);
    await setActiveTenant(id);
    setBusy(null);
    setOpen(false);
  }

  async function remove(id) {
    if (id === activeTenantId) {
      alert("Aktiv şirkəti silmək olmaz. Əvvəl başqasına keçin.");
      return;
    }
    if (!confirm("Bu şirkəti silmək istədiyinizə əminsiniz?")) return;
    setBusy(id);
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    setBusy(null);
    if (error) return alert(error.message);
    await refresh();
  }

  if (!memberships.length) return null;

  return (
    <div style={{ position: "fixed", top: 14, right: 16, zIndex: 40, fontFamily: "Manrope, system-ui" }}>
      <button onClick={() => setOpen(!open)} style={btn}>
        🏢 {active?.tenants?.name || "Şirkət"}
        {active?.role && <span style={roleBadge}>{roleLabel(active.role)}</span>}
        <span style={{ marginLeft: 4 }}>▾</span>
      </button>
      {open && (
        <div style={panel}>
          <div style={{ fontSize: 11, color: "#5f7a70", padding: "6px 10px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Şirkətləriniz ({memberships.length})
          </div>
          {memberships.map((m) => {
            const isActive = m.tenant_id === activeTenantId;
            return (
              <div key={m.id} style={{ ...row, background: isActive ? "#e6f4ef" : "transparent" }}>
                <button
                  onClick={() => !isActive && switchTo(m.tenant_id)}
                  disabled={isActive || busy === m.tenant_id}
                  style={{ ...rowBtn, fontWeight: isActive ? 700 : 500, color: isActive ? "#064e3b" : "#0f2a20" }}
                >
                  {isActive ? "✓ " : ""}{m.tenants?.name}
                  <span style={{ color: "#8a9a92", fontSize: 11, marginLeft: 6 }}>/{m.tenants?.slug}</span>
                  <span style={inlineRoleBadge}>{roleLabel(m.role)}</span>
                </button>
                {m.role === "owner" && !isActive && (
                  <button onClick={() => remove(m.tenant_id)} disabled={busy === m.tenant_id} style={delBtn} title="Sil">
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btn = { background: "#fff", border: "1px solid #d4c9a3", borderRadius: 10, padding: "6px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#064e3b", boxShadow: "0 4px 14px rgba(6,78,59,0.12)", display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const panel = { position: "absolute", top: 38, right: 0, background: "#fff", border: "1px solid #e6dfc9", borderRadius: 12, minWidth: 260, boxShadow: "0 18px 44px rgba(6,78,59,0.18)", padding: "6px 0", maxHeight: 400, overflowY: "auto" };
const row = { display: "flex", alignItems: "center", padding: "0 4px" };
const rowBtn = { flex: 1, background: "none", border: 0, textAlign: "left", padding: "8px 10px", cursor: "pointer", fontSize: 13, borderRadius: 6 };
const delBtn = { background: "none", border: 0, color: "#b23a3a", cursor: "pointer", padding: "6px 10px", fontSize: 14, borderRadius: 6 };
const roleBadge = { background: "#064e3b", color: "#fbe89a", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6, letterSpacing: 0.5, textTransform: "uppercase" };
const inlineRoleBadge = { background: "#f0e6c8", color: "#5a4a1e", fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 5, marginLeft: 8, textTransform: "uppercase", letterSpacing: 0.4 };

function roleLabel(role) {
  const map = { owner: "Sahib", admin: "Admin", member: "Üzv", viewer: "Baxış" };
  return map[role] || role;
}
