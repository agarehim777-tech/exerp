import React, { useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { supabase } from "../integrations/supabase/client";
import { appAlert, appConfirm } from "../shared/ui/dialogService.js";

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
      appAlert("Aktiv şirkəti silmək olmaz. Əvvəl başqasına keçin.");
      return;
    }
    if (!(await appConfirm("Bu şirkəti silmək istədiyinizə əminsiniz?", { danger: true }))) return;
    setBusy(id);
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    setBusy(null);
    if (error) return appAlert(error.message);
    await refresh();
  }

  if (!memberships.length) return null;

  return (
    <div className="u-position-fixed u-bottom-16px u-right-16px u-z-index-40 u-font-family-Manrope_system_ui">
      <button onClick={() => setOpen(!open)} className="tenant-switcher-btn">
        🏢 {active?.tenants?.name || "Şirkət"}
        {active?.role && <span className="tenant-switcher-role-badge">{roleLabel(active.role)}</span>}
        <span className="u-margin-left-4px">▾</span>
      </button>
      {open && (
        <div className="tenant-switcher-panel">
          <div className="u-font-size-11px u-color-5f7a70 u-padding-6px_10px u-text-transform-uppercase u-letter-spacing-0_5px">
            Şirkətləriniz ({memberships.length})
          </div>
          {memberships.map((m) => {
            const isActive = m.tenant_id === activeTenantId;
            return (
              <div key={m.id} className={`tenant-switcher-row ${isActive ? "sx-623d0b0" : "sx-1eb2246"}`}>
                <button
                  onClick={() => !isActive && switchTo(m.tenant_id)}
                  disabled={isActive || busy === m.tenant_id}
                  className={`tenant-switcher-row-btn ${isActive ? "sx-83e4487" : "sx-1e29eef"} ${isActive ? "sx-7c2de19" : "sx-4c30a91"}`}
 >
                  {isActive ? "✓ " : ""}{m.tenants?.name}
                  <span className="u-color-8a9a92 u-font-size-11px u-margin-left-6px">/{m.tenants?.slug}</span>
                  <span className="tenant-switcher-inline-role-badge">{roleLabel(m.role)}</span>
                </button>
                {m.role === "owner" && !isActive && (
                  <button onClick={() => remove(m.tenant_id)} disabled={busy === m.tenant_id} className="tenant-switcher-del-btn" title="Sil">
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


function roleLabel(role) {
  const map = { owner: "Sahib", admin: "Admin", member: "Üzv", viewer: "Baxış" };
  return map[role] || role;
}
