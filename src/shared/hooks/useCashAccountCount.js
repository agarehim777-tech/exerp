import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';
import { useTenantRequestScope } from './useTenantRequestScope';

// Number of active cash/bank accounts (public.cash_accounts) for the onboarding check. The browser-only
// financeAccounts list this used to read was retired; cash accounts are the single source.
export function useCashAccountCount(tenantId) {
  const { begin } = useTenantRequestScope(tenantId);
  const [count, setCount] = useState(0);

  useEffect(() => { setCount(0); }, [tenantId]);
  const fetchCount = useCallback(async () => {
    if (!tenantId) { setCount(0); return; }
    const isCurrent = begin();
    const { count: total, error } = await supabase.from('cash_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('is_active', true);
    if (!isCurrent() || error) return;
    setCount(total || 0);
  }, [tenantId, begin]);

  useEffect(() => { fetchCount(); }, [fetchCount]);
  useRealtimeResync(tenantId, ['cash_accounts'], fetchCount, { channelPrefix: 'cash-account-count' });
  return count;
}
