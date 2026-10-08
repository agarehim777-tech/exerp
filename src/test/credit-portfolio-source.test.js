import { describe, expect, it } from "vitest";
import { dbOrderToLegacy } from "../shared/adapters/erpShape.js";
import { buildAllCreditRecords } from "../shared/lib/appHelpers.jsx";
import { getCreditDisplayPlan, isCreditStarted } from "../shared/lib/credit.js";

describe("credit portfolio DB source", () => {
  it("keeps server activation, partial principal payments and schedule after a reload", () => {
    const order = dbOrderToLegacy({
      id: "order-active", order_no: "SF-ACTIVE", total: 1000.55, paid_amount: 450.45,
      customer: { name: "Test customer" }, status: "confirmed",
      credit: { id: "credit-active", contract_no: "IN-ACTIVE", principal: 1000.55,
        initial_payment: 200.15, required_initial: 200.15, term_months: 4,
        start_date: "2026-10-08", status: "active", installments: [
          { installment_no: 4, due_date: "2027-02-08", principal_due: 200.1, principal_paid: 0 },
          { installment_no: 1, due_date: "2026-11-08", principal_due: 200.1, principal_paid: 200.1 },
          { installment_no: 2, due_date: "2026-12-08", principal_due: 200.1, principal_paid: 50.2 },
          { installment_no: 3, due_date: "2027-01-08", principal_due: 200.1, principal_paid: 0 },
        ] },
    });
    const [credit] = buildAllCreditRecords([order], [{
      id: "stale-browser-credit", orderId: order.id, status: "Başlanmamış", balance: 800,
      startDate: null, startedAt: null, installments: [], payments: [{ id: "browser-only-receipt" }],
    }]);
    expect(credit).toMatchObject({ id: "credit-active", status: "Aktiv", startDate: "2026-10-08", initialPaid: 200.15,
      requiredInitial: 200.15, balance: 550.1, paidMonths: 1, monthly: 149.9, next: "2026-12-08" });
    expect(isCreditStarted(credit)).toBe(true);
    expect(credit.installments.map(row => row.amount)).toEqual([0, 149.9, 200.1, 200.1]);
    expect(credit.payments).toEqual([]);
    expect(getCreditDisplayPlan(credit).balance).toBe(550.1);
    expect(buildAllCreditRecords([order], [])[0]).toMatchObject({ status: "Aktiv", balance: 550.1 });
  });

  it("keeps a server draft and an explicit zero deposit target instead of stale browser financial fields", () => {
    const order = dbOrderToLegacy({ id: "order-draft", total: 1000, paid_amount: 0,
      status: "confirmed", credit: { id: "credit-draft", principal: 1000, initial_payment: 0,
        required_initial: 0, term_months: 12, status: "draft", start_date: null, installments: [] } });
    const [credit] = buildAllCreditRecords([order], [{ id: "credit-draft", orderId: order.id,
      status: "Aktiv", startedAt: "2026-01-01", startDate: "2026-01-01", balance: 10 }]);
    expect(credit).toMatchObject({ status: "Başlanmamış", requiredInitial: 0, initialPaid: 0,
      startDate: null, startedAt: null, balance: 1000 });
    expect(isCreditStarted(credit)).toBe(false);
    expect(buildAllCreditRecords([{ ...order, status: "Ləğv edilib" }], [credit])).toEqual([]);
  });

  it("does not treat missing or empty activation dates as an active credit", () => {
    expect(isCreditStarted(undefined)).toBe(false);
    expect(isCreditStarted({ status: "Aktiv" })).toBe(false);
    expect(isCreditStarted({ status: "Aktiv", startedAt: "", startDate: "" })).toBe(false);
    expect(isCreditStarted({ status: "Aktiv", startDate: "2026-10-08" })).toBe(true);
  });

  it("keeps every DB credit contract as a separate unstarted credit", () => {
    const orders = [
      {
        id: "order-1",
        order_no: "SF-1001",
        customer_id: "customer-1",
        customer: { name: "Test Müştəri" },
        total: 1200,
        paid_amount: 100,
        order_date: "2026-08-25",
        items: [{ id: "line-1", description: "Cihaz", qty: 1, unit_price: 1200, line_total: 1200 }],
        credit: {
          id: "credit-1",
          contract_no: "İN-1001",
          principal: 1200,
          initial_payment: 100,
          required_initial: 100,
          term_months: 12,
          start_date: null,
          status: "pending",
        },
      },
      {
        id: "order-2",
        order_no: "SF-1002",
        customer_id: "customer-1",
        customer: { name: "Test Müştəri" },
        total: 800,
        paid_amount: 80,
        order_date: "2026-08-25",
        items: [{ id: "line-2", description: "Cihaz", qty: 1, unit_price: 800, line_total: 800 }],
        credit: {
          id: "credit-2",
          contract_no: "İN-1002",
          principal: 800,
          initial_payment: 80,
          required_initial: 80,
          term_months: 6,
          start_date: null,
          status: "pending",
        },
      },
    ].map(dbOrderToLegacy);

    const credits = buildAllCreditRecords(orders, []);

    expect(credits).toHaveLength(2);
    expect(credits.map((credit) => credit.id)).toEqual(["credit-1", "credit-2"]);
    expect(credits.map((credit) => credit.contractId)).toEqual(["İN-1001", "İN-1002"]);
    expect(credits.every((credit) => credit.status === "Başlanmamış")).toBe(true);
  });
});
