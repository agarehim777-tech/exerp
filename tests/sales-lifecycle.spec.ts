import { expect, test } from "@playwright/test";
import { authenticatedApi, hasLifecycleEnvironment, runId } from "./supabase-lifecycle";

test.describe.configure({ mode: "serial" });
test.skip(!hasLifecycleEnvironment, "Authenticated Supabase lifecycle environment is not configured");

test("@lifecycle sales order → payment → cancellation stays cancelled after reload", async ({ request }) => {
  const { call, tenantId } = await authenticatedApi(request);
  const marker = runId("E2E-SALE");
  let orderId = "";

  try {
    const customers = await call("get", `customers?tenant_id=eq.${tenantId}&select=id&limit=1`);
    expect(customers?.[0]?.id, "Lifecycle tenant needs at least one customer").toBeTruthy();

    const created = await call("post", "rpc/create_sales_order_complete", {
      _tenant_id: tenantId,
      _request_key: `${marker}:create`,
      _order_no: marker,
      _customer_id: customers[0].id,
      _order_date: new Date().toISOString().slice(0, 10),
      _currency: "AZN",
      _notes: "CI lifecycle test",
      _items: [{ line_no: 1, description: "CI lifecycle item", qty: 1, unit_price: 100, discount_pct: 0, vat_rate: 0 }],
      _credit: null,
      _bonus_allocations: [],
      _initial_payment: 25,
      _account_id: null,
    });
    orderId = created.order_id;
    expect(orderId).toBeTruthy();

    const paid = await call("get", `orders?id=eq.${orderId}&tenant_id=eq.${tenantId}&select=id,status,paid_amount,payment_status`);
    expect(Number(paid[0].paid_amount)).toBe(25);

    await call("post", "rpc/reverse_sales_order_v3", {
      _tenant_id: tenantId, _order_id: orderId, _reason: "CI lifecycle cleanup", _request_key: `${marker}:reverse`,
    });
    const afterReload = await call("get", `orders?id=eq.${orderId}&tenant_id=eq.${tenantId}&status=not.eq.cancelled&select=id`);
    expect(afterReload).toEqual([]);
    const reversed = await call("get", `cash_transactions?tenant_id=eq.${tenantId}&reference=eq.${encodeURIComponent(marker)}&select=direction,amount,reversal_of`);
    expect(reversed.length).toBeGreaterThanOrEqual(1);
  } finally {
    if (orderId) await call("delete", `operation_requests?tenant_id=eq.${tenantId}&request_key=like.${encodeURIComponent(`${marker}*`)}`).catch(() => null);
  }
});