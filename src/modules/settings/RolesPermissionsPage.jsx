import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { navItems } from "../../data.js";

const ROLES = [
  { key: "owner", label: "Sahib", locked: true, hint: "Bütün icazələr avtomatik" },
  { key: "admin", label: "Admin" },
  { key: "member", label: "Üzv" },
  { key: "viewer", label: "Baxış" },
];

const MODULES = navItems.filter((n) => n.id !== "platform");

export default function RolesPermissionsPage() {
  const { activeMembership } = useAuth();
  const { isAdmin, role: currentRole } = usePermissions();
  const tenantId = activeMembership?.tenant_id;
  const [rows, setRows] = useState([]);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const reload = async () => {
    setLoading(true);
    const [{ data: perms }, { data: mems }, { data: invs }] = await Promise.all([
      supabase.from("role_permissions").select("*"),
      tenantId
        ? supabase.from("tenant_members")
            .select("id, user_id, role, profiles:user_id(email, full_name)")
            .eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] }),
      tenantId
        ? supabase.from("tenant_invites")
            .select("id, tenant_id, email, role, invited_by, accepted_at, expires_at, created_at")
            .eq("tenant_id", tenantId).is("accepted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    setRows(perms || []);
    setMembers(mems || []);
    setInvites(invs || []);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [tenantId]);

  const matrix = useMemo(() => {
    const m = {};
    for (const r of rows) {
      m[r.role] = m[r.role] || {};
      m[r.role][r.module] = { view: r.can_view, edit: r.can_edit };
    }
    return m;
  }, [rows]);

  if (!isAdmin) {
    return (
      <div style={card}>
        <h2 style={{ margin: 0 }}>İcazə yoxdur</h2>
        <p style={{ color: "#6b7a72" }}>Bu səhifə yalnız Sahib və Admin üçündür. Cari rol: <b>{currentRole || "—"}</b></p>
      </div>
    );
  }

  const toggle = async (role, module, field) => {
    if (role === "owner") return;
    setSaving(true); setMsg("");
    const cur = matrix[role]?.[module] || { view: false, edit: false };
    const next = { ...cur, [field]: !cur[field] };
    if (field === "view" && !next.view) next.edit = false;
    if (field === "edit" && next.edit) next.view = true;
    const { error } = await supabase
      .from("role_permissions")
      .upsert({ role, module, can_view: next.view, can_edit: next.edit }, { onConflict: "role,module" });
    if (error) setMsg("Xəta: " + error.message);
    await reload();
    setSaving(false);
  };

  const changeRole = async (memberId, newRole) => {
    setSaving(true); setMsg("");
    const { error } = await supabase.from("tenant_members").update({ role: newRole }).eq("id", memberId);
    if (error) setMsg("Xəta: " + error.message);
    await reload();
    setSaving(false);
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSaving(true); setMsg("");
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("tenant_invites")
      .insert({ tenant_id: tenantId, email: inviteEmail.trim().toLowerCase(), role: inviteRole, invited_by: user.id })
      .select().single();
    if (error) setMsg("Xəta: " + error.message);
    else {
      const link = `${window.location.origin}/accept-invite?token=${data.token}`;
      await navigator.clipboard?.writeText(link).catch(() => {});
      setMsg(`Dəvət yaradıldı — link kopyalandı: ${link}`);
      setInviteEmail("");
    }
    await reload();
    setSaving(false);
  };

  const revokeInvite = async (id) => {
    setSaving(true);
    await supabase.from("tenant_invites").delete().eq("id", id);
    await reload();
    setSaving(false);
  };

  const copyInviteLink = async (token) => {
    const link = `${window.location.origin}/accept-invite?token=${token}`;
    await navigator.clipboard?.writeText(link);
    setMsg("Link kopyalandı: " + link);
  };



  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Rollar və İcazələr</h2>
            <p style={{ margin: "4px 0 0", color: "#6b7a72", fontSize: 13 }}>
              Hər rol üçün modul səviyyəsində Baxış / Redaktə icazələrini idarə et
            </p>
          </div>
          {saving && <span style={{ fontSize: 12, color: "#8a6a1e" }}>Saxlanılır…</span>}
        </div>
        {msg && <div style={{ background: "#fdecea", color: "#8b1e1e", padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{msg}</div>}
        {loading ? <div>Yüklənir…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Modul</th>
                  {ROLES.map((r) => (
                    <th key={r.key} style={th} colSpan={2}>
                      {r.label}
                      {r.locked && <span style={lockBadge}>kilidli</span>}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th style={{ ...th, background: "#f7f3e4" }}></th>
                  {ROLES.map((r) => (
                    <>
                      <th key={r.key + "v"} style={subTh}>Baxış</th>
                      <th key={r.key + "e"} style={subTh}>Redaktə</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((mod) => (
                  <tr key={mod.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{mod.label}<div style={{ fontSize: 10, color: "#8a9a92" }}>{mod.id}</div></td>
                    {ROLES.map((r) => {
                      const cell = matrix[r.key]?.[mod.id] || { view: r.key === "owner", edit: r.key === "owner" };
                      const locked = r.locked;
                      return (
                        <>
                          <td key={r.key + mod.id + "v"} style={td}>
                            <input type="checkbox" checked={!!cell.view || locked} disabled={locked || saving}
                              onChange={() => toggle(r.key, mod.id, "view")} />
                          </td>
                          <td key={r.key + mod.id + "e"} style={td}>
                            <input type="checkbox" checked={!!cell.edit || locked} disabled={locked || saving}
                              onChange={() => toggle(r.key, mod.id, "edit")} />
                          </td>
                        </>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, marginBottom: 4 }}>Şirkət üzvləri</h2>
        <p style={{ margin: "0 0 12px", color: "#6b7a72", fontSize: 13 }}>
          Cari şirkət: <b>{activeMembership?.tenants?.name || "—"}</b>
        </p>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>İstifadəçi</th>
              <th style={th}>E-poçt</th>
              <th style={th}>Rol</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr><td style={td} colSpan={3}><i style={{ color: "#8a9a92" }}>Üzv yoxdur</i></td></tr>
            )}
            {members.map((m) => (
              <tr key={m.id}>
                <td style={td}>{m.profiles?.full_name || "—"}</td>
                <td style={td}>{m.profiles?.email || "—"}</td>
                <td style={td}>
                  <select
                    value={m.role}
                    disabled={saving || m.user_id === activeMembership?.user_id}
                    onChange={(e) => changeRole(m.id, e.target.value)}
                    style={select}
                  >
                    {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h2 style={{ margin: 0, marginBottom: 4 }}>Üzv dəvətləri</h2>
        <p style={{ margin: "0 0 12px", color: "#6b7a72", fontSize: 13 }}>
          E-poçt daxil edin, sistem dəvət linki yaradacaq — həmin şəxs qeydiyyatdan keçib linkə keçəndə şirkətə əlavə olunacaq
        </p>
        <form onSubmit={sendInvite} style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 8, marginBottom: 12 }}>
          <input type="email" required placeholder="user@example.com" value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d4c9a3" }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={select}>
            {ROLES.filter((r) => !r.locked).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <button type="submit" disabled={saving} style={{ background: "#064e3b", color: "#fbe89a", border: 0, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Dəvət et</button>
        </form>
        <table style={table}>
          <thead>
            <tr><th style={th}>E-poçt</th><th style={th}>Rol</th><th style={th}>Bitir</th><th style={th}>Link</th><th style={th}></th></tr>
          </thead>
          <tbody>
            {invites.length === 0 && <tr><td style={td} colSpan={5}><i style={{ color: "#8a9a92" }}>Aktiv dəvət yoxdur</i></td></tr>}
            {invites.map((inv) => (
              <tr key={inv.id}>
                <td style={{ ...td, textAlign: "left" }}>{inv.email}</td>
                <td style={td}>{ROLES.find((r) => r.key === inv.role)?.label || inv.role}</td>
                <td style={td}>{new Date(inv.expires_at).toLocaleDateString("az-AZ")}</td>
                <td style={td}><button onClick={() => copyInviteLink(inv.token)} style={{ background: "#f0e6c8", border: 0, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Kopyala</button></td>
                <td style={td}><button onClick={() => confirm("Ləğv edilsin?") && revokeInvite(inv.id)} style={{ background: "none", color: "#b23a3a", border: "1px solid #e6c8c8", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Ləğv et</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card = { background: "#fff", border: "1px solid #e6dfc9", borderRadius: 12, padding: 20, boxShadow: "0 4px 18px rgba(6,78,59,0.06)" };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "8px 10px", background: "#f0e6c8", color: "#5a4a1e", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #e6dfc9" };
const subTh = { textAlign: "center", padding: "4px 6px", background: "#faf5e2", color: "#8a6a1e", fontSize: 10, borderBottom: "1px solid #e6dfc9", fontWeight: 500 };
const td = { padding: "8px 10px", borderBottom: "1px solid #f0ecdb", verticalAlign: "middle", textAlign: "center" };
const select = { padding: "4px 8px", borderRadius: 6, border: "1px solid #d4c9a3", background: "#fff", fontSize: 13 };
const lockBadge = { fontSize: 9, background: "#064e3b", color: "#fbe89a", padding: "1px 5px", borderRadius: 4, marginLeft: 6, verticalAlign: "middle" };
