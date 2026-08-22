import { describe, expect, it } from "vitest";
import { buildRealtimeDashboard } from "../pages/DashboardPage.jsx";

describe("realtime dashboard calculations", () => {
  it("calculates current month metrics and five-month chart from live rows", () => {
    const dashboard = buildRealtimeDashboard(
      [
        { id: "1", order_date: "2026-08-05", total: 1200, status: "confirmed" },
        { id: "2", order_date: "2026-08-18", total: 800, status: "delivered" },
        { id: "3", order_date: "2026-07-10", total: 1000, status: "confirmed" },
        { id: "4", order_date: "2026-08-11", total: 500, status: "cancelled" },
      ],
      [
        { id: "c1", created_at: "2026-08-02T10:00:00Z" },
        { id: "c2", created_at: "2026-06-02T10:00:00Z" },
      ],
      new Date("2026-08-22T12:00:00"),
    );

    expect(dashboard.revenue).toBe(2000);
    expect(dashboard.activeCustomers).toBe(2);
    expect(dashboard.newCustomers).toBe(1);
    expect(dashboard.openOrders).toBe(2);
    expect(dashboard.chart.map((row) => row.month)).toEqual(["Apr", "May", "İyn", "İyl", "Avq"]);
    expect(dashboard.chart.at(-1).amount).toBe(2000);
  });
});
