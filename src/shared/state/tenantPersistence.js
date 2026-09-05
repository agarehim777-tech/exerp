// Operational records live in Supabase. Browser and tenant snapshots may only
// persist UI preferences and non-transactional configuration.
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

export const operationalCollections = Object.freeze([
  ...dbBackedCollections,
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

export function stripDbBackedCollections(state = {}) {
  const next = { ...state };
  dbBackedCollections.forEach((key) => delete next[key]);
  return next;
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

export function writeTenantUiCache(storage, key, state) {
  storage.setItem(key, JSON.stringify(stripOperationalCollections(state)));
}

