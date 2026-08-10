import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';

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

  const degraded = useRealtimeResync(
    tenantId,
    ['sales_invoices', 'invoice_payments'],
    fetchAll,
    { channelPrefix: 'ar' },
  );


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

  const nextInvoiceNo = async () => {
    const { data, error: err } = await supabase.rpc('generate_doc_number', {
      _tenant: tenantId, _prefix: 'INV', _table: 'sales_invoices', _column: 'invoice_no',
    });
    if (err || !data) return `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    return data;
  };

  // Sifarişdən avtomatik faktura kəsimi (sətirlər sifariş sətirlərindən gəlir).
  const createFromOrder = async (order, { invoice_date, due_date, payment_terms_days = 14 } = {}) => {
    const invoiceNo = await nextInvoiceNo();
    const issued = invoice_date || new Date().toISOString().slice(0, 10);
    const due = due_date || new Date(Date.now() + payment_terms_days * 86400000).toISOString().slice(0, 10);
    const lines = (order.items || []).map((item) => ({
      product_id: item.product_id || null,
      description: item.description || null,
      qty: item.qty,
      unit_price: item.unit_price,
      discount_pct: item.discount_pct || 0,
      vat_rate: item.vat_rate ?? item.tax_rate ?? 0,
    }));
    if (!lines.length) throw new Error('Sifarişdə sətir yoxdur — faktura kəsilə bilməz.');
    return create({
      invoice_no: invoiceNo,
      customer_id: order.customer_id || null,
      order_id: order.id,
      invoice_date: issued,
      due_date: due,
      currency: order.currency || 'AZN',
      notes: `Sifariş ${order.order_no} əsasında avtomatik yaradılıb.`,
      lines,
    });
  };

  // Layihədən faktura (mərhələ/faiz üzrə).
  const createFromProject = async (project, { customer_id, percent = 100, vat_rate = 18, invoice_date, due_date, payment_terms_days = 14 } = {}) => {
    const invoiceNo = await nextInvoiceNo();
    const issued = invoice_date || new Date().toISOString().slice(0, 10);
    const due = due_date || new Date(Date.now() + payment_terms_days * 86400000).toISOString().slice(0, 10);
    const amount = Number(((Number(project.budget) || 0) * (Number(percent) || 0)) / 100);
    if (amount <= 0) throw new Error('Layihə məbləği sıfırdır — faktura kəsilə bilməz.');
    return create({
      invoice_no: invoiceNo,
      customer_id: customer_id || null,
      invoice_date: issued,
      due_date: due,
      notes: `Layihə "${project.name}" üzrə ${percent}% mərhələ fakturası. [project:${project.id}]`,
      lines: [{
        product_id: null,
        description: `${project.name} — ${percent}% mərhələ`,
        qty: 1,
        unit_price: Number(amount.toFixed(2)),
        discount_pct: 0,
        vat_rate,
      }],
    });
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
    const { error: err } = await supabase.rpc('cancel_sales_invoice', { _invoice_id: invoiceId });
    if (err) throw err;
    await fetchAll();
  };

  return {
    invoices, loading, error, degraded, refresh: fetchAll,
    create, createFromOrder, createFromProject, nextInvoiceNo,
    postToLedger, addPayment, cancel,
  };
}
