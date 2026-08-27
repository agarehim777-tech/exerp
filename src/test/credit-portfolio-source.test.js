import { describe, expect, it } from "vitest";
import { dbOrderToLegacy } from "../shared/adapters/erpShape.js";
import { buildAllCreditRecords } from "../shared/lib/appHelpers.jsx";

describe("credit portfolio DB source", () => {
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
