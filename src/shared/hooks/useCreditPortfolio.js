import { useCallback, useEffect, useState } from "react";
import { listCreditPortfolio, refreshCreditOverdue, updateCreditCollection } from "../../services/enterpriseWorkflows.js";

export function useCreditPortfolio(tenantId) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try { setContracts(await listCreditPortfolio({ tenantId })); setError(null); }
    catch (nextError) { setError(nextError); }
    finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { refresh(); }, [refresh]);
  const recalculate = async () => { await refreshCreditOverdue({ tenantId }); await refresh(); };
  const setCollection = async (credit, stage) => { await updateCreditCollection({ tenantId, credit, stage }); await refresh(); };
  return { contracts, loading, error, refresh, recalculate, setCollection };
}
