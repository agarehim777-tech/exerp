import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync';
import {
  buildProfitAndLoss,
  buildBalanceSheet,
  buildReceivablesAging,
  buildCashFlow,
  type TrialBalanceRow,
  type InvoiceLike,
  type CashTransactionLike,
} from '../lib/financialReports';

export interface DateRange {
  from: string;
  to: string;
}

function defaultRange(): DateRange {
  const now = new Date();
  const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const from = localDate(new Date(now.getFullYear(), 0, 1));
  const to = localDate(now);
  return { from, to };
}

const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const inRange = (value: unknown, range: DateRange) => String(value || '') >= range.from && String(value || '') <= range.to;

function cleanReversedTransactions(rows: any[] = []) {
  const reversedIds = new Set(rows.flatMap((row) => {
    if (row.category !== 'transaction_reversal' && !row.reversal_of) return [];
    const markerId = String(row.description || '').match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
    return [row.reversal_of, markerId].filter(Boolean);
  }));
  return rows.filter((row) => row.category !== 'transaction_reversal' && !row.reversal_of && !reversedIds.has(row.id));
}

/**
 * Maliyyə hesabatları üçün data qatı: trial balance + AR + kassa axını.
 */
export function useFinancialStatements(tenantId?: string | null, initialRange: DateRange = defaultRange()) {
  const [range, setRange] = useState<DateRange>(initialRange);
  const [trialRows, setTrialRows] = useState<TrialBalanceRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceLike[]>([]);
  const [transactions, setTransactions] = useState<CashTransactionLike[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<any[]>([]);
  const [source, setSource] = useState<'journal' | 'operations'>('operations');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [tb, ar, cash, orderResult, expenseResult, accountResult, stockResult, payableResult] = await Promise.all([
      supabase.rpc('trial_balance', { _tenant: tenantId, _from: range.from, _to: range.to }),
      supabase
        .from('sales_invoices')
        .select('id,status,total,paid_amount,due_date,invoice_date,customer_id,customer:customers(id,name)')
        .eq('tenant_id', tenantId),
      supabase
        .from('cash_transactions')
        .select('id,amount,direction,category,occurred_at,created_at,description,reversal_of')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: true }),
      supabase.from('orders').select('id,total,status,order_date,items:order_items(qty,product_id)').eq('tenant_id', tenantId),
      supabase.from('expenses').select('id,amount,status,expense_date').eq('tenant_id', tenantId),
      supabase.from('cash_accounts').select('id,opening_balance,is_active').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('stock_balances').select('product_id,on_hand,avg_cost').eq('tenant_id', tenantId),
      supabase.from('vendor_invoices').select('id,status,invoice_date,due_date,lines:vendor_invoice_lines(qty_invoiced,unit_price,tax_rate)').eq('tenant_id', tenantId),
    ]);
    const operationalError = ar.error || cash.error || orderResult.error || expenseResult.error || accountResult.error || stockResult.error || payableResult.error || null;
    setError(operationalError);
    const journalRows = (tb.data as TrialBalanceRow[]) || [];
    const hasJournalProfitAndLoss = journalRows.some((row) => ['revenue', 'expense'].includes(String(row.type)) && Math.abs(amount(row.debit) - amount(row.credit)) > 0.0001);
    const averageCost = new Map((stockResult.data || []).map((row: any) => [row.product_id, amount(row.avg_cost)]));
    const periodOrders = (orderResult.data || []).filter((row: any) => row.status !== 'cancelled' && inRange(row.order_date, range));
    const revenue = periodOrders.reduce((sum: number, row: any) => sum + amount(row.total), 0);
    const costOfGoods = periodOrders.reduce((sum: number, row: any) => sum + (row.items || []).reduce((lineSum: number, line: any) => lineSum + amount(line.qty) * amount(averageCost.get(line.product_id)), 0), 0);
    const operatingExpense = (expenseResult.data || []).filter((row: any) => ['approved', 'paid'].includes(row.status) && inRange(row.expense_date, range)).reduce((sum: number, row: any) => sum + amount(row.amount), 0);
    const cleanCash = cleanReversedTransactions(cash.data || []);
    const cashBalance = (accountResult.data || []).reduce((sum: number, row: any) => sum + amount(row.opening_balance), 0)
      + cleanCash.reduce((sum: number, row: any) => sum + (row.direction === 'in' ? amount(row.amount) : -amount(row.amount)), 0);
    const inventoryValue = (stockResult.data || []).reduce((sum: number, row: any) => sum + amount(row.on_hand) * amount(row.avg_cost), 0);
    const receivables = (ar.data || []).filter((row: any) => !['cancelled', 'draft'].includes(row.status)).reduce((sum: number, row: any) => sum + Math.max(0, amount(row.total) - amount(row.paid_amount)), 0);
    const payables = (payableResult.data || []).filter((row: any) => !['paid', 'cancelled', 'draft'].includes(row.status)).reduce((sum: number, row: any) => sum + (row.lines || []).reduce((lineSum: number, line: any) => lineSum + amount(line.qty_invoiced) * amount(line.unit_price) * (1 + amount(line.tax_rate) / 100), 0), 0);
    const netProfit = revenue - costOfGoods - operatingExpense;
    const assetTotal = cashBalance + inventoryValue + receivables;
    const fallbackRows: TrialBalanceRow[] = [
      { code: '1000', name: 'Kassa və bank', type: 'asset', debit: cashBalance, credit: 0 },
      { code: '1400', name: 'Anbar ehtiyatları', type: 'asset', debit: inventoryValue, credit: 0 },
      { code: '1200', name: 'Debitor borcları', type: 'asset', debit: receivables, credit: 0 },
      { code: '3300', name: 'Kreditor borcları', type: 'liability', debit: 0, credit: payables },
      { code: '5000', name: 'Yığılmış kapital', type: 'equity', debit: 0, credit: assetTotal - payables - netProfit },
      { code: '6000', name: 'Satış gəliri', type: 'revenue', debit: 0, credit: revenue },
      { code: '7000', name: 'Satılan malların maya dəyəri', type: 'expense', debit: costOfGoods, credit: 0 },
      { code: '7100', name: 'Əməliyyat xərcləri', type: 'expense', debit: operatingExpense, credit: 0 },
    ];
    setSource(hasJournalProfitAndLoss ? 'journal' : 'operations');
    setTrialRows(hasJournalProfitAndLoss ? journalRows : fallbackRows);
    setInvoices((ar.data as unknown as InvoiceLike[]) || []);
    setTransactions(cleanCash.filter((row: any) => inRange(row.occurred_at || row.created_at, range)) as CashTransactionLike[]);
    setAccounts(accountResult.data || []);
    setStock(stockResult.data || []);
    setVendorInvoices(payableResult.data || []);
    setLoading(false);
  }, [tenantId, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const degraded = useRealtimeResync(
    tenantId || null,
    ['orders', 'order_items', 'expenses', 'cash_transactions', 'cash_accounts', 'stock_balances', 'sales_invoices', 'vendor_invoices'],
    load,
    { channelPrefix: 'financial-statements', debounceMs: 700 },
  );

  const profitAndLoss = useMemo(() => buildProfitAndLoss(trialRows), [trialRows]);
  const balanceSheet = useMemo(
    () => buildBalanceSheet(trialRows, profitAndLoss.netProfit),
    [trialRows, profitAndLoss.netProfit],
  );
  const aging = useMemo(() => buildReceivablesAging(invoices, range.to), [invoices, range.to]);
  const cashFlow = useMemo(() => buildCashFlow(transactions), [transactions]);
  const cashFlowForecast = useMemo(() => {
    const today = new Date(range.to);
    const monthlyOutflow = cashFlow.rows.length ? cashFlow.outflow / cashFlow.rows.length : 0;
    let cumulative = cashFlow.net;
    const rows = Array.from({ length: 3 }, (_, index) => {
      const start = new Date(today.getFullYear(), today.getMonth() + index + 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth() + index + 2, 0);
      const expectedInflow = invoices.filter(invoice => {
        const due = new Date(invoice.due_date || invoice.invoice_date || "");
        return due >= start && due <= end && Number(invoice.total || 0) > Number(invoice.paid_amount || 0);
      }).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total || 0) - Number(invoice.paid_amount || 0)), 0);
      const expectedOutflow = monthlyOutflow;
      cumulative += expectedInflow - expectedOutflow;
      return { month: start.toISOString().slice(0, 7), expectedInflow, expectedOutflow, net: expectedInflow - expectedOutflow, cumulative };
    });
    return { rows, opening: cashFlow.net, monthlyOutflow };
  }, [cashFlow, invoices, range.to]);

  return { range, setRange, loading, error, degraded, source, reload: load, trialRows, accounts, stock, vendorInvoices, profitAndLoss, balanceSheet, aging, cashFlow, cashFlowForecast };
}
