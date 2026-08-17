import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../integrations/supabase/client';

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
    const orders = ordersResult.data || [];
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
        const detailedOrders = orders || [];
        result = {
          ...result,
          orders: detailedOrders,
          orders_count: detailedOrders.length,
          orders_total: detailedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
          orders_paid: detailedOrders.reduce((sum, order) => sum + Number(order.paid_amount || 0), 0),
          orders_outstanding: detailedOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paid_amount || 0)), 0),
        };
      }
      setData({ ...result, customer: withCustomerMeta(result.customer) });
    } catch (nextError) {
      setData(null);
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [customerId, fetchFallback]);

  useEffect(() => { fetchIt(); }, [fetchIt]);

  return { data, loading, error, refresh: fetchIt };
}
