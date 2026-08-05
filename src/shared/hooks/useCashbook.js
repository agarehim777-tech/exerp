import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';

export function useCashbook(tenantId) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [acc, tx, exp] = await Promise.all([
      supabase.from('cash_accounts').select('*').eq('tenant_id', tenantId).order('name'),
      supabase
        .from('cash_transactions')
        .select('*, account:cash_accounts(id,name,currency)')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: false })
        .limit(300),
      supabase
        .from('expenses')
        .select('*, vendor:vendors(id,name), account:cash_accounts(id,name)')
        .eq('tenant_id', tenantId)
        .order('expense_date', { ascending: false })
        .limit(300),
    ]);
    const firstError = acc.error || tx.error || exp.error;
    setError(firstError || null);
    setAccounts(acc.data || []);
    setTransactions(tx.data || []);
    setExpenses(exp.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const degraded = useRealtimeResync(
    tenantId,
    ['cash_transactions', 'expenses', 'cash_accounts'],
    fetchAll,
    { channelPrefix: 'cash' },
  );


  const createAccount = async (payload) => {
    const { error: err } = await supabase.from('cash_accounts').insert({
      ...payload,
      opening_balance: Number(payload.opening_balance) || 0,
      tenant_id: tenantId,
    });
    if (err) throw err;
    await fetchAll();
  };

  const addTransaction = async (payload) => {
    const { error: err } = await supabase.from('cash_transactions').insert({
      ...payload,
      amount: Number(payload.amount) || 0,
      tenant_id: tenantId,
    });
    if (err) throw err;
    await fetchAll();
  };

  const addExpense = async (payload) => {
    const { error: err } = await supabase.from('expenses').insert({
      ...payload,
      amount: Number(payload.amount) || 0,
      vat_amount: Number(payload.vat_amount) || 0,
      tenant_id: tenantId,
    });
    if (err) throw err;
    await fetchAll();
  };

  const setExpenseStatus = async (id, status) => {
    const { error: err } = await supabase.from('expenses').update({ status }).eq('id', id);
    if (err) throw err;
    await fetchAll();
  };

  const removeTransaction = async (id) => {
    const { error: err } = await supabase.from('cash_transactions').delete().eq('id', id);
    if (err) throw err;
    await fetchAll();
  };

  const balanceOf = useCallback((accountId) => {
    const account = accounts.find((a) => a.id === accountId);
    const opening = Number(account?.opening_balance) || 0;
    return transactions
      .filter((t) => t.account_id === accountId)
      .reduce((sum, t) => sum + (t.direction === 'in' ? Number(t.amount) : -Number(t.amount)), opening);
  }, [accounts, transactions]);

  return {
    accounts, transactions, expenses, loading, error, degraded, refresh: fetchAll,
    createAccount, addTransaction, addExpense, setExpenseStatus, removeTransaction, balanceOf,
  };
}
