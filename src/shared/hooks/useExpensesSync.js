import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantRequestScope } from "./useTenantRequestScope";
import { useRealtimeResync } from "./useRealtimeResync";
import { supabase } from "../../integrations/supabase/client";
import { toLocalIsoDate } from "../../services/date.js";
import { readAllRows } from '../../services/readAllRows.js';

// The database stores canonical English status codes (shared with the cashbook
// and the accept/cancel RPCs); the app state uses the Azerbaijani labels.
const AZ_TO_CODE = {
  "Təsdiq gözləyir": "pending", "Təsdiq edildi": "approved", "Qəbul edildi": "paid",
  "Ləğv edildi": "cancelled", "İmtina edildi": "rejected",
};
const CODE_TO_AZ = {
  pending: "Təsdiq gözləyir", draft: "Təsdiq gözləyir", approved: "Təsdiq edildi", paid: "Qəbul edildi",
  cancelled: "Ləğv edildi", rejected: "İmtina edildi",
};
export const expenseStatusToCode = (status) => AZ_TO_CODE[status] || status || "pending";
export const expenseStatusToLabel = (status) => CODE_TO_AZ[status] || status || "Təsdiq gözləyir";

const SELECT_COLUMNS =
  "id,expense_no,description,category,amount,status,expense_date,note,source,currency,vat_amount";

export function expenseRowToApp(row) {
  return {
    id: row.expense_no || row.id,
    description: row.description || "",
    category: row.category || "Digər",
    amount: Number(row.amount || 0),
    currency: row.currency || "AZN",
    vat_amount: Number(row.vat_amount || 0),
    status: expenseStatusToLabel(row.status),
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
    vat_amount: Number(expense.vat_amount || 0),
    currency: expense.currency || "AZN",
    status: expenseStatusToCode(expense.status),
    expense_date: expense.date || toLocalIsoDate(),
    note: expense.note || null,
    source: expense.source || null,
  };
}

function signature(expense) {
  return JSON.stringify(appExpenseToRow(expense, "-"));
}

export function useExpensesSync({ tenantId, ready, expenses, setState, onError }) {
  const { scope } = useTenantRequestScope(tenantId);
  const latest = useRef(expenses);
  latest.current = expenses;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const sessionRef = useRef(null);
  const [status, setStatus] = useState({ phase: "idle", error: null });

  const hydrate = useCallback(async (session) => {
    if (!session?.alive) return;
    if (session.busy) { session.refreshQueued = true; return; }
    session.busy = true;
    setStatus({ phase: "loading", error: null });
    try {
      const { data, error } = await readAllRows(() => supabase.from("expenses").select(SELECT_COLUMNS, { count: 'exact' })
        .eq("tenant_id", tenantId).order("expense_date", { ascending: false }).order("id"));
      if (error) throw error;
      if (!session.alive) return;
      const rows = (data || []).map(expenseRowToApp);
      // Loading never inserts snapshot/browser rows back into the database.
      session.baseline = new Map(rows.map(row => [String(row.id), signature(row)]));
      session.hydrated = true;
      latest.current = rows;
      setState(current => session.alive ? { ...current, expenses: rows } : current);
      setStatus({ phase: "saved", error: null });
    } catch (error) {
      if (session.alive) {
        setStatus({ phase: "error", error });
        errorHandler.current?.(error);
      }
    } finally {
      session.busy = false;
      if (session.refreshQueued && session.alive) {
        session.refreshQueued = false;
        await hydrate(session);
      }
    }
  }, [tenantId, setState]);

  useEffect(() => {
    const session = { scope, alive: true, hydrated: false, busy: false, baseline: new Map() };
    sessionRef.current = session;
    if (tenantId && ready) hydrate(session);
    return () => { session.alive = false; };
  }, [tenantId, ready, scope, hydrate]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    if (!ready || !tenantId || session?.scope !== scope) return;
    return hydrate(session);
  }, [ready, tenantId, scope, hydrate]);

  const refresh = useCallback(() => {
    const session = sessionRef.current;
    if (!ready || !tenantId || session?.scope !== scope) return;
    return hydrate(session);
  }, [ready, tenantId, scope, hydrate]);

  useRealtimeResync(ready ? tenantId : null, ['expenses'], refresh,
    { channelPrefix: 'expense-read' });

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  return { ...status, retry, refresh };
}
