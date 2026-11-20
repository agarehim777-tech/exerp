// Permission and audit guards, moved from App.jsx. Every command factory receives these: can/requirePermission
// combine the legacy role permissions with the database role, the audit helpers stamp the acting role, and
// choosePage only opens modules the user can see.
import { createConfig } from "../../config/createConfig.js";
import { createPermissionByType } from "../../services/permissions.js";
import { appendAudit } from "../../services/persistence.js";
import { getActiveRole, getModuleForPermission } from "../lib/appDomainPlatform.jsx";
import { hasEffectivePermission } from "../lib/permissionHelpers.ts";

type Row = Record<string, any>;
type Audit = Row & { module: string; action: string };

export function createAppGuards({ activeRoleInfo, collectionSync, dbCan, dbRole, isPlatformAdmin, notify, setActive, setMobileNav, setState, state, visibleNavItems }: {
  activeRoleInfo?: { name?: string } | null;
  collectionSync: { ready: boolean };
  dbCan: (module: string, level: string) => boolean;
  dbRole: string | null | undefined;
  isPlatformAdmin: boolean;
  notify: (message: string, tone?: string) => void;
  setActive: (page: string) => void;
  setMobileNav: (open: boolean) => void;
  setState: (update: (current: Row) => Row) => void;
  state: Row;
  visibleNavItems: { id: string }[];
}) {
  function can(permission: string | null | undefined) {
    if (!permission || isPlatformAdmin) return true;

    const legacyOk = hasEffectivePermission(state.settings, permission);
    if (!dbRole) return legacyOk;

    const dbModule = getModuleForPermission(permission);
    const dbOk = dbCan(dbModule, "edit");
    if (dbRole === "owner" || dbRole === "admin") return dbOk;
    return legacyOk && dbOk;
  }

  function requirePermission(permission: string | null | undefined, action: string) {
    if (permission?.startsWith("hr.") && !collectionSync.ready) {
      notify("HR məlumatları serverdən yüklənir. Bir qədər sonra yenidən cəhd edin.", "warning");
      return false;
    }
    if (can(permission)) return true;

    const roleName = activeRoleInfo?.name || "Rol seçilməyib";
    notify(`${roleName}: ${action} üçün icazə yoxdur.`, "warning");
    setState((current) =>
      appendAudit(current, {
        module: "Permission",
        action: "Əməliyyat bloklandı",
        detail: `${roleName}: ${action}`,
        status: "İcazə yoxdur",
        role: roleName,
      }),
    );
    return false;
  }

  function requireSystemBackup(action: string) {
    return requirePermission("system.backup", action);
  }

  function auditCurrentState(nextState: Row, audit: Audit) {
    return appendAudit(nextState, {
      ...audit,
      role: getActiveRole(nextState.settings)?.name || activeRoleInfo?.name || "System",
    });
  }

  function auditOperation(audit: Audit) {
    setState((current) =>
      appendAudit(current, {
        ...audit,
        role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
      }),
    );
  }

  function hasCreatePermission(type: string, values: Row) {
    if (type === "hr" && !collectionSync.ready) return requirePermission("hr.manage", "əməkdaş yaratmaq");
    const permission = (createPermissionByType as Record<string, string>)[type];
    if (!permission) return true;

    const isCreditSale = (type === "sales" || type === "dashboard") && values.paymentMethod === "Kredit";
    if (can(permission) || (isCreditSale && can("credits.manage"))) return true;

    const action = isCreditSale ? "kredit satış yaratmaq" : (createConfig as Record<string, { title?: string }>)[type]?.title || "qeyd yaratmaq";
    return requirePermission(permission, action);
  }

  function choosePage(id: string) {
    const isVisible = visibleNavItems.some((item) => item.id === id);
    if (!isVisible) {
      notify("Bu modul aktiv istifadəçi üçün gizlədilib.", "warning");
      return false;
    }
    setActive(id);
    setMobileNav(false);
    return true;
  }

  return { can, requirePermission, requireSystemBackup, auditCurrentState, auditOperation, hasCreatePermission, choosePage };
}
