// KPI period command moved from moduleActions.js: close, approve or pay out the selected KPI period on the server.
type Row = Record<string, any>;
type AuditEntry = { module: string; action: string; detail: string };

export function createKpiModuleActions({ activeKpiPeriod, kpiAccountId, kpiLedger, notify, requirePermission, selectedKpiPeriod }: {
  activeKpiPeriod: Row;
  kpiAccountId: string | null | undefined;
  kpiLedger: { busy?: boolean; ready?: boolean; execute: (input: Row) => Promise<unknown> };
  notify: (message: string, tone?: string) => void;
  requirePermission: (permission: string, action: string) => boolean;
  selectedKpiPeriod: string;
}) {
  async function runKpiPeriodAction(requestedAction = "next") {
    if (!requirePermission("kpi.manage", "KPI periodunu işləmək")) return;
    if (kpiLedger.busy || !kpiLedger.ready) {
      notify("KPI məlumatları serverdən yüklənməlidir.", "warning"); return;
    }
    const action = requestedAction !== "next" ? requestedAction
      : activeKpiPeriod.status !== "Period bağlandı" ? "close"
      : activeKpiPeriod.approvalStatus !== "Təsdiq edildi" ? "approve"
      : activeKpiPeriod.payoutStatus !== "Ödənildi" ? "payout" : "complete";
    if (action === "complete") { notify("Bu period artıq ödənilib."); return; }
    try {
      const receipt = await kpiLedger.execute({
        action, period: selectedKpiPeriod,
        snapshot: activeKpiPeriod, account_id: kpiAccountId,
      });
      if (!receipt) return;
      notify(action === "payout" ? "KPI ödənişi kassaya və perioda birlikdə yazıldı."
        : action === "approve" ? "KPI periodu təsdiq edildi." : "KPI periodu serverdə bağlandı.");
    } catch (error) { notify((error as Error).message || "KPI əməliyyatı alınmadı.", "error"); }
  }

  return { runKpiPeriodAction };
}
