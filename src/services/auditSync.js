// The browser keeps its audit trail in tenant UI state; the immutable copy is public.audit_events.
// Every entry not yet confirmed by the server is sent, not only the newest one, so entries added
// in the same render or after a failed send still arrive. Upserts ignore duplicates, so resending
// an entry the server already has is harmless.
//
// The UI state snapshot is shared by everyone in the tenant, and entries carry no actor. Only
// entries written since this session started are sent, so another user's entry loaded with the
// snapshot is never recorded under the current user's id.
export const AUDIT_SYNC_RETRY_MS = 30_000;

export function pendingAuditEventRows(entries = [], syncedIds = new Set(), { tenantId, actorId, fallbackRole, since } = {}) {
  if (!tenantId || !actorId) return [];
  return entries
    .filter((entry) => entry?.id && !syncedIds.has(entry.id))
    .filter((entry) => !since || String(entry.date || "") >= since)
    .map((entry) => ({
      id: entry.id,
      tenant_id: tenantId,
      actor_id: actorId,
      actor_role: entry.role || fallbackRole || "System",
      module: entry.module || "Sistem",
      action: entry.action || "Əməliyyat",
      detail: entry.detail || "",
      status: entry.status || "Tamamlandı",
      payload: entry,
      occurred_at: entry.date || new Date().toISOString(),
    }));
}
