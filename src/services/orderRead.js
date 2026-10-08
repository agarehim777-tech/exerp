import { supabase } from '../integrations/supabase/client';

async function readPages(query, limit, isCurrent) {
  const rows = [];
  while (isCurrent() && rows.length < limit) {
    const end = Math.min(rows.length + 499, limit - 1);
    const requested = end - rows.length + 1;
    const { data, count, error } = await query().range(rows.length, end);
    if (!isCurrent()) return null;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data?.length || (Number.isInteger(count) ? rows.length >= count : data.length < requested)) break;
  }
  return isCurrent() ? rows : null;
}

export function readOrderPage(tenantId, limit, isCurrent) {
  return readPages(() => supabase.from('orders')
    .select('*, customer:customers(id,name), items:order_items(*), reservations:stock_reservations(warehouse_id,order_item_id,status)', { count: 'exact' })
    .eq('tenant_id', tenantId).neq('status', 'cancelled')
    .order('order_date', { ascending: false }).order('created_at', { ascending: false }).order('id'), limit, isCurrent);
}

export async function readOrderRelations(tenantId, orderIds, isCurrent) {
  if (!orderIds.length) return { credits: [], bonuses: [], deliveries: [], deliveryError: null };
  const query = (table, columns) => supabase.from(table).select(columns, { count: 'exact' })
    .eq('tenant_id', tenantId).in('order_id', orderIds);
  const credits = await readPages(() => query('credit_contracts',
    'id,order_id,contract_no,principal,initial_payment,required_initial,term_months,start_date,status,created_at,installments:credit_installments(id,installment_no,due_date,principal_due,principal_paid,status)').order('id'), Infinity, isCurrent);
  if (!isCurrent()) return null;
  const bonuses = await readPages(() => query('order_bonus_assignments',
    'id,order_id,seller_name,rate,position,effective_from,effective_to')
    .is('effective_to', null).order('effective_from', { ascending: false }).order('position').order('created_at').order('id'), Infinity, isCurrent);
  if (!isCurrent()) return null;
  // A sales-only role may legitimately lack delivery access. Financial links may not be omitted.
  let deliveries = [], deliveryError = null;
  try { deliveries = await readPages(() => query('deliveries', '*').order('id'), Infinity, isCurrent); }
  catch (error) { deliveryError = error; }
  return isCurrent() ? { credits, bonuses, deliveries, deliveryError } : null;
}
