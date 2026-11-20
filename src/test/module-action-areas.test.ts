import { describe, expect, it, vi } from "vitest";
import { createKpiModuleActions } from "../shared/state/kpiModuleActions.ts";
import { createApiModuleActions } from "../shared/state/apiModuleActions.ts";
import { createSupportModuleActions } from "../shared/state/supportModuleActions.ts";
import { createProductionModuleActions } from "../shared/state/productionModuleActions.ts";

type Row = Record<string, any>;

function stateHolder(initial: Row) {
  let state = initial;
  return {
    get: () => state,
    setState: (update: (current: Row) => Row) => { state = update(state); },
  };
}
const audit = (state: Row, entry: Row) => ({ ...state, audits: [...(state.audits || []), entry] });

describe("KPI period command", () => {
  const base = { kpiAccountId: "ACC-1", requirePermission: () => true, selectedKpiPeriod: "2026-11" };

  it("picks the next step from the period status and reports the server result", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const notify = vi.fn();
    const { runKpiPeriodAction } = createKpiModuleActions({
      ...base, notify, kpiLedger: { ready: true, busy: false, execute },
      activeKpiPeriod: { status: "Period bağlandı", approvalStatus: "Təsdiq edildi", payoutStatus: "Gözləyir" },
    });
    await runKpiPeriodAction();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ action: "payout", period: "2026-11", account_id: "ACC-1" }));
    expect(notify).toHaveBeenLastCalledWith("KPI ödənişi kassaya və perioda birlikdə yazıldı.");
  });

  it("does nothing until the ledger is loaded", async () => {
    const execute = vi.fn();
    const notify = vi.fn();
    const { runKpiPeriodAction } = createKpiModuleActions({
      ...base, notify, kpiLedger: { ready: false, execute }, activeKpiPeriod: {},
    });
    await runKpiPeriodAction();
    expect(execute).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("KPI məlumatları serverdən yüklənməlidir.", "warning");
  });
});

describe("API commands", () => {
  it("warns when there is no webhook rule to check", () => {
    const notify = vi.fn();
    const holder = stateHolder({});
    const { runApiAction } = createApiModuleActions({
      apiWebhookRows: [], auditCurrentState: audit, notify, requirePermission: () => true, setState: holder.setState,
    });
    runApiAction();
    expect(notify).toHaveBeenCalledWith("Webhook qaydası tapılmadı.", "warning");
    expect(holder.get()).toEqual({});
  });

  it("does not rotate a secret without permission", () => {
    const setState = vi.fn();
    const { rotateApiSecret } = createApiModuleActions({
      apiWebhookRows: [], auditCurrentState: audit, notify: vi.fn(), requirePermission: () => false, setState,
    });
    rotateApiSecret("SEC-1");
    expect(setState).not.toHaveBeenCalled();
  });
});

describe("support and onboarding commands", () => {
  function support(overrides: Row = {}) {
    const holder = stateHolder({ supportTickets: [], conversations: [] });
    const deps = {
      activeRoleInfo: { name: "Admin" }, auditCurrentState: audit, auditOperation: vi.fn(), choosePage: vi.fn(),
      creditRecords: [], helpModuleGuides: [], invoiceRows: [], notify: vi.fn(), onboardingRows: { steps: [], nextStep: null },
      selectMessageThread: vi.fn(), setSelectedSupportTicketId: vi.fn(), setState: holder.setState,
      state: { orders: [], customers: [], knowledgeBase: [] }, todayActionRows: [], ...overrides,
    };
    return { holder, deps, actions: createSupportModuleActions(deps) };
  }

  it("opens a support ticket with a prefixed id and selects it", () => {
    const { holder, deps, actions } = support();
    actions.runSupportAction();
    const [ticket] = holder.get().supportTickets;
    expect(ticket.id).toMatch(/^SUP-/);
    expect(ticket.title).toBe("Modul daxili yoxlama sorğusu");
    expect(deps.setSelectedSupportTicketId).toHaveBeenCalledWith(ticket.id);
    expect(holder.get().audits[0]).toMatchObject({ module: "Support", action: "Sorğu yaradıldı" });
  });

  it("opens the module of the next onboarding step", () => {
    const { deps, actions } = support({ onboardingRows: { steps: [], nextStep: { id: "S1", title: "Anbar", module: "warehouse" } } });
    actions.runOnboardingAction();
    expect(deps.choosePage).toHaveBeenCalledWith("warehouse");
    expect(deps.auditOperation).toHaveBeenCalledWith(expect.objectContaining({ module: "Onboarding" }));
  });
});

describe("production plan command", () => {
  it("drafts a BOM from the warehouse that has stock", () => {
    const holder = stateHolder({
      warehouses: [{ id: "W1", name: "Mərkəz" }],
      warehouseStock: { W1: [{ product: "Vint", qty: 10, costPrice: 2 }] },
      stock: [],
      productionPlans: [],
    });
    const notify = vi.fn();
    createProductionModuleActions({ auditCurrentState: audit, notify, setState: holder.setState }).runProductionAction();
    const [plan] = holder.get().productionPlans;
    expect(plan).toMatchObject({ warehouseId: "W1", warehouseName: "Mərkəz", status: "Planlandı" });
    expect(plan.id).toMatch(/^BOM-/);
    expect(notify).toHaveBeenCalledWith("Yeni istehsal planı yaradıldı.");
  });
});
