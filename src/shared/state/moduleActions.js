import { pageMeta } from "../../config/page-meta.js";
import { saveWorkflowRecord } from "../../services/enterpriseWorkflows.js";
import { normalize } from "../../services/format.js";
import { checkWebhookConfiguration } from "../lib/apiWebhookCheck.js";
import { currentBusinessDate, getAvailableQuantity, getSupportThreadId, summarizeOrderProducts } from "../lib/appDomain.jsx";
import { buildHelpArticles, ensureApiSecrets, ensureApiWebhooks, upsertSupportConversation } from "../lib/appHelpers.jsx";
import { getActionStamp } from "./actionStamp.ts";
import { createFinanceModuleActions } from "./financeModuleActions.ts";
import { createReportModuleActions } from "./reportModuleActions.ts";

// Module page commands (invoices, accounting, tax, receivables, reports, projects, production,
// HR/communication sync, support, help, onboarding, API, notifications, KPI periods),
// moved out of App.jsx unchanged. App-local values are passed in.
export function createModuleActions({ accountingData, activeKpiPeriod, activeRoleInfo, activeTenantId, apiWebhookRows, auditCurrentState, auditOperation, beginTenantRequest, choosePage, creditRecords, currentUser, helpModuleGuides, invoiceRows, kpiAccountId, kpiLedger, notify, onboardingRows, projectRoiRows, receivableRows, requirePermission, selectMessageThread, selectedKpiPeriod, setSelectedSupportTicketId, setState, state, taxCalendarRows, todayActionRows }) {
  const { runInvoiceAction, runAccountingAction, runTaxAction, runReceivableSyncAction } = createFinanceModuleActions({
    accountingData, auditCurrentState, invoiceRows, notify, receivableRows, setState, taxCalendarRows,
  });
  const { exportReport, runProjectsExportAction } = createReportModuleActions({
    activeRoleInfo, activeTenantId, auditCurrentState, beginTenantRequest, creditRecords, notify, projectRoiRows,
    requirePermission, setState, state,
  });

  function runProductionAction() {
    const stamp = getActionStamp();

    setState((current) => {
      const warehouseEntry = Object.entries(current.warehouseStock || {}).find(([, rows]) =>
        (rows || []).some((item) => getAvailableQuantity(item) > 0),
      );
      const warehouseId = warehouseEntry?.[0] || current.warehouses[0]?.id || "";
      const warehouse = current.warehouses.find((item) => item.id === warehouseId);
      const sourceRows = warehouseEntry?.[1]?.length ? warehouseEntry[1] : current.stock;
      const materials = [...(sourceRows || [])]
        .filter((item) => getAvailableQuantity(item) > 0)
        .sort((a, b) => getAvailableQuantity(a) - getAvailableQuantity(b))
        .slice(0, 2)
        .map((item) => ({ product: item.product, qty: 1, unitCost: Number(item.costPrice || item.price || 0) }));
      const fallbackMaterial = current.stock[0]
        ? [{ product: current.stock[0].product, qty: 1, unitCost: Number(current.stock[0].costPrice || current.stock[0].price || 0) }]
        : [];
      const planMaterials = materials.length > 0 ? materials : fallbackMaterial;
      if (planMaterials.length === 0) {
        notify("İstehsal planı üçün anbarda xammal tapılmadı.", "warning");
        return current;
      }
      const maxPlannedQty = Math.max(
        1,
        Math.min(4, ...planMaterials.map((material) => {
          const row = (sourceRows || []).find((item) => item.product === material.product);
          return Math.floor(getAvailableQuantity(row || {}) / Math.max(1, Number(material.qty || 1)));
        })),
      );
      const materialValue = planMaterials.reduce((sum, item) => {
        return sum + Number(item.unitCost || 0) * Number(item.qty || 0);
      }, 0);
      const plan = {
        id: `BOM-${Date.now().toString().slice(-5)}`,
        product: "Yeni satış komplekti",
        plannedQty: maxPlannedQty,
        warehouseId,
        warehouseName: warehouse?.name || "Anbar seçilməyib",
        salePrice: Math.max(500, Math.round(materialValue * 1.35)),
        laborCost: 320,
        overheadCost: 180,
        status: "Planlandı",
        createdAt: stamp,
        materials: planMaterials,
      };

      return auditCurrentState(
        {
          ...current,
          productionPlans: [plan, ...(current.productionPlans || [])],
        },
        {
          module: "İstehsalat",
          action: "Plan yaradıldı",
          detail: `${plan.id} · ${plan.warehouseName} · ${plan.materials.map((item) => item.product).join(", ")}`,
        },
      );
    });
    notify("Yeni istehsal planı yaradıldı.");
  }

  function syncHrWorkflow(recordType, item, status, approvals) {
    if (!activeTenantId || !item?.id) return;
    const employeeName = item.employeeName || item.name || "HR qeydi";
    void saveWorkflowRecord({
      tenantId: activeTenantId,
      module: "hr",
      record: {
        record_type: recordType,
        record_no: item.id,
        status,
        title: `${employeeName} - ${recordType}`,
        due_at: item.to ? `${item.to}T18:00:00` : null,
        amount: Number(item.netSalary || item.salary || 0),
        completed_at: ["approved", "paid", "completed", "rejected"].includes(status) ? new Date().toISOString() : null,
        payload: item,
      },
      approvals,
    }).catch((error) => notify(`HR workflow sinxronlaşmadı: ${error.message}`, "warning"));
  }

  function syncCommunicationWorkflow(thread, status = "active") {
    if (!activeTenantId || !thread?.id) return;
    void saveWorkflowRecord({
      tenantId: activeTenantId,
      module: "communications",
      record: {
        record_type: thread.type === "group" ? "group_thread" : "direct_thread",
        record_no: thread.id,
        status,
        title: thread.title || thread.person || "Daxili yazışma",
        payload: {
          participant_ids: thread.participantIds || [],
          participants: thread.participants || [],
          team: thread.team || "",
          ticket_id: thread.ticketId || null,
          order_id: thread.orderId || null,
          credit_id: thread.creditId || null,
          customer_fin: thread.customerFin || null,
          message_count: (thread.messages || []).length,
          last_message: thread.preview || "",
          messages: thread.messages || [],
        },
      },
    }).catch((error) => notify(`Mesaj workflow sinxronlaşmadı: ${error.message}`, "warning"));
  }

  function resolveSupportLink(signal) {
    const signalId = String(signal?.id || "").replace(/^ACT-/, "");
    let order = null;
    let credit = null;

    if (signal?.module === "credits") {
      credit = creditRecords.find((item) => item.id === signalId) || creditRecords[0] || null;
      order = state.orders.find((item) => item.id === credit?.orderId || item.creditId === credit?.id) || null;
    } else if (signal?.module === "deliveries" || signal?.module === "sales") {
      order = state.orders.find((item) => item.id === signalId) || state.orders[0] || null;
      credit = creditRecords.find((item) => item.orderId === order?.id || item.id === order?.creditId) || null;
    } else if (signal?.module === "invoices") {
      const invoice = invoiceRows.find((item) => item.id === signalId);
      order = state.orders.find((item) => item.id === invoice?.orderId) || state.orders[0] || null;
      credit = creditRecords.find((item) => item.orderId === order?.id || item.id === order?.creditId) || null;
    }

    if (!order && !credit) {
      credit = creditRecords[0] || null;
      order = state.orders.find((item) => item.id === credit?.orderId || item.creditId === credit?.id) || state.orders[0] || null;
    }

    const customer =
      state.customers.find((item) => item.fin === order?.fin || item.fin === credit?.fin) ||
      state.customers.find((item) => normalize(item.name) === normalize(order?.customer || credit?.customer)) ||
      state.customers[0] ||
      null;
    const linkedType = credit ? "credit" : order ? "order" : customer ? "customer" : signal?.module || "module";
    const linkedId = credit?.id || order?.id || customer?.fin || signalId || signal?.module || "platform";

    return {
      linkedType,
      linkedId,
      linkedLabel: credit?.contractId || order?.id || customer?.name || signal?.module || "Platform task",
      orderId: order?.id || credit?.orderId || "",
      creditId: credit?.id || order?.creditId || "",
      contractId: credit?.contractId || order?.contractId || "",
      customer: order?.customer || credit?.customer || customer?.name || "",
      fin: order?.fin || credit?.fin || customer?.fin || "",
      product: credit?.product || summarizeOrderProducts(order || {}) || "",
    };
  }

  function runSupportAction() {
    const signal = todayActionRows[0];
    const stamp = getActionStamp();
    const linked = resolveSupportLink(signal);
    const ticket = {
      id: `SUP-${Date.now().toString().slice(-5)}`,
      title: signal ? `${signal.title}: ${signal.detail}` : "Modul daxili yoxlama sorğusu",
      requester: activeRoleInfo?.name || "Sistem",
      module: signal ? pageMeta[signal.module]?.title || signal.module : "Platform",
      priority: signal?.priority || "Orta",
      status: "Açıq",
      owner: signal?.module === "credits" ? "Maliyyəçi" : "Admin",
      slaHours: signal?.priority === "Yüksək" ? 4 : 12,
      createdAt: stamp,
      threadId: `MSG-SUP-${Date.now().toString().slice(-5)}`,
      ...linked,
      tasks: [
        {
          id: `TASK-${Date.now().toString().slice(-5)}`,
          title: signal?.title || "Platform yoxlaması",
          owner: signal?.module === "credits" ? "Maliyyəçi" : "Admin",
          dueAt: stamp,
          status: "Açıq",
        },
      ],
      comments: [
        {
          id: `COM-${Date.now().toString().slice(-5)}`,
          author: activeRoleInfo?.name || "Admin",
          text: `Task yaradıldı: ${signal?.detail || "Ümumi platform yoxlaması"}`,
          at: stamp,
          mine: true,
        },
      ],
    };
    const initialComment = ticket.comments[0];

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          supportTickets: [ticket, ...(current.supportTickets || [])],
          conversations: upsertSupportConversation(current.conversations || [], ticket, initialComment),
        },
        {
          module: "Support",
          action: "Sorğu yaradıldı",
          detail: `${ticket.id} · ${ticket.title} · ${ticket.linkedLabel}`,
        },
      ),
    );
    setSelectedSupportTicketId(ticket.id);
    selectMessageThread(getSupportThreadId(ticket));
    notify(`${ticket.id} support növbəsinə əlavə edildi.`);
  }

  function runHelpAction() {
    const stamp = getActionStamp();
    const article = {
      id: `KB-${Date.now().toString().slice(-5)}`,
      title: "İstifadəçi təlim paketi yeniləndi",
      category: "Təlim",
      answer: "Modul izahları, permission qaydaları, onboarding addımları və hesabat/audit izi yenidən formalaşdırıldı.",
      tags: ["təlim", "modul", "onboarding", "audit"],
      createdAt: stamp,
    };
    const guideSnapshot = {
      generatedAt: stamp,
      modules: helpModuleGuides.length,
      onboardingSteps: onboardingRows.steps.length,
      readyModules: helpModuleGuides.filter((guide) => guide.readiness === "Hazır").length,
      articles: buildHelpArticles([article, ...(state.knowledgeBase || [])], helpModuleGuides, onboardingRows).length,
    };

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          knowledgeBase: [article, ...(current.knowledgeBase || [])],
          helpGuideSnapshot: guideSnapshot,
        },
        {
          module: "Kömək",
          action: "Təlim paketi yeniləndi",
          detail: `${guideSnapshot.modules} modul · ${guideSnapshot.onboardingSteps} onboarding addımı`,
        },
      ),
    );
    notify("İstifadəçi təlimatı və modul izahları yeniləndi.");
  }

  function runOnboardingAction() {
    const nextStep = onboardingRows.nextStep;

    if (!nextStep) {
      notify("Onboarding addımlarının hamısı faktiki məlumatlarla tamamlanıb.");
      return;
    }
    const destination = nextStep.module || "dashboard";
    choosePage(destination);
    auditOperation({
      module: "Onboarding",
      action: "Qurulum addımına keçid",
      detail: `${nextStep.id} · ${nextStep.title}`,
    });
    notify(`${nextStep.title} üçün uyğun modul açıldı.`);
  }

  function rotateApiSecret(secretId) {
    if (!requirePermission("api.manage", "API secret rotasiya etmək")) return;

    const stamp = getActionStamp();
    setState((current) => {
      const secret = ensureApiSecrets(current.apiSecrets || []).find((item) => item.id === secretId);
      if (!secret) return current;
      const suffix = Date.now().toString(16).slice(-4).toUpperCase();
      const prefix = secret.type?.includes("token") ? "tok" : "whsec";
      const nextSecret = {
        ...secret,
        maskedValue: `${prefix}_••••••••${suffix}`,
        status: "Aktiv",
        lastRotatedAt: currentBusinessDate,
        lastRotatedBy: currentUser?.name || activeRoleInfo?.name || "System",
        version: Number(secret.version || 1) + 1,
      };

      return auditCurrentState(
        {
          ...current,
          apiSecrets: ensureApiSecrets(current.apiSecrets || []).map((item) => (item.id === secretId ? nextSecret : item)),
        },
        {
          module: "API/Webhook",
          action: "API secret rotasiya edildi",
          detail: `${secret.key} · v${nextSecret.version} · ${stamp}`,
        },
      );
    });
    notify("API secret/token rotasiyası tamamlandı.");
  }

  function runApiAction(mode = "auto") {
    const targetWebhook =
      mode === "retry"
        ? apiWebhookRows.find((webhook) => webhook.retryQueue > 0) || apiWebhookRows.find((webhook) => webhook.queueCount > 0) || apiWebhookRows[0]
        : apiWebhookRows.find((webhook) => webhook.queueCount > 0) || apiWebhookRows.find((webhook) => webhook.retryQueue > 0) || apiWebhookRows[0];

    if (!targetWebhook) {
      notify("Webhook qaydası tapılmadı.", "warning");
      return;
    }

    // Configuration check only: these rules have no sender, so no response code, latency or retry
    // result is reported. Real delivery runs through webhook-dispatch on the Integration ledger.
    const stamp = getActionStamp();
    let check = null;
    setState((current) => {
      const webhooks = ensureApiWebhooks(current.apiWebhooks || []);
      const secrets = ensureApiSecrets(current.apiSecrets || []);
      const sourceWebhook = webhooks.find((webhook) => webhook.id === targetWebhook.id) || targetWebhook;
      check = checkWebhookConfiguration(sourceWebhook, secrets);
      const log = {
        id: `API-LOG-${Date.now().toString().slice(-6)}`,
        webhookId: sourceWebhook.id,
        webhookName: sourceWebhook.name,
        event: sourceWebhook.event,
        method: sourceWebhook.method || "POST",
        target: sourceWebhook.target,
        result: check.result,
        responseCode: null,
        latencyMs: null,
        retryQueue: Number(sourceWebhook.retryQueue || 0),
        error: check.error,
        mode: mode === "retry" ? "Retry qaydası yoxlaması" : "Konfiqurasiya yoxlaması",
        at: stamp,
        nextRetryAt: "",
      };
      return auditCurrentState(
        {
          ...current,
          apiWebhooks: webhooks.map((webhook) => (webhook.id === sourceWebhook.id ? { ...webhook, lastTestAt: stamp } : webhook)),
          apiWebhookLogs: [log, ...(current.apiWebhookLogs || [])].slice(0, 80),
        },
        {
          module: "API/Webhook",
          action: "Webhook konfiqurasiyası yoxlanıldı",
          detail: `${sourceWebhook.id} · ${sourceWebhook.event} · ${check.result}${check.error ? ` (${check.error})` : ""}`,
        },
      );
    });
    notify(
      check?.ready
        ? `${targetWebhook.id} göndərişə hazırdır. HTTP sorğusu göndərilmədi; real göndəriş İnteqrasiya jurnalındadır.`
        : `${targetWebhook.id}: ${check?.error || "konfiqurasiya natamamdır"}. HTTP sorğusu göndərilmədi.`,
      check?.ready ? "info" : "warning",
    );
  }

  function runNotificationDispatchAction() {
    if (!requirePermission("notifications.manage", "bildiriş növbəsini göndərmək")) return;
    notify("Bildiriş xidməti qoşulmayıb. Göndəriş icra olunmadı.", "warning");
  }

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
    } catch (error) { notify(error.message || "KPI əməliyyatı alınmadı.", "error"); }
  }

  return { getActionStamp, runInvoiceAction, runAccountingAction, runTaxAction, runReceivableSyncAction, exportReport, runProjectsExportAction, runProductionAction, syncHrWorkflow, syncCommunicationWorkflow, resolveSupportLink, runSupportAction, runHelpAction, runOnboardingAction, rotateApiSecret, runApiAction, runNotificationDispatchAction, runKpiPeriodAction };
}
