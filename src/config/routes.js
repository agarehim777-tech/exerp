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
  sales: "/satis/sifarisler",
  products: "/anbar/mehsullar",
  stock: "/anbar/qaliqlar",
  deliveries: "/tehvil",
  finance: "/maliyye/jurnal",
  cashbook: "/maliyye/kassa",
  invoices: "/faktura",
  accounting: "/muhasibat",
  credits: "/kredit",
  receivables: "/borclar",
  vendors: "/vendor",
  procurement: "/satinalma",
  hr: "/hr/emekdaslar",
  kpi: "/kpi",
  contracts: "/muqavile",
  reports: "/hesabat",
  "financial-statements": "/hesabat/maliyye",
  "data-reconciliation": "/sistem/barisdirma",
  support: "/destek",
  help: "/komek",
  onboarding: "/onboarding",
  messages: "/mesajlar",
  notifications: "/bildirisler",
  api: "/api",
  settings: "/parametrler",
  roles: "/rollar",
  "access-check": "/icaze-yoxlama",
  audit: "/audit",

};

export const pathToModule = Object.fromEntries(
  Object.entries(moduleRoutes).map(([k, v]) => [v, k]),
);

// Köhnə blob-əsaslı modullar → DB-əsaslı ekvivalentləri.
export const legacyModuleAliases = {
  finance: "accounting",
  invoices: "sales",
  "sales-quotes": "sales",
  "sales-shipments": "sales",
  "ar-invoices": "sales",
  warehouse: "stock",
};

// Tarixi (köhnə) URL-lər. Modul adını/URL-ini dəyişəndə köhnə dəyəri bura əlavə et
// və ya heç nə etmə — aşağıdakı avtomatik slug indeksi əksər halları özü tutur.
export const historicalRoutes = {
  finance: ["/maliyye", "/jurnal"],
  accounting: ["/maliyye/muhasibat"],
  invoices: ["/fakturalar", "/satis/faktura"],
  sales: ["/sifarisler", "/satis", "/satis/kotirovka", "/satis/catdirilma", "/maliyye/satis-fakturalari", "/satis-fakturalari"],
  crm: ["/musteriler"],
  stock: ["/anbar", "/qaliqlar"],
  hr: ["/hr", "/emekdaslar"],
  platform: ["/sirketler", "/platform"],
  procurement: ["/satin-alma"],
  settings: ["/ayarlar", "/settings"],
  roles: ["/roller"],
};

function normalize(pathname) {
  if (!pathname) return "/";
  let p = pathname.split("?")[0].split("#")[0];
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p.toLowerCase() || "/";
}

// Avtomatik alias indeksi: hər modulun kanonik yolu + tarixi yolları + slug-ları.
const aliasIndex = (() => {
  const idx = {};
  const put = (path, id) => {
    const key = normalize(path);
    if (!key || key === "/") return;
    if (!(key in idx)) idx[key] = id;
  };
  // 1) kanonik yollar həmişə üstünlük təşkil edir
  for (const [id, path] of Object.entries(moduleRoutes)) put(path, id);
  // 2) açıq şəkildə qeyd olunmuş tarixi yollar
  for (const [id, paths] of Object.entries(historicalRoutes)) {
    if (!moduleRoutes[id]) continue;
    for (const path of paths) put(path, id);
  }
  // 3) avtomatik: modul id-si və kanonik yolun son seqmenti
  for (const [id, path] of Object.entries(moduleRoutes)) {
    put("/" + id, id);
    const seg = normalize(path).split("/").filter(Boolean).pop();
    if (seg) put("/" + seg, id);
  }
  return idx;
})();

function resolveModule(id) {
  return legacyModuleAliases[id] || id;
}

export function moduleFromPath(pathname) {
  const p = normalize(pathname);
  if (p === "/") return "dashboard";
  if (aliasIndex[p]) return resolveModule(aliasIndex[p]);
  // longest-prefix match (handles /satis/sifarisler/:id etc.)
  let match = null;
  for (const [path, id] of Object.entries(aliasIndex)) {
    if (p === path || p.startsWith(path + "/")) {
      if (!match || path.length > match.path.length) match = { path, id };
    }
  }
  return resolveModule(match?.id) || "dashboard";
}

export function pathForModule(moduleId) {
  return moduleRoutes[resolveModule(moduleId)] || moduleRoutes[moduleId] || "/";
}

// Köhnə URL-i kanonik URL-ə çevirir (yönləndirmə lazımdırsa).
export function canonicalPath(pathname) {
  const p = normalize(pathname);
  const target = pathForModule(moduleFromPath(p));
  const canonicalSelf = normalize(target);
  if (p === canonicalSelf || p.startsWith(canonicalSelf + "/")) return null;
  return target;
}
