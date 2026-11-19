// Report export commands moved from moduleActions.js: export the report package shown on screen (or a fresh one
// built from live report data) and the project ROI export. Both are saved as report_export workflow records and
// listed in state.reportExports (latest 12). createModuleActions passes the app values.
import { saveWorkflowRecord as saveWorkflowRecordJs } from "../../services/enterpriseWorkflows.js";
import { money, percent } from "../../services/format.js";
import { loadReportData } from "../../services/reportData.js";
import { buildProjectRoiSummary } from "../analytics/projects.js";
import { currentBusinessDate } from "../lib/businessDate.ts";
import { buildReportPackage } from "../lib/reportHelpers.ts";
import { getActionStamp } from "./actionStamp.ts";

type Row = Record<string, any>;
type AuditEntry = { module: string; action: string; detail: string };
// enterpriseWorkflows.js is untyped JavaScript, so TypeScript would treat its optional lines/approvals as required.
const saveWorkflowRecord = saveWorkflowRecordJs as (input: { tenantId: string | null | undefined; module: string; record: Row }) => Promise<unknown>;

export function createReportModuleActions({ activeRoleInfo, activeTenantId, auditCurrentState, beginTenantRequest, creditRecords, notify, projectRoiRows, requirePermission, setState, state }: {
  activeRoleInfo?: { name?: string } | null;
  activeTenantId: string | null | undefined;
  auditCurrentState: (state: Row, entry: AuditEntry) => Row;
  beginTenantRequest: (key: string) => () => boolean;
  creditRecords: Row[];
  notify: (message: string, tone?: string) => void;
  projectRoiRows: Row[];
  requirePermission: (permission: string, action: string) => boolean;
  setState: (update: (current: Row) => Row) => void;
  state: Row;
}) {
  async function exportReport(title = "PDF export", format = "PDF", displayedSnapshot?: Row | null) {
    if (!requirePermission("reports.export", "hesabat export etmək")) return null;
    const isCurrent = beginTenantRequest('report-export');
    try {
      const liveData: Row | null = displayedSnapshot ? null : await loadReportData(activeTenantId);
      if (!isCurrent()) return null;

      const stamp = getActionStamp();
      const reportPackage = displayedSnapshot || buildReportPackage({
        orders: state.orders,
        credits: creditRecords,
        vendors: liveData!.vendors,
        employees: state.employees,
        expenses: liveData!.expenses,
        warehouseStock: state.warehouseStock,
        products: state.products || [],
        purchaseOrders: liveData!.purchaseOrders,
        productionPlans: liveData!.productionPlans,
        invoices: liveData!.invoices,
        cashEntries: liveData!.cashEntries,
      });
      const exportRow = {
        id: `RPT-${crypto.randomUUID()}`,
        title,
        format,
        at: stamp,
        period: reportPackage.period,
        rows: reportPackage.rows,
        sections: reportPackage.sections,
        score: reportPackage.score,
        riskCount: reportPackage.riskCount,
        criticalCount: reportPackage.criticalCount,
        owner: activeRoleInfo?.name || "System",
        status: "Hazır",
        snapshot: reportPackage,
      };

      await saveWorkflowRecord({
        tenantId: activeTenantId,
        module: "reports",
        record: { record_type: "report_export", record_no: exportRow.id, status: "completed",
          title: exportRow.title, completed_at: new Date().toISOString(), payload: exportRow },
      });
      if (!isCurrent()) return null;

      setState((current) =>
        auditCurrentState(
          {
            ...current,
            reportExports: [exportRow, ...(current.reportExports || [])].slice(0, 12),
          },
          {
            module: "Hesabat",
            action: "Export hazırlandı",
            detail: `${title} · ${format} · ${exportRow.rows} sətir · score ${reportPackage.score}`,
          },
        ),
      );
      notify(`${title} ${format} export siyahısına əlavə edildi.`);
      return exportRow;
    } catch (error) {
      if (isCurrent()) notify(`Hesabat exportu saxlanmadı: ${(error as Error).message}`, "warning");
      return null;
    }
  }

  async function runProjectsExportAction() {
    if (!requirePermission("projects.manage", "ROI export etmək")) return;
    const isCurrent = beginTenantRequest('project-export');
    if (projectRoiRows.length === 0) {
      notify("Export üçün layihə tapılmadı.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const summary = buildProjectRoiSummary(projectRoiRows);
    const snapshot = {
      period: currentBusinessDate.slice(0, 7),
      generatedAt: stamp,
      summary,
      projects: projectRoiRows.map((project) => ({
        id: project.id,
        name: project.name,
        owner: project.owner,
        revenue: project.revenue,
        collected: project.collected,
        productCost: project.productCost,
        approvedExpenseCost: project.approvedExpenseCost,
        pendingExpenseCost: project.pendingExpenseCost,
        totalCost: project.totalCost,
        committedCost: project.committedCost,
        profit: project.profit,
        projectedProfit: project.projectedProfit,
        roi: project.roi,
        status: project.status,
        nextAction: project.nextAction,
        orders: project.orderIds,
      })),
    };
    const exportId = `RPT-ROI-${crypto.randomUUID()}`;
    const exportRow = {
      id: exportId, title: "Layihə ROI", format: "Excel/PDF", period: snapshot.period,
      at: stamp, rows: projectRoiRows.length, score: Math.max(0, Math.min(100, Math.round(50 + summary.avgRoi))),
      riskCount: summary.riskCount, owner: activeRoleInfo?.name || "System", status: "Hazır", snapshot,
    };
    try {
      await saveWorkflowRecord({ tenantId: activeTenantId, module: 'reports',
        record: { record_type: 'report_export', record_no: exportId, status: 'completed', title: exportRow.title,
          completed_at: new Date().toISOString(), payload: exportRow } });
    } catch (error) {
      if (isCurrent()) notify(`ROI exportu saxlanmadı: ${(error as Error).message}`, 'warning');
      return;
    }
    if (!isCurrent()) return;
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          projects: (current.projects || []).map((project: Row) => ({
            ...project,
            lastExportAt: stamp,
            exportCount: Number(project.exportCount || 0) + 1,
            lastRoi: projectRoiRows.find((row) => row.id === project.id)?.roi ?? project.lastRoi,
            status: projectRoiRows.find((row) => row.id === project.id)?.status || project.status,
          })),
          reportExports: [
            {
              id: exportId,
              title: "Layihə ROI",
              format: "Excel/PDF",
              period: snapshot.period,
              at: stamp,
              rows: projectRoiRows.length,
              score: Math.max(0, Math.min(100, Math.round(50 + summary.avgRoi))),
              riskCount: summary.riskCount,
              owner: activeRoleInfo?.name || "System",
              status: "Hazır",
              snapshot,
            },
            ...(current.reportExports || []),
          ].slice(0, 12),
          projectRoiSnapshot: snapshot,
        },
        {
          module: "Layihə ROI",
          action: "ROI export",
          detail: `${projectRoiRows.length} layihə · gəlir ${money(summary.revenue)} · ROI ${percent(summary.avgRoi)}`,
        },
      ),
    );
    notify("ROI export hazırlandı və layihələrə qeyd edildi.");
  }

  return { exportReport, runProjectsExportAction };
}
