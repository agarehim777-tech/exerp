export const permissionCatalog = [
  { key: "crm.manage", label: "CRM idarəsi" },
  { key: "sales.create", label: "Satış yaratmaq" },
  { key: "warehouse.manage", label: "Anbar idarəsi" },
  { key: "delivery.complete", label: "Təhvil tamamlamaq" },
  { key: "finance.manage", label: "Maliyyə təsdiqi" },
  { key: "invoices.manage", label: "Faktura/e-qaimə" },
  { key: "accounting.manage", label: "Mühasibat" },
  { key: "tax.manage", label: "Vergi təqvimi" },
  { key: "credits.manage", label: "Kredit idarəsi" },
  { key: "receivables.manage", label: "Debitor/kreditor" },
  { key: "vendors.manage", label: "Vendor idarəsi" },
  { key: "vendors.po", label: "PO yarat/təsdiq et" },
  { key: "procurement.manage", label: "Satınalma sifarişi və göndəriş idarəsi" },
  { key: "procurement.costing", label: "Satınalma xərcləri və maya təsdiqi" },
  { key: "procurement.receive", label: "Maya təsdiqli göndərişi anbara qəbul et" },
  { key: "projects.manage", label: "ROI layihələri" },
  { key: "production.manage", label: "İstehsalat" },
  { key: "hr.manage", label: "HR idarəsi" },
  { key: "kpi.manage", label: "KPI idarəsi" },
  { key: "contracts.manage", label: "Müqavilə idarəsi" },
  { key: "reports.export", label: "Hesabat export" },
  { key: "support.manage", label: "Support/Task" },
  { key: "onboarding.manage", label: "Onboarding" },
  { key: "messages.send", label: "Daxili mesaj göndərmək" },
  { key: "messages.manage", label: "Mesaj qrupları və arxiv idarəsi" },
  { key: "notifications.manage", label: "Bildiriş idarəsi" },
  { key: "api.manage", label: "API/Webhook" },
  { key: "system.backup", label: "Backup və integrity" },
  { key: "settings.manage", label: "Ayarlar və rollar" },
];

export const defaultRoles = [
  {
    name: "Super Admin",
    users: "2 istifadəçi",
    scope: "Bütün modullar",
    permissions: permissionCatalog.map((item) => item.key),
  },
  {
    name: "Satış Meneceri",
    users: "12 istifadəçi",
    scope: "CRM, Satış, Kredit oxunuşu",
    permissions: ["crm.manage", "sales.create", "contracts.manage", "reports.export", "messages.send", "messages.manage", "notifications.manage"],
  },
  {
    name: "Anbar İşçisi",
    users: "8 istifadəçi",
    scope: "Anbar və təhvil",
    permissions: ["warehouse.manage", "procurement.receive", "delivery.complete", "production.manage", "support.manage", "messages.send", "messages.manage", "notifications.manage"],
  },
  {
    name: "Satınalma Əməkdaşı",
    users: "0 istifadəçi",
    scope: "Satınalma sifarişləri və göndərişlər",
    permissions: ["vendors.manage", "vendors.po", "procurement.manage", "reports.export", "messages.send", "notifications.manage"],
  },
  {
    name: "Maliyyəçi",
    users: "4 istifadəçi",
    scope: "Maliyyə və kredit kassası",
    permissions: [
      "finance.manage",
      "procurement.costing",
      "invoices.manage",
      "accounting.manage",
      "tax.manage",
      "credits.manage",
      "receivables.manage",
      "projects.manage",
      "reports.export",
      "api.manage",
      "support.manage",
      "messages.send",
      "messages.manage",
      "notifications.manage",
    ],
  },
  {
    name: "HR Mütəxəssisi",
    users: "3 istifadəçi",
    scope: "HR və KPI",
    permissions: ["hr.manage", "kpi.manage", "support.manage", "onboarding.manage", "reports.export", "messages.send", "messages.manage", "notifications.manage"],
  },
];

export const createPermissionByType = {
  dashboard: "sales.create",
  crm: "crm.manage",
  sales: "sales.create",
  warehouse: "warehouse.manage",
  product: "warehouse.manage",
  products: "warehouse.manage",
  financeAccount: "finance.manage",
  finance: "finance.manage",
  invoices: "invoices.manage",
  accounting: "accounting.manage",
  tax: "tax.manage",
  credits: "credits.manage",
  receivables: "receivables.manage",
  vendors: "vendors.manage",
  projects: "projects.manage",
  production: "production.manage",
  hr: "hr.manage",
  kpi: "kpi.manage",
  contracts: "contracts.manage",
  support: "support.manage",
  onboarding: "onboarding.manage",
  api: "api.manage",
  settings: "settings.manage",
};

export const pageActionPermissionByType = {
  ...createPermissionByType,
  reports: "reports.export",
  notifications: "notifications.manage",
  help: "support.manage",
  messages: "messages.send",
};

export const pageActionlessModules = new Set(["deliveries", "messages"]);

export const navPermissionByType = {
  ...createPermissionByType,
  dashboard: null,
  deliveries: "delivery.complete",
  reports: null,
  messages: null,
  notifications: null,
  help: null,
};

export const permissionModuleOverrides = {
  "system.backup": "settings",
  "settings.manage": "settings",
  "vendors.po": "vendors",
  "procurement.manage": "procurement",
  "procurement.costing": "procurement",
  "procurement.receive": "procurement",
  "reports.export": "reports",
  "messages.send": "messages",
  "messages.manage": "messages",
  "notifications.manage": "notifications",
};

export function buildModulePermissionCatalog(navItems = []) {
  return navItems.map((item) => ({
    ...item,
    permission: navPermissionByType[item.id] || null,
  }));
}

export function uniquePermissionModuleIds(moduleIds = [], navItems = []) {
  const validIds = new Set(navItems.map((item) => item.id));
  return [...new Set(moduleIds)].filter((id) => validIds.has(id));
}

export function getDefaultModuleAccessForRole(roleName, roles = defaultRoles, navItems = []) {
  const role = roles.find((item) => item.name === roleName) || roles[0] || defaultRoles[0];
  if (role?.name === "Super Admin") return navItems.map((item) => item.id);

  const permissions = new Set(role?.permissions || []);
  return uniquePermissionModuleIds(
    navItems
      .filter((item) => {
        const permission = navPermissionByType[item.id];
        return !permission || permissions.has(permission);
      })
      .map((item) => item.id),
    navItems,
  );
}

export function normalizeUserModuleAccess(user, roles = defaultRoles, navItems = []) {
  const rawModuleAccess = Array.isArray(user.moduleAccess)
    ? uniquePermissionModuleIds(user.moduleAccess, navItems)
    : getDefaultModuleAccessForRole(user.role, roles, navItems);
  const role = roles.find((item) => item.name === user.role) || roles[0] || defaultRoles[0];
  const rolePermissions = new Set(role?.permissions || []);
  const permissionOverrides = user?.permissionOverrides || {};
  const moduleAccess =
    role?.name === "Super Admin"
      ? navItems.map((item) => item.id)
      : rawModuleAccess.filter((moduleId) => {
          const permission = navPermissionByType[moduleId];
          return !permission || rolePermissions.has(permission) || permissionOverrides[permission] === true;
        });

  return moduleAccess.length > 0 ? moduleAccess : ["dashboard"];
}

export function getModuleForPermission(permission, modulePermissionCatalog = []) {
  if (!permission) return null;
  if (permissionModuleOverrides[permission]) return permissionModuleOverrides[permission];
  return modulePermissionCatalog.find((item) => item.permission === permission)?.id || null;
}
