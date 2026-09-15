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

// Modules that still live in the tenant snapshot (stored in Supabase, table
// `tenant_state_snapshots`) because they have no dedicated table binding yet.
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

// Hydration path: only the table-backed collections are reset, snapshot-backed
// modules (HR, expenses, cash entries, credits…) survive a reload.
export function withoutDbBackedData(state = {}) {
  const next = stripDbBackedCollections(state);
  dbBackedCollections.forEach((key) => { next[key] = []; });
  if (!next.warehouseStock || typeof next.warehouseStock !== "object") next.warehouseStock = {};
  snapshotBackedCollections.forEach((key) => {
    if (key === "warehouseStock") return;
    if (!Array.isArray(next[key])) next[key] = [];
  });
  return next;
}

export function writeTenantUiCache(storage, key, state) {
  storage.setItem(key, JSON.stringify(stripDbBackedCollections(state)));
}
