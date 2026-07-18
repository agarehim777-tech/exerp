// Module ↔ URL path mapping. Keep in sync with navItems in src/data.js.
export const moduleRoutes = {
  dashboard: "/",
  platform: "/platform/sirketler",
  crm: "/crm/musteriler",
  sales: "/satis/sifarisler",
  warehouse: "/anbar/mehsullar",
  deliveries: "/tehvil",
  finance: "/maliyye/jurnal",
  invoices: "/faktura",
  accounting: "/muhasibat",
  tax: "/vergi",
  credits: "/kredit",
  receivables: "/borclar",
  vendors: "/vendor",
  procurement: "/satinalma",
  projects: "/layihe",
  production: "/istehsalat",
  hr: "/hr/emekdaslar",
  kpi: "/kpi",
  contracts: "/muqavile",
  reports: "/hesabat",
  support: "/destek",
  help: "/komek",
  onboarding: "/onboarding",
  messages: "/mesajlar",
  notifications: "/bildirisler",
  api: "/api",
  settings: "/parametrler",
};

export const pathToModule = Object.fromEntries(
  Object.entries(moduleRoutes).map(([k, v]) => [v, k]),
);

export function moduleFromPath(pathname) {
  if (!pathname || pathname === "/") return "dashboard";
  // exact match first
  if (pathToModule[pathname]) return pathToModule[pathname];
  // longest-prefix match (handles /satis/sifarisler/:id etc.)
  let match = null;
  for (const [path, id] of Object.entries(pathToModule)) {
    if (path === "/") continue;
    if (pathname === path || pathname.startsWith(path + "/")) {
      if (!match || path.length > match.path.length) match = { path, id };
    }
  }
  return match?.id || "dashboard";
}

export function pathForModule(moduleId) {
  return moduleRoutes[moduleId] || "/";
}
