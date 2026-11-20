import { describe, expect, it, vi } from "vitest";
import { createPageHeaderAction } from "../shared/state/pageHeaderAction.ts";

function setup(active: string, allowed = true) {
  const deps = {
    active,
    exportReport: vi.fn(),
    requirePermission: vi.fn(() => allowed),
    runAccountingAction: vi.fn(),
    runApiAction: vi.fn(),
    runHelpAction: vi.fn(),
    runInvoiceAction: vi.fn(),
    runKpiPeriodAction: vi.fn(),
    runNotificationDispatchAction: vi.fn(),
    runOnboardingAction: vi.fn(),
    runProductionAction: vi.fn(),
    runProjectsExportAction: vi.fn(),
    runReceivableSyncAction: vi.fn(),
    runSupportAction: vi.fn(),
    runTaxAction: vi.fn(),
    saveSettings: vi.fn(),
    setModal: vi.fn(),
  };
  createPageHeaderAction(deps).openAction();
  return deps;
}

describe("page header action", () => {
  it("opens a credit sale from the credits page", () => {
    expect(setup("credits").setModal).toHaveBeenCalledWith({ type: "sales", presetPaymentMethod: "Kredit" });
  });

  it("runs the page command instead of a modal", () => {
    expect(setup("reports").exportReport).toHaveBeenCalledWith("PDF export");
    expect(setup("invoices").runInvoiceAction).toHaveBeenCalledTimes(1);
  });

  it("opens the create modal of a configured page", () => {
    expect(setup("vendors").setModal).toHaveBeenCalledWith({ type: "vendors" });
  });

  it("stops when the action permission is missing", () => {
    const deps = setup("sales", false);
    expect(deps.requirePermission).toHaveBeenCalled();
    expect(deps.setModal).not.toHaveBeenCalled();
  });
});
