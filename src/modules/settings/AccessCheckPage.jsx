import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../auth/AuthProvider.jsx";

function Pill({ ok, label }) {
  const bg = ok === null ? "#e5e7eb" : ok ? "#dcfce7" : "#fee2e2";
  const fg = ok === null ? "#374151" : ok ? "#166534" : "#991b1b";
  return (
    <span className="sx-f456d36 sx-1eb7905 sx-6b9c179 sx-e634e6d" style={{ background: bg, color: fg }}>
      {ok === null ? "—" : ok ? "✓" : "✗"} {label}
    </span>
  );
}

function Row({ label, value }) {
  return (
    <div className="u-display-flex u-justify-content-space_between u-padding-6px_0 u-border-bottom-1px_dashed_e5e7eb u-font-size-13px">
      <span className="u-color-6b7280">{label}</span>
      <span className="u-font-family-ui_monospace_monospace u-color-111827">{String(value ?? "—")}</span>
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
    <div className="u-padding-24px u-max-width-960px u-margin-0_auto">
      <div className="u-margin-bottom-20px">
        <h1 className="u-font-size-22px u-font-weight-700 u-margin-0">İcazə diaqnostikası</h1>
        <p className="u-color-6b7280 u-font-size-14px u-margin-top-4px">
          Cari istifadəçinin tenant admin və layihə sahibi icazələrini real-time yoxlayın.
        </p>
      </div>

      {/* ---------- My access ---------- */}
      <section className="u-background-surface u-border-1px_solid_e5e7eb u-border-radius-12px u-padding-20px u-margin-bottom-20px">
        <div className="u-display-flex u-justify-content-space_between u-align-items-center u-margin-bottom-12px">
          <h2 className="u-font-size-16px u-font-weight-600 u-margin-0">Mənim icazələrim</h2>
          <button
            onClick={load}
            disabled={loading}
 className="u-padding-6px_12px u-border-radius-8px u-border-1px_solid_d1d5db u-background-f9fafb u-font-size-13px u-cursor-pointer"
 >
            {loading ? "Yoxlanılır…" : "Yenilə"}
          </button>
        </div>

        {error && <div className="u-color-991b1b u-font-size-13px u-margin-bottom-10px">Xəta: {error}</div>}

        {access && (
          <>
            <div className="u-display-flex u-gap-8px u-flex-wrap-wrap u-margin-bottom-14px">
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
              <div className="u-margin-top-16px">
                <div className="u-font-size-13px u-font-weight-600 u-margin-bottom-6px">Rol icazə matrisi</div>
                <table className="u-width-100 u-font-size-12px u-border-collapse-collapse">
                  <thead>
                    <tr className="u-background-f9fafb u-text-align-left">
                      <th className="u-padding-6px_8px">Modul</th>
                      <th className="u-padding-6px_8px">Baxış</th>
                      <th className="u-padding-6px_8px">Redaktə</th>
                    </tr>
                  </thead>
                  <tbody>
                    {access.role_permissions.map((p) => (
                      <tr key={p.module} className="u-border-top-1px_solid_f3f4f6">
                        <td className="u-padding-6px_8px u-font-family-ui_monospace_monospace">{p.module}</td>
                        <td className="u-padding-6px_8px"><Pill ok={!!p.can_view} label={p.can_view ? "bəli" : "xeyr"} /></td>
                        <td className="u-padding-6px_8px"><Pill ok={!!p.can_edit} label={p.can_edit ? "bəli" : "xeyr"} /></td>
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
      <section className="u-background-surface u-border-1px_solid_e5e7eb u-border-radius-12px u-padding-20px">
        <h2 className="u-font-size-16px u-font-weight-600 u-margin-0 u-margin-bottom-12px">Layihə sahibi yoxlaması</h2>

        <div className="u-display-flex u-gap-8px u-margin-bottom-12px">
          <input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Layihə UUID"
 className="u-flex-1 u-padding-8px_10px u-border-1px_solid_d1d5db u-border-radius-8px u-font-size-13px u-font-family-ui_monospace_monospace"
 />
          <button
            onClick={() => runProjectCheck(projectId)}
            disabled={!projectId || projectLoading}
 className="u-padding-8px_14px u-border-radius-8px u-border-0 u-background-111827 u-color-surface u-font-size-13px u-cursor-pointer"
 >
            {projectLoading ? "…" : "Yoxla"}
          </button>
        </div>

        {myProjects.length > 0 && (
          <div className="u-margin-bottom-12px">
            <div className="u-font-size-12px u-color-6b7280 u-margin-bottom-6px">Sürətli seçim (son layihələr):</div>
            <div className="u-display-flex u-gap-6px u-flex-wrap-wrap">
              {myProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setProjectId(p.id); runProjectCheck(p.id); }}
                  className={`sx-cd22087 sx-6b9c179 sx-1eb7905 sx-006d15c ${p.user_id === user?.id ? "sx-e016922" : "sx-98f358a"} sx-b202c6d`}
                  title={p.user_id === user?.id ? "Sizin layihəniz" : "Başqasının layihəsi"}
 >
                  {p.name || p.id.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        )}

        {projectError && <div className="u-color-991b1b u-font-size-13px">Xəta: {projectError}</div>}

        {projectCheck && projectCheck.found === false && (
          <div className="u-color-991b1b u-font-size-13px">Layihə tapılmadı və ya sizin görmə icazəniz yoxdur.</div>
        )}

        {projectCheck && projectCheck.found && (
          <>
            <div className="u-display-flex u-gap-8px u-flex-wrap-wrap u-margin-bottom-12px">
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
