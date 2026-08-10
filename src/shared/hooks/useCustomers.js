import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

const META_PREFIX = '__crm_meta__:';
const readMeta = (notes) => { try { return String(notes || '').startsWith(META_PREFIX) ? JSON.parse(String(notes).slice(META_PREFIX.length)) : {}; } catch { return {}; } };
const customerPayload = (values, previousNotes = null) => {
  const { birth_date, customer_level_override, paid_total: _paid, customer_level: _level, ...base } = values;
  const meta = { ...readMeta(previousNotes), birth_date: birth_date || null, customer_level_override: customer_level_override || null };
  return { ...base, notes: `${META_PREFIX}${JSON.stringify(meta)}` };
};

export function useCustomers(tenantId) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [levels, setLevels] = useState({ silver: 1000, gold: 5000, platinum: 15000 });

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [customerResult, orderResult, levelResult] = await Promise.all([
      supabase.from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('orders').select('customer_id,paid_amount').eq('tenant_id', tenantId),
      supabase.from('customer_level_settings').select('silver_min,gold_min,platinum_min').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    if (customerResult.error) setError(customerResult.error);
    else {
      const storedLevels = JSON.parse(localStorage.getItem(`crm-levels:${tenantId}`) || 'null');
      const nextLevels = levelResult.data ? { silver: Number(levelResult.data.silver_min), gold: Number(levelResult.data.gold_min), platinum: Number(levelResult.data.platinum_min) } : (storedLevels || { silver: 1000, gold: 5000, platinum: 15000 });
      setLevels(nextLevels);
      const paidByCustomer = new Map();
      (orderResult.data || []).forEach((order) => paidByCustomer.set(order.customer_id, (paidByCustomer.get(order.customer_id) || 0) + Number(order.paid_amount || 0)));
      setCustomers((customerResult.data || []).map((customer) => {
        const meta = readMeta(customer.notes);
        customer = { ...customer, birth_date: customer.birth_date || meta.birth_date || null, customer_level_override: customer.customer_level_override || meta.customer_level_override || null };
        const paidTotal = paidByCustomer.get(customer.id) || 0;
        const automaticLevel = paidTotal >= nextLevels.platinum ? 'platinum' : paidTotal >= nextLevels.gold ? 'gold' : paidTotal >= nextLevels.silver ? 'silver' : 'standard';
        return { ...customer, paid_total: paidTotal, customer_level: customer.customer_level_override || automaticLevel };
      }));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`customers:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'customers', filter: `tenant_id=eq.${tenantId}` },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = async (values) => {
    const { data, error } = await supabase
      .from('customers')
      .insert({ ...customerPayload(values), tenant_id: tenantId })
      .select().single();
    if (error) throw error;
    return data;
  };

  const saveLevels = async (next) => {
    const payload = { tenant_id: tenantId, silver_min: Number(next.silver), gold_min: Number(next.gold), platinum_min: Number(next.platinum) };
    const { error } = await supabase.from('customer_level_settings').upsert(payload, { onConflict: 'tenant_id' });
    if (error && !String(error.message || '').includes('customer_level_settings')) throw error;
    localStorage.setItem(`crm-levels:${tenantId}`, JSON.stringify(next));
    setLevels(next);
    await fetchAll();
  };

  const update = async (id, values) => {
    const current = customers.find(customer => customer.id === id);
    const { data, error } = await supabase
      .from('customers').update(customerPayload(values, current?.notes)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  };

  const remove = async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
  };

  return { customers, levels, loading, error, refresh: fetchAll, create, update, remove, saveLevels };
}
