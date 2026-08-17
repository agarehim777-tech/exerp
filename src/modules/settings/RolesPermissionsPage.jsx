import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { usePermissions } from "../../shared/hooks/usePermissions.js";
import { navItems } from "../../data.js";
import { normalizeUserModuleAccess } from "../../shared/lib/appDomain.jsx";

const ROLES = [
  { key: "owner", label: "Sahib", locked: true, hint: "Bütün icazələr avtomatik" },
  { key: "admin", label: "Admin" },
  { key: "member", label: "Üzv" },
  { key: "viewer", label: "Baxış" },
];

const MODULES = navItems.filter((n) => n.id !== "platform");

export default function RolesPermissionsPage({
  appUsers = [],
  appRoles = [],
  modulePermissionCatalog = [],
  onCreateAppUser,
  onUpdateAppUser,
  onUpdateAppUserStatus,
  onApplyDefaultPermissions,
  onChangeAppUserRole,
  onToggleAppUserModule,
  canOverrideUserPermissions = false,
  requiresPassword = false,
  canManageUsers = false,
}) {
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
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userDraft, setUserDraft] = useState({ name: "", email: "", password: "", role: appRoles[0]?.name || "Super Admin" });
  const [editDraft, setEditDraft] = useState({ name: "", email: "", role: "", status: "Aktiv" });

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

  const unifiedUsers = useMemo(() => {
    const normalizedEmail = (value) => String(value || "").trim().toLowerCase();
    const remoteEmails = new Set(members.map((member) => normalizedEmail(member.profiles?.email)).filter(Boolean));
    const appUsersByEmail = new Map(appUsers.map((user) => [normalizedEmail(user.email), user]));
    const remoteUsers = members.map((member) => ({
      id: `member-${member.id}`,
      memberId: member.id,
      userId: member.user_id,
      name: member.profiles?.full_name || "Ad qeyd edilməyib",
      email: member.profiles?.email || "—",
      role: member.role,
      source: "Supabase üzvü",
      status: "Aktiv",
      appUser: appUsersByEmail.get(normalizedEmail(member.profiles?.email)) || null,
    }));
    const localOnly = appUsers
      .filter((user) => !remoteEmails.has(normalizedEmail(user.email)))
      .map((user) => ({
        id: `app-${user.id}`,
        memberId: null,
        userId: user.id,
        name: user.name || "Ad qeyd edilməyib",
        email: user.email || "—",
        role: user.role || "member",
        source: "Tətbiq profili",
        status: user.status === "Bloklanıb" ? "Bloklanıb" : "Dəvət gözləyir",
        appUser: user,
      }));
    return [...remoteUsers, ...localOnly];
  }, [members, appUsers]);

  const selectedUser = unifiedUsers.find((user) => user.id === selectedUserId) || null;
  const selectedAppUser = selectedUser?.appUser || null;
  const selectedRole = appRoles.find((role) => role.name === selectedAppUser?.role);
  const selectedAccess = selectedAppUser
    ? normalizeUserModuleAccess(selectedAppUser, appRoles)
    : [];

  const roleLabel = (roleName) =>
    ROLES.find((role) => role.key === roleName)?.label ||
    appRoles.find((role) => role.name === roleName)?.name ||
    roleName || "—";

  const submitUser = async (event) => {
    event.preventDefault();
    if (!onCreateAppUser) return;
    await onCreateAppUser(userDraft);
    setUserDraft({ name: "", email: "", password: "", role: appRoles[0]?.name || "Super Admin" });
  };

  const openUserEditor = (user) => {
    setEditingUserId(user.id);
    setEditDraft({
      name: user.appUser?.name || user.name || "",
      email: user.appUser?.email || user.email || "",
      role: user.appUser?.role || user.role || appRoles[0]?.name || "",
      status: user.appUser?.status || user.status || "Aktiv",
    });
  };

  const saveUserEditor = async (event) => {
    event.preventDefault();
    const user = unifiedUsers.find((item) => item.id === editingUserId);
    if (!user?.appUser || !onUpdateAppUser) return;
    await onUpdateAppUser(user.appUser.id, editDraft);
    setEditingUserId(null);
  };

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
    if (!tenantId) { setMsg("Xəta: aktiv şirkət seçilməyib"); return; }
    setSaving(true); setMsg("");
    const { data, error } = await supabase.rpc("create_tenant_invite", {
      _tenant: tenantId,
      _email: inviteEmail.trim().toLowerCase(),
      _role: inviteRole,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error) setMsg("Xəta: " + error.message);
    else if (!row?.token) setMsg("Xəta: dəvət yaradıla bilmədi");
    else {
      const link = `${window.location.origin}/accept-invite?token=${row.token}`;
      await navigator.clipboard?.writeText(link).catch(() => {});
      setMsg(`Dəvət yaradıldı — link kopyalandı: ${link}`);
      setInviteEmail("");
    }
    await reload();
    setSaving(false);
  };

  const revokeInvite = async (id) => {
    setSaving(true);
    const { error } = await supabase.from("tenant_invites").delete().eq("id", id);
    if (error) setMsg("Xəta: " + error.message);
    await reload();
    setSaving(false);
  };

  const copyInviteLink = async (inviteId) => {
    const { data, error } = await supabase.rpc("get_tenant_invite_token", { _invite: inviteId });
    if (error || !data) { setMsg("Xəta: link alına bilmədi"); return; }
    const link = `${window.location.origin}/accept-invite?token=${data}`;
    await navigator.clipboard?.writeText(link).catch(() => {});
    setMsg("Link kopyalandı: " + link);
  };




  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={card}>
        <div style={sectionHeader}>
          <div>
            <h2 style={{ margin: 0, marginBottom: 4 }}>Yeni istifadəçi yarat</h2>
            <p style={{ margin: 0, color: "#6b7a72", fontSize: 13 }}>
              Anbardar, satıcı, satınalma və maliyyə əməkdaşını yaradıb uyğun sistem rolunu seçin.
            </p>
          </div>
          <button
            type="button"
            disabled={!canManageUsers || !onApplyDefaultPermissions}
            onClick={() => window.confirm("Bütün istifadəçilərin fərdi icazələri rol üzrə başlanğıc vəziyyətə qaytarılacaq. Davam edilsin?") && onApplyDefaultPermissions?.()}
            style={secondaryButton}
          >
            Başlanğıc icazələri qur
          </button>
        </div>
        <form onSubmit={submitUser} style={userForm}>
          <label style={fieldLabel}><span>Ad Soyad</span><input required value={userDraft.name} onChange={(e) => setUserDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Ad Soyad" style={input} /></label>
          <label style={fieldLabel}><span>E-poçt</span><input required type="email" value={userDraft.email} onChange={(e) => setUserDraft((v) => ({ ...v, email: e.target.value }))} placeholder="user@sirket.az" style={input} /></label>
          {requiresPassword && <label style={fieldLabel}><span>İlkin parol</span><input required minLength={8} type="password" value={userDraft.password} onChange={(e) => setUserDraft((v) => ({ ...v, password: e.target.value }))} placeholder="Minimum 8 simvol" style={input} /></label>}
          <label style={fieldLabel}><span>Rol</span><select value={userDraft.role} onChange={(e) => setUserDraft((v) => ({ ...v, role: e.target.value }))} style={input}>{appRoles.map((role) => <option key={role.name} value={role.name}>{role.name}</option>)}</select></label>
          <button type="submit" disabled={!canManageUsers || saving} style={primaryButton}>İstifadəçi yarat</button>
        </form>
      </div>

      <div style={overviewCard}>
        <div style={overviewItem}>
          <span style={overviewLabel}>İstifadəçilər</span>
          <strong style={overviewValue}>{unifiedUsers.length}</strong>
        </div>
        <div style={overviewItem}>
          <span style={overviewLabel}>Rollar</span>
          <strong style={overviewValue}>{ROLES.length}</strong>
        </div>
        <div style={overviewItem}>
          <span style={overviewLabel}>Aktiv dəvətlər</span>
          <strong style={overviewValue}>{invites.length}</strong>
        </div>
        <div style={overviewItem}>
          <span style={overviewLabel}>Permission qeydləri</span>
          <strong style={overviewValue}>{rows.length}</strong>
        </div>
      </div>

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
        <h2 style={{ margin: 0, marginBottom: 4 }}>İstifadəçilər</h2>
        <p style={{ margin: "0 0 12px", color: "#6b7a72", fontSize: 13 }}>
          Cari şirkət: <b>{activeMembership?.tenants?.name || "—"}</b> · Tətbiq profilləri və Supabase üzvləri vahid siyahıda göstərilir.
        </p>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>İstifadəçi</th>
              <th style={th}>E-poçt</th>
              <th style={th}>Rol</th>
              <th style={th}>Mənbə</th>
              <th style={th}>Status</th>
              <th style={th}>Əməliyyat</th>
            </tr>
          </thead>
          <tbody>
            {unifiedUsers.length === 0 && (
              <tr><td style={td} colSpan={6}><i style={{ color: "#8a9a92" }}>İstifadəçi yoxdur</i></td></tr>
            )}
            {unifiedUsers.map((user) => (
              <tr key={user.id}>
                <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{user.name}</td>
                <td style={{ ...td, textAlign: "left" }}>{user.email}</td>
                <td style={td}>
                  {user.memberId ? (
                    <select
                      value={user.role}
                      disabled={saving || user.userId === activeMembership?.user_id}
                      onChange={(event) => changeRole(user.memberId, event.target.value)}
                      style={select}
                    >
                      {ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                    </select>
                  ) : (
                    <select
                      value={user.role}
                      disabled={saving || !onChangeAppUserRole}
                      onChange={(event) => onChangeAppUserRole?.(user.userId, event.target.value)}
                      style={select}
                    >
                      {appRoles.map((role) => <option key={role.name} value={role.name}>{role.name}</option>)}
                    </select>
                  )}
                </td>
                <td style={td}>{user.source}</td>
                <td style={td}><span style={user.status === "Aktiv" ? activeBadge : pendingBadge}>{user.status}</span></td>
                <td style={td}><div style={actionGroup}>
                  <button type="button" disabled={!user.appUser || !canManageUsers} onClick={() => openUserEditor(user)} style={user.appUser ? editButton : disabledPermissionButton}>Redaktə et</button>
                  <button
                    type="button"
                    disabled={!user.appUser || user.appUser.role === "Super Admin"}
                    onClick={() => setSelectedUserId((current) => current === user.id ? null : user.id)}
                    style={user.appUser ? permissionButton : disabledPermissionButton}
                    title={!user.appUser ? "Bu üzv üçün tətbiq profili yaradılmalıdır" : "Modul icazələrini idarə et"}
                  >
                    {selectedUserId === user.id ? "Bağla" : "İdarə et"}
                  </button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>

        {selectedUser && (
          <div style={permissionPanel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <strong>{selectedUser.name}</strong>
                <div style={{ color: "#6b7a72", fontSize: 12 }}>{selectedUser.email} · {selectedAppUser?.role}</div>
              </div>
              <span style={permissionCount}>{selectedAccess.length}/{modulePermissionCatalog.length} aktiv modul</span>
            </div>
            <div style={permissionGrid}>
              {modulePermissionCatalog.map((module) => {
                const checked = selectedAccess.includes(module.id);
                const roleAllows = (selectedRole?.permissions || []).includes(module.permission);
                const editable = Boolean(onToggleAppUserModule) && (roleAllows || canOverrideUserPermissions);
                return (
                  <label key={module.id} style={editable ? permissionOption : disabledPermissionOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!editable || saving}
                      onChange={() => onToggleAppUserModule?.(selectedAppUser.id, module.id)}
                    />
                    <span>{module.label}</span>
                  </label>
                );
              })}
            </div>
            {canOverrideUserPermissions && (
              <p style={{ margin: "12px 0 0", color: "#6b7a72", fontSize: 11 }}>
                Super Admin rol limitindən kənar fərdi icazəni də aktiv və ya deaktiv edə bilər.
              </p>
            )}
          </div>
        )}

        {editingUserId && (
          <form onSubmit={saveUserEditor} style={editPanel}>
            <div style={editHeader}><strong>İstifadəçini redaktə et</strong><button type="button" onClick={() => setEditingUserId(null)} style={closeButton}>Bağla</button></div>
            <div style={userForm}>
              <label style={fieldLabel}><span>Ad Soyad</span><input required value={editDraft.name} onChange={(e) => setEditDraft((v) => ({ ...v, name: e.target.value }))} style={input} /></label>
              <label style={fieldLabel}><span>E-poçt</span><input required type="email" value={editDraft.email} onChange={(e) => setEditDraft((v) => ({ ...v, email: e.target.value }))} style={input} /></label>
              <label style={fieldLabel}><span>Rol</span><select value={editDraft.role} onChange={(e) => setEditDraft((v) => ({ ...v, role: e.target.value }))} style={input}>{appRoles.map((role) => <option key={role.name} value={role.name}>{role.name}</option>)}</select></label>
              <label style={fieldLabel}><span>Status</span><select value={editDraft.status} onChange={(e) => setEditDraft((v) => ({ ...v, status: e.target.value }))} style={input}><option>Aktiv</option><option>Bloklanıb</option></select></label>
              <button type="submit" style={primaryButton}>Dəyişiklikləri saxla</button>
            </div>
          </form>
        )}
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
                <td style={td}><button onClick={() => copyInviteLink(inv.id)} style={{ background: "#f0e6c8", border: 0, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Kopyala</button></td>
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
const overviewCard = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 1, overflow: "hidden", background: "#e6dfc9", border: "1px solid #e6dfc9", borderRadius: 8 };
const overviewItem = { padding: "14px 16px", background: "#fff" };
const overviewLabel = { display: "block", color: "#6b7a72", fontSize: 11, marginBottom: 5 };
const overviewValue = { display: "block", color: "#123c31", fontSize: 22 };
const activeBadge = { display: "inline-flex", padding: "4px 8px", borderRadius: 6, background: "#e7f6ef", color: "#147052", fontSize: 11, fontWeight: 700 };
const pendingBadge = { display: "inline-flex", padding: "4px 8px", borderRadius: 6, background: "#fff5d8", color: "#8a6517", fontSize: 11, fontWeight: 700 };
const permissionButton = { border: "1px solid #b8cfc5", background: "#f4faf7", color: "#075e49", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" };
const disabledPermissionButton = { ...permissionButton, opacity: 0.45, cursor: "not-allowed" };
const permissionPanel = { marginTop: 16, borderTop: "1px solid #e6dfc9", paddingTop: 16 };
const permissionGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 };
const permissionOption = { display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "7px 10px", border: "1px solid #dbe8e2", borderRadius: 6, background: "#fbfdfc", color: "#28483e", fontSize: 12, cursor: "pointer" };
const disabledPermissionOption = { ...permissionOption, opacity: 0.48, cursor: "not-allowed" };
const permissionCount = { whiteSpace: "nowrap", padding: "5px 8px", borderRadius: 6, background: "#edf6f1", color: "#17634d", fontSize: 11, fontWeight: 700 };
const userForm = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, alignItems: "end" };
const fieldLabel = { display: "grid", gap: 6, color: "#526b62", fontSize: 12, fontWeight: 600 };
const input = { width: "100%", minHeight: 40, padding: "8px 10px", borderRadius: 8, border: "1px solid #d4c9a3", background: "#fff", boxSizing: "border-box" };
const primaryButton = { minHeight: 40, border: 0, borderRadius: 8, padding: "8px 16px", background: "#08785c", color: "#fff", fontWeight: 700, cursor: "pointer" };
const actionGroup = { display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6 };
const editButton = { ...permissionButton, background: "#fff" };
const editPanel = { ...permissionPanel, padding: 16, border: "1px solid #dbe8e2", borderRadius: 10, background: "#f8fbf9" };
const editHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 };
const closeButton = { border: 0, background: "transparent", color: "#6b7a72", cursor: "pointer" };
const sectionHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14, flexWrap: "wrap" };
const secondaryButton = { minHeight: 38, border: "1px solid #08785c", borderRadius: 8, padding: "8px 14px", background: "#fff", color: "#08785c", fontWeight: 700, cursor: "pointer" };
