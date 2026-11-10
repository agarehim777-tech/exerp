import { normalize } from "../../services/format.js";
import { buildModulePermissionCatalog, defaultRoles, getDefaultModuleAccessForRole as getDefaultModuleAccessForRoleFromCatalog, getModuleForPermission as getModuleForPermissionFromCatalog, normalizeUserModuleAccess as normalizeUserModuleAccessFromCatalog, permissionCatalog, uniquePermissionModuleIds } from "../../services/permissions.js";
import { initialState, navItems } from "../../data.js";

export const PLATFORM_MODULE_CHOICES = navItems
  .filter((n) => !["platform"].includes(n.id))
  .map((n) => ({ id: n.id, label: n.label }));

export function slugifyPlatform(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export const dayInMs = 24 * 60 * 60 * 1000;

export const PLATFORM_PLANS = ["starter", "business", "enterprise"];

export function getActiveRole(settings = {}) {
  const safeSettings = ensureSettings(settings);
  const user = safeSettings.users.find((item) => item.id === safeSettings.sessionUserId);
  if (user?.role === "Platform Super Admin") {
    return { name: "Platform Super Admin", scope: "Bütün platforma və əsas ERP tenant-ına tam giriş", permissions: permissionCatalog.map((item) => item.key) };
  }
  return safeSettings.roles.find((role) => role.name === safeSettings.currentRole) || safeSettings.roles[0];
}

export function getDefaultModuleAccessForRole(roleName, roles = defaultRoles) {
  return getDefaultModuleAccessForRoleFromCatalog(roleName, roles, navItems);
}

export function getModuleForPermission(permission) {
  return getModuleForPermissionFromCatalog(permission, modulePermissionCatalog);
}

export const modulePermissionCatalog = buildModulePermissionCatalog(navItems);

export function normalizeUserModuleAccess(user, roles) {
  return normalizeUserModuleAccessFromCatalog(user, roles, navItems);
}

export const targetDbProvider = String(import.meta.env?.VITE_DB_PROVIDER || "sqlite").trim();

export function uniqueModuleIds(moduleIds = []) {
  return uniquePermissionModuleIds(moduleIds, navItems);
}

export function userHasEffectivePermission(user, roles, permission) {
  if (!permission) return true;
  if (!user) return false;
  if (user.role === "Super Admin" || user.role === "Platform Super Admin") return true;
  const role = roles.find((item) => item.name === user.role);
  const roleAllows = Array.isArray(role?.permissions) && role.permissions.includes(permission);
  const moduleId = getModuleForPermission(permission);
  const moduleAllows = !moduleId || normalizeUserModuleAccess(user, roles).includes(moduleId);
  const explicitOverride = user?.permissionOverrides?.[permission];
  if (typeof explicitOverride === "boolean") return explicitOverride && moduleAllows;
  return roleAllows && moduleAllows;
}

// Bu kolleksiyalar artıq real Supabase cədvəllərində saxlanılır — blob snapshot-a yazılmır.

export function ensureSettings(settings = {}) {
  const baseSettings = initialState.settings || {};
  const roles = mergeRoles(Array.isArray(settings.roles) ? settings.roles : []);
  const users = mergeUsers(Array.isArray(settings.users) ? settings.users : baseSettings.users || []).map((user) => ({
    ...user,
    moduleAccess: normalizeUserModuleAccess(user, roles),
  }));
  const fallbackUser = users.find((user) => user.status === "Aktiv") || users[0] || null;
  const sessionUserId =
    settings.sessionUserId === null
      ? null
      : users.some((user) => user.id === settings.sessionUserId && user.status === "Aktiv")
        ? settings.sessionUserId
        : fallbackUser?.id || null;
  const sessionUser = users.find((user) => user.id === sessionUserId) || null;
  const currentRole =
    sessionUser?.role && roles.some((role) => role.name === sessionUser.role)
      ? sessionUser.role
      : settings.currentRole && roles.some((role) => role.name === settings.currentRole)
        ? settings.currentRole
        : roles[0]?.name || defaultRoles[0].name;

  return {
    ...baseSettings,
    ...settings,
    toggles: {
      ...(baseSettings.toggles || {}),
      ...(settings.toggles || {}),
    },
    roles,
    users,
    sessionUserId,
    currentRole,
  };
}

export function mergeRoles(savedRoles = []) {
  const savedByName = new Map(savedRoles.map((role) => [role.name, role]));

  return defaultRoles.map((defaultRole) => {
    const saved = savedByName.get(defaultRole.name);
    if (!saved) return defaultRole;

    return {
      ...defaultRole,
      ...saved,
      permissions:
        defaultRole.name === "Super Admin"
          ? permissionCatalog.map((item) => item.key)
          : [...new Set([...(defaultRole.permissions || []), ...(saved.permissions || [])])],
    };
  });
}

export function mergeUsers(savedUsers = []) {
  const savedById = new Map(savedUsers.map((user) => [user.id, user]));
  const defaults = getDefaultUsers().map((user) => ({
    ...user,
    ...(savedById.get(user.id) || {}),
  }));
  const defaultIds = new Set(defaults.map((user) => user.id));
  const customUsers = savedUsers.filter((user) => user.id && !defaultIds.has(user.id));
  return [...defaults, ...customUsers];
}

export function getDefaultUsers() {
  return initialState.settings?.users || [];
}
