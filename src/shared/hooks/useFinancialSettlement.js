import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTenantRequestScope } from './useTenantRequestScope.js';
import { createKpiPeriodCommand, createReceivableSettlement, loadKpiLedger, loadReceivableLedger, settlementError } from '../../services/financialSettlement.js';

function useSettlementLedger(tenantId, load, createCommand) {
  const { scope, begin } = useTenantRequestScope(tenantId);
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(null);
  const post = useMemo(() => createCommand(tenantId), [tenantId, createCommand]);
  const data = loaded?.scope === scope ? loaded.data : null;
  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin('read');
    try {
      const result = await load(tenantId, isCurrent);
      if (!isCurrent()) return;
      setLoaded({ scope, data: result }); setError(null);
    } catch (failure) {
      if (isCurrent()) setError({ scope, value: settlementError(failure) });
      throw failure;
    }
  }, [tenantId, scope, begin, load]);
  useEffect(() => {
    setError(null); setBusy(false); inFlight.current = null;
    refresh().catch(() => {});
  }, [scope, refresh]);
  const execute = useCallback(async payload => {
    const fingerprint = JSON.stringify(payload);
    if (inFlight.current?.scope === scope) {
      if (inFlight.current.fingerprint !== fingerprint) throw new Error('SETTLEMENT_COMMAND_BUSY');
      return inFlight.current.promise;
    }
    const isCurrent = begin('write');
    setBusy(true); setError(null);
    const pending = Promise.resolve().then(async () => {
      try {
        const receipt = await post(payload);
        if (!isCurrent()) return null;
        await refresh();
        return isCurrent() ? receipt : null;
      } catch (failure) {
        if (!isCurrent()) return null;
        setError({ scope, value: settlementError(failure) });
        throw failure;
      } finally {
        if (isCurrent()) { setBusy(false); inFlight.current = null; }
      }
    });
    inFlight.current = { scope, promise: pending, fingerprint };
    return pending;
  }, [scope, begin, post, refresh]);
  return { data, ready: Boolean(data), error: error?.scope === scope ? error.value : null, busy, refresh, execute };
}
export const useReceivableLedger = tenantId => useSettlementLedger(tenantId, loadReceivableLedger, createReceivableSettlement);
export const useKpiLedger = tenantId => useSettlementLedger(tenantId, loadKpiLedger, createKpiPeriodCommand);
