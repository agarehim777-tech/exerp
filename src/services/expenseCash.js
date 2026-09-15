import { supabase } from "../integrations/supabase/client";
import { appExpenseToRow } from "../shared/hooks/useExpensesSync.js";
import { expenseCashAction } from "../shared/lib/appDomain.jsx";

/**
 * Keeps the cash ledger in sync with an expense record:
 * approved/accepted expenses post an outflow on the main cash account,
 * cancelled expenses create a reversal entry so the balance is restored.
 */
export async function syncExpenseCash(tenantId, expense, status) {
  const action = expenseCashAction(status);
  if (!tenantId || !expense?.id || !action) return null;

  const { error: upsertError } = await supabase
    .from("expenses")
    .upsert([appExpenseToRow({ ...expense, status }, tenantId)], { onConflict: "tenant_id,expense_no" });
  if (upsertError) throw upsertError;

  const { data, error } = await supabase.rpc("sync_expense_cash", {
    _tenant_id: tenantId,
    _expense_no: String(expense.id),
    _status: action,
  });
  if (error) throw error;
  return data;
}
