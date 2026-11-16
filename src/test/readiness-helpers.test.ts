import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as readiness from "../shared/lib/readinessHelpers.ts";
import * as payroll from "../shared/lib/payrollExpenseHelpers.ts";
import {
  buildGoLiveReadiness,
  buildModuleReadiness,
  buildProductionHardeningReport,
  buildStateIntegrityReport,
  deploymentToolkitReady,
  getDuplicateValues,
} from "../shared/lib/readinessHelpers.ts";
import { buildPayrollExpense } from "../shared/lib/payrollExpenseHelpers.ts";

const signedIn = { users: [{ id: "u1", name: "Admin", role: "Super Admin", status: "Aktiv" }], sessionUserId: "u1" };

describe("readiness and payroll expense helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, value] of [...Object.entries(readiness), ...Object.entries(payroll)]) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(value);
    }
    expect(deploymentToolkitReady).toBe(true);
  });

  it("reports duplicate identifiers once per value", () => {
    const issues = getDuplicateValues([{ id: "A" }, { id: "A" }, { id: "A" }, { id: "B" }, {}], "id", "Satış");
    expect(issues).toEqual([{ id: "Satış-A", severity: "Kritik", area: "Satış", title: "Dublikat identifikator", detail: "A təkrar istifadə olunub", fix: "ID/FIN unikal saxlanmalıdır" }]);
  });

  it("scores data integrity from critical and warning issues", () => {
    const clean = buildStateIntegrityReport({ settings: signedIn });
    expect(clean).toMatchObject({ score: 100, status: "Sağlam", critical: 0, warnings: 0, issueCount: 0 });

    const report = buildStateIntegrityReport({
      settings: signedIn,
      orders: [{ id: "SO-1", amount: 100, paid: 150 }, { id: "SO-1", amount: 50, paid: 0 }],
      stock: [{ product: "A", total: 2, reserved: 5 }],
      employees: [{ id: "E1", name: "Aysel", managerId: "E1" }],
    });
    expect(report.issues.map((issue) => issue.id)).toEqual(["Satış-SO-1", "STOCK-RES-Ümumi stok-A", "ORDER-OVERPAID-SO-1", "HR-SELF-MANAGER-E1"]);
    expect(report).toMatchObject({ critical: 2, warnings: 2, score: 100 - 2 * 18 - 2 * 6, status: "Risk" });

    const noSession = buildStateIntegrityReport({ settings: { users: [], sessionUserId: null } });
    expect(noSession.issues.map((issue) => issue.id)).toContain("AUTH-NO-SESSION");
  });

  it("blocks go-live without a server DB and real business data", () => {
    const local = buildGoLiveReadiness({ dbMeta: { runtime: "browser" } }, { critical: 0 });
    expect(local.items.find((item) => item.area === "Backend DB")?.status).toBe("Bloker");
    expect(local.items.find((item) => item.area === "Deployment")?.status).toBe("Hazır");
    expect(local.status).toBe("Bloker var");
    expect(local.score).toBe(Math.max(0, Math.round((local.ready / local.items.length) * 100 - local.blockers * 8)));

    const server = buildGoLiveReadiness({ dbMeta: { runtime: "server", provider: "Supabase" } }, { critical: 0 });
    expect(server.items.find((item) => item.area === "Backend DB")?.status).toBe("Hazır");
  });

  it("averages production hardening item scores", () => {
    const report = buildProductionHardeningReport({ dbMeta: { runtime: "server", auditMode: "immutable", lastBackupAt: "2026-11-01" } }, {
      goLiveReport: { score: 90, status: "Staging hazırdır", checkedAt: "x" },
      apiWebhookRows: [{ health: "Test OK" }],
      apiSecretRows: [{ health: "Aktiv" }],
      notificationProviderRows: [{ status: "Aktiv" }, { status: "Aktiv" }],
    });
    expect(report.items.map((item) => [item.area, item.status, item.score])).toEqual([
      ["Backend sərtləşdirmə", "Hazır", 100],
      ["Backup/Restore", "Hazır", 100],
      ["Deployment monitorinqi", "Hazır", 90],
      ["Real provider inteqrasiyaları", "Hazır", 95],
      ["Kodun modullara parçalanması", "Nəzarət", 60],
    ]);
    expect(report).toMatchObject({ score: 89, blockers: 0, watch: 1, ready: 4, status: "Production nəzarəti" });
  });

  it("rates each module's handover readiness", () => {
    const report = buildModuleReadiness({}, {});
    expect(report.items.map((item) => item.module)).toEqual(["sales", "warehouse", "deliveries", "credits", "crm", "finance", "vendors", "hr", "kpi"]);
    expect(report.items.find((item) => item.module === "deliveries")?.status).toBe("Hazır");
    expect(report.items.find((item) => item.module === "sales")?.status).toBe("Nəzarət");
    expect(report.blockers).toBe(0);
    const blocked = buildModuleReadiness({ purchaseOrders: [{ id: "PO-1", vendor: "Naməlum", status: "Təsdiq edildi" }] }, {});
    expect(blocked.items.find((item) => item.module === "vendors")?.status).toBe("Bloker");
    expect(blocked.status).toBe("Bloker var");
  });

  it("builds a cash-neutral payroll accrual", () => {
    const expense = buildPayrollExpense([]);
    expect(expense).toMatchObject({ category: "Payroll", source: "HR Payroll", status: "Təsdiq gözləyir", cashImpact: false, amount: 0, payrollRows: [] });
    expect(expense.id).toBe(`PAY-${expense.date.slice(0, 7)}`);
  });
});
