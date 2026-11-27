// Onboarding və yardım: real məlumatdan yoxlanan qurulum addımları (ONB-1..10), modul bələdçiləri və yardım məqalələri.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { navItems } from "../../data.js";
import { pageMeta } from "../../config/page-meta.js";
import { navPermissionByType } from "../../services/permissions.js";
import { currentBusinessDate } from "./businessDate.ts";
import { buildAllCreditRecords } from "./creditRecordHelpers.ts";
import { getPageActionPermission } from "./permissionHelpers.ts";

type Row = Record<string, any>;

export interface OnboardingStep extends Row {
  id: string;
  title: string;
  owner: string;
  module: string;
  detail: string;
  status: string;
  completed: boolean;
  action: string;
}

export interface OnboardingRows {
  steps: OnboardingStep[];
  completed: number;
  blockers: number;
  progress: number;
  nextStep: OnboardingStep | null;
}

export interface HelpModuleGuide {
  id: string;
  module: string;
  title: string;
  purpose: string;
  action: string;
  permission: string;
  readiness: string;
  next: string;
  owner: string;
}

function buildOnboardingRows(onboarding: Row = {}, snapshot: Row = {}, sources: { creditRecords?: Row[]; cashAccountCount?: number } = {}): OnboardingRows {
  const warehouseStockRows = Object.values(snapshot.warehouseStock || {}).flatMap((rows: any) => rows || []);
  const creditRecords = sources.creditRecords || buildAllCreditRecords(snapshot.orders || [], []);
  const payrollReady = (snapshot.expenses || []).some((expense: Row) => expense.source === "HR Payroll");
  const reportReady = (snapshot.reportExports || []).length > 0;
  const backupReady = Boolean(snapshot.integritySnapshot || snapshot.goLiveSnapshot);
  const checks: Record<string, boolean> = {
    "ONB-1": Boolean(snapshot.settings?.company && snapshot.settings?.voen),
    "ONB-2": (snapshot.warehouses || []).length > 0,
    "ONB-3": (snapshot.products || []).length > 0 && warehouseStockRows.some((item: Row) => Number(item.total || 0) > 0),
    "ONB-4": (snapshot.settings?.users || []).length > 1 || (snapshot.settings?.roles || []).length > 0,
    "ONB-5": Number(sources.cashAccountCount || 0) > 0,
    "ONB-6": (snapshot.employees || []).length > 0 && payrollReady,
    "ONB-7": (snapshot.orders || []).length > 0 && creditRecords.length > 0,
    "ONB-8": (snapshot.vendors || []).length > 0 || (snapshot.purchaseOrders || []).length > 0,
    "ONB-9": reportReady,
    "ONB-10": backupReady,
  };
  const defaultSteps = [
    { id: "ONB-1", title: "Şirkət məlumatları və VÖEN", owner: "Administrator", module: "settings", detail: "Ayarlar bölməsində şirkət adı, VÖEN və əsas rekvizitlər doldurulur." },
    { id: "ONB-2", title: "İlk anbarın yaradılması", owner: "Anbar", module: "warehouse", detail: "Ən azı bir aktiv anbar yaradılır." },
    { id: "ONB-3", title: "Məhsul kataloqu və ilkin stok", owner: "Anbar", module: "warehouse", detail: "Məhsullar, minimum qalıq və ilkin mədaxil real stok kimi yazılır." },
    { id: "ONB-4", title: "İstifadəçi rolları və permission", owner: "Administrator", module: "settings", detail: "Rol və modul icazələri real düymələrə tətbiq olunur." },
    { id: "ONB-5", title: "Kassa və bank açılış balansı", owner: "Maliyyə", module: "finance", detail: "Kassa/bank hesabları maliyyə modulunda yaradılır." },
    { id: "ONB-6", title: "HR əməkdaşları və payroll", owner: "HR", module: "hr", detail: "Əməkdaş kartları, sənəd faizi və cash-neutral payroll accrual tamamlanır." },
    { id: "ONB-7", title: "Satış və kredit UAT ssenarisi", owner: "Satış/Maliyyə", module: "sales", detail: "Satışdan kredit, müqavilə, rezerv və təhvil axını test edilir." },
    { id: "ONB-8", title: "Təchizatçı və PO axını", owner: "Procurement", module: "vendors", detail: "Təchizatçı, minimum stok və PO təsdiq/mədaxil axını hazırlanır." },
    { id: "ONB-9", title: "Hesabat və analitika export", owner: "Rəhbərlik", module: "reports", detail: "Executive hesabat, ROI və audit snapshot-ları export edilir." },
    { id: "ONB-10", title: "Backup və go-live yoxlaması", owner: "Administrator", module: "settings", detail: "Integrity, backup və go-live readiness yoxlaması saxlanılır." },
  ];
  const storedById = new Map<unknown, Row>((onboarding.steps || []).map((step: Row) => [step.id, step]));
  const sourceSteps = defaultSteps.map((step) => ({ ...step, ...(storedById.get(step.id) || {}) }));
  let nextFound = false;
  const steps = sourceSteps.map((step) => {
    const completed = Boolean(checks[step.id]);
    const status = completed ? "Tamamlandı" : nextFound ? "Gözləyir" : "İcrada";
    if (!completed) nextFound = true;
    return {
      ...step,
      status,
      completed,
      action: completed ? "Yoxlanılıb" : "Modula keç",
    };
  });
  const completed = steps.filter((step) => step.status === "Tamamlandı").length;
  const blockers = steps.filter((step) => step.status === "İcrada").length;

  return {
    steps,
    completed,
    blockers,
    progress: steps.length > 0 ? (completed / steps.length) * 100 : 0,
    nextStep: steps.find((step) => step.status !== "Tamamlandı") || null,
  };
}

function buildHelpModuleGuides({ moduleReadiness = { items: [] }, onboardingRows = { steps: [] } }: {
  moduleReadiness?: { items?: Row[] };
  onboardingRows?: { steps?: Row[] };
}): HelpModuleGuide[] {
  const readinessByModule = new Map<unknown, Row>((moduleReadiness.items || []).map((item) => [item.module, item]));
  const onboardingByModule = new Map<unknown, Row>((onboardingRows.steps || []).map((step) => [step.module, step]));

  return navItems
    .filter((item: Row) => !["dashboard", "messages", "notifications"].includes(item.id))
    .map((item: Row) => {
      const meta = (pageMeta as Record<string, Row | undefined>)[item.id] || {};
      const readiness = readinessByModule.get(item.id);
      const onboarding = onboardingByModule.get(item.id);
      const permission = getPageActionPermission(item.id) || (navPermissionByType as Record<string, string | null | undefined>)[item.id] || "Oxunuş";
      return {
        id: item.id,
        module: item.label,
        title: meta.title || item.label,
        purpose: meta.subtitle || "Modul üzrə əməliyyatlar və nəzarət.",
        action: meta.action || "Baxış",
        permission,
        readiness: readiness?.status || onboarding?.status || "Nəzarət",
        next: readiness?.next || onboarding?.detail || "Modul üzrə əsas əməliyyatı tamamlayın.",
        owner: onboarding?.owner || "Admin",
      };
    });
}

function buildHelpArticles(articles: Row[] | null | undefined = [], moduleGuides: Row[] = [], onboardingRows: { steps?: Row[] } = { steps: [] }): Row[] {
  const generated = [
    {
      id: "HELP-START",
      title: "Sistemi real istifadəyə necə başlatmaq olar",
      category: "Onboarding",
      answer: "Ayarlar, anbar, məhsul, rol, maliyyə, HR, satış/kredit, təchizatçı, hesabat və ehtiyat nüsxə addımlarını ardıcıl tamamlayın.",
      tags: ["qurulum", "checklist", "go-live"],
      createdAt: currentBusinessDate,
      generated: true,
    },
    {
      id: "HELP-PERMISSIONS",
      title: "Rollar və icazələr necə işləyir",
      category: "Ayarlar",
      answer: "Hər modul əməliyyatı permission ilə qorunur. İstifadəçinin rolunda permission yoxdursa düymə deaktiv olur və ya əməliyyat bloklanır.",
      tags: ["rol", "permission", "təhlükəsizlik"],
      createdAt: currentBusinessDate,
      generated: true,
    },
    {
      id: "HELP-AUDIT",
      title: "Audit log və hesabat izi",
      category: "Audit",
      answer: "Satış, kredit, anbar, maliyyə, HR, ROI, support və export əməliyyatları audit log-a yazılır. Hesabat snapshot-ları reportExports içində saxlanır.",
      tags: ["audit", "hesabat", "snapshot"],
      createdAt: currentBusinessDate,
      generated: true,
    },
  ];
  const moduleArticles = moduleGuides.slice(0, 12).map((guide) => ({
    id: `HELP-MOD-${guide.id}`,
    title: `${guide.module}: ${guide.action}`,
    category: "Modul izahı",
    answer: `${guide.purpose} Növbəti addım: ${guide.next}`,
    tags: [guide.module, guide.permission, guide.readiness].filter(Boolean),
    createdAt: currentBusinessDate,
    generated: true,
  }));
  const manualIds = new Set((articles || []).map((article) => article.id));
  return [...(articles || []), ...generated.filter((article) => !manualIds.has(article.id)), ...moduleArticles.filter((article) => !manualIds.has(article.id))];
}

export { buildOnboardingRows, buildHelpModuleGuides, buildHelpArticles };
