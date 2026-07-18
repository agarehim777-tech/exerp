export const localDbKey = "erpaz.local.backend.v1";
export const localDbSchemaVersion = 2;
export const localDbBaselineVersion = 1;
export const defaultDbProvider = "Local persistent DB";

export function buildAuditEntry({ module, action, detail, status = "Tamamlandı", role = "System" }) {
  return {
    id: `AUD-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date: new Date().toISOString(),
    module,
    action,
    detail,
    status,
    role,
  };
}

export function appendAudit(state, audit) {
  const entry = buildAuditEntry(audit);

  return {
    ...state,
    auditLog: [entry, ...(state.auditLog || [])].slice(0, 240),
    dbMeta: {
      ...(state.dbMeta || {}),
      provider:
        state.dbMeta?.provider && state.dbMeta.provider !== defaultDbProvider
          ? state.dbMeta.provider
          : defaultDbProvider,
      runtime: state.dbMeta?.runtime || "browser",
      version: localDbSchemaVersion,
      schemaVersion: localDbSchemaVersion,
      baselineVersion: localDbBaselineVersion,
      lastWriteAt: entry.date,
      lastAction: `${entry.module}: ${entry.action}`,
      lastAuditId: entry.id,
    },
  };
}
