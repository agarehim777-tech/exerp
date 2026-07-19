import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

export function computeQuoteTotals(items = []) {
  let subtotal = 0, discount = 0, tax = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.unit_price) || 0;
    const disc = Number(it.discount_pct) || 0;
    const rate = Number(it.tax_rate) || 0;
    const lineGross = qty * price;
    const lineDisc = lineGross * (disc / 100);
    const lineNet = lineGross - lineDisc;
    const lineTax = lineNet * (rate / 100);
    subtotal += lineGross;
    discount += lineDisc;
    tax += lineTax;
  }
  const total = subtotal - discount + tax;
  return {
    subtotal: +subtotal.toFixed(2),
    discount_total: +discount.toFixed(2),
    tax_total: +tax.toFixed(2),
    total: +total.toFixed(2),
  };
}

function lineTotalOf(it) {
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  const disc = Number(it.discount_pct) || 0;
  const rate = Number(it.tax_rate) || 0;
  const net = qty * price * (1 - disc / 100);
  return +(net * (1 + rate / 100)).toFixed(2);
}

export function useQuotes(tenantId) {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setQuotes([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from('quotes')
      .select('*, customer:customers(id,name,email), items:quote_items(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setQuotes(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(`quotes:${tenantId}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_items' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, fetchAll]);

  const nextNumber = async () => {
    const yr = new Date().getFullYear();
    const prefix = `QT-${yr}-`;
    const { data } = await supabase
      .from('quotes').select('number').eq('tenant_id', tenantId).like('number', `${prefix}%`)
      .order('number', { ascending: false }).limit(1);
    const last = data?.[0]?.number;
    const n = last ? parseInt(last.split('-')[2], 10) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
  };

  const create = async ({ items = [], ...header }) => {
    const totals = computeQuoteTotals(items);
    const { data: { user } } = await supabase.auth.getUser();
    const number = header.number || await nextNumber();
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({ ...header, ...totals, tenant_id: tenantId, owner_id: user?.id, number })
      .select().single();
    if (error) throw error;
    if (items.length) {
      const rows = items.map((it, i) => ({
        quote_id: quote.id, product_id: it.product_id || null,
        description: it.description, qty: it.qty, unit_price: it.unit_price,
        discount_pct: it.discount_pct || 0, tax_rate: it.tax_rate ?? 18,
        line_total: lineTotalOf(it), sort_order: i,
      }));
      const { error: e2 } = await supabase.from('quote_items').insert(rows);
      if (e2) throw e2;
    }
    return quote;
  };

  const update = async (id, { items, ...header }) => {
    let patch = { ...header };
    if (items) {
      const totals = computeQuoteTotals(items);
      patch = { ...patch, ...totals };
    }
    const { error } = await supabase.from('quotes').update(patch).eq('id', id);
    if (error) throw error;
    if (items) {
      await supabase.from('quote_items').delete().eq('quote_id', id);
      if (items.length) {
        const rows = items.map((it, i) => ({
          quote_id: id, product_id: it.product_id || null,
          description: it.description, qty: it.qty, unit_price: it.unit_price,
          discount_pct: it.discount_pct || 0, tax_rate: it.tax_rate ?? 18,
          line_total: lineTotalOf(it), sort_order: i,
        }));
        const { error: e2 } = await supabase.from('quote_items').insert(rows);
        if (e2) throw e2;
      }
    }
  };

  const setStatus = (id, status) => update(id, { status });

  const remove = async (id) => {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw error;
  };

  const convertToOrder = async (id) => {
    const { data, error } = await supabase.rpc('convert_quote_to_order', { _quote_id: id });
    if (error) throw error;
    return data;
  };

  return { quotes, loading, refresh: fetchAll, create, update, setStatus, remove, convertToOrder, nextNumber };
}
