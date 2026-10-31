import { useEffect, useRef } from "react";
import { supabase } from "../../integrations/supabase/client";
import { ENABLE_LEGACY_WRITES } from "../../config/legacyWrites.js";
import { money, normalize } from "../../services/format.js";
import { appendAudit } from "../../services/persistence.js";
import { getOrderSellerBonuses } from "../lib/appDomain.jsx";
import { buildPayrollExpense } from "../lib/appHelpers.jsx";
import { toLocalIsoDate } from "../../services/date.js";

// One-off repairs for tenants that still run with VITE_ENABLE_LEGACY_WRITES.
// Every effect is a no-op when legacy writes are disabled (the production default).

// Backfills SF- order numbers, legacy cash payments and seller bonus splits onto DB orders.
export function useLegacyOrderMigrations({ activeTenantId, tenantStateReady, dbOrders, updateDbOrder, refreshDbOrders, state }) {
  const legacyBonusMigrationRef = useRef("");

  useEffect(() => {
    if (!ENABLE_LEGACY_WRITES) return;
    if (!activeTenantId || !dbOrders.length) return;
    const used = dbOrders.map(order => String(order.order_no || "").match(/^SF-(\d+)$/u)).filter(Boolean).map(match => Number(match[1]));
    let next = Math.max(1000, ...used) + 1;
    dbOrders.filter(order => !/^SF-\d+$/u.test(String(order.order_no || "")))
      .sort((a, b) => String(a.created_at || a.order_date).localeCompare(String(b.created_at || b.order_date)))
      .forEach(order => {
        const orderNo = `SF-${next++}`;
        updateDbOrder(order.id, { order_no: orderNo }).catch(error => console.error("Sifariş nömrəsi yenilənmədi:", error));
      });
  }, [activeTenantId, dbOrders, updateDbOrder]);

  useEffect(() => {
    if (!ENABLE_LEGACY_WRITES) return;
    if (!activeTenantId || !dbOrders.length || !(state.cashEntries || []).length) return;
    const paidByOrder = new Map();
    (state.cashEntries || []).filter(entry => Number(entry.principal ?? entry.amount ?? 0) > 0).forEach(entry => {
      let target = dbOrders.find(order => normalize(order.id) === normalize(entry.orderId) || normalize(order.order_no) === normalize(entry.orderId));
      if (!target && entry.customer) {
        const matches = dbOrders.filter(order => normalize(order.customer?.name) === normalize(entry.customer));
        if (matches.length === 1) target = matches[0];
      }
      if (target && target.status !== 'cancelled') {
        paidByOrder.set(target.id, Number(paidByOrder.get(target.id) || 0) + Number(entry.principal ?? entry.amount));
      }
    });
    paidByOrder.forEach((legacyPaid, orderId) => {
      const order = dbOrders.find(item => item.id === orderId);
      const currentPaid = Number(order?.paid_amount || 0);
      const nextPaid = Math.min(Number(order?.total || 0), Math.max(currentPaid, legacyPaid));
      if (nextPaid > currentPaid) updateDbOrder(orderId, { paid_amount: nextPaid, payment_status: nextPaid >= Number(order.total || 0) ? "paid" : "partial" }).catch(error => console.error("Sifariş ödənişi sinxronlaşdırılmadı:", error));
    });
  }, [activeTenantId, dbOrders, state.cashEntries, updateDbOrder]);

  // Older sales stored seller percentages only inside the tenant snapshot.
  // Recover those assignments before the DB read-bridge replaces legacy rows.
  useEffect(() => {
    if (!ENABLE_LEGACY_WRITES) return undefined;
    if (!activeTenantId || !tenantStateReady || !dbOrders.length) return;
    const migrationKey = `${activeTenantId}:${dbOrders.map((row) => `${row.id}:${row.bonus_assignments?.length || 0}`).join("|")}`;
    if (legacyBonusMigrationRef.current === migrationKey) return;
    legacyBonusMigrationRef.current = migrationKey;

    const legacyOrders = (state.orders || []).filter((order) =>
      getOrderSellerBonuses(order).some((row) => row?.seller && Number(row.bonus || 0) > 0),
    );
    const pending = dbOrders
      .filter((order) => !(order.bonus_assignments || []).length)
      .map((dbOrder) => {
        const exact = legacyOrders.find((order) =>
          normalize(order.id) === normalize(dbOrder.id)
          || normalize(order.id) === normalize(dbOrder.order_no)
          || normalize(order.orderNo) === normalize(dbOrder.order_no),
        );
        const candidates = exact ? [exact] : legacyOrders.filter((order) =>
          normalize(order.customer) === normalize(dbOrder.customer?.name)
          && String(order.date || "").slice(0, 10) === String(dbOrder.order_date || "").slice(0, 10)
          && Math.abs(Number(order.amount || 0) - Number(dbOrder.total || 0)) < 0.01,
        );
        if (candidates.length !== 1) return null;
        const allocations = getOrderSellerBonuses(candidates[0])
          .map((row) => ({ seller_name: String(row.seller || "").trim(), rate: Number(row.bonus || 0) }))
          .filter((row) => row.seller_name && row.rate > 0);
        return allocations.length ? { dbOrder, allocations } : null;
      })
      .filter(Boolean);
    if (!pending.length) return;

    let active = true;
    (async () => {
      for (const { dbOrder, allocations } of pending) {
        const { error } = await supabase.rpc("set_order_bonus_assignments", {
          _order_id: dbOrder.id,
          _effective_from: dbOrder.order_date || toLocalIsoDate(),
          _allocations: allocations,
          _reason: "Əvvəlki satış məlumatından avtomatik bərpa",
        });
        if (error) throw error;
      }
      if (active) await refreshDbOrders();
    })().catch((error) => {
      if (!active) return;
      legacyBonusMigrationRef.current = "";
      console.error("[sales-bonus] Köhnə satıcı bölgüsü bərpa edilmədi:", error);
    });
    return () => { active = false; };
  }, [activeTenantId, tenantStateReady, dbOrders, refreshDbOrders, state.orders]);
}

// Mirrors the current payroll total into the snapshot expenses list.
export function useLegacyPayrollExpense({ state, setState }) {
  useEffect(() => {
    if (!ENABLE_LEGACY_WRITES || state.employees.length === 0) return;

    setState((current) => {
      const payrollExpense = buildPayrollExpense(current.employees);
      const existing = current.expenses.find((expense) => expense.id === payrollExpense.id);
      const nextExpense = existing
        ? {
            ...existing,
            ...payrollExpense,
            status: existing.status || payrollExpense.status,
          }
        : payrollExpense;
      const isSame =
        existing &&
        Number(existing.amount || 0) === payrollExpense.amount &&
        Number(existing.grossTotal || 0) === payrollExpense.grossTotal &&
        Number(existing.deductions || 0) === payrollExpense.deductions &&
        existing.source === payrollExpense.source &&
        existing.cashImpact === payrollExpense.cashImpact;

      if (isSame) return current;

      const expenses = existing
        ? current.expenses.map((expense) => (expense.id === payrollExpense.id ? nextExpense : expense))
        : [nextExpense, ...current.expenses];

      return appendAudit(
        {
          ...current,
          expenses,
        },
        {
          module: "HR/Maliyyə",
          action: existing ? "Payroll expense yeniləndi" : "Payroll expense yaradıldı",
          detail: `${money(payrollExpense.amount)} payroll maliyyəyə avtomatik düşdü`,
          status: "Avtomatik",
          role: "System",
        },
      );
    });
  }, [state.employees]);
}
