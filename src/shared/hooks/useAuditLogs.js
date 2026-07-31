import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useAuditLogs(tenantId, filters = {}) {
  const { table, action, limit = 200 } = filters;
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (table) query = query.eq('table_name', table);
    if (action) query = query.eq('action', action);
    const { data, error: err } = await query;
    setError(err || null);
    setLogs(data || []);
    setLoading(false);
  }, [tenantId, table, action, limit]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { logs, loading, error, refresh: fetchAll };
}
