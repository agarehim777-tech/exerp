import { describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as kpi from "../shared/lib/kpiHelpers.ts";
import * as api from "../shared/lib/apiIntegrationHelpers.ts";
import { buildKpiPeriodSnapshot, buildKpiTargetRows, ensureKpiTargets, getKpiActualValue } from "../shared/lib/kpiHelpers.ts";
import {
  buildApiSecretRows,
  buildApiWebhookRows,
  ensureApiSecrets,
  ensureApiWebhooks,
  getApiSecretHealth,
} from "../shared/lib/apiIntegrationHelpers.ts";
import { currentBusinessDate } from "../shared/lib/businessDate.ts";
import { initialState } from "../data.js";

const employees = [{ kpi: 100 }, { kpi: 90 }, { kpi: 96 }, { kpi: 80 }];

describe("KPI and API integration helpers", () => {
  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of [...Object.entries(kpi), ...Object.entries(api)]) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("computes KPI actuals and scores progress against weighted targets", () => {
    expect(ensureKpiTargets([])).toBe(initialState.kpiTargets);
    expect(getKpiActualValue("companyKpi", { employees })).toBe(92);
    expect(getKpiActualValue("highPerformers", { employees })).toBe(50);
    expect(getKpiActualValue("salesBonus", { salesBonuses: [{ bonusAmount: 10.4 }, { bonusAmount: 5 }] })).toBe(15);
    expect(getKpiActualValue("unknown")).toBe(0);

    const rows = buildKpiTargetRows({
      employees,
      targets: [
        { id: "T1", metricKey: "companyKpi", target: 92, weight: 40 },
        { id: "T2", metricKey: "highPerformers", target: 60, weight: 60 },
        { id: "T3", metricKey: "hrBonus", target: 100, weight: 0 },
      ],
    });
    expect(rows.map((row) => [row.id, row.progress, row.weightedScore, row.status])).toEqual([
      ["T1", 100, 40, "Tamamlandı"],
      ["T2", 83, 50, "Nəzarət"],
      ["T3", 0, 0, "Risk"],
    ]);

    const snapshot = buildKpiPeriodSnapshot({
      period: "2026-11",
      targetRows: rows,
      employeeRows: [{ id: "E1", name: "Aysel", payoutAmount: 120, performanceBonus: 100 }, { id: "E2", payoutAmount: 0 }],
      existing: { status: "Bağlı" },
      stamp: "2026-11-14T10:00",
    });
    expect(snapshot).toMatchObject({ id: "KPI-PER-2026-11", status: "Bağlı", companyScore: 90, employeeCount: 2, payoutAmount: 120, updatedAt: "2026-11-14T10:00" });
    expect(snapshot.payoutRows).toEqual([expect.objectContaining({ employeeId: "E1", payoutAmount: 120 })]);
  });

  it("merges saved webhooks and secrets onto the defaults and keeps custom ones", () => {
    const [first] = initialState.apiWebhooks;
    const webhooks = ensureApiWebhooks([{ id: first.id, retryMax: "5" }, { id: "WH-CUSTOM", event: "x" }, { event: "no-id" }]);
    expect(webhooks).toHaveLength(initialState.apiWebhooks.length + 1);
    expect(webhooks[0]).toMatchObject({ id: first.id, retryMax: 5, failureCount: 0 });
    expect(webhooks.at(-1)?.id).toBe("WH-CUSTOM");
    expect(ensureApiSecrets(null).every((secret) => secret.status && secret.version >= 1)).toBe(true);
  });

  it("reports secret rotation health", () => {
    expect(getApiSecretHealth({})).toEqual({ daysLeft: 0, status: "Secret tapılmadı" });
    expect(getApiSecretHealth({ key: "K", status: "Deaktiv" })).toEqual({ daysLeft: 0, status: "Deaktiv" });
    expect(getApiSecretHealth({ key: "K", status: "Aktiv", lastRotatedAt: currentBusinessDate, rotationDays: 30 })).toEqual({ daysLeft: 30, status: "Aktiv" });
    expect(getApiSecretHealth({ key: "K", status: "Aktiv", lastRotatedAt: currentBusinessDate, rotationDays: 5 }).status).toBe("Rotasiya yaxınlaşır");
    expect(getApiSecretHealth({ key: "K", status: "Aktiv", rotationDays: 30 })).toEqual({ daysLeft: 0, status: "Rotasiya gecikib" });
  });

  it("links secrets to endpoints and builds the webhook queue", () => {
    const secrets = buildApiSecretRows();
    const signing = secrets.find((secret) => secret.key === "ERP_WEBHOOK_SIGNING_SECRET");
    expect(signing?.linkedCount).toBe(initialState.apiWebhooks.filter((webhook) => webhook.secretKey === signing?.key).length);

    const rows = buildApiWebhookRows({
      invoices: [{ id: "EQ-0001", balance: 0 }, { id: "EQ-0002", balance: 10 }],
      purchaseOrders: [{ id: "PO-1", status: "Təsdiq edildi" }],
      apiWebhooks: [{ id: "WH-INVOICE-PAID", processedCount: 0, retryQueue: 2 }],
    });
    const paid = rows.find((row) => row.id === "WH-INVOICE-PAID");
    expect(paid).toMatchObject({ queueCount: 1, lastPayload: "EQ-0001", retryState: "Retry gözləyir" });
    expect(rows.find((row) => row.id === "WH-PO-APPROVED")?.lastPayload).toBe("PO-1");
  });
});
