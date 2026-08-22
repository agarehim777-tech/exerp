import { describe, expect, it } from "vitest";
import { buildCustomerScore, buildCustomerTimeline } from "../modules/crm/customer360Analytics.js";

describe("customer 360 analytics", () => {
  it("risk və müştəri dəyərini real əməliyyatlardan hesablayır", () => {
    const result = buildCustomerScore({
      orders: [{ total: 5000 }], payments: [{ amount: 1800 }],
      credits: [{ risk_score: 40, installments: [{ status: "overdue", principal_due: 500, principal_paid: 100 }] }],
    });
    expect(result.revenue).toBe(5000);
    expect(result.overduePrincipal).toBe(400);
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.customerScore).toBeGreaterThan(0);
  });

  it("bütün müştəri hadisələrini vahid timeline-da tarixə görə sıralayır", () => {
    const rows = buildCustomerTimeline({
      orders: [{ id: "o1", order_no: "SF-1", order_date: "2026-01-01", total: 100, status: "delivered" }],
      credits: [{ id: "c1", contract_no: "KR-1", created_at: "2026-01-02", principal: 100, status: "active" }],
      payments: [{ id: "p1", credit_id: "c1", receipt_no: "QB-1", paid_at: "2026-01-03", amount: 20 }],
    });
    expect(rows.map(row => row.type)).toEqual(["Ödəniş", "Kredit", "Satış"]);
  });
});
