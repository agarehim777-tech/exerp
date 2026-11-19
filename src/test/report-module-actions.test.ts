import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../services/enterpriseWorkflows.js", () => ({ saveWorkflowRecord: mocks.save }));
vi.mock("../services/reportData.js", () => ({ loadReportData: mocks.load }));

import { createReportModuleActions } from "../shared/state/reportModuleActions.ts";

type Row = Record<string, any>;

function setup({ allowed = true, current = true, state: initial = {} as Row } = {}) {
  let state: Row = { orders: [], employees: [], warehouseStock: {}, products: [], reportExports: [], projects: [], ...initial };
  const audits: Row[] = [];
  const deps = {
    activeRoleInfo: { name: "Maliyyə meneceri" },
    activeTenantId: "tenant-a",
    auditCurrentState: (next: Row, entry: Row) => { audits.push(entry); return next; },
    beginTenantRequest: vi.fn(() => () => current),
    creditRecords: [],
    notify: vi.fn(),
    projectRoiRows: [] as Row[],
    requirePermission: vi.fn(() => allowed),
    setState: vi.fn((update: (current: Row) => Row) => { state = update(state); }),
    state,
  };
  return { deps, audits, getState: () => state };
}

const snapshot = { period: "2026-11", rows: 7, sections: 3, score: 81, riskCount: 2, criticalCount: 0 };

beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.load.mockReset();
});

describe("report module actions", () => {
  it("saves the displayed report package and lists it first", async () => {
    const { deps, audits, getState } = setup({ state: { reportExports: Array.from({ length: 12 }, (_, i) => ({ id: `OLD-${i}` })) } });
    const actions = createReportModuleActions(deps);
    const row = await actions.exportReport("Aylıq hesabat", "Excel", snapshot);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(row).toMatchObject({ title: "Aylıq hesabat", format: "Excel", rows: 7, score: 81, owner: "Maliyyə meneceri", status: "Hazır", snapshot });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-a", module: "reports",
      record: expect.objectContaining({ record_type: "report_export", record_no: row!.id, status: "completed" }),
    }));
    expect(getState().reportExports).toHaveLength(12);
    expect(getState().reportExports[0].id).toBe(row!.id);
    expect(audits[0]).toMatchObject({ module: "Hesabat", action: "Export hazırlandı" });
    expect(deps.notify).toHaveBeenLastCalledWith("Aylıq hesabat Excel export siyahısına əlavə edildi.");
  });

  it("builds a fresh package from live report data when nothing is displayed", async () => {
    mocks.load.mockResolvedValue({ vendors: [], expenses: [], purchaseOrders: [], productionPlans: [], invoices: [], cashEntries: [] });
    const { deps, getState } = setup();
    const row = await createReportModuleActions(deps).exportReport();
    expect(mocks.load).toHaveBeenCalledWith("tenant-a");
    expect(row).toMatchObject({ title: "PDF export", format: "PDF" });
    expect(getState().reportExports).toHaveLength(1);
  });

  it("stops without permission, on a stale tenant, and reports save failures", async () => {
    const denied = setup({ allowed: false });
    expect(await createReportModuleActions(denied.deps).exportReport("X", "PDF", snapshot)).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();

    const stale = setup({ current: false });
    expect(await createReportModuleActions(stale.deps).exportReport("X", "PDF", snapshot)).toBeNull();
    expect(stale.deps.setState).not.toHaveBeenCalled();

    mocks.save.mockRejectedValueOnce(new Error("şəbəkə"));
    const failing = setup();
    expect(await createReportModuleActions(failing.deps).exportReport("X", "PDF", snapshot)).toBeNull();
    expect(failing.deps.notify).toHaveBeenLastCalledWith("Hesabat exportu saxlanmadı: şəbəkə", "warning");
  });

  it("exports project ROI and stamps each project", async () => {
    const { deps, getState, audits } = setup({ state: { projects: [{ id: "P1", exportCount: 2 }, { id: "P2" }] } });
    deps.projectRoiRows = [
      { id: "P1", name: "Ofis", revenue: 1000, collected: 800, totalCost: 600, profit: 400, roi: 66.7, status: "Sağlam", orderIds: ["O1"] },
    ];
    await createReportModuleActions(deps).runProjectsExportAction();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ module: "reports", record: expect.objectContaining({ title: "Layihə ROI" }) }));
    const [p1, p2] = getState().projects;
    expect(p1).toMatchObject({ exportCount: 3, lastRoi: 66.7, status: "Sağlam" });
    expect(p2).toMatchObject({ exportCount: 1 });
    expect(getState().reportExports[0]).toMatchObject({ title: "Layihə ROI", rows: 1 });
    expect(getState().projectRoiSnapshot.projects[0]).toMatchObject({ id: "P1", orders: ["O1"] });
    expect(audits[0]).toMatchObject({ module: "Layihə ROI", action: "ROI export" });
  });

  it("warns when there is no project to export", async () => {
    const { deps } = setup();
    await createReportModuleActions(deps).runProjectsExportAction();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(deps.notify).toHaveBeenLastCalledWith("Export üçün layihə tapılmadı.", "warning");
  });
});
