import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
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
  const from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

/**
 * Maliyyə hesabatları üçün data qatı: trial balance + AR + kassa axını.
 */
export function useFinancialStatements(tenantId?: string | null, initialRange: DateRange = defaultRange()) {
  const [range, setRange] = useState<DateRange>(initialRange);
  const [trialRows, setTrialRows] = useState<TrialBalanceRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceLike[]>([]);
  const [transactions, setTransactions] = useState<CashTransactionLike[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [tb, ar, cash] = await Promise.all([
      supabase.rpc('trial_balance', { _tenant: tenantId, _from: range.from, _to: range.to }),
      supabase
        .from('sales_invoices')
        .select('id,status,total,paid_amount,due_date,invoice_date,customer_id,customer:customers(id,name)')
        .eq('tenant_id', tenantId),
      supabase
        .from('cash_transactions')
        .select('id,amount,direction,occurred_at')
        .eq('tenant_id', tenantId)
        .gte('occurred_at', range.from)
        .lte('occurred_at', range.to)
        .order('occurred_at', { ascending: true }),
    ]);
    setError(tb.error || ar.error || cash.error || null);
    setTrialRows((tb.data as TrialBalanceRow[]) || []);
    setInvoices((ar.data as unknown as InvoiceLike[]) || []);
    setTransactions((cash.data as unknown as CashTransactionLike[]) || []);
    setLoading(false);
  }, [tenantId, range.from, range.to]);

  useEffect(() => { load(); }, [load]);

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

  return { range, setRange, loading, error, reload: load, trialRows, profitAndLoss, balanceSheet, aging, cashFlow, cashFlowForecast };
}
