import { expect, test } from "@playwright/test";
import { authenticatedApi, hasLifecycleEnvironment, runId } from "./supabase-lifecycle";

test.skip(!hasLifecycleEnvironment, "Authenticated Supabase lifecycle environment is not configured");

test("@lifecycle credit deposit → cash once → shortfall guard → activation → cancellation", async ({ request }) => {
  const { call, tenantId } = await authenticatedApi(request);
  const marker = runId("E2E-DEPOSIT");
  const date = new Date().toISOString().slice(0, 10);
  let orderId = "";
  let accountId = "";
  try {
    const customers = await call("get", `customers?tenant_id=eq.${tenantId}&select=id&limit=1`);
    expect(customers[0]?.id).toBeTruthy();
    const accounts = await call("post", "cash_accounts?select=id", {
      tenant_id: tenantId, code: marker, account_no: marker, name: marker,
      type: "cash", currency: "AZN", is_active: true, opening_balance: 0,
    }, { Prefer: "return=representation" });
    accountId = accounts[0].id;
    const command = {
      _tenant_id: tenantId, _request_key: `${marker}:create`, _order_no: marker,
      _customer_id: customers[0].id, _order_date: date, _currency: "AZN", _notes: marker,
      _items: [{ line_no: 1, description: marker, qty: 1, unit_price: 20000, discount_pct: 0, vat_rate: 0 }],
      _credit: { contract_no: marker, principal: 20000, initial_payment: 200, required_initial: 2000, term_months: 12 },
      _bonus_allocations: [], _initial_payment: 200, _account_id: accountId,
    };
    const created = await call("post", "rpc/create_sales_order_complete", command);
    orderId = created.order_id;
    const creditId = created.credit_id;
    expect(creditId).toBeTruthy();
    expect(await call("post", "rpc/create_sales_order_complete", command)).toEqual(created);
    const loadCredit = () => call("get", `credit_contracts?tenant_id=eq.${tenantId}&id=eq.${creditId}&select=status,initial_payment,required_initial`);
    const before = (await loadCredit())[0];
    expect(Number(before.initial_payment)).toBe(200);
    expect(Number(before.required_initial) - Number(before.initial_payment)).toBe(1800);
    const ledger = await call("get", `cash_transactions?tenant_id=eq.${tenantId}&account_id=eq.${accountId}&select=amount,direction`);
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].amount)).toBe(200);
    const start = { _tenant_id: tenantId, _credit_id: creditId, _start_date: date };
    await expect(call("post", "rpc/start_credit_contract", start)).rejects.toThrow("credit_initial_payment_incomplete");
    expect((await loadCredit())[0].status).toBe("draft");
    expect(await call("post", "rpc/post_credit_initial_payment", {
      _tenant_id: tenantId, _credit_id: creditId, _amount: 1800, _cash_account_id: accountId, _note: marker,
    })).toBe(0);
    await call("post", "rpc/start_credit_contract", start);
    expect((await loadCredit())[0].status).toBe("active");
    const installments = await call("get", `credit_installments?tenant_id=eq.${tenantId}&credit_id=eq.${creditId}&select=principal_due`);
    expect(installments).toHaveLength(12);
    expect(installments.reduce((sum: number, row: { principal_due: number }) => sum + Number(row.principal_due), 0)).toBe(18000);
    await call("post", "rpc/reverse_sales_order_v3", {
      _tenant_id: tenantId, _order_id: orderId, _reason: marker, _request_key: `${marker}:reverse`,
    });
    expect((await loadCredit())[0].status).not.toMatch(/^(active|draft)$/);
    const cancelledLedger = await call("get", `cash_transactions?tenant_id=eq.${tenantId}&account_id=eq.${accountId}&select=amount,direction`);
    expect(cancelledLedger.reduce((sum: number, row: { amount: number; direction: string }) =>
      sum + (row.direction === "in" ? Number(row.amount) : -Number(row.amount)), 0)).toBe(0);
  } finally {
    if (orderId) await call("post", "rpc/reverse_sales_order_v3", {
      _tenant_id: tenantId, _order_id: orderId, _reason: marker, _request_key: `${marker}:cleanup`,
    });
    // Keep financial audit rows; remove the temporary account from operational lists.
    if (accountId) await call("patch", `cash_accounts?tenant_id=eq.${tenantId}&id=eq.${accountId}`, { is_active: false });
  }
});
