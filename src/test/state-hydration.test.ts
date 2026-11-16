import { afterEach, describe, expect, it } from "vitest";
import * as legacy from "../shared/lib/appHelpers.jsx";
import * as stateHydration from "../shared/lib/stateHydration.ts";
import {
  hydrateState,
  loadPersistentState,
  nextContractNumber,
  nextSalesOrderNumber,
  normalizeContractNumbers,
  normalizeOperationalLabels,
} from "../shared/lib/stateHydration.ts";
import { defaultDbProvider, localDbBaselineVersion, localDbKey, localDbSchemaVersion } from "../services/persistence.js";

describe("state hydration and numbering", () => {
  afterEach(() => window.localStorage.removeItem(localDbKey));

  it("stays importable from appHelpers so existing callers keep working", () => {
    for (const [name, fn] of Object.entries(stateHydration)) {
      expect((legacy as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it("replaces leftover demo labels with operational ones", () => {
    const labels = normalizeOperationalLabels({
      onboarding: { companyStage: "Demo mərhələ" },
      invoiceSettings: { eTaxMode: "demo" },
      productionPlans: [{ id: "P1", product: "Showroom demo dəsti" }, { id: "P2", product: "Masa" }],
    });
    expect(labels.onboarding.companyStage).toBe("Go-live hazırlığı");
    expect(labels.invoiceSettings.eTaxMode).toBe("E-qaimə inteqrasiya rejimi");
    expect(labels.productionPlans.map((plan: { product: string }) => plan.product)).toEqual(["Showroom nümayiş dəsti", "Masa"]);
  });

  it("renumbers legacy contract ids everywhere after the highest İN number", () => {
    const snapshot = {
      contracts: [{ id: "MQ-SO-1" }, { id: "İN-1005" }],
      orders: [{ id: "SO-1", contractId: "MQ-SO-1" }, { id: "SO-2", contractId: "CONTRACT-9" }],
      credits: [{ id: "KR-1", contractId: "MQ-SO-1", nested: { ref: ["MQ-SO-1"] } }],
    };
    const result = normalizeContractNumbers(snapshot);
    expect(result.contracts.map((item: { id: string }) => item.id)).toEqual(["İN-1006", "İN-1005"]);
    expect(result.orders.map((item: { contractId: string }) => item.contractId)).toEqual(["İN-1006", "İN-1007"]);
    expect(result.credits[0]).toEqual({ id: "KR-1", contractId: "İN-1006", nested: { ref: ["İN-1006"] } });
    const clean = { contracts: [{ id: "İN-1001" }] };
    expect(normalizeContractNumbers(clean)).toBe(clean);
  });

  it("picks the next contract and sales order numbers", () => {
    expect(nextContractNumber()).toBe("İN-1001");
    expect(nextContractNumber({ contracts: [{ id: "İN-1010" }], orders: [{ contractId: "İN-1003" }], credits: [{ contractId: "MQ-1" }] })).toBe("İN-1011");
    expect(nextSalesOrderNumber()).toBe("SF-1001");
    expect(nextSalesOrderNumber([{ order_no: "SF-1042" }, { orderNo: "SF-1007" }, { orderNo: "X-9" }])).toBe("SF-1043");
  });

  it("fills defaults and stamps the current schema on hydration", () => {
    const state = hydrateState({ auditLog: "broken", kpiTargets: [], dbMeta: { provider: "Local persistent DB", lastWriteAt: "2026-01-01" } });
    expect(state.auditLog).toEqual([]);
    expect(state.kpiTargets.length).toBeGreaterThan(0);
    expect(state.dbMeta).toMatchObject({ runtime: "browser", version: localDbSchemaVersion, baselineVersion: localDbBaselineVersion, lastWriteAt: "2026-01-01" });
    expect(state.dbMeta.provider).toBe(defaultDbProvider);
    expect(hydrateState({ dbMeta: { provider: "Supabase" } }).dbMeta.provider).toBe("Supabase");
    expect(Array.isArray(state.settings.users)).toBe(true);
  });

  it("loads the saved snapshot and falls back to defaults on bad or outdated data", () => {
    window.localStorage.setItem(localDbKey, JSON.stringify({ customers: [{ id: "C-1" }], dbMeta: { baselineVersion: localDbBaselineVersion } }));
    expect(loadPersistentState().customers).toEqual([{ id: "C-1" }]);

    window.localStorage.setItem(localDbKey, "{not json");
    const fallback = loadPersistentState();
    expect(fallback.dbMeta.baselineVersion).toBe(localDbBaselineVersion);

    window.localStorage.setItem(localDbKey, JSON.stringify({ customers: [{ id: "OLD" }], dbMeta: { baselineVersion: 0 } }));
    expect(loadPersistentState().customers).not.toEqual([{ id: "OLD" }]);
  });
});
