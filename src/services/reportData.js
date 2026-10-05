import { supabase } from '../integrations/supabase/client';

export const reportTables = Object.freeze(['expenses', 'cash_transactions', 'vendors', 'purchase_orders', 'sales_invoices', 'production_batches']);
export const emptyReportData = Object.freeze({ expenses: [], cashEntries: [], vendors: [], purchaseOrders: [], invoices: [], productionPlans: [] });

const expenseStatus = { pending: 'Təsdiq gözləyir', draft: 'Qaralama', approved: 'Təsdiqlənib', paid: 'Ödənilib', cancelled: 'İmtina edilib', rejected: 'İmtina edilib' };
const poStatus = { draft: 'Qaralama', approved: 'Təsdiqlənib', partial: 'Qismən qəbul', received: 'Qəbul edilib', closed: 'Bağlanıb', cancelled: 'Ləğv edilib' };

async function readAll(query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export async function loadReportData(tenantId) {
  if (!tenantId) throw new Error('REPORT_TENANT_REQUIRED');
  const [expenses, cash, vendors, purchaseOrders, invoices, production] = await Promise.all([
    readAll(() => supabase.from('expenses').select('*').eq('tenant_id', tenantId).order('expense_date', { ascending: false }).order('id')),
    readAll(() => supabase.from('cash_transactions').select('*').eq('tenant_id', tenantId).order('occurred_at', { ascending: false }).order('id')),
    readAll(() => supabase.from('vendors').select('*').eq('tenant_id', tenantId).order('name').order('id')),
    readAll(() => supabase.from('purchase_orders').select('*, vendors(name), purchase_order_lines(*)').eq('tenant_id', tenantId).order('order_date', { ascending: false }).order('id')),
    readAll(() => supabase.from('sales_invoices').select('*, customer:customers(id,name)').eq('tenant_id', tenantId).order('invoice_date', { ascending: false }).order('id')),
    readAll(() => supabase.from('production_batches').select('*, product:products(name), warehouse:warehouses(name)').eq('tenant_id', tenantId).order('completed_at', { ascending: false }).order('id')),
  ]);
  const reversedIds = new Set(cash.flatMap(row => {
    if (row.category !== 'transaction_reversal' && !row.reversal_of) return [];
    return [row.reversal_of, String(row.description || '').match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1]].filter(Boolean);
  }));
  return {
    expenses: expenses.map(row => ({ ...row, date: row.expense_date, createdAt: row.created_at, status: expenseStatus[row.status] || row.status, cashImpact: row.status === 'paid' || row.status === 'approved' })),
    cashEntries: cash.filter(row => row.category !== 'transaction_reversal' && !row.reversal_of && !row.reversed_at && !reversedIds.has(row.id))
      .map(row => ({ ...row, date: row.occurred_at, at: row.occurred_at, type: row.direction === 'in' ? 'Mədaxil' : 'Məxaric' })),
    vendors,
    purchaseOrders: purchaseOrders.map(row => {
      const lines = row.purchase_order_lines || [];
      return { ...row, date: row.order_date, createdAt: row.created_at, vendor: row.vendors?.name || 'Vendor', product: lines.map(line => line.description || line.product_sku).filter(Boolean).join(', ') || 'Məhsul qeyd edilməyib', qty: lines.reduce((sum, line) => sum + Number(line.qty_ordered || 0), 0), amount: lines.reduce((sum, line) => sum + Number(line.qty_ordered || 0) * Number(line.unit_price || 0) * (1 + Number(line.tax_rate || 0) / 100), 0), status: poStatus[row.status] || row.status, warehouseId: row.warehouse_id || '' };
    }),
    invoices: invoices.map(row => ({ ...row, date: row.invoice_date, createdAt: row.created_at, customer: row.customer?.name || 'Müştəri', balance: Math.max(0, Number(row.total || 0) - Number(row.paid_amount || 0)), dueDate: row.due_date, orderId: row.order_id })),
    productionPlans: production.map(row => ({ ...row, product: row.product?.name || row.product_id, warehouseName: row.warehouse?.name || row.warehouse_id, warehouseId: row.warehouse_id, date: row.completed_at, completedAt: row.completed_at, totalCost: Number(row.total_cost), qty: Number(row.quantity), status: 'Tamamlandı' })),
  };
}
