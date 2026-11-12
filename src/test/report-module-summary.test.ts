import { expect, it } from "vitest";
import { mapModuleSummary } from "../shared/hooks/useReportTotals.ts";

const money = (v: number) => `${v} ₼`;
it("maps server module summary into analytics rows and production risks", () => {
  const out = mapModuleSummary({
    sales: { revenue: 2000, count: 3, open_deliveries: 1 }, credit: { balance: 500, count: 1, overdue: 1 },
    stock: { total: 15, sellable: 12, low: 0, sku: 4 }, procurement: { approved_amount: 80, count: 2, open: 0, vendors: 3 },
    finance: { cash_inflow: 300, count: 2, pending: 1, approved_amount: 25 }, invoices: { open_balance: 0, count: 1, overdue: 0 },
    production: { cost: 20, count: 1, risk: 1 },
    production_risks: [{ id: "b1", area: "İstehsalat", title: "QA", amount: 20, owner: "Anbar", action: "Xammal: 0 / 4", priority: "Yüksək", status: "Xammal riski" }],
  }, money);
  expect(out.rows.find(r => r.module === "Satış")).toMatchObject({ metric: "2000 ₼", signal: "1 təhvil gözləyir" });
  expect(out.rows.find(r => r.module === "Kredit")?.status).toBe("Risk");
  expect(out.rows.find(r => r.module === "Anbar")?.metric).toBe("12/15");
  expect(out.production).toMatchObject({ status: "Risk", count: "1 plan" });
  expect(out.productionRisks[0].action).toBe("Xammal: 0 / 4");
});
