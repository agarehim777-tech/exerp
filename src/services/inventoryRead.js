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

export async function readSaleStockShortages(tenantId, warehouseId, lines, products, isCurrent = () => true) {
  if (!tenantId || !warehouseId) throw new Error('SALES_STOCK_SCOPE_REQUIRED');
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const bySku = new Map(products.filter(product => product.sku).map(product => [normalize(product.sku), product]));
  const byName = new Map(products.filter(product => product.name).map(product => [normalize(product.name), product]));
  const required = new Map();
  for (const line of lines) {
    const product = bySku.get(normalize(line.product)) || byName.get(normalize(line.product));
    if (!product?.id) throw new Error('SALES_PRODUCT_NOT_FOUND');
    const quantity = Number(line.qty);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('SALES_QUANTITY_INVALID');
    const existing = required.get(product.id);
    required.set(product.id, { product: line.product, qty: (existing?.qty || 0) + quantity });
  }
  const balances = new Map();
  const ids = [...required.keys()];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const rows = await readPages(last => {
      let query = supabase.from('stock_balances').select('product_id,on_hand,reserved,problem_qty', { count: 'exact' })
        .eq('tenant_id', tenantId).eq('warehouse_id', warehouseId).in('product_id', batch).order('product_id');
      if (last) query = query.gt('product_id', last.product_id);
      return query;
    }, isCurrent, row => row.product_id);
    if (!rows) return null;
    for (const row of rows) {
      const values = [row.on_hand, row.reserved, row.problem_qty ?? 0].map(Number);
      if (!values.every(Number.isFinite)) throw new Error('SALES_STOCK_READ_INVALID');
      balances.set(row.product_id, values[0] - values[1] - values[2]);
    }
  }
  return [...required].flatMap(([id, line]) => {
    const shortage = Math.max(0, line.qty - (balances.get(id) || 0));
    return shortage > 0 ? [{ product: line.product, shortage }] : [];
  });
}
