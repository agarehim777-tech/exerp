import { defaultRoles } from "../../services/permissions.js";
import { appendAudit, defaultDbProvider, localDbSchemaVersion } from "../../services/persistence.js";
import { baseFinanceDate, getActiveRole, getDefaultModuleAccessForRole } from "../lib/appDomain.jsx";
import { buildAllCreditRecords, buildGoLiveReadiness, buildProductionHardeningReport, buildStateIntegrityReport, hydrateState } from "../lib/appHelpers.jsx";

// Settings, notification, readiness check, backup and role switch commands,
// moved out of App.jsx unchanged. App-local values are passed in.
export function createSettingsActions({ activeRoleInfo, apiSecretRows, apiWebhookRows, auditCurrentState, auditOperation, auditServerSyncedAt, creditRecords, currentUser, getActionStamp, goLiveReport, integrityReport, notificationProviderRows, notify, requirePermission, requireSystemBackup, setState, state }) {
  function markAllNotificationsRead() {
    if (!requirePermission("notifications.manage", "bildirişləri idarə etmək")) return;

    const stamp = getActionStamp();
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          notificationSweepAt: stamp,
          notifications: current.notifications.map((item) => ({ ...item, unread: false })),
        },
        {
          module: "Bildiriş",
          action: "Hamısı oxundu",
          detail: `Son yoxlama: ${stamp}`,
        },
      ),
    );
    notify("Bütün bildirişlər oxunmuş işarələndi.");
  }

  function toggleSetting(key) {
    if (!requirePermission("settings.manage", "ayarları dəyişmək")) return;

    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        toggles: {
          ...current.settings.toggles,
          [key]: !current.settings.toggles[key],
        },
      },
    }));
    auditOperation({
      module: "Ayarlar",
      action: "Toggle dəyişdi",
      detail: key,
    });
  }

  function updateCompany(field, value) {
    if (!requirePermission("settings.manage", "şirkət məlumatlarını dəyişmək")) return;

    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [field]: value,
      },
    }));
    auditOperation({
      module: "Ayarlar",
      action: "Şirkət məlumatı dəyişdi",
      detail: field,
    });
  }

  function saveSettings() {
    if (!requirePermission("settings.manage", "ayarları yadda saxlamaq")) return;

    notify("Sistem tənzimləmələri yadda saxlanıldı.");
    auditOperation({
      module: "Ayarlar",
      action: "Ayarlar yadda saxlandı",
      detail: "Şirkət və sistem tənzimləmələri",
    });
  }

  function runIntegrityCheck() {
    if (!requireSystemBackup("integrity yoxlaması")) return;

    const report = buildStateIntegrityReport(state, creditRecords);
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          integritySnapshot: report,
        },
        {
          module: "Sistem/DB",
          action: "Integrity yoxlaması",
          detail: `${report.issueCount} siqnal · score ${report.score}%`,
          status: report.status,
        },
      ),
    );
    notify(`Integrity yoxlandı: ${report.status}, score ${report.score}%.`);
  }

  function runGoLiveCheck() {
    if (!requireSystemBackup("go-live yoxlaması")) return;

    const report = buildGoLiveReadiness(state, integrityReport);
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          goLiveSnapshot: report,
        },
        {
          module: "Sistem/Go-live",
          action: "Go-live readiness yoxlandı",
          detail: `${report.blockers} bloker · score ${report.score}%`,
          status: report.status,
        },
      ),
    );
    notify(`Go-live yoxlandı: ${report.status}, score ${report.score}%.`);
  }

  function runProductionHardeningCheck() {
    if (!requireSystemBackup("production hardening yoxlaması")) return;

    const report = buildProductionHardeningReport(
      {
        ...state,
        productionHardeningSnapshot: {
          ...(state.productionHardeningSnapshot || {}),
          backupCheckedAt: new Date().toISOString(),
        },
      },
      {
        goLiveReport,
        auditServerSynced: Boolean(auditServerSyncedAt),
        apiWebhookRows,
        apiSecretRows,
        notificationProviderRows,
      },
    );
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          productionHardeningSnapshot: report,
        },
        {
          module: "Production Hardening",
          action: "Production hardening yoxlandı",
          detail: `${report.ready} hazır · ${report.watch} nəzarətdə · score ${report.score}%`,
          status: report.status,
        },
      ),
    );
    notify(`Production hardening yoxlandı: ${report.status}, score ${report.score}%.`);
  }

  function exportBackup() {
    if (!requireSystemBackup("backup export")) return;

    const exportedAt = new Date().toISOString();
    const payload = {
      app: "ERP+CRM AZ",
      schemaVersion: localDbSchemaVersion,
      exportedAt,
      exportedBy: currentUser?.email || currentUser?.name || "System",
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `erpaz-backup-${baseFinanceDate}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    const sizeKb = `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 }).format(blob.size / 1024)} KB`;

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          dbMeta: {
            ...(current.dbMeta || {}),
            lastBackupAt: exportedAt,
            lastBackupBy: currentUser?.email || currentUser?.name || "System",
          },
        },
        {
          module: "Sistem/DB",
          action: "Backup export",
          detail: `Schema v${localDbSchemaVersion} · ${sizeKb}`,
        },
      ),
    );
    notify("Backup JSON faylı hazırlandı.");
  }

  function importBackup(file) {
    if (!requireSystemBackup("backup import")) return;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const incomingState = parsed.state || parsed;
        const hydrated = hydrateState(incomingState);
        const restoredCredits = buildAllCreditRecords(hydrated.orders || [], hydrated.credits || []);
        const report = buildStateIntegrityReport(hydrated, restoredCredits);
        const importedAt = new Date().toISOString();

        setState(
          appendAudit(
            {
              ...hydrated,
              integritySnapshot: report,
              dbMeta: {
                ...(hydrated.dbMeta || {}),
                provider:
                  hydrated.dbMeta?.provider && hydrated.dbMeta.provider !== "Local persistent DB"
                    ? hydrated.dbMeta.provider
                    : defaultDbProvider,
                runtime: hydrated.dbMeta?.runtime || "browser",
                version: localDbSchemaVersion,
                schemaVersion: localDbSchemaVersion,
                lastRestoreAt: importedAt,
                lastRestoreFile: file.name,
              },
            },
            {
              module: "Sistem/DB",
              action: "Backup import",
              detail: `${file.name} · ${report.issueCount} integrity siqnalı`,
              status: report.status,
              role: activeRoleInfo?.name || "System",
            },
          ),
        );
        notify(`Backup import edildi. Integrity: ${report.status}.`);
      } catch {
        notify("Backup faylı oxunmadı. JSON strukturunu yoxlayın.", "warning");
      }
    };
    reader.onerror = () => notify("Backup faylı oxunarkən xəta baş verdi.", "warning");
    reader.readAsText(file);
  }

  function changeCurrentRole(roleName) {
    if (!requirePermission("settings.manage", "aktiv rolu dəyişmək")) return;

    setState((current) =>
      appendAudit(
        {
          ...current,
          settings: {
            ...current.settings,
            users: (current.settings.users || []).map((user) =>
              user.id === current.settings.sessionUserId
                ? { ...user, role: roleName, moduleAccess: getDefaultModuleAccessForRole(roleName, current.settings.roles || defaultRoles) }
                : user,
            ),
            currentRole: roleName,
          },
        },
        {
          module: "Ayarlar",
          action: "Aktiv rol dəyişdi",
          detail: roleName,
          role: getActiveRole(current.settings)?.name || "System",
        },
      ),
    );
    notify(`Aktiv rol: ${roleName}`);
  }

  return { markAllNotificationsRead, toggleSetting, updateCompany, saveSettings, runIntegrityCheck, runGoLiveCheck, runProductionHardeningCheck, exportBackup, importBackup, changeCurrentRole };
}
