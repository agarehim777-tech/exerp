import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';
import { createClientId } from '../utils/id.js';

const mainAccountCode = tenantId => `MAIN-${String(tenantId || '').slice(0, 8).toUpperCase()}`;
const newAccountCode = type => `${type === 'bank' ? 'BNK' : type === 'card' ? 'KRT' : 'KAS'}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const newTransactionNo = (prefix = 'KAS') => `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export function useCashbook(tenantId) {
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
    setLoading(true);
    const [acc, tx, exp, categoryResult, customerResult, employeeResult] = await Promise.all([
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
    ]);
    const firstError = acc.error || tx.error || exp.error;
    setError(firstError || null);
    setAccounts(acc.data || []);
    setTransactions(tx.data || []);
    setExpenses(exp.data || []);
    setCustomers(customerResult.data || []);
    setEmployees(employeeResult.data || []);
    const fallbackKey = `erp.expense_categories.${tenantId}`;
    const fallbackNames = ['icarə', 'kommunal', 'əmək haqqı', 'marketinq', 'nəqliyyat', 'digər'];
    let fallback = [];
    try { fallback = JSON.parse(localStorage.getItem(fallbackKey) || '[]'); } catch { fallback = []; }
    setExpenseCategories(categoryResult.error
      ? (fallback.length ? fallback : fallbackNames.map(name => ({ id: `local-${name}`, name, is_active: true })))
      : (categoryResult.data || []));
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
    const account = accounts.find(item => item.id === payload.account_id);
    const amount = Number(payload.amount) || 0;
    if (!account) throw new Error('Xərc kassasını seçin.');
    if (amount <= 0) throw new Error('Düzgün xərc məbləği daxil edin.');
    if (amount > balanceOf(account.id)) throw new Error('Seçilmiş kassada kifayət qədər vəsait yoxdur.');
    const { data: expense, error: err } = await supabase.from('expenses').insert({
      ...payload,
      amount,
      vat_amount: Number(payload.vat_amount) || 0,
      status: 'pending',
      tenant_id: tenantId,
    }).select('*').single();
    if (err) throw err;
    const { error: cashError } = await supabase.from('cash_transactions').insert({
      tenant_id: tenantId, account_id: account.id, direction: 'out', amount,
      transaction_no: newTransactionNo('XRC'),
      currency: expense.currency || account.currency || 'AZN', category: 'expense',
      reference: `EXPENSE:${expense.id}`, description: expense.description || expense.category || 'Xərc',
      occurred_at: expense.expense_date || new Date().toISOString().slice(0, 10),
    });
    if (cashError) {
      await supabase.from('expenses').delete().eq('id', expense.id).eq('tenant_id', tenantId);
      throw cashError;
    }
    await fetchAll();
  };

  const persistFallbackCategories = rows => {
    localStorage.setItem(`erp.expense_categories.${tenantId}`, JSON.stringify(rows));
    setExpenseCategories(rows);
  };

  const createExpenseCategory = async (name) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Kateqoriya adını daxil edin.');
    if (expenseCategories.some(item => item.name.toLocaleLowerCase('az') === cleanName.toLocaleLowerCase('az'))) throw new Error('Bu kateqoriya artıq mövcuddur.');
    const { data, error: categoryError } = await supabase.from('expense_categories').insert({ tenant_id: tenantId, name: cleanName }).select('*').single();
    if (categoryError) persistFallbackCategories([...expenseCategories, { id: createClientId(), name: cleanName, is_active: true }].sort((a, b) => a.name.localeCompare(b.name, 'az')));
    else { setExpenseCategories(current => [...current, data].sort((a, b) => a.name.localeCompare(b.name, 'az'))); }
  };

  const updateExpenseCategory = async (category, name) => {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Kateqoriya adını daxil edin.');
    const { error: categoryError } = await supabase.from('expense_categories').update({ name: cleanName }).eq('id', category.id).eq('tenant_id', tenantId);
    const next = expenseCategories.map(item => item.id === category.id ? { ...item, name: cleanName } : item).sort((a, b) => a.name.localeCompare(b.name, 'az'));
    if (categoryError || String(category.id).startsWith('local-')) persistFallbackCategories(next); else setExpenseCategories(next);
  };

  const removeExpenseCategory = async (category) => {
    const { error: categoryError } = await supabase.from('expense_categories').update({ is_active: false }).eq('id', category.id).eq('tenant_id', tenantId);
    const next = expenseCategories.filter(item => item.id !== category.id);
    if (categoryError || String(category.id).startsWith('local-')) persistFallbackCategories(next); else setExpenseCategories(next);
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
    if (err) {
      const missingRpc = err.code === 'PGRST202' || String(err.message || '').includes('schema cache');
      if (!missingRpc || typeof transaction === 'string') throw err;
      const marker = `REVERSAL_OF:${transaction.id}`;
      const { data: duplicate, error: duplicateError } = await supabase
        .from('cash_transactions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('category', 'transaction_reversal')
        .ilike('description', `%${marker}%`)
        .maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) throw new Error('Bu əməliyyat artıq ləğv edilib.');
      const { error: fallbackError } = await supabase.from('cash_transactions').insert({
        tenant_id: tenantId,
        account_id: transaction.account_id,
        transaction_no: newTransactionNo('LƏĞV'),
        direction: transaction.direction === 'in' ? 'out' : 'in',
        amount: Number(transaction.amount || 0),
        currency: transaction.currency || 'AZN',
        category: 'transaction_reversal',
        counterparty: transaction.counterparty || null,
        customer_id: transaction.customer_id || null,
        vendor_id: transaction.vendor_id || null,
        reference: transaction.reference || transaction.transaction_no || null,
        description: `${marker} · Ləğv: ${transaction.transaction_no || transaction.id} · ${String(reason || '').trim()}`,
        occurred_at: new Date().toISOString().slice(0, 10),
      });
      if (fallbackError) throw fallbackError;
    }
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

  const approveExpenseRefund = async (expense) => {
    if (expense.status !== 'refund_pending') throw new Error('Bu xərc geri qaytarma növbəsində deyil.');
    const account = accounts.find(item => item.id === expense.account_id);
    if (!account) throw new Error('Xərclə əlaqəli kassa tapılmadı.');
    const reference = `EXPENSE-REVERSAL:${expense.id}`;
    const { data: existing, error: existingError } = await supabase.from('cash_transactions').select('id').eq('tenant_id', tenantId).eq('reference', reference).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      const { error: cashError } = await supabase.from('cash_transactions').insert({
        tenant_id: tenantId, account_id: account.id, direction: 'in', amount: Number(expense.amount || 0),
        transaction_no: newTransactionNo('QYT'),
        currency: expense.currency || account.currency || 'AZN', category: 'expense_reversal', reference,
        description: `${expense.description || expense.category || 'Xərc'} — ləğv məbləğinin qaytarılması`,
        occurred_at: new Date().toISOString().slice(0, 10),
      });
      if (cashError) throw cashError;
    }
    const { error: statusError } = await supabase.from('expenses').update({ status: 'cancelled' }).eq('id', expense.id).eq('tenant_id', tenantId);
    if (statusError) throw statusError;
    await fetchAll();
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

  const syncExpenseCashImpact = async () => {
    if (!accounts.length) return 0;
    const payable = expenses.filter(expense => ['pending', 'draft', 'approved'].includes(expense.status));
    if (!payable.length) return 0;
    const references = payable.map(expense => `EXPENSE:${expense.id}`);
    const { data: existing, error: existingError } = await supabase.from('cash_transactions').select('reference').eq('tenant_id', tenantId).in('reference', references);
    if (existingError) throw existingError;
    const known = new Set((existing || []).map(item => item.reference));
    const defaultAccount = accounts.find(account => account.name?.trim().toLocaleLowerCase('az') === 'əsas kassa') || accounts[0];
    const missing = payable.filter(expense => !known.has(`EXPENSE:${expense.id}`));
    for (const expense of missing) {
      const account = accounts.find(item => item.id === expense.account_id) || defaultAccount;
      const { error: cashError } = await supabase.from('cash_transactions').insert({
        tenant_id: tenantId, account_id: account.id, direction: 'out', amount: Number(expense.amount || 0),
        transaction_no: newTransactionNo('XRC'),
        currency: expense.currency || account.currency || 'AZN', category: 'expense', reference: `EXPENSE:${expense.id}`,
        description: expense.description || expense.category || 'Xərc', occurred_at: expense.expense_date || new Date().toISOString().slice(0, 10),
      });
      if (cashError) throw cashError;
      if (!expense.account_id) await supabase.from('expenses').update({ account_id: account.id }).eq('id', expense.id).eq('tenant_id', tenantId);
    }
    if (missing.length) await fetchAll();
    return missing.length;
  };

  const syncOrderPayments = async (legacyCashEntries = []) => {
    const { data: databaseAccounts, error: accountsError } = await supabase.from('cash_accounts')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true).order('created_at');
    if (accountsError) throw accountsError;
    let targetAccounts = databaseAccounts || [];
    const mainAccounts = targetAccounts.filter(account => account.name?.trim().toLocaleLowerCase('az') === 'əsas kassa' && account.currency === 'AZN');
    if (mainAccounts.length > 1) {
      const primary = mainAccounts[0];
      const duplicates = mainAccounts.slice(1);
      const duplicateIds = duplicates.map(account => account.id);
      const combinedOpening = mainAccounts.reduce((sum, account) => sum + Number(account.opening_balance || 0), 0);
      const { error: moveError } = await supabase.from('cash_transactions').update({ account_id: primary.id }).in('account_id', duplicateIds).eq('tenant_id', tenantId);
      if (moveError) throw moveError;
      const { error: openingError } = await supabase.from('cash_accounts').update({ opening_balance: combinedOpening }).eq('id', primary.id).eq('tenant_id', tenantId);
      if (openingError) throw openingError;
      const { error: disableError } = await supabase.from('cash_accounts').update({ is_active: false }).in('id', duplicateIds).eq('tenant_id', tenantId);
      if (disableError) throw disableError;
      targetAccounts = targetAccounts.filter(account => !duplicateIds.includes(account.id)).map(account => account.id === primary.id ? { ...account, opening_balance: combinedOpening } : account);
    }
    if (!targetAccounts.length) {
      const code = mainAccountCode(tenantId);
      let { data: existingMain, error: existingMainError } = await supabase.from('cash_accounts')
        .select('*').eq('tenant_id', tenantId).eq('code', code).limit(1).maybeSingle();
      if (existingMainError) throw existingMainError;
      if (!existingMain) {
        const byName = await supabase.from('cash_accounts')
          .select('*').eq('tenant_id', tenantId).ilike('name', 'Əsas kassa')
          .order('created_at', { ascending: true }).limit(1).maybeSingle();
        if (byName.error) throw byName.error;
        existingMain = byName.data;
      }
      if (existingMain) {
        const { data: reactivated, error: reactivateError } = await supabase.from('cash_accounts')
          .update({ is_active: true, name: 'Əsas kassa', code: existingMain.code || code, type: 'cash', currency: 'AZN' })
          .eq('id', existingMain.id).eq('tenant_id', tenantId).select('*').single();
        if (reactivateError) throw reactivateError;
        targetAccounts = [reactivated];
      } else {
        const { data: created, error: createError } = await supabase.from('cash_accounts').insert({
          tenant_id: tenantId,
          code,
          name: 'Əsas kassa',
          type: 'cash',
          currency: 'AZN',
          opening_balance: 0,
          is_active: true,
        }).select('*').single();
        if (createError) throw createError;
        targetAccounts = [created];
      }
    }

    const [{ data: orders, error: ordersError }, { data: existing, error: existingError }] = await Promise.all([
      supabase.from('orders').select('id,order_no,order_date,created_at,total,paid_amount,currency,customer_id,created_by,customer:customers(name)').eq('tenant_id', tenantId),
      supabase.from('cash_transactions').select('id,account_id,reference,amount,currency,category,customer_id').eq('tenant_id', tenantId).eq('direction', 'in'),
    ]);
    if (ordersError) throw ordersError;
    if (existingError) throw existingError;
    const activeAccountIds = new Set(targetAccounts.map(account => account.id));
    for (const transaction of existing || []) {
      if (activeAccountIds.has(transaction.account_id)) continue;
      if (!['sales_payment', 'credit_payment', 'receivable_payment'].includes(transaction.category)) continue;
      const targetAccount = targetAccounts.find(account => account.currency === (transaction.currency || 'AZN')) || targetAccounts[0];
      if (!targetAccount) continue;
      const { error: relinkError } = await supabase.from('cash_transactions')
        .update({ account_id: targetAccount.id })
        .eq('id', transaction.id).eq('tenant_id', tenantId);
      if (relinkError) throw relinkError;
      transaction.account_id = targetAccount.id;
    }
    const knownReferences = new Set((existing || []).map(row => row.reference).filter(Boolean));
    const normalize = value => String(value || '').trim().toLocaleLowerCase('az');
    const legacyByOrder = new Map();
    const matchedLegacyIds = new Set();
    (legacyCashEntries || []).filter(entry => Number(entry.amount || 0) > 0).forEach(entry => {
      let match = (orders || []).find(order => normalize(order.id) === normalize(entry.orderId) || normalize(order.order_no) === normalize(entry.orderId));
      if (!match && entry.customer) {
        const customerMatches = (orders || []).filter(order => normalize(order.customer?.name) === normalize(entry.customer));
        if (customerMatches.length === 1) match = customerMatches[0];
      }
      if (match) {
        legacyByOrder.set(match.id, Number(legacyByOrder.get(match.id) || 0) + Number(entry.principal ?? entry.amount));
        matchedLegacyIds.add(entry.id);
      }
    });
    for (const order of orders || []) {
      const legacyPaid = Number(legacyByOrder.get(order.id) || 0);
      const currentPaid = Number(order.paid_amount || 0);
      const nextPaid = Math.min(Number(order.total || 0), Math.max(currentPaid, legacyPaid));
      if (nextPaid > currentPaid) {
        const { error: updateError } = await supabase.from('orders').update({
          paid_amount: nextPaid,
          payment_status: nextPaid >= Number(order.total || 0) ? 'paid' : 'partial',
        }).eq('id', order.id).eq('tenant_id', tenantId);
        if (updateError) throw updateError;
        order.paid_amount = nextPaid;
      }
    }
    const duplicateLegacyTransactions = (existing || []).filter(transaction => {
      if (!String(transaction.reference || '').startsWith('LEGACY:')) return false;
      return matchedLegacyIds.has(String(transaction.reference).slice('LEGACY:'.length));
    });
    if (duplicateLegacyTransactions.length) {
      const duplicateIds = duplicateLegacyTransactions.map(transaction => transaction.id);
      const { error: cleanupError } = await supabase.from('cash_transactions').delete().in('id', duplicateIds).eq('tenant_id', tenantId);
      if (cleanupError) throw cleanupError;
      duplicateLegacyTransactions.forEach(transaction => knownReferences.delete(transaction.reference));
    }
    for (const order of orders || []) {
      const paid = Number(order.paid_amount || 0);
      if (paid <= 0 || knownReferences.has(order.order_no)) continue;
      const linkedSalesTransactions = (existing || []).filter(transaction =>
        transaction.category === 'sales_payment' && transaction.customer_id && transaction.customer_id === order.customer_id
      );
      const linkedAmount = linkedSalesTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
      if (linkedAmount >= paid && linkedSalesTransactions.length) {
        knownReferences.add(order.order_no);
        if (linkedSalesTransactions.length === 1 && linkedSalesTransactions[0].reference !== order.order_no) {
          const { error: referenceError } = await supabase.from('cash_transactions').update({ reference: order.order_no }).eq('id', linkedSalesTransactions[0].id).eq('tenant_id', tenantId);
          if (referenceError) throw referenceError;
          linkedSalesTransactions[0].reference = order.order_no;
        }
      }
    }
    const cashPaidByOrder = new Map();
    (existing || []).filter(transaction => ['sales_payment', 'credit_payment', 'receivable_payment'].includes(transaction.category) && transaction.reference).forEach(transaction => {
      cashPaidByOrder.set(transaction.reference, Number(cashPaidByOrder.get(transaction.reference) || 0) + Number(transaction.amount || 0));
    });
    const orderRows = (orders || []).map(order => {
      const paid = Number(order.paid_amount || 0);
      const recordedCash = Number(cashPaidByOrder.get(order.order_no) || 0);
      const missingCash = Number(Math.max(0, paid - recordedCash).toFixed(2));
      if (missingCash <= 0) return null;
      const account = targetAccounts.find(item => item.currency === (order.currency || 'AZN')) || targetAccounts[0];
      return {
        tenant_id: tenantId,
        transaction_no: newTransactionNo('SAT'),
        account_id: account.id,
        direction: 'in',
        amount: missingCash,
        currency: order.currency || account.currency || 'AZN',
        category: 'sales_payment',
        counterparty: order.customer?.name || null,
        customer_id: order.customer_id || null,
        reference: order.order_no,
        description: `${order.order_no} sifarişi üzrə əvvəlki ödənişin kassa sinxronizasiyası`,
        occurred_at: order.order_date || order.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        created_by: order.created_by || null,
      };
    }).filter(Boolean);
    const defaultAccount = targetAccounts.find(item => item.currency === 'AZN') || targetAccounts[0];
    const legacyRows = (legacyCashEntries || [])
      .filter(entry => Number(entry.amount || 0) > 0)
      .filter(entry => !matchedLegacyIds.has(entry.id))
      .filter(entry => !knownReferences.has(`LEGACY:${entry.id}`))
      .map(entry => ({
        tenant_id: tenantId,
        transaction_no: newTransactionNo(entry.source === 'Kredit ödənişi' ? 'KRD' : 'MDX'),
        account_id: defaultAccount.id,
        direction: 'in',
        amount: Number(entry.amount),
        currency: 'AZN',
        category: entry.source === 'Kredit ödənişi' ? 'credit_payment' : 'receivable_payment',
        counterparty: entry.customer || null,
        reference: `LEGACY:${entry.id}`,
        description: [entry.source, entry.contractId || entry.creditId || entry.orderId, entry.note].filter(Boolean).join(' · '),
        occurred_at: entry.date || new Date().toISOString().slice(0, 10),
      }));
    const rows = [...orderRows, ...legacyRows];
    if (rows.length) {
      const { error: insertError } = await supabase.from('cash_transactions').insert(rows);
      if (insertError) throw insertError;
    }
    await fetchAll();
    return rows.length;
  };

  const removeAccount = async (account) => {
    if (account.name?.trim().toLocaleLowerCase('az') === 'əsas kassa') throw new Error('Əsas kassa silinə bilməz.');
    if (Math.abs(balanceOf(account.id)) > 0.0001) throw new Error('Kassanı silməzdən əvvəl qalığını başqa kassaya transfer edin.');
    const { error: err } = await supabase.from('cash_accounts').update({ is_active: false }).eq('id', account.id).eq('tenant_id', tenantId);
    if (err) throw err;
    await fetchAll();
  };

  const transfer = async ({ fromAccountId, toAccountId, amount, occurredAt, description }) => {
    const value = Number(amount);
    const from = accounts.find(account => account.id === fromAccountId);
    const to = accounts.find(account => account.id === toAccountId);
    if (!from || !to || from.id === to.id) throw new Error('Fərqli mənbə və təyinat kassaları seçin.');
    if (from.currency !== to.currency) throw new Error('Transfer yalnız eyni valyutalı kassalar arasında mümkündür.');
    if (!Number.isFinite(value) || value <= 0) throw new Error('Düzgün məbləğ daxil edin.');
    if (value > balanceOf(from.id)) throw new Error('Mənbə kassada kifayət qədər qalıq yoxdur.');
    const reference = `TRANSFER:${createClientId()}`;
    const common = { tenant_id: tenantId, amount: value, currency: from.currency, category: 'internal_transfer', reference, occurred_at: occurredAt || new Date().toISOString().slice(0, 10), description: description || `${from.name} → ${to.name}` };
    const { error: err } = await supabase.from('cash_transactions').insert([
      { ...common, transaction_no: newTransactionNo('TRF-CIX'), account_id: from.id, direction: 'out', counterparty: to.name },
      { ...common, transaction_no: newTransactionNo('TRF-GIR'), account_id: to.id, direction: 'in', counterparty: from.name },
    ]);
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
    accounts, transactions, expenses, expenseCategories, customers, employees, loading, error, degraded, refresh: fetchAll,
    createAccount, addTransaction, addExpense, createExpenseCategory, updateExpenseCategory, removeExpenseCategory, updateExpense, removeExpense, setExpenseStatus, approveExpense, rejectExpense, approveExpenseRefund, syncExpenseCashImpact, removeTransaction, syncOrderPayments, removeAccount, transfer, balanceOf,
  };
}
