// Module page commands, moved out of App.jsx. Each area lives in its own factory; this file wires them together
// with the app values and returns the same command set App.jsx used before.
import { getActionStamp } from "./actionStamp.ts";
import { createApiModuleActions } from "./apiModuleActions.ts";
import { createFinanceModuleActions } from "./financeModuleActions.ts";
import { createKpiModuleActions } from "./kpiModuleActions.ts";
import { createProductionModuleActions } from "./productionModuleActions.ts";
import { createReportModuleActions } from "./reportModuleActions.ts";
import { createSupportModuleActions } from "./supportModuleActions.ts";
import { createWorkflowSyncActions } from "./workflowSyncActions.ts";

export function createModuleActions({ accountingData, activeKpiPeriod, activeRoleInfo, activeTenantId, apiWebhookRows, auditCurrentState, auditOperation, beginTenantRequest, choosePage, creditRecords, currentUser, helpModuleGuides, invoiceRows, kpiAccountId, kpiLedger, notify, onboardingRows, projectRoiRows, receivableRows, requirePermission, selectMessageThread, selectedKpiPeriod, setSelectedSupportTicketId, setState, state, taxCalendarRows, todayActionRows }) {
  const { runInvoiceAction, runAccountingAction, runTaxAction, runReceivableSyncAction } = createFinanceModuleActions({
    accountingData, auditCurrentState, invoiceRows, notify, receivableRows, setState, taxCalendarRows,
  });
  const { exportReport, runProjectsExportAction } = createReportModuleActions({
    activeRoleInfo, activeTenantId, auditCurrentState, beginTenantRequest, creditRecords, notify, projectRoiRows,
    requirePermission, setState, state,
  });

  const { runProductionAction } = createProductionModuleActions({ auditCurrentState, notify, setState });
  const { syncHrWorkflow, syncCommunicationWorkflow } = createWorkflowSyncActions({ activeTenantId, notify });
  const { resolveSupportLink, runSupportAction, runHelpAction, runOnboardingAction } = createSupportModuleActions({
    activeRoleInfo, auditCurrentState, auditOperation, choosePage, creditRecords, helpModuleGuides, invoiceRows, notify,
    onboardingRows, selectMessageThread, setSelectedSupportTicketId, setState, state, todayActionRows,
  });
  const { rotateApiSecret, runApiAction, runNotificationDispatchAction } = createApiModuleActions({
    activeRoleInfo, apiWebhookRows, auditCurrentState, currentUser, notify, requirePermission, setState,
  });
  const { runKpiPeriodAction } = createKpiModuleActions({
    activeKpiPeriod, kpiAccountId, kpiLedger, notify, requirePermission, selectedKpiPeriod,
  });

  return { getActionStamp, runInvoiceAction, runAccountingAction, runTaxAction, runReceivableSyncAction, exportReport, runProjectsExportAction, runProductionAction, syncHrWorkflow, syncCommunicationWorkflow, resolveSupportLink, runSupportAction, runHelpAction, runOnboardingAction, rotateApiSecret, runApiAction, runNotificationDispatchAction, runKpiPeriodAction };
}
