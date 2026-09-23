import { describe, expect, it } from "vitest";
import { appExpenseToRow, expenseRowToApp } from "../shared/hooks/useExpensesSync.js";

describe("expenses sync mapping", () => {
  it("maps an app expense to a database row", () => {
    const row = appExpenseToRow(
      { id: "MX-1", description: "Ofis", category: "İnzibati", amount: "120.5", status: "Təsdiqləndi", date: "2026-09-01", note: "qeyd" },
      "tenant-1",
    );
    expect(row).toMatchObject({
      tenant_id: "tenant-1",
      expense_no: "MX-1",
      amount: 120.5,
      currency: "AZN",
      expense_date: "2026-09-01",
      note: "qeyd",
    });
  });

  it("maps a database row back to the app shape", () => {
    expect(expenseRowToApp({ id: "uuid", expense_no: "MX-2", description: "Yanacaq", category: "Nəqliyyat", amount: "40", status: "Təsdiq gözləyir", expense_date: "2026-09-02" }))
      .toEqual({ id: "MX-2", description: "Yanacaq", category: "Nəqliyyat", amount: 40, currency: "AZN", vat_amount: 0, status: "Təsdiq gözləyir", date: "2026-09-02", note: "", source: "" });
  });

  it("falls back to defaults for incomplete rows", () => {
    const mapped = expenseRowToApp({ id: "uuid-2", amount: null });
    expect(mapped.id).toBe("uuid-2");
    expect(mapped.amount).toBe(0);
    expect(mapped.category).toBe("Digər");
  });
});
