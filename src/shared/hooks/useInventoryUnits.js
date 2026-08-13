import { useCallback, useEffect, useState } from "react";
import { listInventoryUnits, removeInventoryUnit, saveInventoryUnit } from "../../services/enterpriseWorkflows.js";
import { supabase } from "../../integrations/supabase/client";

export function useInventoryUnits(tenantId) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      setUnits(await listInventoryUnits({ tenantId }));
      setError(null);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

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
