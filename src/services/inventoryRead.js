import { supabase } from '../integrations/supabase/client';

const PAGE_SIZE = 500;
async function readPages(query, isCurrent) {
  const rows = [];
  while (isCurrent()) {
    const { data, error, count } = await query().range(rows.length, rows.length + PAGE_SIZE - 1);
    if (!isCurrent()) return null;
    if (error) throw error;
    rows.push(...(data || []));
    // Exact counts also handle a server row limit lower than the requested page.
    if (!data?.length || (Number.isInteger(count) ? rows.length >= count : data.length < PAGE_SIZE)) return rows;
  }
  return null;
}

export async function readInventoryBase(tenantId, balanceSelect, isCurrent = () => true) {
  if (!tenantId) throw new Error('Active tenant is required');
  const [warehouses, balances] = await Promise.all([
    readPages(() => supabase.from('warehouses').select('*', { count: 'exact' }).eq('tenant_id', tenantId)
      .order('name').order('id'), isCurrent),
    readPages(() => supabase.from('stock_balances').select(balanceSelect, { count: 'exact' }).eq('tenant_id', tenantId)
      .order('warehouse_id').order('product_id'), isCurrent),
  ]);
  return warehouses && balances ? { warehouses, balances } : null;
}
