import { Building2, CalendarClock, Pencil, ShieldCheck, Trash2, Users } from "lucide-react";
import { DataTable, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useCallback, useEffect, useState } from "react";
import { PLATFORM_MODULE_CHOICES, PLATFORM_PLANS, dayInMs, slugifyPlatform } from "../shared/lib/appDomain.jsx";
import { appConfirm } from "../shared/ui/dialogService.js";

const platformModuleIds = new Set(PLATFORM_MODULE_CHOICES.map((module) => module.id));
const normalizePlatformModules = (modules = []) => [...new Set(modules)].filter((id) => platformModuleIds.has(id));

export default function PlatformAdminPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState(null); // { email, password }
  const [editing, setEditing] = useState(null); // tenant obj or null
  const emptyForm = {
    name: "", slug: "", admin_email: "", max_users: 10,
    plan_name: "starter", expires_at: "", notes: "",
    modules: PLATFORM_MODULE_CHOICES.map((m) => m.id),
  };
  const [form, setForm] = useState(emptyForm);

  const checkAdmin = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    setIsAdmin(!!data);
    setChecked(true);
  }, [user?.id]);

  const refreshTenants = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc("platform_list_tenants");
    if (err) setError(err.message);
    else { setTenants(data || []); setError(""); }
    setLoading(false);
  }, []);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);
  useEffect(() => { if (isAdmin) refreshTenants(); }, [isAdmin, refreshTenants]);

  async function bootstrap() {
    setBusy(true);
    const { error: err } = await supabase.rpc("platform_bootstrap_admin");
    setBusy(false);
    if (err) return setError(err.message);
    await checkAdmin();
  }

  function toggleModule(id) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(id) ? f.modules.filter((m) => m !== id) : [...f.modules, id],
    }));
  }

  function startEdit(t) {
    setEditing(t);
    setForm({
      name: t.name || "",
      slug: t.slug || "",
      admin_email: "",
      max_users: t.max_users ?? 10,
      plan_name: t.plan_name || "starter",
      expires_at: t.expires_at || "",
      notes: t.notes || "",
      modules: t.modules?.length ? normalizePlatformModules(t.modules) : PLATFORM_MODULE_CHOICES.map((m) => m.id),
    });
  }
  function cancelEdit() { setEditing(null); setForm(emptyForm); }

  async function syncTenantLimits(tenantId) {
    const { error: limitError } = await supabase.rpc("platform_set_tenant_limits", {
      _tenant: tenantId,
      _max_users: Number(form.max_users) || 10,
      _max_warehouses: 3,
      _max_storage_mb: form.plan_name === "enterprise" ? 10240 : form.plan_name === "business" ? 4096 : 1024,
      _enabled_modules: form.modules,
    });
    if (limitError) throw limitError;
  }

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (editing) {
        const { error: e1 } = await supabase.rpc("platform_update_tenant", {
          _tenant: editing.id, _name: form.name.trim(),
          _max_users: Number(form.max_users) || 10,
          _plan: form.plan_name, _expires_at: form.expires_at || null,
          _notes: form.notes || null,
        });
        if (e1) throw e1;
        const { error: e2 } = await supabase.rpc("platform_set_tenant_modules", {
          _tenant: editing.id, _modules: form.modules,
        });
        if (e2) throw e2;
        await syncTenantLimits(editing.id);
      } else {
        const base = (form.slug || slugifyPlatform(form.name) || "sirket").slice(0, 40);
        let finalSlug = base; let lastErr = null; let createdTenantId = null;
        for (let i = 0; i < 4; i++) {
          const { data: newId, error: rpcErr } = await supabase.rpc("platform_create_tenant", {
            _name: form.name.trim(), _slug: finalSlug,
            _max_users: Number(form.max_users) || 10,
            _plan: form.plan_name, _modules: form.modules,
            _expires_at: form.expires_at || null, _notes: form.notes || null,
            _admin_email: null,
          });
          if (!rpcErr) { lastErr = null; createdTenantId = newId; break; }
          lastErr = rpcErr;
          const dup = rpcErr.code === "23505" || /duplicate|tenants_slug_key/i.test(rpcErr.message || "");
          if (!dup) break;
          finalSlug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        }
        if (lastErr) throw lastErr;
        await syncTenantLimits(createdTenantId);

        const adminEmail = form.admin_email.trim();
        if (createdTenantId && adminEmail) {
          const { data: prov, error: provErr } = await supabase.functions.invoke(
            "platform-provision-admin",
            { body: { tenant_id: createdTenantId, email: adminEmail, role: "admin" } },
          );
          if (provErr || prov?.error) {
            throw new Error(provErr?.message || prov?.error || "Admin yaradıla bilmədi");
          }
          if (prov.password) setCredential({ email: prov.email, password: prov.password });
          else alert(` artıq mövcud hesabdır; şirkətə admin kimi əlavə edildi, parolu dəyişmədi.`);
        }
      }
      cancelEdit();
      await refreshTenants();
      await refreshAuth?.();
    } catch (err) {
      setError(err?.message || "Əməliyyat alınmadı.");
    } finally { setBusy(false); }
  }

  async function setStatus(t, status) {
    if (status === "frozen" && !(await appConfirm(`${t.name} şirkəti dondurulsun?`))) return;
    if (status === "active" && !(await appConfirm(`${t.name} şirkəti aktivləşdirilsin?`))) return;
    const { error: err } = await supabase.rpc("platform_set_tenant_status", { _tenant: t.id, _status: status });
    if (err) return setError(err.message);
    await refreshTenants();
  }
  async function deleteTenant(t) {
    if (!(await appConfirm(`${t.name} şirkəti və bütün məlumatları silinsin? Bu əməliyyat geri qaytarılmır.`, { danger: true }))) return;
    const { error: err } = await supabase.rpc("platform_delete_tenant", { _tenant: t.id });
    if (err) return setError(err.message);
    await refreshTenants();
    await refreshAuth?.();
  }

  const activeTenantCount = tenants.filter((tenant) => tenant.status === "active").length;
  const frozenTenantCount = tenants.filter((tenant) => tenant.status === "frozen").length;
  const totalPlatformUsers = tenants.reduce((sum, tenant) => sum + Number(tenant.member_count || 0), 0);
  const expiringTenantCount = tenants.filter((tenant) => {
    if (!tenant.expires_at) return false;
    const days = Math.ceil((new Date(tenant.expires_at).getTime() - Date.now()) / dayInMs);
    return days >= 0 && days <= 30;
  }).length;

  if (!checked) return <p className="muted">Yüklənir…</p>;
  if (!isAdmin) {
    return (
      <Panel>
        <PanelHeader title="Platform Super Admin" subtitle="Bu bölmə yalnız platform administratorları üçündür." />
        <p className="muted u-margin-bottom-12px" >
          Hələ heç bir platform admin təyin edilməyib. İlk admin kimi özünüzü təyin edin.
        </p>
        <button type="button" className="primary-btn" onClick={bootstrap} disabled={busy}>
          {busy ? "Təyin olunur…" : "Məni platform admin təyin et"}
        </button>
        {error && <div className="form-error u-margin-top-10px" >{error}</div>}
      </Panel>
    );
  }

  return (
    <div className="page-grid">
      <section className="metric-grid four u-grid-column-1_1" >
        <MetricCard label="Aktiv şirkət" value={activeTenantCount} trend={`${tenants.length} tenant`} icon={Building2} tone="success" />
        <MetricCard label="Platform istifadəçisi" value={totalPlatformUsers} trend="Bütün tenant-lər" icon={Users} tone="primary" />
        <MetricCard label="Dondurulmuş" value={frozenTenantCount} trend="Giriş məhdudiyyəti" icon={ShieldCheck} tone={frozenTenantCount ? "warning" : "success"} />
        <MetricCard label="30 günə bitən" value={expiringTenantCount} trend="Lisenziya nəzarəti" icon={CalendarClock} tone={expiringTenantCount ? "warning" : "info"} />
      </section>
      <Panel>
        <PanelHeader
          title={editing ? `Şirkəti redaktə et — ${editing.name}` : "Yeni şirkət yarat"}
          subtitle={editing ? "Dəyişiklikləri yadda saxlayın." : "Yeni tenant və (istəyə bağlı) admin — müvəqqəti parol yaradılır."}
          action={editing ? <button type="button" className="secondary-btn" onClick={cancelEdit}>Ləğv et</button> : null}
        />
        <form className="form-grid u-gap-12px" onSubmit={submit} >
          <div className="u-display-grid u-grid-template-columns-1fr_1fr u-gap-12px">
            <label className="field">
              <span>Şirkət adı *</span>
              <input required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : (form.slug || slugifyPlatform(e.target.value)) })} />
            </label>
            <label className="field">
              <span>Slug</span>
              <input disabled={!!editing} value={form.slug}
                onChange={(e) => setForm({ ...form, slug: slugifyPlatform(e.target.value) })} placeholder="avto" />
            </label>
            {!editing && (
              <label className="field u-grid-column-1_1" >
                <span>Admin e-poçtu (müvəqqəti parol yaradılacaq)</span>
                <input type="email" value={form.admin_email}
                  onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  placeholder="admin@sirket.az" />
              </label>
            )}
            <label className="field">
              <span>Maks. istifadəçi</span>
              <input type="number" min="1" value={form.max_users}
                onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
            </label>
            <label className="field">
              <span>Plan</span>
              <select value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })}>
                {PLATFORM_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Bitmə tarixi</span>
              <input type="date" value={form.expires_at || ""}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </label>
            <label className="field">
              <span>Qeyd</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div>
            <div className="u-display-flex u-justify-content-space_between u-align-items-center u-margin-bottom-6px">
              <span className="u-font-weight-600 u-font-size-13px">İcazə verilən modullar ({form.modules.length}/{PLATFORM_MODULE_CHOICES.length})</span>
              <div className="u-display-flex u-gap-8px">
                <button type="button" className="link-btn" onClick={() => setForm({ ...form, modules: PLATFORM_MODULE_CHOICES.map((m) => m.id) })}>Hamısı</button>
                <button type="button" className="link-btn" onClick={() => setForm({ ...form, modules: [] })}>Heç biri</button>
              </div>
            </div>
            <div className="u-display-grid u-grid-template-columns-repeat_auto_fill_minmax_160px_1fr u-gap-6px u-padding-10px u-border-1px_solid_e6dfc9 u-border-radius-10px u-max-height-220px u-overflow-y-auto u-background-fafaf5">
              {PLATFORM_MODULE_CHOICES.map((m) => (
                <label key={m.id} className="u-display-flex u-align-items-center u-gap-6px u-font-size-13px u-cursor-pointer">
                  <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-btn" disabled={busy || !form.name.trim()}>
              {busy ? "Saxlanılır…" : (editing ? "Yadda saxla" : "Şirkət yarat")}
            </button>
          </div>
        </form>
        {error && <div className="form-error u-margin-top-10px" >{error}</div>}
        {credential && (
          <div className="u-margin-top-12px u-padding-14px u-border-radius-12px u-background-e6f4ef u-border-1px_solid_0d7a5f">
            <div className="u-font-weight-700 u-color-text_primary u-margin-bottom-6px">Admin girişi yaradıldı</div>
            <div className="u-font-size-13px u-color-0f2a20">Bu məlumatı admin ilə paylaşın — bu pəncərəni bağladıqdan sonra parolu yenidən görə bilməyəcəksiniz.</div>
            <div className="u-margin-top-8px u-display-grid u-gap-4px u-font-family-monospace u-font-size-14px">
              <div><strong>E-poçt:</strong> {credential.email}</div>
              <div><strong>Müvəqqəti parol:</strong> {credential.password}</div>
            </div>
            <div className="u-margin-top-10px u-display-flex u-gap-8px">
              <button type="button" className="secondary-btn"
                onClick={() => navigator.clipboard?.writeText(`${credential.email} / ${credential.password}`)}>
                Kopyala
              </button>
              <button type="button" className="link-btn" onClick={() => setCredential(null)}>Bağla</button>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Bütün şirkətlər"
          subtitle={`${tenants.length} tenant`}
          action={<button type="button" className="secondary-btn" onClick={refreshTenants}>Yenilə</button>}
        />
        {loading ? <p className="muted">Yüklənir…</p> : (
          <DataTable
            columns={["Şirkət", "Plan", "Status", "İstifadəçi", "Bitmə", "Modullar", "Əməliyyat"]}
            rows={tenants.map((t) => [
              <TwoLine title={t.name} subtitle={t.slug} />,
              t.plan_name,
              <StatusBadge status={t.status === "active" ? "Aktiv" : t.status === "frozen" ? "Dondurulub" : "Silinib"} />,
              `${t.member_count}/${t.max_users}`,
              t.expires_at || "—",
              `${normalizePlatformModules(t.modules || []).length}/${PLATFORM_MODULE_CHOICES.length}`,
              <div className="table-actions u-display-flex u-gap-4px" >
                <button type="button" className="icon-btn" title="Redaktə" onClick={() => startEdit(t)}><Pencil size={14} /></button>
                {t.status === "active" ? (
                  <button type="button" className="icon-btn" title="Dondur" onClick={() => setStatus(t, "frozen")}>❄</button>
                ) : (
                  <button type="button" className="icon-btn" title="Aktivləşdir" onClick={() => setStatus(t, "active")}>▶</button>
                )}
                <button type="button" className="icon-btn danger" title="Sil" onClick={() => deleteTenant(t)}><Trash2 size={14} /></button>
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}
