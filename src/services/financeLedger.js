import { supabase } from '../integrations/supabase/client';
import { createIdempotencyKey, migrationRequiredError } from './coreOperations';

export function financeRpcError(error) {
  if (['PGRST202', '42883'].includes(error?.code)) return migrationRequiredError('kassa ledger-i', error);
  return error;
}

// Keep the key after an uncertain network failure; never persist financial payloads in browser storage.
function createFinanceCommand(tenantId, name, normalize, rpc = (name, args) => supabase.rpc(name, args)) {
  const attempts = new Map();
  return (payload) => {
    if (!tenantId) return Promise.reject(new Error('Aktiv şirkət seçilməyib.'));
    const normalized = normalize(payload);
    const fingerprint = JSON.stringify(normalized);
    const attempt = attempts.get(fingerprint) || { key: createIdempotencyKey('expense'), pending: null };
    attempts.set(fingerprint, attempt);
    if (attempt.pending) return attempt.pending;
    attempt.pending = Promise.resolve().then(async () => {
      const { data, error } = await rpc(name, {
        _tenant_id: tenantId, _request_key: attempt.key, _payload: normalized,
      });
      if (error) throw financeRpcError(error);
      attempts.delete(fingerprint);
      return data;
    }).finally(() => { attempt.pending = null; });
    return attempt.pending;
  };
}

export function createExpenseCommand(tenantId, rpc) {
  return createFinanceCommand(tenantId, 'create_cash_expense_atomic', payload => ({
    account_id: payload.account_id, amount: Number(payload.amount), vat_amount: Number(payload.vat_amount || 0),
    expense_date: payload.expense_date, currency: payload.currency || null,
    category: payload.category || 'other', description: payload.description || '',
  }), rpc);
}

export function createTransferCommand(tenantId, rpc) {
  return createFinanceCommand(tenantId, 'transfer_cash_atomic', payload => ({
    from_account_id: payload.fromAccountId, to_account_id: payload.toAccountId,
    amount: Number(payload.amount), occurred_at: payload.occurredAt || null,
    description: payload.description || '',
  }), rpc);
}

export function createRefundCommand(tenantId, rpc) {
  return createFinanceCommand(tenantId, 'refund_cash_expense_atomic', payload => ({
    expense_id: payload.expenseId, only_pending: Boolean(payload.onlyPending), reason: payload.reason || '',
  }), rpc);
}
