import { supabase } from '../integrations/supabase/client';

async function readPages(query, isCurrent, limit = Infinity) {
  const rows = [];
  while (isCurrent() && rows.length < limit) {
    const end = Math.min(rows.length + 499, limit - 1);
    const requested = end - rows.length + 1;
    const { data, error, count } = await query().range(rows.length, end);
    if (!isCurrent()) return null;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data?.length || (Number.isInteger(count) ? rows.length >= count : data.length < requested)) break;
  }
  return isCurrent() ? rows : null;
}

export function readSalesInvoicePage(tenantId, limit, isCurrent) {
  return readPages(() => supabase.from('sales_invoices')
    .select('*, customer:customers(id,name), lines:sales_invoice_lines(*), payments:invoice_payments(*)', { count: 'exact' })
    .eq('tenant_id', tenantId).order('invoice_date', { ascending: false }).order('id'), isCurrent, limit);
}

export async function readBillingSources(tenantId, isCurrent) {
  const [orders, projects, invoices] = await Promise.all([
    readPages(() => supabase.from('orders').select('*, customer:customers(id,name), items:order_items(*)', { count: 'exact' })
      .eq('tenant_id', tenantId).neq('status', 'cancelled').order('order_date', { ascending: false }).order('id'), isCurrent),
    readPages(() => supabase.from('projects').select('id,name,budget,status,start_date,end_date', { count: 'exact' })
      .eq('tenant_id', tenantId).order('created_at', { ascending: false }).order('id'), isCurrent),
    readPages(() => supabase.from('sales_invoices').select('id,order_id,notes,status', { count: 'exact' })
      .eq('tenant_id', tenantId).order('id'), isCurrent),
  ]);
  return orders && projects && invoices ? { orders, projects, invoices } : null;
}
