import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';

export function useCurrencies(tenantId) {
  const [currencies, setCurrencies] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setCurrencies([]); setRates([]); return; }
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        supabase.from('currencies').select('*').eq('tenant_id', tenantId).order('code'),
        supabase.from('exchange_rates').select('*').eq('tenant_id', tenantId)
          .order('rate_date', { ascending: false }).limit(200),
      ]);
      if (cRes.error) throw cRes.error;
      if (rRes.error) throw rRes.error;
      setCurrencies(cRes.data || []);
      setRates(rRes.data || []);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  const degraded = useRealtimeResync(tenantId, ['currencies', 'exchange_rates'], fetchAll, { channelPrefix: 'fx' });

  const baseCurrency = currencies.find((c) => c.is_base) || null;

  const addCurrency = async ({ code, name, symbol }) => {
    const { error: err } = await supabase.from('currencies').insert({
      tenant_id: tenantId,
      code: String(code || '').trim().toUpperCase(),
      name: name || code,
      symbol: symbol || null,
    });
    if (err) throw err;
    await fetchAll();
  };

  const toggleActive = async (id, isActive) => {
    const { error: err } = await supabase.from('currencies').update({ is_active: isActive }).eq('id', id);
    if (err) throw err;
    await fetchAll();
  };

  const setRate = async ({ currency_code, rate_date, rate, source = 'manual' }) => {
    const { error: err } = await supabase.from('exchange_rates').upsert({
      tenant_id: tenantId,
      currency_code: String(currency_code).toUpperCase(),
      rate_date: rate_date || new Date().toISOString().slice(0, 10),
      rate: Number(rate),
      source,
    }, { onConflict: 'tenant_id,currency_code,rate_date' });
    if (err) throw err;
    await fetchAll();
  };

  /** Verilmiş tarixə (və ya ondan əvvəlki ən yaxın tarixə) məzənnə. Tapılmazsa 1. */
  const rateFor = useCallback((code, onDate) => {
    if (!code || (baseCurrency && code === baseCurrency.code)) return 1;
    const limit = onDate || new Date().toISOString().slice(0, 10);
    const match = rates
      .filter((r) => r.currency_code === code && r.rate_date <= limit)
      .sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1))[0];
    return match ? Number(match.rate) : 1;
  }, [rates, baseCurrency]);

  /** Məbləği əsas valyutaya çevirir. */
  const toBase = useCallback((amount, code, onDate) => Number(amount || 0) * rateFor(code, onDate), [rateFor]);

  return { currencies, rates, baseCurrency, loading, error, degraded, refresh: fetchAll, addCurrency, toggleActive, setRate, rateFor, toBase };
}

export default useCurrencies;
