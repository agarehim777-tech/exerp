import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function useCustomer360(customerId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchIt = useCallback(async () => {
    if (!customerId) { setData(null); return; }
    setLoading(true);
    const { data: json } = await supabase.rpc('customer_360', { _customer: customerId });
    setData(json);
    setLoading(false);
  }, [customerId]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  return { data, loading, refresh: fetchIt };
}
