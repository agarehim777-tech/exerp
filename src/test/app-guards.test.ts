import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppGuards } from "../shared/state/appGuards.ts";
import { useFilteredRows } from "../shared/selectors/filteredRows.ts";

type Row = Record<string, any>;

function guards(overrides: Row = {}) {
  let state: Row = { settings: { currentRole: "Admin", roles: [], users: [] }, auditLog: [] };
  const deps = {
    activeRoleInfo: { name: "Satış" },
    collectionSync: { ready: true },
    dbCan: vi.fn(() => true),
    dbRole: "member",
    isPlatformAdmin: false,
    notify: vi.fn(),
    setActive: vi.fn(),
    setMobileNav: vi.fn(),
    setState: (update: (current: Row) => Row) => { state = update(state); },
    state,
    visibleNavItems: [{ id: "dashboard" }, { id: "sales" }],
    ...overrides,
  };
  return { deps, getState: () => state, ...createAppGuards(deps) };
}

describe("app guards", () => {
  it("lets platform admins and permission-free actions through", () => {
    expect(guards({ isPlatformAdmin: true, dbCan: () => false }).can("sales.manage")).toBe(true);
    expect(guards({ dbCan: () => false }).can(null)).toBe(true);
  });

  it("owners and admins follow the database role only", () => {
    expect(guards({ dbRole: "owner", dbCan: () => true }).can("sales.manage")).toBe(true);
    expect(guards({ dbRole: "admin", dbCan: () => false }).can("sales.manage")).toBe(false);
  });

  it("blocks HR commands until HR data has loaded", () => {
    const g = guards({ collectionSync: { ready: false } });
    expect(g.requirePermission("hr.manage", "əməkdaş yaratmaq")).toBe(false);
    expect(g.deps.notify).toHaveBeenCalledWith(expect.stringContaining("HR məlumatları"), "warning");
  });

  it("records a blocked action in the audit log with the acting role", () => {
    const g = guards({ dbRole: "admin", dbCan: () => false });
    expect(g.requirePermission("sales.manage", "satış yaratmaq")).toBe(false);
    expect(g.deps.notify).toHaveBeenCalledWith("Satış: satış yaratmaq üçün icazə yoxdur.", "warning");
    expect(g.getState().auditLog[0]).toMatchObject({ module: "Permission", action: "Əməliyyat bloklandı", role: "Satış" });
  });

  it("opens only modules the user can see", () => {
    const g = guards();
    expect(g.choosePage("sales")).toBe(true);
    expect(g.deps.setActive).toHaveBeenCalledWith("sales");
    expect(g.deps.setMobileNav).toHaveBeenCalledWith(false);
    expect(g.choosePage("settings")).toBe(false);
    expect(g.deps.setActive).toHaveBeenCalledTimes(1);
  });
});

describe("topbar search", () => {
  it("filters page lists by the query", () => {
    const empty: Row[] = [];
    const { result } = renderHook(() => useFilteredRows({
      accountingData: { journalRows: empty, chartRows: empty }, apiWebhookRows: empty, creditRecords: empty,
      currencyExposureRows: empty, invoiceRows: empty, messageConversations: empty, productionRows: empty,
      projectRoiRows: empty, query: "aysel", receivableRows: empty, taxCalendarRows: empty,
      state: { customers: [{ name: "Aysel" }, { name: "Murad" }], orders: [], stock: [], warehouses: [], expenses: [], vendors: [], employees: [], contracts: [], notifications: [] },
    }));
    expect(result.current.customers).toEqual([{ name: "Aysel" }]);
  });
});
