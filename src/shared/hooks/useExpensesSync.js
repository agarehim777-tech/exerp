import { useCallback, useEffect, useRef, useState } from "react";
import { useTenantRequestScope } from "./useTenantRequestScope";
import { supabase } from "../../integrations/supabase/client";

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
    vat_amount: Number(expense.vat_amount || 0),
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

export function useExpensesSync({ tenantId, ready, expenses, setState, onError }) {
  const { scope } = useTenantRequestScope(tenantId);
  const latest = useRef(expenses);
  latest.current = expenses;
  const errorHandler = useRef(onError);
  errorHandler.current = onError;
  const sessionRef = useRef(null);
  const [status, setStatus] = useState({ phase: "idle", error: null });

  const hydrate = useCallback(async (session) => {
    if (!session?.alive || session.busy) return;
    session.busy = true;
    setStatus({ phase: "loading", error: null });
    try {
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from("expenses").select(SELECT_COLUMNS)
          .eq("tenant_id", tenantId).order("expense_date", { ascending: false }).order("id").range(offset, offset + 499);
        if (error) throw error;
        if (!session.alive) return;
        rows.push(...(data || []).map(expenseRowToApp));
        if (!data || data.length < 500) break;
      }
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
    } finally { session.busy = false; }
  }, [tenantId, setState]);

  const flush = useCallback(async () => {
    const session = sessionRef.current;
    if (!session?.alive || session.scope !== scope || !session.hydrated || session.busy) return;
    session.busy = true;
    setStatus({ phase: "saving", error: null });
    try {
      while (session.alive) {
        const rows = (latest.current || []).filter(row => row?.id);
        const keys = new Set(rows.map(row => String(row.id)));
        const changed = rows.filter(row => session.baseline.get(String(row.id)) !== signature(row));
        const removed = [...session.baseline.keys()].filter(key => !keys.has(key));
        if (!changed.length && !removed.length) break;
        if (changed.length) {
          const { error } = await supabase.from("expenses").upsert(changed.map(row => appExpenseToRow(row, tenantId)), { onConflict: "tenant_id,expense_no" });
          if (error) throw error;
          if (!session.alive) return;
          changed.forEach(row => session.baseline.set(String(row.id), signature(row)));
        }
        if (removed.length) {
          const { error } = await supabase.from("expenses").delete().eq("tenant_id", tenantId).in("expense_no", removed);
          if (error) throw error;
          if (!session.alive) return;
          removed.forEach(key => session.baseline.delete(key));
        }
      }
      if (session.alive) setStatus({ phase: "saved", error: null });
    } catch (error) {
      if (session.alive) {
        setStatus({ phase: "error", error });
        errorHandler.current?.(error);
      }
    } finally { session.busy = false; }
  }, [scope, tenantId]);

  useEffect(() => {
    const session = { scope, alive: true, hydrated: false, busy: false, baseline: new Map() };
    sessionRef.current = session;
    if (tenantId && ready) hydrate(session);
    return () => { session.alive = false; };
  }, [tenantId, ready, scope, hydrate]);

  useEffect(() => {
    if (!ready || !sessionRef.current?.hydrated) return;
    const timer = setTimeout(flush, 400);
    return () => clearTimeout(timer);
  }, [expenses, ready, flush]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    if (!ready || !tenantId || session?.scope !== scope) return;
    return session.hydrated ? flush() : hydrate(session);
  }, [ready, tenantId, scope, flush, hydrate]);

  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  return { ...status, retry, refresh: retry };
}
