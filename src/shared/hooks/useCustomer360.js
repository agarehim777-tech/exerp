import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { buildCustomerScore, buildCustomerTimeline } from '../../modules/crm/customer360Analytics.js';

const withCustomerMeta = (customer) => {
  if (!customer || !String(customer.notes || '').startsWith('__crm_meta__:')) return customer;
  try {
    const meta = JSON.parse(String(customer.notes).slice('__crm_meta__:'.length));
    return {
      ...customer,
      birth_date: customer.birth_date || meta.birth_date || null,
      customer_level_override: customer.customer_level_override || meta.customer_level_override || null,
      fin_code: customer.fin_code || meta.fin_code || (customer.segment !== 'business' && customer.tax_id && !/^\d{10}$/.test(customer.tax_id) ? customer.tax_id : null),
      identity_card_no: customer.identity_card_no || meta.identity_card_no || null,
    };
  } catch { return customer; }
};

const isActiveOrder = (order) => String(order?.status || '').toLowerCase() !== 'cancelled';
const isActiveCredit = (credit, activeOrderIds) => {
  const status = String(credit?.status || '').toLowerCase();
  return !['closed', 'cancelled'].includes(status)
    && (!credit?.order_id || activeOrderIds.has(credit.order_id));
};

export function useCustomer360(customerId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFallback = useCallback(async () => {
    const [customerResult, dealsResult, activitiesResult, tasksResult, ordersResult, tagsResult] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      supabase.from('crm_deals').select('*').eq('customer_id', customerId),
      supabase.from('crm_activities').select('*').eq('customer_id', customerId).order('occurred_at', { ascending: false }).limit(20),
      supabase.from('crm_tasks').select('*').eq('customer_id', customerId).eq('done', false),
      supabase.from('orders').select('id,order_no,order_date,status,total,paid_amount,payment_status,currency,created_by').eq('customer_id', customerId).order('order_date', { ascending: false }),
      supabase.from('crm_customer_tags').select('tag:crm_tags(id,name,color)').eq('customer_id', customerId),
    ]);

    if (customerResult.error) throw customerResult.error;
    const deals = dealsResult.data || [];
    const orders = (ordersResult.data || []).filter(isActiveOrder);
    return {
      customer: withCustomerMeta(customerResult.data),
      open_deals: deals.filter((deal) => deal.status === 'open'),
      won_amount: deals.filter((deal) => deal.status === 'won').reduce((sum, deal) => sum + Number(deal.amount || 0), 0),
      activities: activitiesResult.data || [],
      tasks: tasksResult.data || [],
      orders_total: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      orders_paid: orders.reduce((sum, order) => sum + Number(order.paid_amount || 0), 0),
      orders_outstanding: orders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0)), 0),
      orders_count: orders.length,
      orders,
      tags: (tagsResult.data || []).map((row) => row.tag).filter(Boolean),
    };
  }, [customerId]);

  const fetchIt = useCallback(async () => {
    if (!customerId) { setData(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: json, error: rpcError } = await supabase.rpc('customer_360', { _customer: customerId });
      let result = rpcError || !json?.customer ? await fetchFallback() : json;
      {
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('id,order_no,order_date,status,total,paid_amount,payment_status,currency,created_by')
          .eq('customer_id', customerId)
          .order('order_date', { ascending: false });
        if (ordersError) throw ordersError;
        const detailedOrders = (orders || []).filter(isActiveOrder);
        result = {
          ...result,
          orders: detailedOrders,
          orders_count: detailedOrders.length,
          orders_total: detailedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
          orders_paid: detailedOrders.reduce((sum, order) => sum + Number(order.paid_amount || 0), 0),
          orders_outstanding: detailedOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0)), 0),
        };
      }
      const [creditResult, documentResult, serviceResult] = await Promise.all([
        supabase.from('credit_contracts').select('*, installments:credit_installments(*), payments:credit_payments(*)').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('customer_documents').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('customer_service_cases').select('*, product:products(id,name,sku)').eq('customer_id', customerId).order('created_at', { ascending: false }),
      ]);
      const orderIds = (result.orders || []).map(order => order.id);
      const itemResult = orderIds.length
        ? await supabase.from('order_items').select('*, product:products(id,name,sku)').in('order_id', orderIds)
        : { data: [], error: null };
      const itemsByOrder = new Map();
      (itemResult.data || []).forEach(item => itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) || []), item]));
      const orders = (result.orders || []).map(order => ({ ...order, items: itemsByOrder.get(order.id) || [] }));
      const activeOrderIds = new Set(orders.map(order => order.id));
      const credits = creditResult.error
        ? []
        : (creditResult.data || []).filter(credit => isActiveCredit(credit, activeOrderIds));
      const payments = credits.flatMap(credit => (credit.payments || []).filter(payment => !payment.reversed_at));
      const documents = documentResult.error ? [] : (documentResult.data || []);
      const serviceCases = serviceResult.error ? [] : (serviceResult.data || []);
      const analytics = buildCustomerScore({ orders, credits, payments });
      const timeline = buildCustomerTimeline({ orders, credits, payments, activities: result.activities || [], serviceCases, documents });
      setData({ ...result, customer: withCustomerMeta(result.customer), orders, credits, payments, documents, serviceCases, analytics, timeline });
    } catch (nextError) {
      setData(null);
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [customerId, fetchFallback]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  const uploadDocument = useCallback(async ({ file, title, documentType }) => {
    if (!data?.customer?.tenant_id || !file) throw new Error('Sənəd faylı seçilməyib.');
    const safeName = String(file.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${data.customer.tenant_id}/${customerId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('customer-documents').upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from('customer_documents').insert({ tenant_id: data.customer.tenant_id, customer_id: customerId, title: title || file.name, document_type: documentType || 'Digər', file_path: path, file_name: file.name, mime_type: file.type || null, file_size: file.size || 0 });
    if (insertError) { await supabase.storage.from('customer-documents').remove([path]); throw insertError; }
    await fetchIt();
  }, [customerId, data?.customer?.tenant_id, fetchIt]);

  const downloadDocument = useCallback(async document => {
    const { data: signed, error: signedError } = await supabase.storage.from('customer-documents').createSignedUrl(document.file_path, 60);
    if (signedError) throw signedError;
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const removeDocument = useCallback(async document => {
    const { error: storageError } = await supabase.storage.from('customer-documents').remove([document.file_path]);
    if (storageError) throw storageError;
    const { error: rowError } = await supabase.from('customer_documents').delete().eq('id', document.id);
    if (rowError) throw rowError;
    await fetchIt();
  }, [fetchIt]);

  return { data, loading, error, refresh: fetchIt, uploadDocument, downloadDocument, removeDocument };
}

