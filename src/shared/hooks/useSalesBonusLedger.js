import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useRealtimeResync } from "./useRealtimeResync";

export function useSalesBonusLedger(tenantId) {
  const [assignments, setAssignments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [assignmentResult, entryResult] = await Promise.all([
      supabase.from("order_bonus_assignments").select("*").eq("tenant_id", tenantId).order("effective_from", { ascending: false }),
      supabase.from("sales_bonus_entries").select("*").eq("tenant_id", tenantId).order("accrued_on", { ascending: false }),
    ]);
    const nextError = assignmentResult.error || entryResult.error;
    setError(nextError || null);
    if (!assignmentResult.error) setAssignments(assignmentResult.data || []);
    if (!entryResult.error) {
      const rawEntries = entryResult.data || [];
      const orderIds = [...new Set(rawEntries.map((row) => row.order_id).filter(Boolean))];
      let ordersById = new Map();
      let customersById = new Map();
      if (orderIds.length) {
        const { data: orderRows, error: orderError } = await supabase.from("orders")
          .select("id,order_no,customer_id").eq("tenant_id", tenantId).in("id", orderIds);
        if (orderError) setError(orderError);
        else {
          ordersById = new Map((orderRows || []).map((row) => [row.id, row]));
          const customerIds = [...new Set((orderRows || []).map((row) => row.customer_id).filter(Boolean))];
          if (customerIds.length) {
            const { data: customerRows, error: customerError } = await supabase.from("customers")
              .select("id,name").eq("tenant_id", tenantId).in("id", customerIds);
            if (customerError) setError(customerError);
            else customersById = new Map((customerRows || []).map((row) => [row.id, row]));
          }
        }
      }
      setEntries(rawEntries.map((entry) => {
        const order = ordersById.get(entry.order_id);
        return { ...entry, order: order ? { ...order, customer: customersById.get(order.customer_id) || null } : null };
      }));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);
  useRealtimeResync(tenantId, ["order_bonus_assignments", "sales_bonus_entries"], refresh, { channelPrefix: "sales-bonus-ledger" });

  const replaceAssignments = async (orderId, effectiveFrom, allocations, reason) => {
    const { error: rpcError } = await supabase.rpc("set_order_bonus_assignments", {
      _order_id: orderId,
      _effective_from: effectiveFrom,
      _allocations: allocations,
      _reason: reason || null,
    });
    if (rpcError) throw rpcError;
    await refresh();
  };

  const rows = entries.map((entry) => ({
    id: entry.id,
    paymentId: entry.cash_transaction_id,
    orderId: entry.order?.order_no || entry.order_id,
    date: entry.accrued_on,
    customer: entry.order?.customer?.name || "—",
    product: "Kassa daxilolması",
    productLines: [],
    paymentMethod: "Kassa/bank",
    seller: entry.seller_name,
    rate: Number(entry.rate || 0),
    paid: Number(entry.payment_amount || 0),
    bonusAmount: Number(entry.bonus_amount || 0),
    status: entry.status,
  }));

  return { assignments, entries, rows, loading, error, refresh, replaceAssignments };
}
