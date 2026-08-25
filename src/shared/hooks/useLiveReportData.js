import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useRealtimeResync } from "./useRealtimeResync.js";

const expenseStatus = { pending: "Təsdiq gözləyir", draft: "Qaralama", approved: "Təsdiqlənib", paid: "Ödənilib", cancelled: "İmtina edilib", rejected: "İmtina edilib" };
const poStatus = { draft: "Qaralama", approved: "Təsdiqlənib", partial: "Qismən qəbul", received: "Qəbul edilib", closed: "Bağlanıb", cancelled: "Ləğv edilib" };

export function useLiveReportData(tenantId) {
  const [data, setData] = useState({ expenses: [], cashEntries: [], vendors: [], purchaseOrders: [], invoices: [] });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [expenseResult, cashResult, vendorResult, poResult, invoiceResult] = await Promise.all([
      supabase.from("expenses").select("*").eq("tenant_id", tenantId).order("expense_date", { ascending: false }),
      supabase.from("cash_transactions").select("*").eq("tenant_id", tenantId).order("occurred_at", { ascending: false }).limit(1000),
      supabase.from("vendors").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("purchase_orders").select("*, vendors(name), purchase_order_lines(*)").eq("tenant_id", tenantId).order("order_date", { ascending: false }),
      supabase.from("sales_invoices").select("*, customer:customers(id,name)").eq("tenant_id", tenantId).order("invoice_date", { ascending: false }),
    ]);
    const firstError = [expenseResult, cashResult, vendorResult, poResult, invoiceResult].find((result) => result.error)?.error || null;
    setError(firstError);
    const rawCashEntries = cashResult.data || [];
    const reversedIds = new Set(rawCashEntries.flatMap((row) => {
      if (row.category !== "transaction_reversal" && !row.reversal_of) return [];
      const markerId = String(row.description || "").match(/REVERSAL_OF:([0-9a-f-]{36})/i)?.[1];
      return [row.reversal_of, markerId].filter(Boolean);
    }));
    setData({
      expenses: (expenseResult.data || []).map((row) => ({ ...row, date: row.expense_date, createdAt: row.created_at, status: expenseStatus[row.status] || row.status, cashImpact: row.status === "paid" || row.status === "approved" })),
      cashEntries: rawCashEntries
        .filter((row) => row.category !== "transaction_reversal" && !row.reversal_of && !reversedIds.has(row.id))
        .map((row) => ({ ...row, date: row.occurred_at, at: row.occurred_at, type: row.direction === "in" ? "Mədaxil" : "Məxaric" })),
      vendors: vendorResult.data || [],
      purchaseOrders: (poResult.data || []).map((row) => {
        const lines = row.purchase_order_lines || [];
        return { ...row, date: row.order_date, createdAt: row.created_at, vendor: row.vendors?.name || "Vendor", product: lines.map((line) => line.description || line.product_sku).filter(Boolean).join(", ") || "Məhsul qeyd edilməyib", qty: lines.reduce((sum, line) => sum + Number(line.qty_ordered || 0), 0), amount: lines.reduce((sum, line) => sum + Number(line.qty_ordered || 0) * Number(line.unit_price || 0) * (1 + Number(line.tax_rate || 0) / 100), 0), status: poStatus[row.status] || row.status, warehouseId: row.warehouse_id || "" };
      }),
      invoices: (invoiceResult.data || []).map((row) => ({ ...row, date: row.invoice_date, createdAt: row.created_at, customer: row.customer?.name || "Müştəri", balance: Math.max(0, Number(row.total || 0) - Number(row.paid_amount || 0)), dueDate: row.due_date, orderId: row.order_id })),
    });
    setLoaded(true);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);
  const degraded = useRealtimeResync(tenantId, ["expenses", "cash_transactions", "vendors", "purchase_orders", "sales_invoices"], load, { channelPrefix: "reports-live", debounceMs: 700 });
  return { ...data, loading, loaded, error, degraded, refresh: load };
}
