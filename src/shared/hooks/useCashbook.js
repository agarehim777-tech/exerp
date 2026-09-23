import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';
import { useTenantRequestScope } from './useTenantRequestScope.js';
import { createExpenseCommand, createTransferCommand, createRefundCommand, financeRpcError } from '../../services/financeLedger.js';


const newAccountCode = type => `${type === 'bank' ? 'BNK' : type === 'card' ? 'KRT' : 'KAS'}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const newTransactionNo = (prefix = 'KAS') => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export function useCashbook(tenantId) {
  const { scope, begin } = useTenantRequestScope(tenantId);
  const [summary, setSummary] = useState(null);
  const [loadedScope, setLoadedScope] = useState(null);
  const ledgerReady = Boolean(tenantId && summary && loadedScope === scope);
  const postExpense = useMemo(() => createExpenseCommand(tenantId), [tenantId]);
  const postTransfer = useMemo(() => createTransferCommand(tenantId), [tenantId]);
  const postRefund = useMemo(() => createRefundCommand(tenantId), [tenantId]);

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    const [acc, tx, exp, categoryResult, customerResult, employeeResult, ledgerResult] = await Promise.all([
      supabase.from('cash_accounts').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('created_at'),
      supabase
        .from('cash_transactions')
        .select('*, account:cash_accounts(id,name,currency), customer:customers(id,name,fin,phone), vendor:vendors(id,name)')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: false })
        .limit(300),
      supabase
        .from('expenses')
        .select('*, account:cash_accounts(id,name)')
        .eq('tenant_id', tenantId)
        .order('expense_date', { ascending: false })
        .limit(300),
      supabase.from('expense_categories').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      supabase.from('customers').select('id,name,fin,phone').eq('tenant_id', tenantId).order('name'),
      supabase.from('employees').select('id,user_id,full_name,position').eq('tenant_id', tenantId),
      supabase.rpc('cashbook_ledger_summary', { _tenant_id: tenantId }),
    ]);
    if (!isCurrent()) return;
    setSummary(ledgerResult.error ? null : ledgerResult.data);
    setLoadedScope(scope);
    const firstError = (ledgerResult.error && financeRpcError(ledgerResult.error)) || acc.error || tx.error || exp.error || customerResult.error || employeeResult.error;
    setError(firstError || null);
    setAccounts(acc.data || []);
    setTransactions(tx.data || []);
    setExpenses(exp.data || []);
    setCustomers(customerResult.data || []);
    setEmployees(employeeResult.data || []);
    if (categoryResult.error) setError(current => current || categoryResult.error);
    setExpenseCategories(categoryResult.data || []);
    setLoading(false);
  }, [tenantId, scope, begin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const degraded = useRealtimeResync(
    tenantId,
    ['cash_transactions', 'expenses', 'cash_accounts'],
    fetchAll,
    { channelPrefix: 'cash' },
  );


  const createAccount = async (payload) => {
    const cleanName = String(payload.name || '').trim();
    if (cleanName.toLocaleLowerCase('az') === 'əsas kassa') {
      throw new Error('“Əsas kassa” sistem tərəfindən idarə olunur. Başqa hesab adı daxil edin.');
    }
    if (!cleanName) throw new Error('Kassa adını daxil edin.');
    const { error: err } = await supabase.from('cash_accounts').insert({
      ...payload,
      code: payload.code || newAccountCode(payload.type),
      name: cleanName,
      currency: String(payload.currency || 'AZN').trim().toUpperCase(),
      opening_balance: Number(payload.opening_balance) || 0,
      tenant_id: tenantId,
      is_active: true,
    });
    if (err) throw err;
    await fetchAll();
  };

  const addTransaction = async (payload) => {
    const customer = customers.find(item => item.id === payload.customer_id);
    const { error: err } = await supabase.from('cash_transactions').insert({
      ...payload,
      customer_id: payload.customer_id || null,
      counterparty: customer?.name || String(payload.counterparty || '').trim() || null,
      transaction_no: payload.transaction_no || newTransactionNo(),
      amount: Number(payload.amount) || 0,
      tenant_id: tenantId,
    });
    if (err) throw err;
    await fetchAll();
  };

  const addExpense = async (payload) => {
    if (!ledgerReady) throw new Error('Kassa balansı serverdən yüklənməyib.');
    const result = await postExpense(payload);
    await fetchAll();
    return result;
  };

  const createExpenseCategory = async (name) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Kateqoriya adını daxil edin.');
    if (expenseCategories.some(item => item.name.toLocaleLowerCase('az') === cleanName.toLocaleLowerCase('az'))) throw new Error('Bu kateqoriya artıq mövcuddur.');
    const { data, error: categoryError } = await supabase.from('expense_categories').insert({ tenant_id: tenantId, name: cleanName }).select('*').single();
    if (categoryError) throw categoryError;
    setExpenseCategories(current => [...current, data].sort((a, b) => a.name.localeCompare(b.name, 'az')));
  };

  const updateExpenseCategory = async (category, name) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Kateqoriya adını daxil edin.');
    const { error: categoryError } = await supabase.from('expense_categories').update({ name: cleanName }).eq('id', category.id).eq('tenant_id', tenantId);
    if (categoryError) throw categoryError;
    const next = expenseCategories.map(item => item.id === category.id ? { ...item, name: cleanName } : item).sort((a, b) => a.name.localeCompare(b.name, 'az'));
    setExpenseCategories(next);
  };

  const removeExpenseCategory = async (category) => {
    const { error: categoryError } = await supabase.from('expense_categories').update({ is_active: false }).eq('id', category.id).eq('tenant_id', tenantId);
    if (categoryError) throw categoryError;
    setExpenseCategories(expenseCategories.filter(item => item.id !== category.id));
  };

  const setExpenseStatus = async (id, status) => {
    const { error: err } = await supabase.from('expenses').update({ status }).eq('id', id);
    if (err) throw err;
    await fetchAll();
  };

  const removeTransaction = async (transaction, reason) => {
    const id = typeof transaction === 'string' ? transaction : transaction?.id;
    const { error: err } = await supabase.rpc('reverse_cash_transaction', {
      _tenant_id: tenantId,
      _transaction_id: id,
      _reason: reason,
    });
    if (err) throw financeRpcError(err);
    await fetchAll();
  };

  const approveExpense = async (expense, accountId) => {
    if (!['pending', 'draft'].includes(expense.status)) throw new Error('Bu xərc artıq emal edilib.');
    const { error: expenseError } = await supabase.from('expenses').update({ status: 'approved' }).eq('id', expense.id).eq('tenant_id', tenantId);
    if (expenseError) throw expenseError;
    await fetchAll();
  };

  const rejectExpense = async (expenseId) => {
    const { error: err } = await supabase.from('expenses').update({ status: 'refund_pending' }).eq('id', expenseId).eq('tenant_id', tenantId).in('status', ['pending', 'draft', 'approved', 'paid']);
    if (err) throw err;
    await fetchAll();
  };

  // Bir addımlı ləğv: status "cancelled" olur və məbləğ əks yazılışla kassaya qayıdır.
  const cancelExpense = async (expense, reason = null) => {
    const data = await postRefund({ expenseId: expense.id, reason });
    await fetchAll();
    return data || {};
  };

  const acceptExpense = async (expense) => {
    const { data, error: err } = await supabase.rpc('accept_expense', { _tenant_id: tenantId, _expense_id: expense.id });
    if (err) throw err;
    await fetchAll();
    return data || {};
  };

  const approveExpenseRefund = async (expense) => {
    const result = await postRefund({ expenseId: expense.id, onlyPending: true, reason: 'Expense refund approved' });
    await fetchAll();
    return result;
  };

  const updateExpense = async (expense, payload) => {
    if (!['pending', 'draft'].includes(expense.status)) throw new Error('Təsdiqlənmiş xərc redaktə edilə bilməz.');
    const account = accounts.find(item => item.id === payload.account_id);
    const amount = Number(payload.amount || 0);
    if (!account) throw new Error('Xərc kassasını seçin.');
    if (amount <= 0) throw new Error('Düzgün xərc məbləği daxil edin.');
    const available = balanceOf(account.id) + (account.id === expense.account_id ? Number(expense.amount || 0) : 0);
    if (amount > available) throw new Error('Seçilmiş kassada kifayət qədər vəsait yoxdur.');
    const reference = `EXPENSE:${expense.id}`;
    const { data: oldTransaction, error: transactionReadError } = await supabase.from('cash_transactions').select('*').eq('tenant_id', tenantId).eq('reference', reference).maybeSingle();
    if (transactionReadError) throw transactionReadError;
    const transactionPatch = {
      account_id: account.id, amount, currency: payload.currency || expense.currency || account.currency || 'AZN',
      description: payload.description || payload.category || 'Xərc', occurred_at: payload.expense_date || expense.expense_date,
    };
    if (oldTransaction) {
      const { error: transactionError } = await supabase.from('cash_transactions').update(transactionPatch).eq('id', oldTransaction.id).eq('tenant_id', tenantId);
      if (transactionError) throw transactionError;
    } else {
      const { error: transactionError } = await supabase.from('cash_transactions').insert({ tenant_id: tenantId, transaction_no: newTransactionNo('XRC'), direction: 'out', category: 'expense', reference, ...transactionPatch });
      if (transactionError) throw transactionError;
    }
    const { error: expenseError } = await supabase.from('expenses').update({
      account_id: account.id, category: payload.category, description: payload.description, amount,
      vat_amount: Number(payload.vat_amount || 0), expense_date: payload.expense_date,
    }).eq('id', expense.id).eq('tenant_id', tenantId).in('status', ['pending', 'draft']);
    if (expenseError) {
      if (oldTransaction) await supabase.from('cash_transactions').update({ account_id: oldTransaction.account_id, amount: oldTransaction.amount, currency: oldTransaction.currency, description: oldTransaction.description, occurred_at: oldTransaction.occurred_at }).eq('id', oldTransaction.id).eq('tenant_id', tenantId);
      throw expenseError;
    }
    await fetchAll();
  };

  const removeExpense = async (expense) => {
    if (!['pending', 'draft'].includes(expense.status)) throw new Error('Təsdiqlənmiş xərc silinə bilməz.');
    const reference = `EXPENSE:${expense.id}`;
    const { error: cashError } = await supabase.from('cash_transactions').delete().eq('tenant_id', tenantId).eq('reference', reference);
    if (cashError) throw cashError;
    const { error: expenseError } = await supabase.from('expenses').delete().eq('id', expense.id).eq('tenant_id', tenantId).in('status', ['pending', 'draft']);
    if (expenseError) throw expenseError;
    await fetchAll();
  };

  const removeAccount = async (account) => {
    if (!ledgerReady) throw new Error('Kassa balansı serverdən yüklənməyib.');
    if (account.name?.trim().toLocaleLowerCase('az') === 'əsas kassa') throw new Error('Əsas kassa silinə bilməz.');
    if (Math.abs(balanceOf(account.id)) > 0.0001) throw new Error('Kassanı silməzdən əvvəl qalığını başqa kassaya transfer edin.');
    const { error: err } = await supabase.from('cash_accounts').update({ is_active: false }).eq('id', account.id).eq('tenant_id', tenantId);
    if (err) throw err;
    await fetchAll();
  };

  const transfer = async (payload) => {
    if (!ledgerReady) throw new Error('Kassa balansı serverdən yüklənməyib.');
    const result = await postTransfer(payload);
    await fetchAll();
    return result;
  };

  const balanceOf = useCallback((accountId) => {
    if (!ledgerReady) return null;
    const account = summary.accounts.find(item => item.id === accountId);
    return account ? Number(account.balance) : null;
  }, [ledgerReady, summary]);

  return {
    accounts: loadedScope === scope ? accounts : [],
    transactions: loadedScope === scope ? transactions : [],
    expenses: loadedScope === scope ? expenses : [],
    expenseCategories: loadedScope === scope ? expenseCategories : [],
    customers: loadedScope === scope ? customers : [],
    employees: loadedScope === scope ? employees : [],
    ledgerReady, summary: ledgerReady ? summary : null, loading, error, degraded, refresh: fetchAll,
    createAccount, addTransaction, addExpense, createExpenseCategory, updateExpenseCategory, removeExpenseCategory, updateExpense, removeExpense, setExpenseStatus, approveExpense, rejectExpense, cancelExpense, acceptExpense, approveExpenseRefund, removeTransaction, removeAccount, transfer, balanceOf,
  };
}
