import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';

function computeTotals(lines) {
  let subtotal = 0;
  let vatTotal = 0;
  const rows = lines.map((line, index) => {
    const qty = Number(line.qty) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const discount = Number(line.discount_pct) || 0;
    const vatRate = Number(line.vat_rate) || 0;
    const net = qty * unitPrice * (1 - discount / 100);
    const vat = net * (vatRate / 100);
    subtotal += net;
    vatTotal += vat;
    return {
      product_id: line.product_id || null,
      line_no: index + 1,
      description: line.description || null,
      qty,
      unit_price: unitPrice,
      discount_pct: discount,
      vat_rate: vatRate,
      line_total: Number((net + vat).toFixed(2)),
    };
  });
  return {
    rows,
    subtotal: Number(subtotal.toFixed(2)),
    vat_total: Number(vatTotal.toFixed(2)),
    total: Number((subtotal + vatTotal).toFixed(2)),
  };
}

export function useSalesInvoices(tenantId) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('sales_invoices')
      .select('*, customer:customers(id,name), lines:sales_invoice_lines(*), payments:invoice_payments(*)')
      .eq('tenant_id', tenantId)
      .order('invoice_date', { ascending: false });
    setError(err || null);
    setInvoices(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!tenantId) return undefined;
    const channel = supabase
      .channel(`ar:${tenantId}:${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_invoices', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_payments', filter: `tenant_id=eq.${tenantId}` }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, fetchAll]);

  const create = async ({ lines = [], ...header }) => {
    const totals = computeTotals(lines);
    const { data: invoice, error: err } = await supabase
      .from('sales_invoices')
      .insert({
        tenant_id: tenantId,
        invoice_no: header.invoice_no,
        customer_id: header.customer_id || null,
        order_id: header.order_id || null,
        invoice_date: header.invoice_date || new Date().toISOString().slice(0, 10),
        due_date: header.due_date || null,
        currency: header.currency || 'AZN',
        notes: header.notes || null,
        subtotal: totals.subtotal,
        vat_total: totals.vat_total,
        total: totals.total,
      })
      .select()
      .single();
    if (err) throw err;

    if (totals.rows.length) {
      const { error: lineError } = await supabase
        .from('sales_invoice_lines')
        .insert(totals.rows.map((row) => ({ ...row, tenant_id: tenantId, invoice_id: invoice.id })));
      if (lineError) {
        await supabase.from('sales_invoices').delete().eq('id', invoice.id);
        throw lineError;
      }
    }
    await fetchAll();
    return invoice;
  };

  const postToLedger = async (invoiceId) => {
    const { error: err } = await supabase.rpc('post_invoice_to_gl', { _invoice_id: invoiceId });
    if (err) throw err;
    await fetchAll();
  };

  const addPayment = async ({ invoice_id, amount, account_id, method, reference, paid_at }) => {
    const { data, error: err } = await supabase
      .from('invoice_payments')
      .insert({
        tenant_id: tenantId,
        invoice_id,
        account_id: account_id || null,
        amount: Number(amount) || 0,
        method: method || 'bank',
        reference: reference || null,
        paid_at: paid_at || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();
    if (err) throw err;
    const { error: glError } = await supabase.rpc('post_payment_to_gl', { _payment_id: data.id });
    await fetchAll();
    if (glError) throw glError;
    return data;
  };

  const cancel = async (invoiceId) => {
    const { error: err } = await supabase
      .from('sales_invoices')
      .update({ status: 'cancelled' })
      .eq('id', invoiceId);
    if (err) throw err;
    await fetchAll();
  };

  return { invoices, loading, error, refresh: fetchAll, create, postToLedger, addPayment, cancel };
}
