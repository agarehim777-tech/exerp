// Support, help and onboarding commands moved from moduleActions.js: open a support ticket linked to today's top
// signal, refresh the help/training package, and jump to the next onboarding step.
import { pageMeta } from "../../config/page-meta.js";
import { normalize } from "../../services/format.js";
import { summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { getSupportThreadId } from "../lib/financeDomain.ts";
import { upsertSupportConversation } from "../lib/messagingHelpers.ts";
import { buildHelpArticles } from "../lib/onboardingHelpers.ts";
import { createPrefixedId } from "../utils/id.js";
import { getActionStamp } from "./actionStamp.ts";

type Row = Record<string, any>;
type AuditEntry = { module: string; action: string; detail: string };

export function createSupportModuleActions({ activeRoleInfo, auditCurrentState, auditOperation, choosePage, creditRecords, helpModuleGuides, invoiceRows, notify, onboardingRows, selectMessageThread, setSelectedSupportTicketId, setState, state, todayActionRows }: {
  activeRoleInfo?: { name?: string } | null;
  auditCurrentState: (state: Row, entry: AuditEntry) => Row;
  auditOperation: (entry: AuditEntry) => void;
  choosePage: (page: string) => void;
  creditRecords: Row[];
  helpModuleGuides: Row[];
  invoiceRows: Row[];
  notify: (message: string, tone?: string) => void;
  onboardingRows: Row;
  selectMessageThread: (threadId: string) => void;
  setSelectedSupportTicketId: (ticketId: string) => void;
  setState: (update: (current: Row) => Row) => void;
  state: Row;
  todayActionRows: Row[];
}) {
  function resolveSupportLink(signal: Row | null | undefined) {
    const signalId = String(signal?.id || "").replace(/^ACT-/, "");
    let order: Row | null = null;
    let credit: Row | null = null;

    if (signal?.module === "credits") {
      credit = creditRecords.find((item) => item.id === signalId) || creditRecords[0] || null;
      order = state.orders.find((item: Row) => item.id === credit?.orderId || item.creditId === credit?.id) || null;
    } else if (signal?.module === "deliveries" || signal?.module === "sales") {
      order = state.orders.find((item: Row) => item.id === signalId) || state.orders[0] || null;
      credit = creditRecords.find((item) => item.orderId === order?.id || item.id === order?.creditId) || null;
    } else if (signal?.module === "invoices") {
      const invoice = invoiceRows.find((item) => item.id === signalId);
      order = state.orders.find((item: Row) => item.id === invoice?.orderId) || state.orders[0] || null;
      credit = creditRecords.find((item) => item.orderId === order?.id || item.id === order?.creditId) || null;
    }

    if (!order && !credit) {
      credit = creditRecords[0] || null;
      order = state.orders.find((item: Row) => item.id === credit?.orderId || item.creditId === credit?.id) || state.orders[0] || null;
    }

    const customer =
      state.customers.find((item: Row) => item.fin === order?.fin || item.fin === credit?.fin) ||
      state.customers.find((item: Row) => normalize(item.name) === normalize(order?.customer || credit?.customer)) ||
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
      id: createPrefixedId("SUP"),
      title: signal ? `${signal.title}: ${signal.detail}` : "Modul daxili yoxlama sorğusu",
      requester: activeRoleInfo?.name || "Sistem",
      module: signal ? (pageMeta as Record<string, { title?: string }>)[signal.module]?.title || signal.module : "Platform",
      priority: signal?.priority || "Orta",
      status: "Açıq",
      owner: signal?.module === "credits" ? "Maliyyəçi" : "Admin",
      slaHours: signal?.priority === "Yüksək" ? 4 : 12,
      createdAt: stamp,
      threadId: createPrefixedId("MSG-SUP"),
      ...linked,
      tasks: [
        {
          id: createPrefixedId("TASK"),
          title: signal?.title || "Platform yoxlaması",
          owner: signal?.module === "credits" ? "Maliyyəçi" : "Admin",
          dueAt: stamp,
          status: "Açıq",
        },
      ],
      comments: [
        {
          id: createPrefixedId("COM"),
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
      id: createPrefixedId("KB"),
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

  return { resolveSupportLink, runSupportAction, runHelpAction, runOnboardingAction };
}
