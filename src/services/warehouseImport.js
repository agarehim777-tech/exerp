import { supabase } from '../integrations/supabase/client';

export async function importWarehouseStockAtomic(tenantId, rows, requestKey) {
  if (!tenantId || !requestKey || !Array.isArray(rows) || !rows.length) throw new Error('İmport məlumatları natamamdır.');
  const { data, error } = await supabase.rpc('import_warehouse_stock_atomic', {
    _tenant_id: tenantId, _request_key: requestKey, _rows: rows,
  });
  if (error) throw error;
  if (data?.row_count !== rows.length) throw new Error('İmportun server təsdiqi alınmadı.');
  return data;
}
