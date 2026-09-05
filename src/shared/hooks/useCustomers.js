import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync';

const META_PREFIX = '__crm_meta__:';
const readMeta = (notes) => { try { return String(notes || '').startsWith(META_PREFIX) ? JSON.parse(String(notes).slice(META_PREFIX.length)) : {}; } catch { return {}; } };
const customerPayload = (values, previousNotes = null) => {
  const { birth_date, customer_level_override, fin_code, identity_card_no, paid_total: _paid, customer_level: _level, ...base } = values;
  const meta = { ...readMeta(previousNotes), birth_date: birth_date || null, customer_level_override: customer_level_override || null, fin_code: fin_code || null, identity_card_no: identity_card_no || null };
  return {
    ...base,
    // Empty strings participate in the tenant/email unique index. Store an
    // omitted optional e-mail as NULL so multiple customers can be e-mailless.
    email: String(base.email || '').trim() || null,
    notes: `${META_PREFIX}${JSON.stringify(meta)}`,
  };
};

const CUSTOMERS_PAGE_SIZE = 500;
const compact = value => String(value || '').toLocaleLowerCase('az').replace(/[^a-z0-9əöüğşıç]/g, '');
export const findCustomerDuplicates = (candidate, rows, excludedId = null) => rows.filter(row => row.id !== excludedId && [
  ['FİN/VÖEN', compact(candidate.fin_code || candidate.tax_id), compact(row.fin_code || row.tax_id)],
  ['telefon', compact(candidate.phone), compact(row.phone)],
  ['e-poçt', compact(candidate.email), compact(row.email)],
].some(([, left, right]) => left && right && left === right));

export function useCustomers(tenantId) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [levels, setLevels] = useState({ silver: 1000, gold: 5000, platinum: 15000 });
  const [limit, setLimit] = useState(CUSTOMERS_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [customerResult, orderResult, levelResult] = await Promise.all([
      supabase.from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit + 1),
      supabase.rpc('customer_sales_metrics', { _tenant: tenantId }),
      supabase.from('customer_level_settings').select('silver_min,gold_min,platinum_min').eq('tenant_id', tenantId).maybeSingle(),
    ]);
    if (customerResult.error) setError(customerResult.error);
    else {
      const storedLevels = JSON.parse(localStorage.getItem(`crm-levels:${tenantId}`) || 'null');
      const nextLevels = levelResult.data ? { silver: Number(levelResult.data.silver_min), gold: Number(levelResult.data.gold_min), platinum: Number(levelResult.data.platinum_min) } : (storedLevels || { silver: 1000, gold: 5000, platinum: 15000 });
      setLevels(nextLevels);
      const paidByCustomer = new Map();
      (orderResult.data || []).forEach((row) => paidByCustomer.set(row.customer_id, Number(row.paid_total || 0)));
      const customerRows = customerResult.data || [];
      setHasMore(customerRows.length > limit);
      setCustomers(customerRows.slice(0, limit).map((customer) => {
        const meta = readMeta(customer.notes);
        customer = { ...customer, birth_date: customer.birth_date || meta.birth_date || null, customer_level_override: customer.customer_level_override || meta.customer_level_override || null, fin_code: meta.fin_code || (customer.segment !== 'business' && customer.tax_id && !/^\d{10}$/.test(customer.tax_id) ? customer.tax_id : null), identity_card_no: meta.identity_card_no || null };
        const paidTotal = paidByCustomer.get(customer.id) || 0;
        const automaticLevel = paidTotal >= nextLevels.platinum ? 'platinum' : paidTotal >= nextLevels.gold ? 'gold' : paidTotal >= nextLevels.silver ? 'silver' : 'standard';
        return { ...customer, paid_total: paidTotal, customer_level: customer.customer_level_override || automaticLevel };
      }));
    }
    setLoading(false);
  }, [tenantId, limit]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadMore = useCallback(() => setLimit((value) => value + CUSTOMERS_PAGE_SIZE), []);

  useRealtimeResync(tenantId, ['customers'], fetchAll, { channelPrefix: 'customers' });

  const create = async (values) => {
    const duplicates = findCustomerDuplicates(values, customers);
    if (duplicates.length) throw new Error(`Dublikat müştəri: ${duplicates.map(item => item.name).join(', ')}. FİN/VÖEN, telefon və e-poçtu yoxlayın.`);
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
    const duplicates = findCustomerDuplicates(values, customers, id);
    if (duplicates.length) throw new Error(`Bu məlumat başqa müştəriyə aiddir: ${duplicates.map(item => item.name).join(', ')}.`);
    const { data, error } = await supabase
      .from('customers').update(customerPayload(values, current?.notes)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  };

  const remove = async (id) => {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
  };

  return { customers, levels, loading, error, hasMore, loadMore, refresh: fetchAll, create, update, remove, saveLevels };
}

