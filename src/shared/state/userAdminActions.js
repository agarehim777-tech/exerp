import { createRemoteUser, remoteApiEnabled } from "../../remote-api.js";
import { defaultRoles } from "../../services/permissions.js";
import { appendAudit } from "../../services/persistence.js";
import { getActiveRole, getDefaultModuleAccessForRole, modulePermissionCatalog, normalizeUserModuleAccess } from "../lib/appDomain.jsx";

// User administration commands for the browser settings state (users, roles, module access),
// moved out of App.jsx unchanged. App passes in the state and its permission/audit helpers.
export function createUserAdminActions({ state, setState, notify, requirePermission, auditCurrentState, activeRoleInfo, currentUser }) {
  async function createUser(values) {
    if (!requirePermission("settings.manage", "istifadəçi yaratmaq")) return;
    if (!remoteApiEnabled) {
      // Without the account API this would only add a browser record nobody can sign in with.
      notify("Bu versiyada istifadəçi hesabı yalnız dəvətlə yaradılır. \"Dəvət et\" bölməsindən istifadə edin.", "warning");
      return;
    }

    const userName = String(values.name || "").trim();
    const email = String(values.email || "").trim();
    const role = values.role || defaultRoles[0].name;
    const roleOptions = state.settings.roles || defaultRoles;
    const moduleAccess = normalizeUserModuleAccess(
      {
        role,
        moduleAccess: Array.isArray(values.moduleAccess) ? values.moduleAccess : undefined,
      },
      roleOptions,
    );

    if (!userName || !email) {
      notify("İstifadəçi adı və email daxil edin.", "warning");
      return;
    }

    let user = {
      id: `USR-${Date.now()}`,
      name: userName,
      email,
      role,
      status: "Aktiv",
      moduleAccess,
    };

    if (remoteApiEnabled) {
      const password = String(values.password || "");
      if (password.length < 8) {
        notify("Server istifadəçisi üçün ən azı 8 simvoldan ibarət parol daxil edin.", "warning");
        return;
      }
      try {
        const remote = await createRemoteUser({ ...user, password });
        user = { ...remote.user, moduleAccess };
      } catch (error) {
        notify(error instanceof Error ? error.message : "İstifadəçi yaradılmadı.", "warning");
        return;
      }
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: [user, ...(current.settings.users || [])],
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "İstifadəçi yaradıldı",
          detail: `${user.name} · ${user.role}`,
        },
      ),
    );
    notify(`${user.name} istifadəçisi yaradıldı.`);
  }

  function updateUserStatus(userId, status) {
    if (!requirePermission("settings.manage", "istifadəçi statusunu dəyişmək")) return;

    setState((current) => {
      const nextUsers = (current.settings.users || []).map((user) =>
        user.id === userId ? { ...user, status } : user,
      );
      const nextSessionUserId = status !== "Aktiv" && current.settings.sessionUserId === userId ? null : current.settings.sessionUserId;

      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: nextUsers,
            sessionUserId: nextSessionUserId,
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "İstifadəçi statusu dəyişdi",
          detail: `${userId}: ${status}`,
        },
      );
    });
  }

  function updateUserProfile(userId, values) {
    if (!requirePermission("settings.manage", "istifadəçini redaktə etmək")) return;
    const name = String(values.name || "").trim();
    const email = String(values.email || "").trim().toLowerCase();
    if (!name || !email) {
      notify("İstifadəçi adı və e-poçt daxil edilməlidir.", "warning");
      return;
    }
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        users: (current.settings.users || []).map((user) => {
          if (user.id !== userId) return user;
          const nextRole = values.role || user.role;
          return {
            ...user,
            name,
            email,
            role: nextRole,
            status: values.status || user.status,
            moduleAccess: nextRole === user.role
              ? user.moduleAccess
              : getDefaultModuleAccessForRole(nextRole, current.settings.roles || defaultRoles),
          };
        }),
      },
      auditLog: [
        {
          id: `AUD-${Date.now()}`,
          date: new Date().toISOString(),
          module: "Ayarlar/Auth",
          action: "İstifadəçi redaktə edildi",
          detail: `${name} · ${values.role || ""}`,
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        },
        ...(current.auditLog || []),
      ],
    }));
    notify(`${name} istifadəçisi yeniləndi.`);
  }

  function applyDefaultUserPermissions() {
    if (!requirePermission("settings.manage", "başlanğıc istifadəçi icazələrini qurmaq")) return;
    setState((current) => {
      const roles = current.settings.roles || defaultRoles;
      const users = (current.settings.users || []).map((user) => ({
        ...user,
        moduleAccess: getDefaultModuleAccessForRole(user.role, roles),
        permissionOverrides: {},
      }));
      return {
        ...current,
        settings: { ...current.settings, roles, users },
        auditLog: [
          {
            id: `AUD-${Date.now()}`,
            date: new Date().toISOString(),
            module: "Ayarlar/Auth",
            action: "Başlanğıc rol icazələri quruldu",
            detail: `${users.length} istifadəçiyə rol üzrə standart modul icazələri tətbiq edildi`,
            role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
          },
          ...(current.auditLog || []),
        ],
      };
    });
    notify("Satıcı, maliyyəçi, anbardar və digər rolların başlanğıc icazələri tətbiq edildi.");
  }

  function toggleUserModuleAccess(userId, moduleId) {
    if (!requirePermission("settings.manage", "istifadəçi modul icazəsini dəyişmək")) return;

    setState((current) => {
      const users = current.settings.users || [];
      const targetUser = users.find((user) => user.id === userId);
      if (!targetUser || targetUser.role === "Super Admin") return current;
      const module = modulePermissionCatalog.find((item) => item.id === moduleId);
      const role = (current.settings.roles || defaultRoles).find((item) => item.name === targetUser.role);
      const canOverrideRole = ["Super Admin", "Platform Super Admin"].includes(currentUser?.role);
      if (module?.permission && !(role?.permissions || []).includes(module.permission) && !canOverrideRole) {
        return appendAudit(current, {
          module: "Ayarlar/Auth",
          action: "Modul icazəsi bloklandı",
          detail: `${targetUser.name}: ${module.label}`,
          status: "İcazə yoxdur",
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        });
      }

      const currentAccess = Array.isArray(targetUser.moduleAccess)
        ? [...new Set(targetUser.moduleAccess)]
        : normalizeUserModuleAccess(targetUser, current.settings.roles || defaultRoles);
      const willEnable = !currentAccess.includes(moduleId);
      const nextAccess = currentAccess.includes(moduleId)
        ? currentAccess.filter((id) => id !== moduleId)
        : [...currentAccess, moduleId];
      const safeAccess = nextAccess.length > 0 ? nextAccess : ["dashboard"];
      const permissionOverrides = module?.permission && canOverrideRole
        ? { ...(targetUser.permissionOverrides || {}), [module.permission]: willEnable }
        : targetUser.permissionOverrides;

      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: users.map((user) =>
              user.id === userId ? { ...user, moduleAccess: safeAccess, permissionOverrides } : user,
            ),
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "Modul icazəsi dəyişdi",
          detail: `${targetUser.name}: ${moduleId} ${willEnable ? "verildi" : "ləğv edildi"}`,
        },
      );
    });
  }

  function updateUserRole(userId, roleName) {
    if (!requirePermission("settings.manage", "istifadəçi rolunu dəyişmək")) return;
    setState((current) => {
      const roles = current.settings.roles || defaultRoles;
      const targetRole = roles.find((role) => role.name === roleName);
      if (!targetRole) return current;
      const targetUser = (current.settings.users || []).find((user) => user.id === userId);
      if (!targetUser) return current;
      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: (current.settings.users || []).map((user) =>
              user.id === userId
                ? {
                    ...user,
                    role: roleName,
                    moduleAccess: getDefaultModuleAccessForRole(roleName, roles),
                    permissionOverrides: {},
                  }
                : user,
            ),
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "İstifadəçi rolu dəyişdi",
          detail: `${targetUser.name}: ${roleName}`,
        },
      );
    });
  }

  return { createUser, updateUserStatus, updateUserProfile, applyDefaultUserPermissions, toggleUserModuleAccess, updateUserRole };
}
