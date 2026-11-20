// Immutable audit log sync, moved from App.jsx: upsert this session's new audit entries into audit_events,
// retry a failed batch on a timer, and report when the server last accepted a batch.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { AUDIT_SYNC_RETRY_MS, pendingAuditEventRows } from "../../services/auditSync.js";

type Row = Record<string, any>;

export function useAuditServerSync({ activeRoleInfo, activeTenantId, authUser, state }: {
  activeRoleInfo?: { name?: string } | null;
  activeTenantId: string | null | undefined;
  authUser: { id?: string } | null | undefined;
  state: Row;
}) {
  const syncedAuditIds = useRef(new Set());
  const auditRetryTimer = useRef<number | undefined>(undefined);
  const auditSessionStart = useRef(new Date().toISOString());
  const [auditRetryTick, setAuditRetryTick] = useState(0);
  const [auditServerSyncedAt, setAuditServerSyncedAt] = useState("");

  useEffect(() => {
    const rows = pendingAuditEventRows(state.auditLog, syncedAuditIds.current, {
      tenantId: activeTenantId,
      actorId: authUser?.id,
      fallbackRole: activeRoleInfo?.name,
      since: auditSessionStart.current,
    });
    if (!rows.length) return;

    rows.forEach((row) => syncedAuditIds.current.add(row.id));
    supabase
      .from("audit_events")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) {
          setAuditServerSyncedAt(new Date().toISOString());
          return;
        }
        rows.forEach((row) => syncedAuditIds.current.delete(row.id));
        console.warn("[audit] immutable server log unavailable", {
          code: error.code,
          message: error.message,
        });
        // Retry on a timer as well, so a failed batch does not wait for the next audited action.
        window.clearTimeout(auditRetryTimer.current);
        auditRetryTimer.current = window.setTimeout(() => setAuditRetryTick((tick) => tick + 1), AUDIT_SYNC_RETRY_MS);
      });
  }, [state.auditLog, activeTenantId, authUser?.id, activeRoleInfo?.name, auditRetryTick]);

  useEffect(() => () => window.clearTimeout(auditRetryTimer.current), []);

  return auditServerSyncedAt;
}
