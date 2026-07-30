// Module ↔ URL path mapping. Keep in sync with navItems in src/data.js.
export const moduleRoutes = {
  dashboard: "/",
  assistant: "/ai-komekci",
  platform: "/platform/sirketler",
  crm: "/crm/musteriler",
  "crm-deals": "/crm/sovdelesmeler",
  "crm-activities": "/crm/aktivlikler",
  "crm-tasks": "/crm/tapsiriqlar",
  "sales-dashboard": "/satis/dashboard",
  "sales-quotes": "/satis/kotirovka",
  sales: "/satis/sifarisler",
  "sales-shipments": "/satis/catdirilma",
  warehouse: "/anbar/mehsullar",
  stock: "/anbar/qaliqlar",
  deliveries: "/tehvil",
  finance: "/maliyye/jurnal",
  cashbook: "/maliyye/kassa",
  "ar-invoices": "/maliyye/satis-fakturalari",
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
  roles: "/rollar",
  "access-check": "/icaze-yoxlama",
};

export const pathToModule = Object.fromEntries(
  Object.entries(moduleRoutes).map(([k, v]) => [v, k]),
);

// Köhnə blob-əsaslı modullar → DB-əsaslı ekvivalentləri.
export const legacyModuleAliases = {
  finance: "accounting",
  invoices: "ar-invoices",
};

function resolveModule(id) {
  return legacyModuleAliases[id] || id;
}

export function moduleFromPath(pathname) {
  if (!pathname || pathname === "/") return "dashboard";
  // exact match first
  if (pathToModule[pathname]) return resolveModule(pathToModule[pathname]);
  // longest-prefix match (handles /satis/sifarisler/:id etc.)
  let match = null;
  for (const [path, id] of Object.entries(pathToModule)) {
    if (path === "/") continue;
    if (pathname === path || pathname.startsWith(path + "/")) {
      if (!match || path.length > match.path.length) match = { path, id };
    }
  }
  return resolveModule(match?.id) || "dashboard";
}


export function pathForModule(moduleId) {
  return moduleRoutes[moduleId] || "/";
}
