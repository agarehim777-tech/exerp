// Cari istifadəçi və icazə yoxlamaları: rol icazəsi, modul girişi, menyu bəndi və səhifə əməliyyatı.
// Platform Super Admin hər yoxlamadan keçir. Server tərəfində RLS ayrıca qoruyur; bu yoxlamalar yalnız UI üçündür.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { pageMeta } from "../../config/page-meta.js";
import { navPermissionByType, pageActionPermissionByType, pageActionlessModules } from "../../services/permissions.js";
import { ensureSettings, getActiveRole, getModuleForPermission, normalizeUserModuleAccess } from "./appDomainPlatform.jsx";

export const PLATFORM_SUPER_ADMIN = "Platform Super Admin";

export interface AppUser {
  id?: string;
  role?: string;
  [key: string]: unknown;
}

type Settings = Record<string, any>;

function getCurrentUser(settings: Settings = {}): AppUser | null {
  const safeSettings = ensureSettings(settings);
  return safeSettings.users.find((user: AppUser) => user.id === safeSettings.sessionUserId) || null;
}

function hasRolePermission(settings: Settings, permission?: string | null): boolean {
  if (!permission) return true;
  const user = getCurrentUser(settings);
  if (!user) return false;
  if (user.role === PLATFORM_SUPER_ADMIN) return true;
  const role = getActiveRole(settings);
  return Array.isArray(role?.permissions) && role.permissions.includes(permission);
}

function hasUserModuleAccess(settings: Settings, moduleId?: string | null): boolean {
  if (!moduleId) return true;
  const user = getCurrentUser(settings);
  if (!user) return false;
  if (user.role === PLATFORM_SUPER_ADMIN) return true;
  return normalizeUserModuleAccess(user, ensureSettings(settings).roles).includes(moduleId);
}

function hasEffectivePermission(settings: Settings, permission?: string | null): boolean {
  if (!hasRolePermission(settings, permission)) return false;
  return hasUserModuleAccess(settings, getModuleForPermission(permission));
}

function canAccessNavItem(settings: Settings, id: string): boolean {
  const permission = (navPermissionByType as Record<string, string | null | undefined>)[id];
  return hasUserModuleAccess(settings, id) && (!permission || hasRolePermission(settings, permission));
}

function getPageActionPermission(moduleId: string): string | null {
  return (pageActionPermissionByType as Record<string, string | null | undefined>)[moduleId] || null;
}

function hasPageAction(moduleId: string): boolean {
  return Boolean((pageMeta as Record<string, { action?: unknown } | undefined>)[moduleId]?.action) && !pageActionlessModules.has(moduleId);
}

export {
  getCurrentUser,
  hasRolePermission,
  hasUserModuleAccess,
  hasEffectivePermission,
  canAccessNavItem,
  getPageActionPermission,
  hasPageAction,
};
