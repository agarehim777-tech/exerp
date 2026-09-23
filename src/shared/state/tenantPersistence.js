// Operational records that have their own Supabase tables are always loaded
// from those tables and never kept in the tenant snapshot.
export const dbBackedCollections = Object.freeze([
  "customers",
  "products",
  "orders",
  "invoices",
  "stock",
  "warehouses",
  "vendors",
  "accounting",
]);

// Transitional modules are persisted as individual rows in
// `tenant_collection_records`; they must never be copied into browser storage
// or the last-write-wins tenant snapshot.
export const snapshotBackedCollections = Object.freeze([
  "warehouseStock",
  "expenses",
  "cashEntries",
  "financeAccounts",
  "credits",
  "employees",
  "departments",
  "leaveRequests",
  "vacancies",
  "contracts",
]);

export const operationalCollections = Object.freeze([
  ...dbBackedCollections,
  ...snapshotBackedCollections,
]);

export function stripDbBackedCollections(state = {}) {
  return stripOperationalCollections(state);
}

export function stripOperationalCollections(state = {}) {
  const next = { ...state };
  operationalCollections.forEach((key) => delete next[key]);
  return next;
}

export function withoutOperationalData(state = {}) {
  const next = stripOperationalCollections(state);
  operationalCollections.forEach((key) => { next[key] = key === "warehouseStock" ? {} : []; });
  return next;
}

// Hydration path: operational data always starts empty and is populated by the
// relevant repository hook. A stale snapshot can therefore never resurrect it.
export function withoutDbBackedData(state = {}) {
  return withoutOperationalData(state);
}

export function writeTenantUiCache(storage, key, state) {
  storage.setItem(key, JSON.stringify(pickUiPreferences(state)));
}

const UI_KEYS = ["theme", "density", "locale", "sidebarCollapsed", "tablePreferences"];

export function pickUiPreferences(state = {}) {
  return Object.fromEntries(UI_KEYS.filter((key) => Object.hasOwn(state, key)).map((key) => [key, state[key]]));
}
