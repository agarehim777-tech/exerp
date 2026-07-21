import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

function Pill({ ok, label }) {
  const bg = ok === null ? "#e5e7eb" : ok ? "#dcfce7" : "#fee2e2";
  const fg = ok === null ? "#374151" : ok ? "#166534" : "#991b1b";
  return (
    <span style={{ background: bg, color: fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      {ok === null ? "—" : ok ? "✓" : "✗"} {label}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #e5e7eb", fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontFamily: "ui-monospace, monospace", color: "#111827" }}>{String(value ?? "—")}</span>
    </div>
  );
}

export default function AccessCheckPage() {
  const { user } = useAuth();
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [projectCheck, setProjectCheck] = useState(null);
  const [projectError, setProjectError] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [myProjects, setMyProjects] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("check_my_access");
    if (error) setError(error.message);
    else setAccess(data);
    setLoading(false);
  }, []);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name, user_id, status")
      .order("created_at", { ascending: false })
      .limit(10);
    setMyProjects(data || []);
  }, []);

  useEffect(() => {
    load();
    loadProjects();
  }, [load, loadProjects]);

  const runProjectCheck = useCallback(async (id) => {
    if (!id) return;
    setProjectLoading(true);
    setProjectError(null);
    setProjectCheck(null);
    const { data, error } = await supabase.rpc("check_project_access", { _project: id });
    if (error) setProjectError(error.message);
    else setProjectCheck(data);
    setProjectLoading(false);
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>İcazə diaqnostikası</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
          Cari istifadəçinin tenant admin və layihə sahibi icazələrini real-time yoxlayın.
        </p>
      </div>

      {/* ---------- My access ---------- */}
      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Mənim icazələrim</h2>
          <button
            onClick={load}
            disabled={loading}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f9fafb", fontSize: 13, cursor: "pointer" }}
          >
            {loading ? "Yoxlanılır…" : "Yenilə"}
          </button>
        </div>

        {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 10 }}>Xəta: {error}</div>}

        {access && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <Pill ok={!!access.authenticated} label="Autentifikasiya" />
              <Pill ok={!!access.is_tenant_member} label="Tenant üzvü" />
              <Pill ok={!!access.is_tenant_admin} label="Tenant admin" />
              <Pill ok={!!access.is_platform_admin} label="Platform admin" />
            </div>
            <Row label="User ID" value={access.user_id} />
            <Row label="Aktiv tenant" value={access.active_tenant_id} />
            <Row label="Rol" value={access.role} />
            <Row label="Aktiv modullar" value={(access.enabled_modules || []).join(", ") || "(hamısı)"} />

            {Array.isArray(access.role_permissions) && access.role_permissions.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Rol icazə matrisi</div>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Modul</th>
                      <th style={{ padding: "6px 8px" }}>Baxış</th>
                      <th style={{ padding: "6px 8px" }}>Redaktə</th>
                    </tr>
                  </thead>
                  <tbody>
                    {access.role_permissions.map((p) => (
                      <tr key={p.module} style={{ borderTop: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace" }}>{p.module}</td>
                        <td style={{ padding: "6px 8px" }}><Pill ok={!!p.can_view} label={p.can_view ? "bəli" : "xeyr"} /></td>
                        <td style={{ padding: "6px 8px" }}><Pill ok={!!p.can_edit} label={p.can_edit ? "bəli" : "xeyr"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------- Project access ---------- */}
      <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>Layihə sahibi yoxlaması</h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Layihə UUID"
            style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontFamily: "ui-monospace, monospace" }}
          />
          <button
            onClick={() => runProjectCheck(projectId)}
            disabled={!projectId || projectLoading}
            style={{ padding: "8px 14px", borderRadius: 8, border: 0, background: "#111827", color: "#fff", fontSize: 13, cursor: "pointer" }}
          >
            {projectLoading ? "…" : "Yoxla"}
          </button>
        </div>

        {myProjects.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Sürətli seçim (son layihələr):</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {myProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProjectId(p.id); runProjectCheck(p.id); }}
                  style={{ padding: "4px 10px", fontSize: 12, borderRadius: 999, border: "1px solid #d1d5db", background: p.user_id === user?.id ? "#ecfdf5" : "#f9fafb", cursor: "pointer" }}
                  title={p.user_id === user?.id ? "Sizin layihəniz" : "Başqasının layihəsi"}
                >
                  {p.name || p.id.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        )}

        {projectError && <div style={{ color: "#991b1b", fontSize: 13 }}>Xəta: {projectError}</div>}

        {projectCheck && projectCheck.found === false && (
          <div style={{ color: "#991b1b", fontSize: 13 }}>Layihə tapılmadı və ya sizin görmə icazəniz yoxdur.</div>
        )}

        {projectCheck && projectCheck.found && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Pill ok={!!projectCheck.is_owner} label="Sahib" />
              <Pill ok={!!projectCheck.is_tenant_member} label="Tenant üzvü" />
              <Pill ok={!!projectCheck.is_tenant_admin} label="Tenant admin" />
              <Pill ok={!!projectCheck.can_view} label="Baxa bilər" />
              <Pill ok={!!projectCheck.can_edit} label="Redaktə edə bilər" />
            </div>
            <Row label="Layihə" value={projectCheck.name} />
            <Row label="Status" value={projectCheck.status} />
            <Row label="Tenant" value={projectCheck.tenant_id} />
            <Row label="Sahib user_id" value={projectCheck.owner_user_id} />
          </>
        )}
      </section>
    </div>
  );
}
