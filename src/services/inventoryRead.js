import { supabase } from '../integrations/supabase/client';

const PAGE_SIZE = 500;
async function readPages(query, isCurrent, identity) {
  const rows = [];
  const seen = new Set();
  while (isCurrent()) {
    const { data, error, count } = await query(rows.at(-1)).range(0, PAGE_SIZE - 1);
    if (!isCurrent()) return null;
    if (error) throw error;
    for (const row of data || []) {
      const key = identity(row);
      if (!key || seen.has(key)) throw new Error('Inventory pagination returned a missing or repeated identity');
      seen.add(key);
    }
    rows.push(...(data || []));
    if (!data?.length) return rows;
    if (!Number.isInteger(count)) throw new Error('Inventory pagination requires an exact count');
    // Count is for the remaining cursor window, not the original table.
    if (data.length >= count) return rows;
  }
  return null;
}

export async function readInventoryBase(tenantId, balanceSelect, isCurrent = () => true) {
  if (!tenantId) throw new Error('Active tenant is required');
  const [warehouses, balances] = await Promise.all([
    readPages(last => {
      let query = supabase.from('warehouses').select('*', { count: 'exact' }).eq('tenant_id', tenantId).order('id');
      if (last) query = query.gt('id', last.id);
      return query;
    }, isCurrent, row => row.id),
    readPages(last => {
      let query = supabase.from('stock_balances').select(balanceSelect, { count: 'exact' }).eq('tenant_id', tenantId)
        .order('warehouse_id').order('product_id');
      if (last) query = query.or(`warehouse_id.gt.${last.warehouse_id},and(warehouse_id.eq.${last.warehouse_id},product_id.gt.${last.product_id})`);
      return query;
    }, isCurrent, row => row.warehouse_id && row.product_id ? `${row.warehouse_id}:${row.product_id}` : null),
  ]);
  return warehouses && balances ? { warehouses: warehouses.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'az') || String(a.id).localeCompare(String(b.id))), balances } : null;
}
