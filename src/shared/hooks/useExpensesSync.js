import { useCallback, useEffect, useRef } from "react";
import { supabase } from "../../integrations/supabase/client";

const SELECT_COLUMNS =
  "id,expense_no,description,category,amount,status,expense_date,note,source,currency";

export function expenseRowToApp(row) {
  return {
    id: row.expense_no || row.id,
    description: row.description || "",
    category: row.category || "Digər",
    amount: Number(row.amount || 0),
    status: row.status || "Təsdiq gözləyir",
    date: row.expense_date || null,
    note: row.note || "",
    source: row.source || "",
  };
}

export function appExpenseToRow(expense, tenantId) {
  return {
    tenant_id: tenantId,
    expense_no: String(expense.id),
    description: expense.description || "",
    category: expense.category || "Digər",
    amount: Number(expense.amount || 0),
    vat_amount: 0,
    currency: expense.currency || "AZN",
    status: expense.status || "Təsdiq gözləyir",
    expense_date: expense.date || new Date().toISOString().slice(0, 10),
    note: expense.note || null,
    source: expense.source || null,
  };
}

function signature(expense) {
  return JSON.stringify(appExpenseToRow(expense, "-"));
}

/**
 * Keeps `state.expenses` mirrored in the Supabase `expenses` table:
 * hydrates from the table on tenant load (backfilling any snapshot-only rows)
 * and pushes later inserts/updates/deletes straight to the database.
 */
export function useExpensesSync({ tenantId, ready, expenses, setState, onError }) {
  const syncedRef = useRef(new Map());
  const hydratedTenantRef = useRef(null);

  const hydrate = useCallback(async () => {
    if (!tenantId || !ready) return;
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select(SELECT_COLUMNS)
        .eq("tenant_id", tenantId)
        .order("expense_date", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const dbRows = (data || []).map(expenseRowToApp);
      const dbKeys = new Set(dbRows.map((row) => row.id));
      const pending = (expenses || []).filter((expense) => expense?.id && !dbKeys.has(String(expense.id)));

      if (pending.length) {
        const { error: seedError } = await supabase
          .from("expenses")
          .upsert(pending.map((expense) => appExpenseToRow(expense, tenantId)), {
            onConflict: "tenant_id,expense_no",
          });
        if (seedError) throw seedError;
        pending.forEach((expense) => dbRows.push({ ...expense, id: String(expense.id) }));
      }

      syncedRef.current = new Map(dbRows.map((row) => [row.id, signature(row)]));
      hydratedTenantRef.current = tenantId;
      setState((current) => ({ ...current, expenses: dbRows }));
    } catch (error) {
      onError?.(error);
    }
  }, [expenses, onError, ready, setState, tenantId]);

  useEffect(() => {
    if (!tenantId || !ready) {
      hydratedTenantRef.current = null;
      syncedRef.current = new Map();
      return;
    }
    if (hydratedTenantRef.current === tenantId) return;
    hydrate();
  }, [hydrate, ready, tenantId]);

  useEffect(() => {
    if (!tenantId || !ready || hydratedTenantRef.current !== tenantId) return;
    const rows = (expenses || []).filter((expense) => expense?.id);
    const nextKeys = new Set(rows.map((expense) => String(expense.id)));
    const changed = rows.filter((expense) => syncedRef.current.get(String(expense.id)) !== signature(expense));
    const removed = [...syncedRef.current.keys()].filter((key) => !nextKeys.has(key));
    if (!changed.length && !removed.length) return;

    const nextSigned = new Map(rows.map((expense) => [String(expense.id), signature(expense)]));
    syncedRef.current = nextSigned;

    (async () => {
      try {
        if (changed.length) {
          const { error } = await supabase
            .from("expenses")
            .upsert(changed.map((expense) => appExpenseToRow(expense, tenantId)), {
              onConflict: "tenant_id,expense_no",
            });
          if (error) throw error;
        }
        if (removed.length) {
          const { error } = await supabase
            .from("expenses")
            .delete()
            .eq("tenant_id", tenantId)
            .in("expense_no", removed);
          if (error) throw error;
        }
      } catch (error) {
        onError?.(error);
      }
    })();
  }, [expenses, onError, ready, tenantId]);

  return { refresh: hydrate };
}
