// The page header's main button, moved from App.jsx: check the page's action permission, then run the page's
// command or open its create modal. Pages without a header action do nothing.
import { createConfig as createConfigJs } from "../../config/createConfig.js";
import { pageMeta as pageMetaJs } from "../../config/page-meta.js";
import { getPageActionPermission, hasPageAction } from "../lib/permissionHelpers.ts";

// Both config objects are keyed by page id; index them by the active page string.
const createConfig = createConfigJs as Record<string, unknown>;
const pageMeta = pageMetaJs as Record<string, { action?: string }>;

export function createPageHeaderAction({ active, exportReport, requirePermission, runAccountingAction, runApiAction, runHelpAction, runInvoiceAction, runKpiPeriodAction, runNotificationDispatchAction, runOnboardingAction, runProductionAction, runProjectsExportAction, runReceivableSyncAction, runSupportAction, runTaxAction, saveSettings, setModal }: {
  active: string;
  exportReport: (format: string) => void;
  requirePermission: (permission: string, action: string) => boolean;
  runAccountingAction: () => void;
  runApiAction: () => void;
  runHelpAction: () => void;
  runInvoiceAction: () => void;
  runKpiPeriodAction: () => void;
  runNotificationDispatchAction: () => void;
  runOnboardingAction: () => void;
  runProductionAction: () => void;
  runProjectsExportAction: () => void;
  runReceivableSyncAction: () => void;
  runSupportAction: () => void;
  runTaxAction: () => void;
  saveSettings: () => void;
  setModal: (modal: { type: string; mode?: string; presetPaymentMethod?: string }) => void;
}) {
  function openAction() {
    if (!hasPageAction(active)) return;

    const permission = getPageActionPermission(active);
    if (permission && !requirePermission(permission, pageMeta[active]?.action || "əməliyyat")) return;

    if (active === "reports") {
      exportReport("PDF export");
      return;
    }
    if (active === "notifications") {
      runNotificationDispatchAction();
      return;
    }
    if (active === "kpi") {
      runKpiPeriodAction();
      return;
    }
    if (active === "settings") {
      saveSettings();
      return;
    }
    if (active === "warehouse") {
      setModal({ type: "warehouse", mode: "create" });
      return;
    }
    if (active === "dashboard" || active === "sales") {
      setModal({ type: "sales" });
      return;
    }
    if (active === "credits") {
      setModal({ type: "sales", presetPaymentMethod: "Kredit" });
      return;
    }
    if (active === "invoices") {
      runInvoiceAction();
      return;
    }
    if (active === "accounting") {
      runAccountingAction();
      return;
    }
    if (active === "tax") {
      runTaxAction();
      return;
    }
    if (active === "receivables") {
      runReceivableSyncAction();
      return;
    }
    if (active === "projects") {
      runProjectsExportAction();
      return;
    }
    if (active === "production") {
      runProductionAction();
      return;
    }
    if (active === "support") {
      runSupportAction();
      return;
    }
    if (active === "help") {
      runHelpAction();
      return;
    }
    if (active === "onboarding") {
      runOnboardingAction();
      return;
    }
    if (active === "api") {
      runApiAction();
      return;
    }
    if (createConfig[active]) setModal({ type: active });
  }

  return { openAction };
}
