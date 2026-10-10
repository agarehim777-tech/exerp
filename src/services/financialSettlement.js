import { supabase } from '../integrations/supabase/client';
import { createFinanceCommand } from './financeLedger.js';
import { migrationRequiredError } from './coreOperations';
import { readTenantPage } from './readTenantPage.js';

export function settlementError(error) {
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)
    ? migrationRequiredError('borc və KPI əməliyyatları', error) : error;
}
export const createReceivableSettlement = tenantId => createFinanceCommand(tenantId, 'settle_receivable_atomic',
  payload => ({ source_type: payload.source_type, source_id: payload.source_id, account_id: payload.account_id }));
export const createKpiPeriodCommand = tenantId => createFinanceCommand(tenantId, 'run_kpi_period_atomic',
  payload => ({ action: payload.action, period: payload.period,
    ...(payload.action === 'close' ? { snapshot: payload.snapshot } : {}),
    ...(payload.action === 'payout' ? { account_id: payload.account_id || null } : {}),
  }));

export async function loadReceivableLedger(tenantId) {
  const { data, error } = await supabase.rpc('receivable_ledger_snapshot', { _tenant_id: tenantId });
  if (error) throw settlementError(error);
  if (!Array.isArray(data?.items) || !Array.isArray(data?.settlements) || !Array.isArray(data?.accounts)) {
    throw new Error('RECEIVABLE_LEDGER_INVALID_RESPONSE');
  }
  return data;
}
export async function loadKpiLedger(tenantId, isCurrent) {
  const read = async (table, order) => {
    const result = await readTenantPage(() => supabase.from(table).select('*', { count: 'exact' })
      .eq('tenant_id', tenantId).order(order).order('id'), Number.MAX_SAFE_INTEGER, isCurrent);
    if (!result) return null;
    if (result.error) throw settlementError(result.error);
    return result.data;
  };
  const periods = await read('kpi_periods', 'period');
  if (!isCurrent()) return null;
  const accounts = await read('cash_accounts', 'created_at');
  return isCurrent() ? { periods, accounts: accounts.filter(row => row.is_active && row.currency === 'AZN') } : null;
}

export function receivableItemView(item, now = Date.now()) {
  const days = item.due_date ? Math.max(0, Math.floor((now - Date.parse(item.due_date + 'T00:00:00+04:00')) / 86400000)) : 0;
  const aging = days === 0 ? 'Cari' : days <= 30 ? '1-30 gün' : days <= 60 ? '31-60 gün' : days <= 90 ? '61-90 gün' : '90+ gün';
  return { ...item, id: item.source_type + ':' + item.source_id, overdueDays: days, agingBucket: aging,
    sourceType: item.source_type, sourceTypeLabel: { credit: 'Kredit', order: 'Satış', vendor_invoice: 'Vendor fakturası' }[item.source_type],
    riskCategory: days > 90 ? 'Kritik' : days > 30 ? 'Yüksək' : 'Normal',
    collectionStatus: item.can_settle ? 'Açıq borc' : item.source_type === 'credit' ? 'Başlatma gözləyir' : 'Uyğunlaşdırma gözləyir',
    nextAction: item.can_settle ? 'Kassa ilə bağla' : item.source_type === 'credit' ? 'Krediti başlat' : '3-way match',
    owner: 'Maliyyə', orderIds: item.order_id ? [item.order_id] : [],
    creditBalance: item.source_type === 'credit' ? Number(item.amount) : 0,
    orderBalance: item.source_type === 'order' ? Number(item.amount) : 0,
  };
}
export function kpiPeriodView(row) {
  return { ...row.snapshot, id: row.id, period: row.period.slice(0, 7),
    status: 'Period bağlandı', approvalStatus: row.status === 'closed' ? 'Təsdiq gözləyir' : 'Təsdiq edildi',
    payoutStatus: row.status === 'paid' ? 'Ödənildi' : 'Gözləyir', payoutAmount: Number(row.payout_amount),
    closedAt: row.closed_at, approvedAt: row.approved_at, approvedBy: row.approved_by, paidAt: row.paid_at,
    payoutExpenseId: row.expense_id || '',
  };
}
