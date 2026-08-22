import { useCallback, useEffect, useState } from "react";
import { decideCreditAdjustment, listCreditAudit, listCreditPortfolio, refreshCreditOverdue, requestCreditAdjustment, restructureCredit, updateCreditCollection } from "../../services/enterpriseWorkflows.js";

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
  const audit = creditId => listCreditAudit({ tenantId, creditId });
  const restructure = async values => { const id = await restructureCredit({ tenantId, ...values }); await refresh(); return id; };
  const requestAdjustment = async values => { const row = await requestCreditAdjustment({ tenantId, ...values }); await refresh(); return row; };
  const decideAdjustment = async values => { const row = await decideCreditAdjustment({ tenantId, ...values }); await refresh(); return row; };
  return { contracts, loading, error, refresh, recalculate, setCollection, audit, restructure, requestAdjustment, decideAdjustment };
}
