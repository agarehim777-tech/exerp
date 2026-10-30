// Legacy snapshot writes are only for tenants that have not finished migrating to DB-backed modules.
export const ENABLE_LEGACY_WRITES = import.meta.env.VITE_ENABLE_LEGACY_WRITES === "true";
