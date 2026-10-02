import { expect, test } from "@playwright/test";
import { authenticatedApi, hasLifecycleEnvironment, runId } from "./supabase-lifecycle";

test.describe.configure({ mode: "serial" });
test.skip(!hasLifecycleEnvironment, "Authenticated Supabase lifecycle environment is not configured");

test("@lifecycle expense → atomic edit → approval → acceptance → cancellation restores cash balance", async ({ request }) => {
  const { call, tenantId } = await authenticatedApi(request);
  const marker = runId("E2E-EXP");
  let accountId = "";
  let expenseId = "";

  try {
    const accounts = await call("post", "cash_accounts?select=id", {
      tenant_id: tenantId, account_no: marker, code: marker, name: marker, type: "cash", currency: "AZN", opening_balance: 500, is_active: true,
    }, { Prefer: "return=representation" });
    accountId = accounts[0].id;

    const command = {
      _tenant_id: tenantId, _request_key: marker,
      _payload: { category: "CI lifecycle", amount: 75, currency: "AZN",
        expense_date: new Date().toISOString().slice(0, 10), description: marker, account_id: accountId },
    };
    const created = await call("post", "rpc/create_cash_expense_atomic", command);
    expenseId = created.expense_id;
    expect(await call("post", "rpc/create_cash_expense_atomic", command)).toEqual(created);
    const summary = await call("post", "rpc/cashbook_ledger_summary", { _tenant_id: tenantId });
    expect(Number(summary.accounts.find((row: { id: string }) => row.id === accountId).balance)).toBe(425);

    const edit = { _tenant_id: tenantId, _request_key: `${marker}-edit`, _payload: {
      expense_id: expenseId, account_id: accountId, amount: 84.50, vat_amount: 0, currency: "AZN",
      expense_date: command._payload.expense_date, category: "CI lifecycle", description: `${marker} edited`,
      expected: { amount: 75, vat_amount: 0, account_id: accountId, category: "CI lifecycle", description: marker,
        expense_date: command._payload.expense_date },
    } };
    const edited = await call("post", "rpc/edit_cash_expense_atomic", edit);
    expect(await call("post", "rpc/edit_cash_expense_atomic", edit)).toEqual(edited);
    const editedSummary = await call("post", "rpc/cashbook_ledger_summary", { _tenant_id: tenantId });
    expect(Number(editedSummary.accounts.find((row: { id: string }) => row.id === accountId).balance)).toBe(415.50);

    await call("patch", `expenses?id=eq.${expenseId}&tenant_id=eq.${tenantId}`, { status: "approved" }, { Prefer: "return=minimal" });
    await call("post", "rpc/accept_expense", { _tenant_id: tenantId, _expense_id: expenseId });
    await call("post", "rpc/accept_expense", { _tenant_id: tenantId, _expense_id: expenseId });
    let loaded = await call("get", `expenses?id=eq.${expenseId}&tenant_id=eq.${tenantId}&select=id,status`);
    expect(loaded[0].status).toBe("paid");

    const acceptedLedger = await call("get", `cash_transactions?tenant_id=eq.${tenantId}&reference=eq.${encodeURIComponent(`EXPENSE:${expenseId}`)}&select=id,direction,amount`);
    expect(acceptedLedger).toHaveLength(1);
    expect(acceptedLedger[0].direction).toBe("out");
    expect(Number(acceptedLedger[0].amount)).toBe(84.50);

    await call("post", "rpc/cancel_expense", { _tenant_id: tenantId, _expense_id: expenseId, _reason: "CI lifecycle cleanup" });
    await call("post", "rpc/cancel_expense", { _tenant_id: tenantId, _expense_id: expenseId, _reason: "CI lifecycle cleanup" });
    loaded = await call("get", `expenses?id=eq.${expenseId}&tenant_id=eq.${tenantId}&select=id,status`);
    expect(loaded[0].status).toBe("cancelled");
    const ledger = await call("get", `cash_transactions?tenant_id=eq.${tenantId}&or=(reference.eq.${encodeURIComponent(`EXPENSE:${expenseId}`)},reference.eq.${encodeURIComponent(`EXPENSE-REVERSAL:${expenseId}`)})&select=direction,amount`);
    expect(ledger).toHaveLength(2);
    expect(ledger.reduce((sum: number, row: { direction: string; amount: number }) => sum + (row.direction === "in" ? Number(row.amount) : -Number(row.amount)), 0)).toBe(0);
  } finally {
    if (expenseId) await call("delete", `cash_transactions?tenant_id=eq.${tenantId}&or=(reference.eq.${encodeURIComponent(`EXPENSE:${expenseId}`)},reference.eq.${encodeURIComponent(`EXPENSE-REVERSAL:${expenseId}`)})`).catch(() => null);
    if (expenseId) await call("delete", `expenses?id=eq.${expenseId}&tenant_id=eq.${tenantId}`).catch(() => null);
    if (accountId) await call("delete", `cash_accounts?id=eq.${accountId}&tenant_id=eq.${tenantId}`).catch(() => null);
  }
});
