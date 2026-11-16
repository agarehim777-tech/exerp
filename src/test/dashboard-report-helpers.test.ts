import { describe, expect, it } from "vitest";
import { CalendarClock, FileText, Package, Wallet } from "lucide-react";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as dashboard from "../shared/lib/dashboardHelpers.ts";
import * as reports from "../shared/lib/reportHelpers.ts";
import { buildExecutiveInsights, buildTodayActionRows } from "../shared/lib/dashboardHelpers.ts";
import { buildReportModuleRows, buildReportPackage, buildReportRiskRows } from "../shared/lib/reportHelpers.ts";
import { currentBusinessDate } from "../shared/lib/businessDate.ts";

const expenses = [
  { id: "E1", description: "İcarə", category: "Ofis", amount: 6000, status: "Təsdiq gözləyir" },
  { id: "E2", description: "Kargo", category: "Logistika", amount: 300, status: "Təsdiq gözləyir" },
  { id: "E3", description: "Kommunal", category: "Ofis", amount: 200, status: "Təsdiq edildi" },
];
const stock = [{ product: "Kabel", total: 2, reserved: 0, price: 10, minStock: 5 }];
const invoices = [
  { id: "EQ-1", customer: "Ali", balance: 150, status: "Ödəniş gözləyir", orderId: "SO-1" },
  { id: "EQ-2", customer: "Vali", balance: 0, status: "Ödənilib" },
];
const taxRows = [
  { id: "TAX-1", title: "ƏDV", period: "2026-11", amount: 900, status: "Gecikib" },
  { id: "TAX-2", title: "Payroll", period: "2026-11", amount: 100, status: "Planlı" },
];

describe("dashboard and report helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of [...Object.entries(dashboard), ...Object.entries(reports)]) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("queues today's actions by priority, then by amount", () => {
    const rows = buildTodayActionRows({ credits: [], orders: [], expenses, stock, invoices, taxRows });
    expect(rows.map((row) => [row.id, row.priority])).toEqual([
      ["ACT-E1", "Yüksək"],
      ["ACT-TAX-1", "Yüksək"],
      ["ACT-STOCK-Kabel", "Yüksək"],
      ["ACT-E2", "Orta"],
      ["ACT-EQ-1", "Orta"],
    ]);
    expect(rows.find((row) => row.module === "tax")?.icon).toBe(CalendarClock);
    expect(rows.find((row) => row.module === "finance")?.icon).toBe(Wallet);
    expect(rows.find((row) => row.module === "warehouse")).toMatchObject({ amount: 20, icon: Package });
    expect(rows.find((row) => row.module === "invoices")?.icon).toBe(FileText);
  });

  it("summarises the executive cards", () => {
    const cards = buildExecutiveInsights({
      orders: [{ status: "Hazırlanır" }, { status: "Təhvil verilib" }],
      credits: [],
      vendors: [{ status: "Risk altında" }, { status: "Aktiv" }],
      employees: [{ name: "Aysel", kpi: 92 }, { name: "Orxan", kpi: 97 }],
    });
    expect(cards.map((card) => [card.title, card.value, card.tone])).toEqual([
      ["Kredit portfeli", "0 risk", "success"],
      ["Təhvil yükü", "1 sifariş", "info"],
      ["Vendor riski", 1, "warning"],
      ["HR/KPI", "Orxan", "primary"],
    ]);
  });

  it("builds module rows and a sorted risk register", () => {
    const modules = buildReportModuleRows({ expenses, invoices, warehouseStock: { "WH-1": stock }, products: [{ name: "Kabel" }] });
    expect(modules.map((row) => row.module)).toEqual(["Satış", "Kredit", "Anbar", "Vendor / PO", "Maliyyə", "Faktura", "HR"]);
    expect(modules.find((row) => row.module === "Maliyyə")).toMatchObject({ signal: "2 xərc təsdiqdə", status: "Nəzarət" });

    const risks = buildReportRiskRows({ expenses, invoices, employees: [{ id: "H1", name: "Aysel", documentsComplete: 50, salary: 800 }] });
    expect(risks.map((row) => [row.area, row.priority])).toEqual([
      ["Maliyyə", "Yüksək"],
      ["HR", "Yüksək"],
      ["Maliyyə", "Orta"],
      ["Faktura", "Orta"],
    ]);
  });

  it("scores the report package from its risks", () => {
    const pack = buildReportPackage({ expenses, invoices, orders: [{ id: "SO-1", amount: 500, status: "Təhvil verilib" }] });
    expect(pack).toMatchObject({ period: currentBusinessDate.slice(0, 7), generatedAt: currentBusinessDate, sections: 7, revenue: 500, riskCount: 3, criticalCount: 1 });
    expect(pack.score).toBe(100 - 12 - 2 * 4);
    expect(pack.rows).toBe(1 + 3 + 2);
    expect(pack.checklist[0]).toEqual({ label: "Satış və kredit müqavilələri", status: "Hazır" });
  });
});
