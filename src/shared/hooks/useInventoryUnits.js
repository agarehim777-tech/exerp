import { useCallback, useEffect, useState } from "react";
import { listInventoryUnits, removeInventoryUnit, saveInventoryUnit } from "../../services/enterpriseWorkflows.js";
import { supabase } from "../../integrations/supabase/client";
import { useTenantRequestScope } from "./useTenantRequestScope";

export function useInventoryUnits(tenantId) {
  const { begin } = useTenantRequestScope(tenantId);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setUnits([]); }, [tenantId]);
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    try {
      const nextUnits = await listInventoryUnits({ tenantId });
      if (!isCurrent()) return;
      setUnits(nextUnits);
      setError(null);
    } catch (nextError) {
      if (isCurrent()) setError(nextError);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [tenantId, begin]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!tenantId) return undefined;
    const channel = supabase.channel(`inventory-units:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_units", filter: `tenant_id=eq.${tenantId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, refresh]);

  const save = async (unit) => { const result = await saveInventoryUnit({ tenantId, unit }); await refresh(); return result; };
  const remove = async (unitId) => { const result = await removeInventoryUnit({ tenantId, unitId }); await refresh(); return result; };
  return { units, loading, error, refresh, save, remove };
}
