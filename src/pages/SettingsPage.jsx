import { permissionCatalog } from "../services/permissions.js";
import { localDbKey, localDbSchemaVersion } from "../services/persistence.js";
import { defaultRoles } from "../services/permissions.js";
import { useState } from "react";
import { Bell, Check, CircleAlert, Database, Download, Plus, ShieldCheck, Upload, UserCog, X } from "lucide-react";
import { DataTable, EmptyState, Field, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { total } from "../shared/utils/aggregate.js";
import {
  Toggle,
  getActiveRole,
  getDefaultModuleAccessForRole,
  getModuleForPermission,
  modulePermissionCatalog,
  normalizeUserModuleAccess,
  targetDbProvider,
  uniqueModuleIds,
  userHasEffectivePermission,
} from "../shared/lib/appDomain.jsx";

export default SettingsPage;

function SettingsPage({
  settings,
  activeRole,
  auditLog = [],
  dbMeta = {},
  integrityReport = {},
  integritySnapshot = null,
  goLiveReport = {},
  goLiveSnapshot = null,
  productionHardeningReport = {},
  productionHardeningSnapshot = null,
  permissionCatalog = [],
  modulePermissionCatalog = [],
  users = [],
  toggleSetting,
  updateCompany,
  onSaveSettings,
  onChangeRole,
  onCreateUser,
  onUpdateUserStatus,
  onToggleUserModule,
  onRunIntegrityCheck,
  onRunGoLiveCheck,
  onRunProductionHardeningCheck,
  onExportBackup,
  onImportBackup,
  notify,
  requiresPassword = false,
  canManageSettings = true,
  canRunSystemBackup = true,
}) {
  const [userDraft, setUserDraft] = useState({
    name: "",
    email: "",
    password: "",
    role: activeRole?.name || defaultRoles[0].name,
    moduleAccess: getDefaultModuleAccessForRole(activeRole?.name || defaultRoles[0].name, defaultRoles),
  });
  const integrations = [
    ["AKB", "Müştəri kredit tarixçəsi sorğusu", "Aktiv"],
    ["SMS Gateway", "Bildirişlər və OTP üçün", "Aktiv"],
    ["1C Mühasibat", "Maliyyə məlumatlarının sinxronizasiyası", "Gözləyir"],
    ["ASAN İmza", "Müqavilələrin rəqəmsal imzalanması", "Gözləyir"],
    ["E-Qaimə Sistemi", "Elektron qaimələrin avtomatik göndərilməsi", "Aktiv"],
  ];
  const roles = settings.roles || defaultRoles;
  const currentRole = activeRole || getActiveRole(settings);
  const draftRole = roles.find((role) => role.name === userDraft.role);
  const draftIsSuperAdmin = userDraft.role === "Super Admin";
  const shownIntegrity = integritySnapshot || integrityReport;
  const integrityIssues = shownIntegrity.issues || [];
  const shownGoLive = goLiveSnapshot || goLiveReport;
  const goLiveItems = shownGoLive.items || [];
  const shownHardening = productionHardeningSnapshot || productionHardeningReport;
  const hardeningItems = shownHardening.items || [];
  const formatAuditDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || "—";
    return new Intl.DateTimeFormat("az-AZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };
  const getUserPermissionSummary = (user) => {
    const role = roles.find((item) => item.name === user.role);
    const rolePermissions = new Set(role?.permissions || []);
    const effectivePermissions = permissionCatalog.filter((permission) =>
      userHasEffectivePermission(user, roles, permission.key),
    );
    const blockedByModule = permissionCatalog.filter((permission) => {
      const moduleId = getModuleForPermission(permission.key);
      return rolePermissions.has(permission.key) && moduleId && !normalizeUserModuleAccess(user, roles).includes(moduleId);
    });
    return {
      effectivePermissions,
      blockedByModule,
      total: permissionCatalog.length,
    };
  };

  function submitUser(event) {
    event.preventDefault();
    onCreateUser(userDraft);
    setUserDraft({
      name: "",
      email: "",
      password: "",
      role: roles[0]?.name || defaultRoles[0].name,
      moduleAccess: getDefaultModuleAccessForRole(roles[0]?.name || defaultRoles[0].name, roles),
    });
  }

  function changeDraftRole(roleName) {
    setUserDraft((current) => ({
      ...current,
      role: roleName,
      moduleAccess: getDefaultModuleAccessForRole(roleName, roles),
    }));
  }

  function toggleDraftModule(moduleId) {
    setUserDraft((current) => {
      const currentAccess = uniqueModuleIds(current.moduleAccess || []);
      const nextAccess = currentAccess.includes(moduleId)
        ? currentAccess.filter((id) => id !== moduleId)
        : [...currentAccess, moduleId];
      return {
        ...current,
        moduleAccess: nextAccess.length > 0 ? nextAccess : ["dashboard"],
      };
    });
  }

  return (
    <div className="settings-grid">
      <Panel>
        <PanelHeader title="Şirkət Məlumatları" subtitle="Əsas hüquqi və əlaqə məlumatları" />
        <div className="form-grid">
          <Field label="Şirkət adı" value={settings.company} onChange={(value) => updateCompany("company", value)} disabled={!canManageSettings} />
          <Field label="VÖEN" value={settings.voen} onChange={(value) => updateCompany("voen", value)} disabled={!canManageSettings} />
          <Field label="Telefon" value={settings.phone} onChange={(value) => updateCompany("phone", value)} disabled={!canManageSettings} />
          <Field label="Email" value={settings.email} onChange={(value) => updateCompany("email", value)} disabled={!canManageSettings} />
          <Field label="Ünvan" value={settings.address} onChange={(value) => updateCompany("address", value)} full disabled={!canManageSettings} />
        </div>
        <button
          className="primary-btn"
          onClick={onSaveSettings}
          disabled={!canManageSettings}
          title={!canManageSettings ? "Ayarları dəyişmək üçün icazə yoxdur" : ""}
        >
          <Check size={16} />
          Yadda saxla
        </button>
      </Panel>

      <Panel>
        <PanelHeader title="Bildiriş Tənzimləmələri" subtitle="Kanallar və avtomatik xəbərdarlıqlar" />
        <div className="toggle-list">
          <Toggle label="Push bildirişlər" checked={settings.toggles.push} disabled={!canManageSettings} onChange={() => toggleSetting("push")} />
          <Toggle label="SMS bildirişlər" checked={settings.toggles.sms} disabled={!canManageSettings} onChange={() => toggleSetting("sms")} />
          <Toggle label="Email bildirişlər" checked={settings.toggles.email} disabled={!canManageSettings} onChange={() => toggleSetting("email")} />
          <Toggle
            label="Kredit ödəniş xəbərdarlığı"
            checked={settings.toggles.creditWarnings}
            disabled={!canManageSettings}
            onChange={() => toggleSetting("creditWarnings")}
          />
          <Toggle
            label="Anbar stok aşağı həddi"
            checked={settings.toggles.lowStock}
            disabled={!canManageSettings}
            onChange={() => toggleSetting("lowStock")}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="İnteqrasiyalar" subtitle="Aktiv servis bağlantıları" />
        <div className="integration-list">
          {integrations.map(([name, desc, status]) => (
            <div className="integration-row" key={name}>
              <TwoLine title={name} subtitle={desc} />
              <StatusBadge status={status} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="settings-security-panel">
        <PanelHeader title="İstifadəçilər & Login" subtitle="İstifadəçi yaradın, rol bağlayın və real permission görünüşünü yoxlayın" icon={UserCog} />
        <form className="user-create-form" onSubmit={submitUser}>
          <label>
            <span>Ad Soyad</span>
            <input
              value={userDraft.name}
              onChange={(event) => setUserDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Yeni istifadəçi"
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={userDraft.email}
              onChange={(event) => setUserDraft((current) => ({ ...current, email: event.target.value }))}
              placeholder="user@sirket.az"
            />
          </label>
          {requiresPassword && (
            <label>
              <span>İlkin parol</span>
              <input
                type="password"
                minLength="8"
                value={userDraft.password}
                onChange={(event) => setUserDraft((current) => ({ ...current, password: event.target.value }))}
                placeholder="Minimum 8 simvol"
                required
              />
            </label>
          )}
          <label>
            <span>Rol</span>
            <select
              value={userDraft.role}
              onChange={(event) => changeDraftRole(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.name}>{role.name}</option>
              ))}
            </select>
          </label>
          <div className="user-module-picker">
            <span>Modul icazələri</span>
            <div className="module-access-grid compact">
              {modulePermissionCatalog.map((module) => {
                const roleAllowsModule =
                  draftIsSuperAdmin || !module.permission || (draftRole?.permissions || []).includes(module.permission);
                return (
                  <label key={`draft-${module.id}`} className="module-access-check" title={!roleAllowsModule ? "Seçilmiş rol bu modulun permission-unu daşımır" : ""}>
                    <input
                      type="checkbox"
                      checked={draftIsSuperAdmin || (roleAllowsModule && (userDraft.moduleAccess || []).includes(module.id))}
                      disabled={draftIsSuperAdmin || !canManageSettings || !roleAllowsModule}
                      onChange={() => toggleDraftModule(module.id)}
                    />
                    <span>{module.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <button
            className="primary-btn"
            type="submit"
            disabled={!canManageSettings}
            title={!canManageSettings ? "İstifadəçi yaratmaq üçün icazə yoxdur" : ""}
          >
            <Plus size={16} />
            İstifadəçi yarat
          </button>
        </form>
        <DataTable
          columns={["İstifadəçi", "Rol", "Scope", "Modullar", "Effective permission", "Status", "Əməliyyat"]}
          rows={users.map((user) => {
            const role = roles.find((item) => item.name === user.role);
            const isCurrent = user.id === settings.sessionUserId;
            const userModuleAccess = normalizeUserModuleAccess(user, roles);
            const isSuperAdmin = user.role === "Super Admin";
            const permissionSummary = getUserPermissionSummary(user);

            return [
              <TwoLine title={user.name} subtitle={user.email} />,
              <StatusBadge status={user.role} />,
              role?.scope || "Scope yoxdur",
              <div className="module-access-grid">
                {modulePermissionCatalog.map((module) => (
                  (() => {
                    const roleAllowsModule =
                      isSuperAdmin || !module.permission || (role?.permissions || []).includes(module.permission);
                    return (
                      <label key={`${user.id}-${module.id}`} className="module-access-check" title={!roleAllowsModule ? "Rol bu modulun permission-unu daşımır" : ""}>
                        <input
                          type="checkbox"
                          checked={isSuperAdmin || (roleAllowsModule && userModuleAccess.includes(module.id))}
                          disabled={isSuperAdmin || !canManageSettings || !roleAllowsModule}
                          onChange={() => onToggleUserModule(user.id, module.id)}
                        />
                        <span>{module.label}</span>
                      </label>
                    );
                  })()
                ))}
              </div>,
              <div className="permission-effective-cell" data-testid={`permission-effective-${user.id}`}>
                <strong>{permissionSummary.effectivePermissions.length}/{permissionSummary.total}</strong>
                <span>aktiv permission</span>
                {permissionSummary.blockedByModule.length > 0 && (
                  <small>{permissionSummary.blockedByModule.length} permission modul access ilə bloklanıb</small>
                )}
              </div>,
              <StatusBadge status={isCurrent ? "Aktiv sessiya" : user.status} />,
              <button
                className={`text-btn ${user.status === "Aktiv" ? "danger" : ""}`}
                disabled={isCurrent || !canManageSettings}
                title={!canManageSettings ? "İstifadəçi statusu dəyişmək üçün icazə yoxdur" : ""}
                onClick={() => onUpdateUserStatus(user.id, user.status === "Aktiv" ? "Bloklanıb" : "Aktiv")}
              >
                {user.status === "Aktiv" ? "Blokla" : "Aktiv et"}
              </button>,
            ];
          })}
        />
      </Panel>

      <Panel className="settings-security-panel">
        <PanelHeader title="Rollar & İcazələr" subtitle="Modul səviyyəli girişlər" />
        <label className="role-selector">
          <span>Aktiv rol</span>
          <select
            value={currentRole?.name || ""}
            disabled={!canManageSettings}
            title={!canManageSettings ? "Aktiv rolu dəyişmək üçün icazə yoxdur" : ""}
            onChange={(event) => onChangeRole(event.target.value)}
          >
            {roles.map((role) => (
              <option key={role.name}>{role.name}</option>
            ))}
          </select>
        </label>
        <DataTable
          columns={["Rol", "İstifadəçi", "Scope", "Real permission"]}
          rows={roles.map((role) => [
            <TwoLine title={role.name} subtitle={role.name === currentRole?.name ? "Aktiv rol" : "Passiv"} />,
            role.users,
            role.scope,
            <div className="permission-chip-list">
              {permissionCatalog.map((permission) => (
                <span
                  key={`${role.name}-${permission.key}`}
                  className={role.permissions?.includes(permission.key) ? "permission-chip allowed" : "permission-chip"}
                >
                  {role.permissions?.includes(permission.key) ? "✓" : "—"} {permission.label}
                </span>
              ))}
            </div>,
          ])}
        />
      </Panel>

      <Panel className="settings-security-panel system-health-panel">
        <PanelHeader
          title="Sistem Sağlamlığı & Backup"
          subtitle="DB bütövlüyü, schema versiyası, backup/export və bərpa əməliyyatları"
          icon={ShieldCheck}
        />
        <section className="metric-grid four">
          <MetricCard
            label="Integrity score"
            value={`${shownIntegrity.score ?? 100}%`}
            trend={shownIntegrity.status || "Yoxlanmayıb"}
            icon={ShieldCheck}
            tone={shownIntegrity.critical > 0 ? "danger" : shownIntegrity.warnings > 0 ? "warning" : "success"}
          />
          <MetricCard label="Kritik siqnal" value={shownIntegrity.critical || 0} icon={CircleAlert} tone={shownIntegrity.critical > 0 ? "danger" : "success"} />
          <MetricCard label="Xəbərdarlıq" value={shownIntegrity.warnings || 0} icon={Bell} tone={shownIntegrity.warnings > 0 ? "warning" : "info"} />
          <MetricCard label="Schema" value={`v${dbMeta.schemaVersion || localDbSchemaVersion}`} trend={formatAuditDate(shownIntegrity.checkedAt)} icon={Database} tone="primary" />
        </section>
        <div className="backup-toolbar">
          <button
            type="button"
            className="primary-btn"
            onClick={onRunIntegrityCheck}
            disabled={!canRunSystemBackup}
            title={!canRunSystemBackup ? "Backup və integrity üçün icazə yoxdur" : ""}
          >
            <ShieldCheck size={16} />
            Integrity yoxla
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={onExportBackup}
            disabled={!canRunSystemBackup}
            title={!canRunSystemBackup ? "Backup export üçün icazə yoxdur" : ""}
          >
            <Download size={16} />
            Backup export
          </button>
          <label className={`secondary-btn file-import-btn ${!canRunSystemBackup ? "disabled" : ""}`} title={!canRunSystemBackup ? "Backup import üçün icazə yoxdur" : ""}>
            <Upload size={16} />
            Backup import
            <input
              type="file"
              accept="application/json"
              disabled={!canRunSystemBackup}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportBackup(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <DataTable
          columns={["Sahə", "Siqnal", "Detal", "Təklif", "Səviyyə"]}
          rows={integrityIssues.slice(0, 8).map((issue) => [
            issue.area,
            <strong>{issue.title}</strong>,
            issue.detail,
            issue.fix,
            <StatusBadge status={issue.severity} />,
          ])}
        />
      </Panel>

      <Panel className="settings-security-panel go-live-panel">
        <PanelHeader
          title="Real Mühitə Çıxış"
          subtitle="Production ERP üçün blokerlər, nəzarət maddələri və deploy öncəsi yoxlama"
          icon={Database}
        />
        <section className="metric-grid four">
          <MetricCard
            label="Go-live score"
            value={`${shownGoLive.score ?? 0}%`}
            trend={shownGoLive.status || "Yoxlanmayıb"}
            icon={ShieldCheck}
            tone={shownGoLive.blockers > 0 ? "danger" : shownGoLive.watch > 0 ? "warning" : "success"}
          />
          <MetricCard label="Bloker" value={shownGoLive.blockers || 0} icon={CircleAlert} tone={shownGoLive.blockers > 0 ? "danger" : "success"} />
          <MetricCard label="Nəzarətdə" value={shownGoLive.watch || 0} icon={Bell} tone={shownGoLive.watch > 0 ? "warning" : "success"} />
          <MetricCard label="Hazır qat" value={shownGoLive.ready || 0} icon={Check} tone="success" />
        </section>
        <div className="backup-toolbar">
          <button type="button" className="primary-btn" onClick={onRunGoLiveCheck}>
            <ShieldCheck size={16} />
            Go-live yoxla
          </button>
          <StatusBadge status={shownGoLive.status || "Yoxlanmayıb"} />
          <span className="module-action-note">
            Son yoxlama: {formatAuditDate(shownGoLive.checkedAt)}
          </span>
        </div>
        <DataTable
          columns={["Qat", "Tələb", "Status", "Risk", "Növbəti addım"]}
          rows={goLiveItems.map((item) => [
            <strong>{item.area}</strong>,
            item.requirement,
            <StatusBadge status={item.status} />,
            <StatusBadge status={item.risk} />,
            item.next,
          ])}
        />
      </Panel>

      <Panel className="settings-security-panel production-hardening-panel" data-testid="production-hardening-panel">
        <PanelHeader
          title="Production Hardening"
          subtitle="Backend, backup/restore, deployment monitorinqi, provider inteqrasiyaları və kod parçalanması"
          icon={ShieldCheck}
        />
        <section className="metric-grid four">
          <MetricCard
            label="Hardening score"
            value={`${shownHardening.score ?? 0}%`}
            trend={shownHardening.status || "Yoxlanmayıb"}
            icon={ShieldCheck}
            tone={shownHardening.score >= 85 ? "success" : shownHardening.score >= 70 ? "warning" : "danger"}
          />
          <MetricCard label="Hazır qat" value={shownHardening.ready || 0} icon={Check} tone="success" />
          <MetricCard label="Nəzarətdə" value={shownHardening.watch || 0} icon={Bell} tone={shownHardening.watch > 0 ? "warning" : "success"} />
          <MetricCard label="Bloker" value={shownHardening.blockers || 0} icon={CircleAlert} tone={shownHardening.blockers > 0 ? "danger" : "success"} />
        </section>
        <div className="backup-toolbar">
          <button
            type="button"
            className="primary-btn"
            data-testid="production-hardening-check"
            onClick={onRunProductionHardeningCheck}
            disabled={!canRunSystemBackup}
            title={!canRunSystemBackup ? "Production hardening üçün icazə yoxdur" : ""}
          >
            <ShieldCheck size={16} />
            Hardening yoxla
          </button>
          <StatusBadge status={shownHardening.status || "Yoxlanmayıb"} />
          <span className="module-action-note">
            Son yoxlama: {formatAuditDate(shownHardening.checkedAt)}
          </span>
        </div>
        <DataTable
          columns={["Qat", "Status", "Score", "Detal", "Növbəti addım"]}
          rows={hardeningItems.map((item) => [
            <strong>{item.area}</strong>,
            <StatusBadge status={item.status} />,
            `${item.score}%`,
            item.detail,
            item.next,
          ])}
        />
      </Panel>

      <Panel className="settings-security-panel">
        <PanelHeader title="Backend DB & Audit Log" subtitle="Bütün əsas əməliyyatlar qalıcı local DB və audit reyestrinə yazılır" icon={ShieldCheck} />
        <div className="db-status-grid">
          <div>
            <span>Provider</span>
            <strong>{dbMeta.provider || "Local persistent DB"}</strong>
          </div>
          <div>
            <span>Runtime</span>
            <strong>{dbMeta.runtime || "browser"}</strong>
          </div>
          <div>
            <span>Target DB</span>
            <strong>{targetDbProvider}</strong>
          </div>
          <div>
            <span>Storage key</span>
            <strong>{localDbKey}</strong>
          </div>
          <div>
            <span>Son yazılış</span>
            <strong>{formatAuditDate(dbMeta.lastWriteAt)}</strong>
          </div>
          <div>
            <span>Audit sayı</span>
            <strong>{auditLog.length}</strong>
          </div>
        </div>
        <div className="audit-list">
          {auditLog.slice(0, 8).map((entry) => (
            <article className="audit-row" key={entry.id}>
              <div>
                <strong>{entry.action}</strong>
                <span>{entry.module} · {entry.detail}</span>
              </div>
              <TwoLine title={entry.role} subtitle={formatAuditDate(entry.date)} />
              <StatusBadge status={entry.status} />
            </article>
          ))}
          {auditLog.length === 0 && <EmptyState title="Audit qeydi hələ yoxdur" />}
        </div>
      </Panel>
    </div>
  );
}
