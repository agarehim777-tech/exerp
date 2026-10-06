import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useRealtimeResync } from './useRealtimeResync.js';
import { useTenantRequestScope } from './useTenantRequestScope.js';
import { createInvoiceCommand, createInvoicePaymentCommand } from '../../services/salesInvoices.js';
import { financeRpcError } from '../../services/financeLedger.js';
import { readSalesInvoicePage } from '../../services/billingRead.js';

const INVOICES_PAGE_SIZE = 200;

export function useSalesInvoices(tenantId) {
  const { scope, begin } = useTenantRequestScope(tenantId);
  const [loadedScope, setLoadedScope] = useState(null);
  const loaded = Boolean(tenantId && loadedScope === scope);
  const postCreate = useMemo(() => createInvoiceCommand(tenantId), [scope]);
  const postPayment = useMemo(() => createInvoicePaymentCommand(tenantId), [scope]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(INVOICES_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    const isCurrent = begin();
    setLoading(true);
    try {
      const data = await readSalesInvoicePage(tenantId, limit + 1, isCurrent);
      if (!isCurrent()) return;
      setError(null);
      setLoadedScope(scope);
      const rows = data || [];
      setHasMore(rows.length > limit);
      setInvoices(rows.slice(0, limit));
    } catch (err) {
      if (isCurrent()) { setError(err); setLoadedScope(null); }
    } finally { if (isCurrent()) setLoading(false); }
  }, [tenantId, limit, scope, begin]);

  useEffect(() => { setLimit(INVOICES_PAGE_SIZE); setError(null); }, [scope]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const loadMore = useCallback(() => setLimit((value) => value + INVOICES_PAGE_SIZE), []);

  const degraded = useRealtimeResync(
    tenantId,
    ['sales_invoices', 'sales_invoice_lines', 'invoice_payments'],
    fetchAll,
    { channelPrefix: 'ar' },
  );


  const create = async (payload) => {
    const invoice = await postCreate(payload);
    await fetchAll();
    return invoice;
  };

  const nextInvoiceNo = async () => {
    const { data, error: err } = await supabase.rpc('generate_doc_number', {
      _tenant: tenantId, _prefix: 'INV', _table: 'sales_invoices', _column: 'invoice_no',
    });
    if (err) throw financeRpcError(err);
    if (!data) throw new Error('Faktura nömrəsi serverdən alınmadı.');
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
    if (err) throw financeRpcError(err);
    await fetchAll();
  };

  const addPayment = async (payload) => {
    const data = await postPayment(payload);
    await fetchAll();
    return data;
  };

  const cancel = async (invoiceId) => {
    const { error: err } = await supabase.rpc('cancel_sales_invoice', { _invoice_id: invoiceId });
    if (err) throw financeRpcError(err);
    await fetchAll();
  };

  return {
    invoices: loaded ? invoices : [], loading, error, degraded, hasMore: loaded && hasMore, loadMore, refresh: fetchAll,
    create, createFromOrder, createFromProject, nextInvoiceNo,
    postToLedger, addPayment, cancel,
  };
}
