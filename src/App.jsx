import { useEffect, useMemo, useRef, useState, useCallback, Suspense, lazy } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { moduleFromPath, pathForModule, canonicalPath } from "./config/routes.js";
import { useAuth } from "./auth/AuthProvider.jsx";
import { supabase } from "./integrations/supabase/client";
import { useCustomers } from "./shared/hooks/useCustomers.js";
import { useProducts } from "./shared/hooks/useProducts.js";
import { useOrders } from "./shared/hooks/useOrders.js";
import { useGitHubSync } from "./shared/hooks/useGitHubSync.js";
import { dbCustomerToLegacy, dbProductToLegacy, dbOrderToLegacy } from "./shared/adapters/erpShape.js";
import { usePermissions } from "./shared/hooks/usePermissions.js";
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  ChevronDown,
  CircleAlert,
  CreditCard,
  Database,
  Download,
  Eye,
  FileText,
  Filter,
  GitBranch,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  SlidersHorizontal,
  TrendingUp,
  Trash2,
  Truck,
  Upload,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import {
  contractTemplates,
  initialState,
  navItems,
  stages,
} from "./data.js";
import { pageMeta } from "./config/page-meta.js";
const HelpCenterPage = lazy(() => import("./modules/help/HelpCenterPage.jsx").then(m => ({ default: m.HelpCenterPage })));
const OnboardingPage = lazy(() => import("./modules/onboarding/OnboardingPage.jsx").then(m => ({ default: m.OnboardingPage })));
const ReportsPage = lazy(() => import("./modules/reports/ReportsPage.jsx").then(m => ({ default: m.ReportsPage })));
const FinancialStatementsPage = lazy(() => import("./modules/reports/FinancialStatementsPage.jsx"));
const DataReconciliationPage = lazy(() => import("./modules/admin/DataReconciliationPage.jsx"));
import {
  changeRemotePassword,
  createRemoteCompany,
  createRemoteUser,
  deleteRemoteCompany,
  getRemoteSession,
  getRemoteToken,
  loadRemoteState,
  listRemoteCompanies,
  loginRemote,
  logoutRemote,
  remoteApiEnabled,
  saveRemoteState,
  setRemoteToken,
  updateRemoteCompany,
} from "./remote-api.js";
import {
  AvatarLine,
  DataTable,
  EmptyState,
  Field,
  MetricCard,
  Panel,
  PanelHeader,
  ProgressRow,
  StatusBadge,
  TwoLine,
} from "./components/ui.jsx";
import { money, normalize, percent } from "./services/format.js";
import { queueNotification, saveWorkflowRecord } from "./services/enterpriseWorkflows.js";
import {
  addMonths,
  formatDateInput,
  formatPaymentDate,
  parsePaymentDate,
  toDateInputValue,
} from "./services/date.js";
import {
  buildModulePermissionCatalog,
  createPermissionByType,
  defaultRoles,
  getDefaultModuleAccessForRole as getDefaultModuleAccessForRoleFromCatalog,
  getModuleForPermission as getModuleForPermissionFromCatalog,
  navPermissionByType,
  normalizeUserModuleAccess as normalizeUserModuleAccessFromCatalog,
  pageActionPermissionByType,
  pageActionlessModules,
  permissionCatalog,
  uniquePermissionModuleIds,
} from "./services/permissions.js";
import {
  appendAudit,
  defaultDbProvider,
  localDbBaselineVersion,
  localDbKey,
  localDbSchemaVersion,
} from "./services/persistence.js";
import { total } from "./shared/utils/aggregate.js";
import { buildProjectRoiSummary } from "./shared/analytics/projects.js";
const ContractsPage = lazy(() => import("./modules/contracts/ContractsPage.jsx").then(m => ({ default: m.ContractsPage })));
const ProjectsPage = lazy(() => import("./modules/projects/ProjectsPage.jsx").then(m => ({ default: m.ProjectsPage })));
const ProductionPage = lazy(() => import("./modules/production/ProductionPage.jsx").then(m => ({ default: m.ProductionPage })));
const RolesPermissionsPage = lazy(() => import("./modules/settings/RolesPermissionsPage.jsx"));
const AccessCheckPage = lazy(() => import("./modules/settings/AccessCheckPage.jsx"));
const AccountingPageV2 = lazy(() => import("./modules/accounting/AccountingPage.jsx"));
const CrmCustomersPageV2 = lazy(() => import("./modules/crm/CrmCustomersPage.jsx"));
const PeriodsPage = lazy(() => import("./modules/accounting/PeriodsPage.jsx"));
const CurrenciesPage = lazy(() => import("./modules/finance/CurrenciesPage.jsx"));
const AuditLogPage = lazy(() => import("./modules/settings/AuditLogPage.jsx"));
const CrmDealsPage = lazy(() => import("./modules/crm/CrmDealsPage.jsx"));

const CrmActivitiesPage = lazy(() => import("./modules/crm/CrmActivitiesPage.jsx"));
const CrmTasksPage = lazy(() => import("./modules/crm/CrmTasksPage.jsx"));
const SalesDashboardPage = lazy(() => import("./modules/sales/SalesDashboardPage.jsx"));
const QuotesPage = lazy(() => import("./modules/sales/QuotesPage.jsx"));
const SalesOrdersPage = lazy(() => import("./modules/sales/SalesOrdersPage.jsx"));
const ShipmentsPage = lazy(() => import("./modules/sales/ShipmentsPage.jsx"));
const AssistantPage = lazy(() => import("./modules/assistant/AssistantPage.jsx"));
import FloatingAssistant from "./modules/assistant/FloatingAssistant.jsx";
const ProcurementPage = lazy(() => import("./modules/procurement/ProcurementPage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const WarehousePage = lazy(() => import("./pages/WarehousePage.jsx"));
const FinancePage = lazy(() => import("./pages/FinancePage.jsx"));
const StockPage = lazy(() => import("./modules/warehouse/StockPage.jsx"));
const CashbookPage = lazy(() => import("./modules/finance/CashbookPage.jsx"));
const SalesInvoicesPage = lazy(() => import("./modules/finance/SalesInvoicesPage.jsx"));
const VendorManagementPage = lazy(() => import("./pages/VendorManagementPage.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));
const CreditsPage = lazy(() => import("./pages/CreditsPage.jsx"));


export const navIcons = {
  dashboard: LayoutDashboard,
  assistant: Sparkles,
  platform: Building2,
  crm: Users,
  "crm-deals": TrendingUp,
  "crm-activities": MessageSquare,
  "crm-tasks": ShieldCheck,
  sales: ShoppingCart,
  "sales-dashboard": BarChart3,
  "sales-quotes": FileText,
  "sales-shipments": Truck,
  warehouse: Warehouse,
  stock: Boxes,
  deliveries: Truck,
  finance: Wallet,
  cashbook: Wallet,
  "ar-invoices": FileText,
  invoices: FileText,
  accounting: BarChart3,
  tax: CalendarClock,
  credits: CreditCard,
  receivables: Wallet,
  vendors: Building2,
  procurement: ShoppingCart,
  projects: BarChart3,
  production: Package,
  hr: UserCog,
  kpi: TrendingUp,
  contracts: FileText,
  reports: BarChart3,
  support: MessageSquare,
  help: FileText,
  onboarding: ShieldCheck,
  messages: MessageSquare,
  notifications: Bell,
  api: ShieldCheck,
  settings: Settings,
  roles: ShieldCheck,
  "access-check": ShieldCheck,
  audit: ShieldCheck,
  periods: FileText,
  currencies: FileText,
  "financial-statements": FileText,

};

export const modulePermissionCatalog = buildModulePermissionCatalog(navItems);
export const currentBusinessDate = formatDateInput(new Date());
export const currentBusinessYear = currentBusinessDate.slice(0, 4);
export const currentBusinessQuarter = Math.floor(new Date().getMonth() / 3) + 1;
export const baseCreditDate = currentBusinessDate;
const baseDeliveryDate = currentBusinessDate;
const baseCashBalance = 0;
export const baseFinanceDate = currentBusinessDate;
const dayInMs = 24 * 60 * 60 * 1000;
export const targetDbProvider = String(import.meta.env?.VITE_DB_PROVIDER || "sqlite").trim();
const deploymentToolkitReady = true;


import {
  addDays,
  applyCreditPrincipalPayment,
  buildCreditPlan,
  creditTermOptions,
  daysBetween,
  getCreditDebtFormula,
  getCreditDisplayPlan,
  getCreditInitials,
  getCreditManagementStatus,
  getCreditPaidTotal,
  getCreditPaymentState,
  getCreditPlanStartDate,
  getCreditRemainingMonths,
  getCreditRiskLabel,
  getCreditRowDate,
  getCreditSourceLabel,
  getReceivableClosureAmount,
  isCreditClosed,
  matchesCreditDashboardFilter,
  matchesCreditManagementFilter,
  matchesCreditSearch,
  matchesCreditSourceFilter,
  monthNamesAz,
  roundMoney,
  shiftPaymentDate,
} from "./shared/lib/credit.js";
export {
  applyCreditPrincipalPayment,
  buildCreditPlan,
  getCreditDebtFormula,
  getCreditDisplayPlan,
  getCreditInitials,
  getCreditManagementStatus,
  getCreditPaidTotal,
  getCreditPaymentState,
  getCreditRowDate,
  getCreditSourceLabel,
  getReceivableClosureAmount,
  isCreditClosed,
  matchesCreditManagementFilter,
  matchesCreditSearch,
  matchesCreditSourceFilter,
  monthNamesAz,
};

function summarizeOrderProducts(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines
      .map((line) => `${line.product}${Number(line.qty || 1) > 1 ? ` x${Number(line.qty)}` : ""}`)
      .join(", ");
  }
  return order.products || "Cihaz qeyd edilməyib";
}

function getCreditIdForOrder(order) {
  return order.creditId || `KR-${String(order.id || "").replace(/\D/g, "")}`;
}

function buildSalesCreditRecord(order, storedCredit) {
  const totalAmount = Number(order.amount || storedCredit?.total || 0);
  const initialPayment = Number(order.initialPayment ?? order.paid ?? storedCredit?.initialPayment ?? 0);
  const months = Number(order.creditMonths || storedCredit?.months || 12);
  const basePlan = buildCreditPlan({ total: totalAmount, initialPayment, months });
  const productSummary = summarizeOrderProducts(order);
  const balance = Number(storedCredit?.balance ?? order.creditBalance ?? basePlan.balance);
  const paidMonths = Number(storedCredit?.paidMonths ?? (balance <= 0 ? months : 0));
  const status = isCreditClosed({ ...(storedCredit || {}), balance, paidMonths, months }, { ...basePlan, balance })
    ? "Tamamlandı"
    : storedCredit?.status || "Aktiv";

  return {
    ...(storedCredit || {}),
    id: storedCredit?.id || getCreditIdForOrder(order),
    salesSource: true,
    createdFrom: "Satış modulu",
    orderId: order.id,
    customer: order.customer,
    fin: order.fin,
    contractId: order.contractId || storedCredit?.contractId || `MQ-${order.id}`,
    product: productSummary,
    device: productSummary,
    productLines: order.productLines || [],
    seller: order.seller,
    warehouseName: order.warehouseName,
    total: totalAmount,
    initialPayment,
    balance,
    monthly: storedCredit?.monthly ?? order.creditMonthly ?? basePlan.monthly,
    lastPayment: storedCredit?.lastPayment ?? order.creditLastPayment ?? basePlan.lastPayment,
    months,
    paidMonths,
    rate: storedCredit?.rate ?? 0,
    next: storedCredit?.next || basePlan.installments[0]?.due || "—",
    status,
    installments: storedCredit?.installments || basePlan.installments,
    payments: storedCredit?.payments || [],
  };
}

function buildSalesCreditRecords(orders, storedCredits) {
  const storedByOrderId = new Map(storedCredits.filter((credit) => credit.orderId).map((credit) => [credit.orderId, credit]));
  const storedById = new Map(storedCredits.map((credit) => [credit.id, credit]));

  return orders
    .filter((order) => order.paymentMethod === "Kredit" || order.creditId)
    .map((order) => {
      const storedCredit = storedByOrderId.get(order.id) || storedById.get(order.creditId) || storedById.get(getCreditIdForOrder(order));
      return buildSalesCreditRecord(order, storedCredit);
    });
}

function buildAllCreditRecords(orders, storedCredits) {
  const salesRecords = buildSalesCreditRecords(orders, storedCredits);
  const salesRecordIds = new Set(salesRecords.map((credit) => credit.id));
  const salesOrderIds = new Set(salesRecords.map((credit) => credit.orderId).filter(Boolean));
  const manualRecords = storedCredits.filter((credit) => {
    if (salesRecordIds.has(credit.id)) return false;
    if (credit.orderId && salesOrderIds.has(credit.orderId)) return false;
    return true;
  });

  return [...salesRecords, ...manualRecords];
}

function parseSellerBonusText(text) {
  return String(text || "")
    .split(",")
    .map((part) => {
      const match = part.trim().match(/(.+?)\s+(\d+(?:\.\d+)?)%/);
      if (!match) return null;
      return {
        seller: match[1].trim(),
        bonus: Number(match[2] || 0),
      };
    })
    .filter(Boolean);
}

function getOrderSellerBonuses(order) {
  if (Array.isArray(order.sellerBonuses) && order.sellerBonuses.length > 0) {
    return order.sellerBonuses;
  }
  return parseSellerBonusText(order.seller);
}

function buildSalesBonusRows(orders) {
  return orders.flatMap((order) => {
    const paid = Number(order.paid || 0);
    return getOrderSellerBonuses(order).map((sellerBonus) => {
      const rate = Number(sellerBonus.bonus || 0);
      return {
        id: `${order.id}-${sellerBonus.seller}-${rate}`,
        orderId: order.id,
        date: order.date,
        customer: order.customer,
        product: summarizeOrderProducts(order),
        paymentMethod: order.paymentMethod || "Nağd",
        seller: sellerBonus.seller,
        rate,
        paid,
        bonusAmount: Math.round((paid * rate) / 100),
        status: order.status,
      };
    });
  });
}

function getKpiPeriodKey(date = currentBusinessDate) {
  return String(date || currentBusinessDate).slice(0, 7);
}

function ensureKpiTargets(targets = []) {
  return Array.isArray(targets) && targets.length > 0 ? targets : initialState.kpiTargets || [];
}

function buildKpiEmployeeScoreRows(employees = [], salesBonuses = []) {
  const bonusBySeller = salesBonuses.reduce((map, row) => {
    const key = normalize(row.seller);
    if (!key) return map;
    const current = map.get(key) || { orders: 0, paid: 0, bonus: 0 };
    current.orders += 1;
    current.paid += Number(row.paid || 0);
    current.bonus += Number(row.bonusAmount || 0);
    map.set(key, current);
    return map;
  }, new Map());

  return buildHrEmployeeRecords(employees).map((employee) => {
    const sellerBonus = bonusBySeller.get(normalize(employee.name)) || { orders: 0, paid: 0, bonus: 0 };
    const performanceBonus = Number(employee.bonus || 0);
    const salesBonus = Math.round(sellerBonus.bonus || 0);
    const payoutAmount = performanceBonus + salesBonus;

    return {
      ...employee,
      salesOrders: sellerBonus.orders,
      salesPaid: Math.round(sellerBonus.paid || 0),
      salesBonus,
      performanceBonus,
      payoutAmount,
      payoutStatus: payoutAmount > 0 ? "Payout hazır" : Number(employee.kpi || 0) < 95 ? "Hədəfdən aşağı" : "İzləmə",
    };
  });
}

function getKpiActualValue(metricKey, { employees = [], employeeRows = [], salesBonuses = [] } = {}) {
  if (metricKey === "companyKpi") {
    return employees.length ? Math.round(total(employees, "kpi") / employees.length) : 0;
  }
  if (metricKey === "salesBonus") return Math.round(total(salesBonuses, "bonusAmount"));
  if (metricKey === "hrBonus") return Math.round(total(employeeRows, "performanceBonus"));
  if (metricKey === "highPerformers") {
    return employees.length
      ? Math.round((employees.filter((employee) => Number(employee.kpi || 0) >= 95).length / employees.length) * 100)
      : 0;
  }
  return 0;
}

function buildKpiTargetRows({ targets = [], employees = [], employeeRows = [], salesBonuses = [] } = {}) {
  return ensureKpiTargets(targets).map((target) => {
    const actual = getKpiActualValue(target.metricKey, { employees, employeeRows, salesBonuses });
    const targetValue = Number(target.target || 0);
    const progress = targetValue > 0 ? Math.round((actual / targetValue) * 100) : 0;
    const weightedScore = Math.round((Math.min(progress, 100) / 100) * Number(target.weight || 0));

    return {
      ...target,
      actual,
      progress,
      weightedScore,
      status: progress >= 100 ? "Tamamlandı" : progress >= 75 ? "Nəzarət" : "Risk",
    };
  });
}

function buildKpiPeriodSnapshot({ period, targetRows = [], employeeRows = [], salesBonuses = [], existing = {}, stamp = "" } = {}) {
  const totalWeight = Math.max(1, total(targetRows, "weight"));
  const companyScore = Math.round((total(targetRows, "weightedScore") / totalWeight) * 100);
  const salesBonusTotal = Math.round(total(salesBonuses, "bonusAmount"));
  const performanceBonusTotal = Math.round(total(employeeRows, "performanceBonus"));
  const payoutAmount = Math.round(total(employeeRows, "payoutAmount"));

  return {
    id: existing.id || `KPI-PER-${period}`,
    period,
    status: existing.status || "Açıq period",
    approvalStatus: existing.approvalStatus || "Hazırlanır",
    payoutStatus: existing.payoutStatus || "Gözləyir",
    companyScore,
    employeeCount: employeeRows.length,
    targetCount: targetRows.length,
    salesBonusTotal,
    performanceBonusTotal,
    payoutAmount,
    closedAt: existing.closedAt || "",
    approvedAt: existing.approvedAt || "",
    approvedBy: existing.approvedBy || "",
    paidAt: existing.paidAt || "",
    payoutExpenseId: existing.payoutExpenseId || "",
    updatedAt: stamp || existing.updatedAt || "",
    targetRows: targetRows.map((row) => ({
      id: row.id,
      name: row.name,
      target: row.target,
      unit: row.unit,
      weight: row.weight,
      actual: row.actual,
      progress: row.progress,
      status: row.status,
    })),
    payoutRows: employeeRows
      .filter((row) => Number(row.payoutAmount || 0) > 0)
      .map((row) => ({
        employeeId: row.id,
        employee: row.name,
        department: row.department,
        kpi: row.kpi,
        performanceBonus: row.performanceBonus,
        salesBonus: row.salesBonus,
        payoutAmount: row.payoutAmount,
      })),
  };
}

function getCustomerRelatedCredits(customer, credits) {
  return credits.filter(
    (credit) => credit.fin === customer.fin || normalize(credit.customer) === normalize(customer.name),
  );
}

function getCustomerOrders(customer, orders) {
  return orders.filter(
    (order) => order.fin === customer.fin || normalize(order.customer) === normalize(customer.name),
  );
}

function getCustomerContracts(customer, contracts = []) {
  return contracts.filter(
    (contract) => contract.fin === customer.fin || normalize(contract.customer) === normalize(customer.name),
  );
}

function getOrderCredit(order, credits = []) {
  return credits.find(
    (credit) =>
      credit.orderId === order.id ||
      credit.id === order.creditId ||
      (order.contractId && credit.contractId === order.contractId),
  );
}

function getOrderProductRows(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines.map((line) => {
      const qty = Math.max(1, Number(line.qty || 1));
      const amount = Math.max(0, Number(line.price || 0) * qty);
      return {
        product: line.product || order.products || "Cihaz qeyd edilməyib",
        qty,
        amount,
        serials: Array.isArray(line.serials) ? line.serials.filter(Boolean) : [],
      };
    });
  }

  return [
    {
      product: order.products || "Cihaz qeyd edilməyib",
      qty: 1,
      amount: Number(order.amount || 0),
      serials: [],
    },
  ];
}

function getCreditOrder(credit, orders = []) {
  return (
    orders.find(
      (order) =>
        order.id === credit.orderId ||
        order.creditId === credit.id ||
        (credit.contractId && order.contractId === credit.contractId),
    ) || null
  );
}

function getCreditContract(credit, contracts = []) {
  return (
    contracts.find(
      (contract) =>
        contract.id === credit.contractId ||
        contract.creditId === credit.id ||
        (credit.orderId && contract.orderId === credit.orderId),
    ) || null
  );
}

function getInstallmentStatus(installment) {
  if (Number(installment.amount || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(installment.due);
  const today = parsePaymentDate(baseCreditDate);
  if (dueDate && today && daysBetween(dueDate, today) > 0) return "Gecikib";
  if (dueDate && today && daysBetween(dueDate, today) === 0) return "Bu gün";
  return "Gözləyir";
}

function sortByBusinessDateDesc(a, b) {
  const aTime = parsePaymentDate(a.date)?.getTime() || 0;
  const bTime = parsePaymentDate(b.date)?.getTime() || 0;
  return bTime - aTime;
}

function buildCustomer360(customer, { credits = [], orders = [], contracts = [] }) {
  const customerOrders = getCustomerOrders(customer, orders);
  const customerCredits = getCustomerRelatedCredits(customer, credits);
  const customerContracts = getCustomerContracts(customer, contracts);
  const contractByOrderId = new Map(customerContracts.filter((contract) => contract.orderId).map((contract) => [contract.orderId, contract]));
  const contractById = new Map(customerContracts.map((contract) => [contract.id, contract]));
  const orderById = new Map(customerOrders.map((order) => [order.id, order]));

  const creditAgreements = customerCredits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    const paymentState = getCreditPaymentState(credit, plan);
    const order = getCreditOrder(credit, customerOrders);
    const contract = getCreditContract(credit, customerContracts);
    const productLines =
      order
        ? getOrderProductRows(order)
        : [
            {
              product: credit.device || credit.product || contract?.product || "Cihaz qeyd edilməyib",
              qty: 1,
              amount: Number(plan.total || contract?.amount || 0),
              serials: [],
            },
          ];
    const paid = getCreditPaidTotal(plan);

    return {
      id: credit.id,
      key: `credit-${credit.id}`,
      type: "Kredit müqaviləsi",
      source: getCreditSourceLabel(credit),
      contractId: credit.contractId || contract?.id || "Müqaviləsiz",
      orderId: credit.orderId || order?.id || contract?.orderId || "—",
      creditId: credit.id,
      date: credit.date || order?.date || contract?.date || baseCreditDate,
      product: productLines.map((line) => line.product).filter(Boolean).join(", "),
      productLines,
      amount: Number(plan.total || contract?.amount || order?.amount || 0),
      paid,
      balance: Number(plan.balance || 0),
      initialPayment: Number(plan.initialPayment || 0),
      monthly: Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
      months: Number(plan.months || 0),
      paidMonths: Number(credit.paidMonths || 0),
      remainingMonths: plan.installments.filter((installment) => Number(installment.amount || 0) > 0).length,
      nextDue: paymentState.nextInstallment?.due || credit.next || "—",
      status: getCreditManagementStatus({ credit, plan, paymentState }),
      overdueDays: Number(paymentState.daysOverdue || 0),
      plan,
      paymentState,
      payments: credit.payments || [],
      order,
      contract,
    };
  });

  const creditedOrderIds = new Set(creditAgreements.map((agreement) => agreement.orderId).filter((id) => id && id !== "—"));
  const usedContractIds = new Set(
    creditAgreements.map((agreement) => agreement.contractId).filter((id) => id && id !== "Müqaviləsiz"),
  );
  const directSaleAgreements = customerOrders
    .filter((order) => !creditedOrderIds.has(order.id) && !getOrderCredit(order, customerCredits))
    .map((order) => {
      const contract = contractByOrderId.get(order.id) || contractById.get(order.contractId);
      if (contract?.id) usedContractIds.add(contract.id);
      const balance = getOrderBalance(order);
      const amount = Number(order.amount || 0);

      return {
        id: order.id,
        key: `order-${order.id}`,
        type: getOrderPaymentMethod(order),
        source: "Satış modulu",
        contractId: order.contractId || contract?.id || "Müqaviləsiz",
        orderId: order.id,
        creditId: "—",
        date: order.date || currentBusinessDate,
        product: summarizeOrderProducts(order),
        productLines: getOrderProductRows(order),
        amount,
        paid: Math.max(0, amount - balance),
        balance,
        initialPayment: Number(order.paid || 0),
        monthly: 0,
        months: 0,
        paidMonths: balance > 0 ? 0 : 1,
        remainingMonths: balance > 0 ? 1 : 0,
        nextDue: balance > 0 ? order.dueDate || "Razılaşdırılmayıb" : "—",
        status: balance > 0 ? "Qalıqlı satış" : "Ödənilib",
        overdueDays: 0,
        plan: null,
        paymentState: null,
        payments: [],
        order,
        contract,
      };
    });

  const standaloneContracts = customerContracts
    .filter((contract) => !usedContractIds.has(contract.id) && !orderById.has(contract.orderId))
    .map((contract) => ({
      id: contract.id,
      key: `contract-${contract.id}`,
      type: "Müqavilə",
      source: "Müqavilə modulu",
      contractId: contract.id,
      orderId: contract.orderId || "—",
      creditId: "—",
      date: contract.date || currentBusinessDate,
      product: contract.product || "Cihaz qeyd edilməyib",
      productLines: [{ product: contract.product || "Cihaz qeyd edilməyib", qty: 1, amount: Number(contract.amount || 0), serials: [] }],
      amount: Number(contract.amount || 0),
      paid: 0,
      balance: Number(contract.amount || 0),
      initialPayment: 0,
      monthly: 0,
      months: 0,
      paidMonths: 0,
      remainingMonths: 0,
      nextDue: "—",
      status: contract.status || "Hazırlanır",
      overdueDays: 0,
      plan: null,
      paymentState: null,
      payments: [],
      order: null,
      contract,
    }));

  const agreements = [...creditAgreements, ...directSaleAgreements, ...standaloneContracts].sort(sortByBusinessDateDesc);
  const paymentRows = customerCredits
    .flatMap((credit) =>
      (credit.payments || []).map((payment) => ({
        ...payment,
        creditId: credit.id,
        contractId: credit.contractId,
        product: credit.device || credit.product || "Cihaz qeyd edilməyib",
      })),
    )
    .sort(sortByBusinessDateDesc);

  const deviceRows = customerOrders.flatMap((order) => {
    const linkedCredit = getOrderCredit(order, customerCredits);
    const plan = linkedCredit ? getCreditDisplayPlan(linkedCredit) : null;
    const paidTotal = linkedCredit ? getCreditPaidTotal(plan) : Number(order.paid || 0);
    const balanceTotal = linkedCredit ? Number(plan.balance || 0) : getOrderBalance(order);
    const lineRows = getOrderProductRows(order);
    const lineTotal = lineRows.reduce((sum, line) => sum + Number(line.amount || 0), 0) || Number(order.amount || 0) || 1;

    return lineRows.map((line) => {
      const lineAmount = Number(line.amount || 0) || Math.round(Number(order.amount || 0) / Math.max(1, lineRows.length));
      const ratio = Math.min(1, Math.max(0, lineAmount / lineTotal));
      const contract = contractByOrderId.get(order.id) || contractById.get(order.contractId);
      return {
        id: `${order.id}-${line.product}-${line.qty}`,
        product: line.product,
        qty: line.qty,
        serials: line.serials,
        orderId: order.id,
        contractId: order.contractId || contract?.id || linkedCredit?.contractId || "—",
        creditId: linkedCredit?.id || "—",
        date: order.date,
        status: order.status,
        amount: Math.round(lineAmount),
        paid: Math.round(paidTotal * ratio),
        balance: Math.round(balanceTotal * ratio),
      };
    });
  });

  const totalPurchased = agreements.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const totalPaid = agreements.reduce((sum, row) => sum + Number(row.paid || 0), 0);
  const totalBalance = agreements.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  const overdueAgreements = agreements.filter((agreement) => agreement.paymentState?.isOverdue);
  const nextPayment = creditAgreements
    .filter((agreement) => agreement.paymentState?.nextInstallment)
    .sort((a, b) => {
      const aTime = parsePaymentDate(a.nextDue)?.getTime() || 0;
      const bTime = parsePaymentDate(b.nextDue)?.getTime() || 0;
      return aTime - bTime;
    })[0];

  return {
    orders: customerOrders,
    credits: customerCredits,
    contracts: customerContracts,
    agreements,
    paymentRows,
    devices: deviceRows,
    totalPurchased,
    totalPaid,
    totalBalance,
    activeCreditCount: creditAgreements.filter((agreement) => !normalize(agreement.status).includes("bağlan")).length,
    overdueCount: overdueAgreements.length,
    openOrders: customerOrders.filter((order) => order.status !== "Təhvil verilib").length,
    nextPayment,
  };
}

function getLatestOrder(orders) {
  return [...orders].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  })[0];
}

function buildCrmPipelineRows(customers, credits, orders) {
  return customers.map((customer, index) => {
    const customerCredits = getCustomerRelatedCredits(customer, credits);
    const customerOrders = getCustomerOrders(customer, orders);
    const latestOrder = getLatestOrder(customerOrders);
    const activeCreditCount = customerCredits.filter((credit) => !isCreditClosed(credit, getCreditDisplayPlan(credit))).length;
    const totalBalance = customerCredits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
    const overdueCredit = customerCredits.find((credit) =>
      getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue,
    );
    const limitLeft = Math.max(0, Number(customer.limit || 0) - Number(customer.debt || 0) - totalBalance);
    const openOrders = customerOrders.filter((order) => order.status !== "Təhvil verilib").length;
    const hasDeliveryFollowUp = openOrders > 0;
    const stage = overdueCredit
      ? "Risk follow-up"
      : hasDeliveryFollowUp
        ? "Təhvil sonrası"
        : customer.category === "Platin"
          ? "Upsell"
          : limitLeft > 3000
            ? "Təklif"
            : "Kredit uyğunluğu";
    const probability =
      stage === "Upsell" ? 82 : stage === "Təklif" ? 68 : stage === "Təhvil sonrası" ? 56 : stage === "Risk follow-up" ? 34 : 46;
    const owner = latestOrder?.sellerBonuses?.[0]?.seller || latestOrder?.seller || "Təyin edilməyib";
    const value = Math.max(0, Math.round((limitLeft || Number(customer.limit || 0) * 0.28) / 100) * 100);
    const nextPayment = customerCredits
      .map((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).nextInstallment)
      .find(Boolean);

    return {
      id: `${customer.fin}-${stage}`,
      customer,
      stage,
      owner,
      value,
      probability,
      source: latestOrder ? `Son sifariş: ${latestOrder.id}` : customer.category,
      nextAction:
        stage === "Risk follow-up"
          ? "Gecikmə üzrə zəng və SMS"
          : stage === "Təhvil sonrası"
            ? "Təhvil sonrası məmnunluq zəngi"
            : stage === "Upsell"
              ? "Premium cihaz təklifi"
              : stage === "Təklif"
                ? "Limitə uyğun kommersiya təklifi"
                : "AKB və limit yoxlaması",
      activeCreditCount,
      totalBalance,
      openOrders,
      limitLeft,
      nextPayment,
      lastOrderId: latestOrder?.id || "Yeni fürsət",
    };
  });
}

function matchesCrmPipelineFilter(row, filter) {
  return filter === "Hamısı" || row.stage === filter;
}

function matchesCrmCustomerSearch(entry, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  const { customer, profile } = entry;
  const text = [
    customer.name,
    customer.fin,
    customer.phone,
    customer.category,
    ...profile.agreements.flatMap((agreement) => [
      agreement.contractId,
      agreement.orderId,
      agreement.creditId,
      agreement.product,
      agreement.status,
    ]),
  ].join(" ");
  return normalize(text).includes(q);
}

function matchesCrmCustomerSegment(entry, segment) {
  const { customer, profile } = entry;
  if (segment === "Aktiv kredit") return profile.activeCreditCount > 0;
  if (segment === "Gecikmə") return profile.overdueCount > 0 || Number(customer.delay || 0) > 0;
  if (segment === "Açıq təhvil") return profile.openOrders > 0;
  if (segment === "Borcsuz") return Number(profile.totalBalance || 0) <= 0 && Number(customer.debt || 0) <= 0;
  return true;
}

function buildCreditRiskRows(enrichedCredits) {
  return enrichedCredits
    .map((item) => {
      const overdueDays = Number(item.paymentState.daysOverdue || 0);
      const balance = Number(item.plan.balance || 0);
      const monthly = Number(item.paymentState.nextInstallment?.amount || item.plan.monthly || 0);
      const score = Math.min(
        100,
        Math.round(overdueDays * 4 + balance / 150 + monthly / 40 + (item.paymentState.isOverdue ? 22 : 0)),
      );
      const level = score >= 75 ? "Yüksək risk" : score >= 45 ? "Nəzarət" : "Sağlam";
      const bucket =
        overdueDays === 0 ? "Vaxtında" : overdueDays <= 7 ? "1-7 gün" : overdueDays <= 30 ? "8-30 gün" : "30+ gün";

      return {
        ...item,
        riskScore: score,
        riskLevel: level,
        bucket,
        recommendedAction:
          level === "Yüksək risk"
            ? "Kollektor zəngi + restruktur təklifi"
            : level === "Nəzarət"
              ? "SMS və ödəmə linki"
              : "Avtomatik xatırlatma",
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

function buildCreditAgingBuckets(riskRows) {
  const buckets = ["Vaxtında", "1-7 gün", "8-30 gün", "30+ gün"];
  return buckets.map((bucket) => {
    const rows = riskRows.filter((row) => row.bucket === bucket);
    return {
      bucket,
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row.paymentState.nextInstallment?.amount || 0), 0),
      balance: rows.reduce((sum, row) => sum + Number(row.plan.balance || 0), 0),
    };
  });
}

function buildProductLookup(products = []) {
  return new Map((products || []).map((product) => [normalize(product.name), product]));
}

function getReorderPoint(item = {}, productsByName = new Map()) {
  const catalogProduct = productsByName.get(normalize(item.product));
  const configuredPoint = catalogProduct?.reorderLevel ?? item.reorderLevel;
  if (configuredPoint !== undefined && configuredPoint !== null && configuredPoint !== "") {
    const point = Number(configuredPoint);
    if (Number.isFinite(point)) return Math.max(0, Math.round(point));
  }
  return Number(item.price || 0) >= 2000 ? 5 : 8;
}

function isLowStockItem(item, productsByName = new Map()) {
  const reorderPoint = getReorderPoint(item, productsByName);
  return reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint;
}

export function isPurchaseOrderOpen(po = {}) {
  const status = normalize(po.status);
  return (
    !status.includes("edildi") &&
    !status.includes("ödən") &&
    !status.includes("oden") &&
    !status.includes("bağ") &&
    !status.includes("bag") &&
    !status.includes("imtina") &&
    !status.includes("cancel")
  );
}

export function buildPurchaseOrderCoverage(purchaseOrders = []) {
  return (purchaseOrders || []).filter(isPurchaseOrderOpen).reduce((map, po) => {
    const key = normalize(po.product);
    if (!key) return map;
    const current = map.get(key) || { orderedQty: 0, amount: 0, count: 0, latest: null };
    map.set(key, {
      orderedQty: current.orderedQty + Number(po.qty || 0),
      amount: current.amount + Number(po.amount || 0),
      count: current.count + 1,
      latest: current.latest || po,
    });
    return map;
  }, new Map());
}

export function buildWarehouseWmsRows(items, products = []) {
  const productsByName = buildProductLookup(products);

  return items.map((item, index) => {
    const available = getAvailableQuantity(item);
    const serialSummary = getSerialSummary(item.serials || []);
    const catalogProduct = productsByName.get(normalize(item.product));
    const reorderPoint = getReorderPoint(item, productsByName);
    const serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
    const reorderQty = Math.max(0, reorderPoint * 2 - available);
    const brandCode = normalize(item.product).replace(/[^a-z0-9]/g, "").slice(0, 5).toLocaleUpperCase("az-AZ");
    const sku = `SKU-${brandCode || index + 1}-${String(index + 1).padStart(3, "0")}`;
    const barcode = `869${String(index + 100000001).padStart(9, "0")}`;
    return {
      sku,
      barcode,
      qrPayload: `ERPZ|${sku}|${item.product}|${available}`,
      product: item.product,
      bin: `${String.fromCharCode(65 + (index % 4))}-${String((index % 6) + 1).padStart(2, "0")}`,
      serialMode: serialTracked ? "IMEI/Serial" : "Batch",
      cycleCount: index % 3 === 0 ? "Bu həftə" : index % 3 === 1 ? "Növbəti həftə" : "Aylıq",
      available,
      reserved: Number(item.reserved || 0),
      serialSummary,
      sampleSerial: item.serials?.find((serial) => serial.status !== "Satılıb")?.imei || "Batch",
      reorderPoint,
      reorderQty,
      status: reorderQty > 0 ? "Sifariş aç" : available <= reorderPoint + 2 ? "Nəzarət" : "Normal",
    };
  });
}

function getPreferredVendorName(product, vendors) {
  const normalizedProduct = normalize(product);
  const direct = vendors.find((vendor) => normalizedProduct.includes(normalize(vendor.name).split(" ")[0]));
  if (direct) return direct.name;
  return vendors[0]?.name || "Vendor təyin edilməyib";
}

export function getVendorKey(vendor = {}) {
  return vendor.id || `VND-${normalize(vendor.name).replace(/[^a-z0-9]+/g, "-") || "vendor"}`;
}

function normalizeVendor(values = {}, fallback = {}) {
  const name = String(values.name ?? fallback.name ?? "").trim();
  return {
    id: fallback.id || values.id || `VND-${Date.now()}`,
    name,
    country: String(values.country ?? fallback.country ?? "").trim(),
    sku: Math.max(0, Math.round(Number(values.sku ?? fallback.sku ?? 0))),
    sold: Math.max(0, Math.round(Number(values.sold ?? fallback.sold ?? 0))),
    quota: Math.max(0, Math.round(Number(values.quota ?? fallback.quota ?? 0))),
    status: values.status || fallback.status || "Aktiv",
    contact: String(values.contact ?? fallback.contact ?? "").trim(),
    phone: String(values.phone ?? fallback.phone ?? "").trim(),
    email: String(values.email ?? fallback.email ?? "").trim(),
    leadTimeDays: Math.max(0, Math.round(Number(values.leadTimeDays ?? fallback.leadTimeDays ?? 14))),
    paymentTerms: String(values.paymentTerms ?? fallback.paymentTerms ?? "30 gün").trim(),
    note: String(values.note ?? fallback.note ?? "").trim(),
  };
}

export function getNormalizedVendor(vendor = {}) {
  const key = getVendorKey(vendor);
  return {
    ...normalizeVendor({ ...vendor, id: key }, vendor),
    id: key,
  };
}

export function buildProcurementRows(vendors, warehouseStock, orders, products = [], purchaseOrders = []) {
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const byProduct = new Map();

  products.filter((product) => product.status !== "Passiv").forEach((product) => {
    byProduct.set(product.name, {
      product: product.name,
      total: 0,
      reserved: 0,
      price: Number(product.salePrice || product.costPrice || 0),
      costPrice: Number(product.costPrice || 0),
      salePrice: Number(product.salePrice || 0),
      sku: product.sku || "",
    });
  });

  Object.values(warehouseStock).forEach((items) => {
    (items || []).forEach((item) => {
      const catalogProduct = productsByName.get(normalize(item.product));
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: Number(item.price || 0),
        costPrice: Number(catalogProduct?.costPrice || 0),
        salePrice: Number(catalogProduct?.salePrice || item.price || 0),
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = Number(item.price || current.price || 0);
      current.costPrice = Number(current.costPrice || catalogProduct?.costPrice || 0);
      current.salePrice = Number(current.salePrice || catalogProduct?.salePrice || item.price || 0);
      byProduct.set(item.product, current);
    });
  });

  const soldByProduct = orders.reduce((map, order) => {
    (order.productLines || []).forEach((line) => {
      map.set(line.product, (map.get(line.product) || 0) + Number(line.qty || 0));
    });
    return map;
  }, new Map());

  return [...byProduct.values()]
    .map((item) => {
      const available = Math.max(0, item.total - item.reserved);
      const sold = soldByProduct.get(item.product) || 0;
      const demand = Math.max(4, sold * 2);
      const reorderPoint = getReorderPoint(item, productsByName);
      const targetQty = Math.max(demand, reorderPoint > 0 ? reorderPoint * 2 : 0);
      const recommendedQty = Math.max(0, targetQty - available);
      const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, amount: 0, count: 0 };
      const unitCost = Number(item.costPrice || Math.round(Number(item.price || 0) * 0.76));
      const orderGap = Math.max(0, recommendedQty - Number(coverage.orderedQty || 0));
      const orderStatus =
        recommendedQty <= 0
          ? "Stok normal"
          : coverage.orderedQty >= recommendedQty
            ? "Sifariş verilib"
            : coverage.orderedQty > 0
              ? "Qismən sifarişdə"
              : "Sifariş verilməyib";
      return {
        ...item,
        available,
        sold,
        reorderPoint,
        vendor: getPreferredVendorName(item.product, vendors),
        recommendedQty,
        orderGap,
        orderedQty: Number(coverage.orderedQty || 0),
        openPoCount: Number(coverage.count || 0),
        latestPoId: coverage.latest?.id || "",
        unitCost,
        estimatedCost: Math.round(orderGap * unitCost),
        status:
          recommendedQty > 0
            ? orderStatus
            : reorderPoint > 0 && available <= reorderPoint
              ? "Nəzarət"
              : "Kifayət edir",
      };
    })
    .sort((a, b) => b.recommendedQty - a.recommendedQty || a.available - b.available);
}

export function buildFinanceScenario({ orders, expenses, credits, cashEntries, openingBalance = 0 }) {
  const ledger = buildFinanceLedger({ orders, expenses, cashEntries });
  const inflow = ledger.filter((row) => row.direction === "in").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const approvedExpense = expenses
    .filter((expense) => expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pendingExpense = expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir" && hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const grossSales = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const estimatedCost = Math.round(grossSales * 0.68);
  const grossProfit = grossSales - estimatedCost;

  return {
    inflow,
    approvedExpense,
    pendingExpense,
    creditBalance,
    grossSales,
    estimatedCost,
    grossProfit,
    margin: grossSales > 0 ? (grossProfit / grossSales) * 100 : 0,
    cashAfterPending: Number(openingBalance || 0) + inflow - approvedExpense - pendingExpense,
  };
}

export function hasExpenseCashImpact(expense = {}) {
  if (expense.cashImpact === false) return false;
  return expense.source !== "HR Payroll";
}

function getInvoiceVatRate(invoiceSettings = {}) {
  return Number(invoiceSettings.vatRate || 18) / 100;
}

function buildInvoiceRows({ orders, settings = {}, invoiceSettings = {} }) {
  const vatRate = getInvoiceVatRate(invoiceSettings);
  const prefix = invoiceSettings.prefix || "EQ";
  const paymentTermsDays = Number(invoiceSettings.paymentTermsDays || 7);

  return orders.map((order, index) => {
    const totalAmount = roundMoney(order.amount);
    const netAmount = roundMoney(totalAmount / (1 + vatRate));
    const vatAmount = Math.max(0, totalAmount - netAmount);
    const balance = getOrderBalance(order);
    const dueDate = formatPaymentDate(addDays(order.date || currentBusinessDate, paymentTermsDays));
    const status =
      balance <= 0
        ? "Ödənilib"
        : Number(order.paid || 0) > 0
          ? "Qismən ödənilib"
          : "Ödəniş gözləyir";

    return {
      id: `${prefix}-${String(index + 1).padStart(4, "0")}`,
      orderId: order.id,
      contractId: order.contractId || "—",
      customer: order.customer,
      fin: order.fin,
      seller: settings.company || "ERP+CRM AZ",
      voen: settings.voen || "—",
      date: order.date || currentBusinessDate,
      dueDate,
      products: summarizeOrderProducts(order),
      paymentMethod: getOrderPaymentMethod(order),
      netAmount,
      vatAmount,
      totalAmount,
      paid: Number(order.paid || 0),
      balance,
      currency: invoiceSettings.defaultCurrency || "AZN",
      eTaxStatus: order.eTaxStatus || (balance <= 0 ? "E-qaimə göndərildi" : "Göndərişə hazır"),
      invoiceBatchId: order.invoiceBatchId,
      invoiceSentAt: order.invoiceSentAt,
      status,
    };
  });
}

function buildInvoiceSummary(invoices) {
  const paidRows = invoices.filter((invoice) => invoice.balance <= 0);
  const waitingRows = invoices.filter((invoice) => invoice.balance > 0);

  return {
    count: invoices.length,
    total: total(invoices, "totalAmount"),
    vat: total(invoices, "vatAmount"),
    paid: total(paidRows, "paid"),
    balance: total(waitingRows, "balance"),
    ready: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
  };
}

function getInvoiceAgingBucket(invoice) {
  if (Number(invoice.balance || 0) <= 0) return "Ödənilib";
  const dueDate = parsePaymentDate(invoice.dueDate);
  const today = parsePaymentDate(currentBusinessDate);
  const days = dueDate && today ? daysBetween(dueDate, today) : 0;
  if (days <= 0) return "Vaxtında";
  if (days <= 7) return "1-7 gün";
  if (days <= 30) return "8-30 gün";
  return "30+ gün";
}

function buildInvoiceAgingRows(invoices) {
  const buckets = ["Vaxtında", "1-7 gün", "8-30 gün", "30+ gün", "Ödənilib"];
  const rows = buckets.map((bucket) => ({
    bucket,
    count: 0,
    balance: 0,
    total: 0,
  }));
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));

  invoices.forEach((invoice) => {
    const bucket = getInvoiceAgingBucket(invoice);
    const row = byBucket.get(bucket);
    if (!row) return;
    row.count += 1;
    row.balance += Number(invoice.balance || 0);
    row.total += Number(invoice.totalAmount || 0);
  });

  return rows;
}

function buildInvoiceControlSummary(invoices) {
  const today = parsePaymentDate(currentBusinessDate);
  const openInvoices = invoices.filter((invoice) => Number(invoice.balance || 0) > 0);
  const overdue = openInvoices.filter((invoice) => {
    const dueDate = parsePaymentDate(invoice.dueDate);
    return dueDate && today && daysBetween(dueDate, today) > 0;
  });
  const dueSoon = openInvoices.filter((invoice) => {
    const dueDate = parsePaymentDate(invoice.dueDate);
    if (!dueDate || !today) return false;
    const diff = daysBetween(today, dueDate);
    return diff >= 0 && diff <= 7;
  });

  return {
    sent: invoices.filter((invoice) => invoice.invoiceSentAt || invoice.eTaxStatus === "E-qaimə göndərildi").length,
    ready: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
    overdueCount: overdue.length,
    overdueBalance: total(overdue, "balance"),
    dueSoonCount: dueSoon.length,
    dueSoonBalance: total(dueSoon, "balance"),
    openBalance: total(openInvoices, "balance"),
  };
}

function buildCurrencyExposureRows({ currencyRates = [], orders, credits, cashEntries }) {
  const salesTotal = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const collectedTotal = orders.reduce((sum, order) => sum + Number(order.paid || 0), 0) + total(cashEntries, "amount");
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);

  return currencyRates.map((rate) => {
    const fxRate = Number(rate.rate || 1);
    const foreignSales = fxRate > 0 ? Math.round(salesTotal / fxRate) : salesTotal;
    const openExposure = Math.round((creditBalance / Math.max(fxRate, 1)) * Number(rate.change || 0) / 100);

    return {
      ...rate,
      salesEquivalent: foreignSales,
      collectedEquivalent: fxRate > 0 ? Math.round(collectedTotal / fxRate) : collectedTotal,
      exposureAzn: openExposure,
      status: rate.code === "AZN" ? "Baza" : Math.abs(Number(rate.change || 0)) >= 0.3 ? "Nəzarət" : rate.status,
    };
  });
}

function buildAccountingData({ orders, expenses, cashEntries, credits, stock, invoices, openingBalance = 0 }) {
  const salesRevenue = total(orders, "amount");
  const salesVat = total(invoices, "vatAmount");
  const salesNet = Math.max(0, salesRevenue - salesVat);
  const approvedExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi");
  const pendingExpenses = expenses.filter((expense) => expense.status === "Təsdiq gözləyir");
  const approvedExpenseTotal = total(approvedExpenses, "amount");
  const approvedCashExpenseTotal = approvedExpenses
    .filter((expense) => hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pendingExpenseTotal = total(pendingExpenses, "amount");
  const pendingCashExpenseTotal = pendingExpenses
    .filter((expense) => hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const salesCollected = orders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  const creditCash = total(cashEntries, "amount");
  const cash = Number(openingBalance || 0) + salesCollected + creditCash - approvedCashExpenseTotal;
  const nonCreditReceivable = orders
    .filter((order) => getOrderPaymentMethod(order) !== "Kredit")
    .reduce((sum, order) => sum + getOrderBalance(order), 0);
  const creditReceivable = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const receivable = nonCreditReceivable + creditReceivable;
  const inventory = stock.reduce(
    (sum, item) => sum + Math.round(getAvailableQuantity(item) * Number(item.price || 0) * 0.68),
    0,
  );
  const costOfGoods = Math.round(salesRevenue * 0.68);
  const penaltyIncome = cashEntries.reduce((sum, entry) => sum + Number(entry.penalty || 0), 0);
  const grossProfit = salesNet - costOfGoods;
  const netProfit = grossProfit + penaltyIncome - approvedExpenseTotal;
  const vatPayable = Math.max(0, salesVat - Math.round((approvedExpenseTotal * 18) / 118));

  const journalRows = [
    ...invoices.slice(0, 8).map((invoice) => ({
      id: `JR-${invoice.id}`,
      date: invoice.date,
      source: invoice.orderId,
      debit: invoice.balance > 0 ? "Kassa / Debitor" : "Kassa",
      credit: "Satış gəliri / ƏDV",
      amount: invoice.totalAmount,
      status: invoice.balance > 0 ? "Açıq" : "Bağlandı",
    })),
    ...cashEntries.slice(0, 4).map((entry) => ({
      id: `JR-${entry.id}`,
      date: entry.date,
      source: entry.creditId,
      debit: "Kassa",
      credit: Number(entry.penalty || 0) > 0 ? "Debitor / Gecikmə gəliri" : "Debitor",
      amount: entry.amount,
      status: "Kassa yazıldı",
    })),
    ...expenses.slice(0, 6).map((expense) => ({
      id: `JR-${expense.id}`,
      date: expense.date,
      source: expense.id,
      debit: expense.category,
      credit: expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense) ? "Kassa" : "Kreditor",
      amount: expense.amount,
      status: hasExpenseCashImpact(expense) ? expense.status : "Cash təsiri yoxdur",
    })),
  ];

  const chartRows = [
    { code: "1010", account: "Kassa", type: "Aktiv", debit: cash, credit: 0, balance: cash },
    { code: "1210", account: "Debitor borclar", type: "Aktiv", debit: receivable, credit: 0, balance: receivable },
    { code: "2050", account: "Mal ehtiyatları", type: "Aktiv", debit: inventory, credit: 0, balance: inventory },
    { code: "4310", account: "ƏDV öhdəliyi", type: "Öhdəlik", debit: 0, credit: vatPayable, balance: vatPayable },
    { code: "5310", account: "Kreditor borclar", type: "Öhdəlik", debit: 0, credit: pendingExpenseTotal, balance: pendingExpenseTotal },
    { code: "6010", account: "Satış gəliri", type: "Gəlir", debit: 0, credit: salesNet, balance: salesNet },
    { code: "7010", account: "Maya dəyəri", type: "Xərc", debit: costOfGoods, credit: 0, balance: costOfGoods },
    { code: "7310", account: "Əməliyyat xərcləri", type: "Xərc", debit: approvedExpenseTotal, credit: 0, balance: approvedExpenseTotal },
  ];

  return {
    journalRows,
    chartRows,
    balance: {
      assets: cash + receivable + inventory,
      liabilities: vatPayable + pendingExpenseTotal,
      equity: cash + receivable + inventory - vatPayable - pendingExpenseTotal,
    },
    pl: {
      revenue: salesNet,
      vat: salesVat,
      costOfGoods,
      grossProfit,
      penaltyIncome,
      operatingExpenses: approvedExpenseTotal,
      netProfit,
      margin: salesNet > 0 ? (netProfit / salesNet) * 100 : 0,
    },
    cashFlow: {
      opening: Number(openingBalance || 0),
      inflow: salesCollected + creditCash,
      outflow: approvedCashExpenseTotal,
      closing: cash,
      pendingOutflow: pendingCashExpenseTotal,
    },
    vatPayable,
  };
}

function buildAccountingCloseChecklist(accounting, closeRun) {
  const { balance, pl, cashFlow, journalRows, chartRows } = accounting;
  const cashAccount = chartRows.find((row) => row.code === "1010");
  const equationDiff = Math.round(Number(balance.assets || 0) - Number(balance.liabilities || 0) - Number(balance.equity || 0));
  const cashDiff = Math.round(Number(cashAccount?.balance || 0) - Number(cashFlow.closing || 0));
  const checks = [
    {
      label: "Balans bərabərliyi",
      detail: `Aktiv - öhdəlik - kapital = ${money(equationDiff)}`,
      status: Math.abs(equationDiff) <= 1 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Kassa uzlaşması",
      detail: `1010 hesabı ilə cash-flow fərqi ${money(cashDiff)}`,
      status: Math.abs(cashDiff) <= 1 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Jurnal yazılışları",
      detail: `${journalRows.length} jurnal sətri formalaşıb`,
      status: journalRows.length > 0 ? "Tamamlandı" : "Gözləyir",
    },
    {
      label: "ƏDV öhdəliyi",
      detail: `${money(accounting.vatPayable)} öhdəlik hesablandı`,
      status: Number(accounting.vatPayable || 0) >= 0 ? "Tamamlandı" : "Yoxlanmalıdır",
    },
    {
      label: "Ay bağlanışı",
      detail: closeRun ? `${closeRun.period} export edilib` : "Jurnal export gözləyir",
      status: closeRun ? "Tamamlandı" : "Gözləyir",
    },
  ];

  return {
    checks,
    readyCount: checks.filter((check) => check.status === "Tamamlandı").length,
    warningCount: checks.filter((check) => check.status !== "Tamamlandı").length,
    equationDiff,
    cashDiff,
    closeReady: checks.every((check) => check.status === "Tamamlandı"),
    retainedEarnings: Number(pl.netProfit || 0),
  };
}

function calculatePayrollTax2026(grossValue) {
  const gross = Math.max(0, roundMoney(grossValue));
  const incomeTax =
    gross <= 2500
      ? Math.max(0, Math.round((gross - 200) * 0.03))
      : gross <= 8000
        ? Math.round(75 + (gross - 2500) * 0.1)
        : Math.round(625 + (gross - 8000) * 0.14);
  const employeeSocial = gross <= 200 ? Math.round(gross * 0.03) : Math.round(6 + (gross - 200) * 0.1);
  const employerSocial =
    gross <= 200
      ? Math.round(gross * 0.22)
      : gross <= 8000
        ? Math.round(44 + (gross - 200) * 0.15)
        : Math.round(44 + 7800 * 0.15 + (gross - 8000) * 0.11);
  const employeeUnemployment = Math.round(gross * 0.005);
  const employerUnemployment = Math.round(gross * 0.005);
  const totalDeductions = incomeTax + employeeSocial + employeeUnemployment;

  return {
    gross,
    incomeTax,
    employeeSocial,
    employeeUnemployment,
    totalDeductions,
    net: Math.max(0, gross - totalDeductions),
    employerSocial,
    employerUnemployment,
    employerCost: gross + employerSocial + employerUnemployment,
  };
}

function buildPayrollTaxCalculatorRows(records) {
  return records.map((record) => {
    const gross = Number(record.salary || 0) + Number(record.bonus || 0);
    return {
      employee: record.name,
      department: record.department,
      ...calculatePayrollTax2026(gross),
    };
  });
}

function getTaxAmountByType(type, { invoices, payrollTaxRows, accounting }) {
  const normalized = normalize(type);
  if (normalized.includes("ədv")) return total(invoices, "vatAmount");
  if (normalized.includes("payroll")) {
    return payrollTaxRows.reduce(
      (sum, row) =>
        sum +
        Number(row.incomeTax || 0) +
        Number(row.employeeSocial || 0) +
        Number(row.employeeUnemployment || 0) +
        Number(row.employerSocial || 0) +
        Number(row.employerUnemployment || 0),
      0,
    );
  }
  if (normalized.includes("mənfəət")) return Math.max(0, Math.round(Number(accounting.pl.netProfit || 0) * 0.2));
  if (normalized.includes("sadələşdirilmiş")) return Math.round(Number(accounting.pl.revenue || 0) * 0.02);
  return 0;
}

function buildTaxDueDate(day, monthOffset = 1) {
  const [year, month] = currentBusinessDate.split("-").map(Number);
  const date = new Date(year, month - 1 + monthOffset, Number(day || 20));
  return formatDateInput(date);
}

function buildDefaultTaxCalendarItems({ invoices, payrollTaxRows, accounting }) {
  const invoiceSummary = buildInvoiceSummary(invoices);
  const payrollAmount = getTaxAmountByType("Payroll", { invoices, payrollTaxRows, accounting });
  const profitAmount = getTaxAmountByType("Mənfəət", { invoices, payrollTaxRows, accounting });
  const period = currentBusinessDate.slice(0, 7);

  return [
    {
      id: `TAX-AUTO-VAT-${period}`,
      title: "ƏDV bəyannaməsi",
      type: "ƏDV",
      period,
      dueDate: buildTaxDueDate(20, 1),
      owner: "Maliyyə",
      source: "Avtomatik",
      plannedAmount: invoiceSummary.vat,
    },
    {
      id: `TAX-AUTO-PAYROLL-${period}`,
      title: "Payroll vergi/DSMF",
      type: "Payroll",
      period,
      dueDate: buildTaxDueDate(15, 1),
      owner: "HR/Maliyyə",
      source: "Avtomatik",
      plannedAmount: payrollAmount,
    },
    {
      id: `TAX-AUTO-PROFIT-${currentBusinessYear}-Q${currentBusinessQuarter}`,
      title: "Mənfəət vergisi avans",
      type: "Mənfəət",
      period: `${currentBusinessYear} Q${currentBusinessQuarter}`,
      dueDate: buildTaxDueDate(20, 1),
      owner: "Maliyyə",
      source: "Avtomatik",
      plannedAmount: profitAmount,
    },
  ];
}

function buildTaxCalendarRows({ taxCalendar = [], invoices, payrollTaxRows, accounting }) {
  const today = parsePaymentDate(currentBusinessDate);
  const defaults = buildDefaultTaxCalendarItems({ invoices, payrollTaxRows, accounting });
  const existingIds = new Set((taxCalendar || []).map((item) => item.id));
  const sourceRows = [
    ...(taxCalendar || []),
    ...defaults.filter((item) => !existingIds.has(item.id)),
  ];

  return sourceRows.map((item) => {
    const dueDate = parsePaymentDate(item.dueDate);
    const daysLeft = dueDate && today ? daysBetween(today, dueDate) : 0;
    const status =
      item.paymentStatus ||
      (daysLeft < 0 ? "Gecikib" : daysLeft === 0 ? "Bu gün" : daysLeft <= 7 ? "Yaxınlaşır" : "Planlı");

    return {
      ...item,
      daysLeft,
      amount: getTaxAmountByType(item.type, { invoices, payrollTaxRows, accounting }),
      status,
      autoGenerated: item.source === "Avtomatik" || item.id?.startsWith("TAX-AUTO"),
    };
  });
}

function ensureApiWebhooks(apiWebhooks = []) {
  const defaults = initialState.apiWebhooks || [];
  const savedById = new Map((apiWebhooks || []).map((webhook) => [webhook.id, webhook]));
  const mergedDefaults = defaults.map((webhook) => ({
    ...webhook,
    ...(savedById.get(webhook.id) || {}),
    retryMax: Number(savedById.get(webhook.id)?.retryMax ?? webhook.retryMax ?? 3),
    retryBackoffSeconds: Number(savedById.get(webhook.id)?.retryBackoffSeconds ?? webhook.retryBackoffSeconds ?? 60),
    failureCount: Number(savedById.get(webhook.id)?.failureCount ?? webhook.failureCount ?? 0),
    retryQueue: Number(savedById.get(webhook.id)?.retryQueue ?? webhook.retryQueue ?? 0),
    processedCount: Number(savedById.get(webhook.id)?.processedCount ?? webhook.processedCount ?? 0),
  }));
  const defaultIds = new Set(defaults.map((webhook) => webhook.id));
  const custom = (apiWebhooks || []).filter((webhook) => webhook.id && !defaultIds.has(webhook.id));
  return [...mergedDefaults, ...custom];
}

function ensureApiSecrets(apiSecrets = []) {
  const defaults = initialState.apiSecrets || [];
  const savedById = new Map((apiSecrets || []).map((secret) => [secret.id, secret]));
  const mergedDefaults = defaults.map((secret) => ({
    ...secret,
    ...(savedById.get(secret.id) || {}),
    status: savedById.get(secret.id)?.status || secret.status || "Aktiv",
    version: Number(savedById.get(secret.id)?.version ?? secret.version ?? 1),
  }));
  const defaultIds = new Set(defaults.map((secret) => secret.id));
  const custom = (apiSecrets || []).filter((secret) => secret.id && !defaultIds.has(secret.id));
  return [...mergedDefaults, ...custom];
}

function getApiSecretHealth(secret = {}) {
  if (!secret.key) return { daysLeft: 0, status: "Secret tapılmadı" };
  if (secret.status !== "Aktiv") return { daysLeft: 0, status: secret.status || "Deaktiv" };
  const rotated = parsePaymentDate(secret.lastRotatedAt);
  const today = parsePaymentDate(currentBusinessDate);
  const rotationDays = Number(secret.rotationDays || 90);
  const age = rotated && today ? Math.max(0, daysBetween(rotated, today)) : rotationDays;
  const daysLeft = Math.max(0, rotationDays - age);
  const status = daysLeft <= 0 ? "Rotasiya gecikib" : daysLeft <= 7 ? "Rotasiya yaxınlaşır" : "Aktiv";
  return { daysLeft, status };
}

function buildApiSecretRows(apiSecrets = [], apiWebhooks = []) {
  const webhookRows = ensureApiWebhooks(apiWebhooks);
  return ensureApiSecrets(apiSecrets).map((secret) => {
    const health = getApiSecretHealth(secret);
    const linkedEndpoints = webhookRows.filter((webhook) => webhook.secretKey === secret.key);
    return {
      ...secret,
      linkedCount: linkedEndpoints.length,
      linkedEvents: linkedEndpoints.map((webhook) => webhook.event).join(", ") || "Bağlı endpoint yoxdur",
      daysLeft: health.daysLeft,
      health: health.status,
    };
  });
}

function buildApiWebhookRows({ apiWebhooks = [], apiSecrets = [], apiWebhookLogs = [], invoices = [], credits = [], stock = [], products = [], purchaseOrders = [], expenses = [] }) {
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const productsByName = buildProductLookup(products);
  const lowStock = stock.filter((item) => isLowStockItem(item, productsByName));
  const eventCounts = {
    "invoice.paid": invoices.filter((invoice) => invoice.balance <= 0).length,
    "invoice.overdue": invoices.filter((invoice) => {
      const dueDate = parsePaymentDate(invoice.dueDate);
      const today = parsePaymentDate(currentBusinessDate);
      return invoice.balance > 0 && dueDate && today && daysBetween(dueDate, today) > 0;
    }).length,
    "credit.overdue": overdueCredits.length,
    "product.low_stock": lowStock.length,
    "po.approved": (purchaseOrders || []).filter((po) => po.status === "Təsdiq edildi").length,
    "payroll.created": expenses.filter((expense) => expense.source === "HR Payroll").length,
  };

  const secretRows = buildApiSecretRows(apiSecrets, apiWebhooks);
  const secretByKey = new Map(secretRows.map((secret) => [secret.key, secret]));
  const logsByWebhook = (apiWebhookLogs || []).reduce((map, log) => {
    if (!log.webhookId) return map;
    if (!map.has(log.webhookId)) map.set(log.webhookId, []);
    map.get(log.webhookId).push(log);
    return map;
  }, new Map());

  return ensureApiWebhooks(apiWebhooks).map((webhook) => {
    const eventCount = eventCounts[webhook.event] || 0;
    const processedCount = Number(webhook.processedCount || 0);
    const queueCount = Math.max(0, eventCount - processedCount);
    const retryQueue = Number(webhook.retryQueue || 0);
    const retryMax = Number(webhook.retryMax || 3);
    const lastLog = (logsByWebhook.get(webhook.id) || [])[0];
    const secret = webhook.authType === "None" ? { key: "", health: "Aktiv", maskedValue: "Auth yoxdur" } : secretByKey.get(webhook.secretKey);
    const secretHealth = secret?.health || "Secret tapılmadı";
    const derivedPayload =
      webhook.event === "credit.overdue"
        ? overdueCredits[0]?.id || "Növbə boşdur"
        : webhook.event === "product.low_stock"
          ? lowStock[0]?.product || "Stok normaldır"
          : webhook.event === "invoice.paid"
            ? invoices.find((invoice) => invoice.balance <= 0)?.id || "Ödənilmiş faktura yoxdur"
            : webhook.event === "po.approved"
              ? (purchaseOrders || []).find((po) => po.status === "Təsdiq edildi")?.id || "Təsdiqli PO yoxdur"
              : "Hazır";

    return {
      ...webhook,
      queueCount,
      retryQueue,
      retryMax,
      authLabel: `${webhook.authType || "HMAC"} · ${secret?.maskedValue || webhook.secretKey || "Secret yoxdur"}`,
      secretStatus: secretHealth,
      lastResponseCode: webhook.lastResponseCode || lastLog?.responseCode || "—",
      lastLatencyMs: webhook.lastLatencyMs || lastLog?.latencyMs || 0,
      failureCount: Number(webhook.failureCount || 0),
      nextRetryAt: webhook.nextRetryAt || "",
      lastPayload: webhook.lastPayloadOverride || derivedPayload,
      retryState:
        retryQueue > 0
          ? "Retry gözləyir"
          : Number(webhook.failureCount || 0) >= retryMax
            ? "Bloklandı"
            : "Normal",
      health:
        secretHealth.includes("tapılmadı") || secretHealth.includes("gecikib")
          ? "Secret riski"
          : lastLog?.result === "Uğurlu" || webhook.lastTestAt
            ? "Test OK"
            : webhook.status === "Aktiv"
              ? "Canlı"
              : webhook.status,
    };
  });
}

function buildTodayActionRows({ credits, orders, expenses, stock, products = [], invoices, taxRows }) {
  const creditActions = credits
    .map((credit) => {
      const plan = getCreditDisplayPlan(credit);
      return { credit, paymentState: getCreditPaymentState(credit, plan), plan };
    })
    .filter((item) => item.paymentState.isOverdue || item.paymentState.isDueToday)
    .map((item) => ({
      id: `ACT-${item.credit.id}`,
      module: "credits",
      title: item.paymentState.isOverdue ? "Gecikən kredit" : "Bu gün kredit ödənişi",
      detail: `${item.credit.customer} · ${item.credit.contractId || item.credit.id}`,
      amount: Number(item.paymentState.nextInstallment?.amount || item.plan.monthly || 0),
      priority: item.paymentState.isOverdue ? "Yüksək" : "Orta",
      status: item.paymentState.isOverdue ? `${item.paymentState.daysOverdue} gün gecikib` : "Bu gün",
      icon: CreditCard,
    }));

  const deliveryActions = orders
    .filter((order) => order.status !== "Təhvil verilib" && getDeliveryRisk(enrichDeliveryOrder(order)) !== "Normal")
    .slice(0, 5)
    .map((order) => ({
      id: `ACT-${order.id}`,
      module: "deliveries",
      title: "Təhvil nəzarəti",
      detail: `${order.id} · ${order.customer} · ${summarizeOrderProducts(order)}`,
      amount: getOrderBalance(order),
      priority: getDeliveryAgeDays(order) >= 5 ? "Yüksək" : "Orta",
      status: getDeliveryRisk(order),
      icon: Truck,
    }));

  const expenseActions = expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir")
    .map((expense) => ({
      id: `ACT-${expense.id}`,
      module: "finance",
      title: "Xərc təsdiqi",
      detail: `${expense.description} · ${expense.category}`,
      amount: Number(expense.amount || 0),
      priority: Number(expense.amount || 0) >= 5000 ? "Yüksək" : "Orta",
      status: expense.status,
      icon: Wallet,
    }));

  const productsByName = buildProductLookup(products);
  const stockActions = stock
    .filter((item) => isLowStockItem(item, productsByName))
    .map((item) => ({
      id: `ACT-STOCK-${item.product}`,
      module: "warehouse",
      title: "Aşağı stok",
      detail: `${item.product} · satış üçün ${getAvailableQuantity(item)} ədəd`,
      amount: getAvailableQuantity(item) * Number(item.price || 0),
      priority: getAvailableQuantity(item) <= 3 ? "Yüksək" : "Orta",
      status: "PO/transfer lazımdır",
      icon: Package,
    }));

  const invoiceActions = invoices
    .filter((invoice) => invoice.balance > 0)
    .slice(0, 4)
    .map((invoice) => ({
      id: `ACT-${invoice.id}`,
      module: "invoices",
      title: "Açıq faktura",
      detail: `${invoice.id} · ${invoice.customer}`,
      amount: Number(invoice.balance || 0),
      priority: invoice.status === "Ödəniş gözləyir" ? "Orta" : "Aşağı",
      status: invoice.status,
      icon: FileText,
    }));

  const taxActions = taxRows
    .filter((row) => row.status === "Bu gün" || row.status === "Gecikib" || row.status === "Yaxınlaşır")
    .map((row) => ({
      id: `ACT-${row.id}`,
      module: "tax",
      title: "Vergi öhdəliyi",
      detail: `${row.title} · ${row.period}`,
      amount: Number(row.amount || 0),
      priority: row.status === "Gecikib" || row.status === "Bu gün" ? "Yüksək" : "Orta",
      status: row.status,
      icon: CalendarClock,
    }));

  const priorityOrder = { "Yüksək": 0, Orta: 1, "Aşağı": 2 };
  return [...creditActions, ...taxActions, ...deliveryActions, ...expenseActions, ...stockActions, ...invoiceActions]
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 12);
}

function buildExecutiveInsights({ orders, credits, vendors, employees }) {
  const creditRows = credits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
  });
  const overdueCount = creditRows.filter((item) => item.paymentState.isOverdue).length;
  const topSeller = [...employees].sort((a, b) => Number(b.kpi || 0) - Number(a.kpi || 0))[0];
  const vendorAtRisk = vendors.filter((vendor) => normalize(vendor.status).includes("risk") || normalize(vendor.status).includes("aşağı"));
  const openDelivery = orders.filter((order) => order.status !== "Təhvil verilib").length;

  return [
    {
      title: "Kredit portfeli",
      value: `${overdueCount} risk`,
      desc: overdueCount > 0 ? "Gecikən müştərilər üzrə kollektor növbəsi yaradın" : "Gecikmə siqnalı yoxdur",
      tone: overdueCount > 0 ? "danger" : "success",
    },
    {
      title: "Təhvil yükü",
      value: `${openDelivery} sifariş`,
      desc: "Anbar çıxışı və sürücü planı ilə izlənir",
      tone: openDelivery > 4 ? "warning" : "info",
    },
    {
      title: "Vendor riski",
      value: vendorAtRisk.length,
      desc: "Kvota və təchizat üzrə zəif vendorlar",
      tone: vendorAtRisk.length > 0 ? "warning" : "success",
    },
    {
      title: "HR/KPI",
      value: topSeller?.name || "Yoxdur",
      desc: topSeller ? `${topSeller.kpi}% KPI ilə lider` : "KPI datası yoxdur",
      tone: "primary",
    },
  ];
}

function flattenWarehouseStock(warehouseStock = {}) {
  return Object.entries(warehouseStock || {}).flatMap(([warehouseId, rows]) =>
    (rows || []).map((row) => ({ ...row, warehouseId })),
  );
}

function buildReportModuleRows({
  orders = [],
  credits = [],
  vendors = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  invoices = [],
  cashEntries = [],
}) {
  const creditRows = credits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
  });
  const stockRows = flattenWarehouseStock(warehouseStock);
  const productsByName = buildProductLookup(products);
  const lowStockRows = stockRows.filter((item) => isLowStockItem(item, productsByName));
  const openDeliveries = orders.filter((order) => order.status !== "Təhvil verilib");
  const openPos = (purchaseOrders || []).filter(isPurchaseOrderOpen);
  const pendingExpenses = expenses.filter((expense) => expense.status === "Təsdiq gözləyir");
  const approvedExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi");
  const invoiceControl = buildInvoiceControlSummary(invoices);
  const creditBalance = creditRows.reduce((sum, row) => sum + Number(row.plan.balance || 0), 0);
  const overdueCredits = creditRows.filter((row) => row.paymentState.isOverdue);
  const totalStock = stockRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const availableStock = stockRows.reduce((sum, item) => sum + getAvailableQuantity(item), 0);
  const approvedPoAmount = (purchaseOrders || [])
    .filter((po) => po.status === "Təsdiq edildi")
    .reduce((sum, po) => sum + Number(po.amount || 0), 0);
  const payrollRows = buildHrEmployeeRecords(employees);
  const payrollCost = payrollRows.reduce((sum, employee) => sum + Number(employee.employerCost || 0), 0);
  const documentGaps = employees.filter((employee) => employee.documentReviewRequired || Number(employee.documentsComplete || 100) < 100);
  const cashInflow = total(cashEntries, "amount") + orders.reduce((sum, order) => sum + Number(order.paid || 0), 0);

  return [
    {
      module: "Satış",
      metric: money(total(orders, "amount")),
      count: `${orders.length} sifariş`,
      signal: openDeliveries.length > 0 ? `${openDeliveries.length} təhvil gözləyir` : "Bağlı axın",
      status: openDeliveries.length > 5 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Kredit",
      metric: money(creditBalance),
      count: `${creditRows.length} müqavilə`,
      signal: overdueCredits.length > 0 ? `${overdueCredits.length} gecikmə` : "Gecikmə yoxdur",
      status: overdueCredits.length > 0 ? "Risk" : "Hazır",
    },
    {
      module: "Anbar",
      metric: `${availableStock}/${totalStock}`,
      count: `${products.length} SKU`,
      signal: lowStockRows.length > 0 ? `${lowStockRows.length} minimum qalıq` : "Stok sağlam",
      status: lowStockRows.length > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Vendor / PO",
      metric: money(approvedPoAmount),
      count: `${(purchaseOrders || []).length} PO`,
      signal: openPos.length > 0 ? `${openPos.length} təsdiqdə` : `${vendors.length} vendor aktiv`,
      status: openPos.length > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Maliyyə",
      metric: money(cashInflow),
      count: `${expenses.length} xərc`,
      signal: pendingExpenses.length > 0 ? `${pendingExpenses.length} xərc təsdiqdə` : `${money(total(approvedExpenses, "amount"))} təsdiqli xərc`,
      status: pendingExpenses.length > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Faktura",
      metric: money(invoiceControl.openBalance),
      count: `${invoices.length} faktura`,
      signal: invoiceControl.overdueCount > 0 ? `${invoiceControl.overdueCount} gecikmiş faktura` : `${invoiceControl.ready} e-qaimə hazır`,
      status: invoiceControl.overdueCount > 0 || invoiceControl.openBalance > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "HR",
      metric: money(payrollCost),
      count: `${employees.length} əməkdaş`,
      signal: documentGaps.length > 0 ? `${documentGaps.length} sənəd açığı` : "Payroll hazır",
      status: documentGaps.length > 0 ? "Nəzarət" : "Hazır",
    },
  ];
}

function buildReportRiskRows({
  orders = [],
  credits = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  invoices = [],
}) {
  const riskRows = [];
  const stockRows = flattenWarehouseStock(warehouseStock);
  const productsByName = buildProductLookup(products);

  credits.forEach((credit) => {
    const plan = getCreditDisplayPlan(credit);
    const paymentState = getCreditPaymentState(credit, plan);
    if (!paymentState.isOverdue && !paymentState.isDueToday) return;
    riskRows.push({
      id: credit.id,
      area: "Kredit",
      title: credit.customer,
      amount: Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
      owner: credit.contractId || credit.orderId || "Kredit",
      action: paymentState.isOverdue ? `${paymentState.daysOverdue} gün gecikib` : "Bu gün ödəniş",
      priority: paymentState.isOverdue ? "Yüksək" : "Orta",
      status: paymentState.isOverdue ? "Gecikmə" : "Bu gün",
    });
  });

  orders
    .filter((order) => order.status !== "Təhvil verilib")
    .slice(0, 8)
    .forEach((order) => {
      riskRows.push({
        id: order.id,
        area: "Satış/Təhvil",
        title: order.customer,
        amount: getOrderBalance(order),
        owner: order.warehouseName || order.seller || "Anbar",
        action: summarizeOrderProducts(order),
        priority: "Orta",
        status: "Təhvil gözləyir",
      });
    });

  stockRows
    .filter((item) => isLowStockItem(item, productsByName))
    .slice(0, 10)
    .forEach((item) => {
      const reorderPoint = getReorderPoint(item, productsByName);
      riskRows.push({
        id: `${item.warehouseId}-${item.product}`,
        area: "Anbar",
        title: item.product,
        amount: getAvailableQuantity(item) * Number(item.price || 0),
        owner: item.warehouseName || item.warehouseId || "Anbar",
        action: `${getAvailableQuantity(item)} qalıq / min ${reorderPoint}`,
        priority: getAvailableQuantity(item) === 0 ? "Yüksək" : "Orta",
        status: "Minimum qalıq",
      });
    });

  (purchaseOrders || [])
    .filter(isPurchaseOrderOpen)
    .slice(0, 8)
    .forEach((po) => {
      riskRows.push({
        id: po.id,
        area: "Vendor / PO",
        title: po.product,
        amount: Number(po.amount || 0),
        owner: po.vendor,
        action: `${po.qty || 0} ədəd sifariş`,
        priority: po.status === "Təsdiq gözləyir" ? "Orta" : "Aşağı",
        status: po.status || "Açıq PO",
      });
    });

  expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir")
    .slice(0, 8)
    .forEach((expense) => {
      riskRows.push({
        id: expense.id,
        area: "Maliyyə",
        title: expense.description,
        amount: Number(expense.amount || 0),
        owner: expense.category,
        action: expense.cashImpact === false ? "Cash təsiri yoxdur" : "Təsdiq lazımdır",
        priority: Number(expense.amount || 0) >= 5000 ? "Yüksək" : "Orta",
        status: expense.status,
      });
    });

  invoices
    .filter((invoice) => Number(invoice.balance || 0) > 0)
    .slice(0, 8)
    .forEach((invoice) => {
      const bucket = getInvoiceAgingBucket(invoice);
      riskRows.push({
        id: invoice.id,
        area: "Faktura",
        title: invoice.customer,
        amount: Number(invoice.balance || 0),
        owner: invoice.orderId,
        action: bucket,
        priority: bucket.includes("30+") || bucket.includes("8-30") ? "Yüksək" : "Orta",
        status: invoice.status,
      });
    });

  employees
    .filter((employee) => employee.documentReviewRequired || Number(employee.documentsComplete || 100) < 100)
    .slice(0, 8)
    .forEach((employee) => {
      riskRows.push({
        id: getEmployeeKey(employee),
        area: "HR",
        title: employee.name,
        amount: Number(employee.salary || 0),
        owner: employee.department,
        action: `${Number(employee.documentsComplete || 0)}% sənəd`,
        priority: Number(employee.documentsComplete || 0) < 70 ? "Yüksək" : "Orta",
        status: employee.payrollStatus || employee.hrStatus || "Sənəd gözləyir",
      });
    });

  const priorityOrder = { "Yüksək": 0, Orta: 1, "Aşağı": 2 };
  return riskRows.sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      Number(b.amount || 0) - Number(a.amount || 0),
  );
}

function buildReportPackage({
  orders = [],
  credits = [],
  vendors = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  productionPlans = [],
  invoices = [],
  cashEntries = [],
}) {
  const moduleRows = buildReportModuleRows({
    orders,
    credits,
    vendors,
    employees,
    expenses,
    warehouseStock,
    products,
    purchaseOrders,
    invoices,
    cashEntries,
  });
  const riskRows = buildReportRiskRows({
    orders,
    credits,
    employees,
    expenses,
    warehouseStock,
    products,
    purchaseOrders,
    invoices,
  });
  const invoiceControl = buildInvoiceControlSummary(invoices);
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const criticalCount = riskRows.filter((row) => row.priority === "Yüksək").length;
  const warningCount = riskRows.filter((row) => row.priority === "Orta").length;
  const score = Math.max(0, Math.min(100, 100 - criticalCount * 12 - warningCount * 4));
  const rows =
    orders.length +
    credits.length +
    vendors.length +
    employees.length +
    expenses.length +
    products.length +
    (purchaseOrders || []).length +
    (productionPlans || []).length +
    invoices.length +
    cashEntries.length;

  return {
    period: currentBusinessDate.slice(0, 7),
    generatedAt: currentBusinessDate,
    rows,
    sections: moduleRows.length,
    score,
    riskCount: riskRows.length,
    criticalCount,
    revenue: total(orders, "amount"),
    creditBalance,
    invoiceBalance: invoiceControl.openBalance,
    moduleRows,
    riskRows,
    checklist: [
      { label: "Satış və kredit müqavilələri", status: credits.length > 0 || orders.length > 0 ? "Hazır" : "Məlumat yoxdur" },
      { label: "Anbar minimum qalıq siqnalları", status: moduleRows.find((row) => row.module === "Anbar")?.status || "Hazır" },
      { label: "Maliyyə təsdiq və faktura nəzarəti", status: invoiceControl.openBalance > 0 ? "Nəzarət" : "Hazır" },
      { label: "HR payroll və sənəd tamamlığı", status: moduleRows.find((row) => row.module === "HR")?.status || "Hazır" },
    ],
  };
}

function getInitials(value = "ERP") {
  const words = String(value || "ERP")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "E";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("az-AZ");
}

function getSupportThreadId(ticket) {
  return ticket.threadId || `MSG-${ticket.id}`;
}

function buildSupportMessageFromComment(comment) {
  return {
    from: comment.author || "Admin",
    text: comment.text,
    time: comment.at || "indi",
    mine: comment.mine !== false,
    commentId: comment.id,
  };
}

function buildSupportConversation(ticket, comment) {
  const firstMessage = buildSupportMessageFromComment(comment);
  const person = ticket.linkedLabel || ticket.customer || ticket.title || ticket.id;
  return {
    id: getSupportThreadId(ticket),
    type: "task",
    status: "Aktiv",
    ticketId: ticket.id,
    linkedType: ticket.linkedType,
    linkedId: ticket.linkedId,
    orderId: ticket.orderId,
    creditId: ticket.creditId,
    customerFin: ticket.fin,
    person,
    initials: getInitials(person),
    team: ticket.module || "Support",
    preview: firstMessage.text,
    time: firstMessage.time,
    unread: 0,
    participants: [ticket.owner || "Support", firstMessage.from].filter(Boolean),
    messages: [firstMessage],
  };
}

function normalizeMessageThread(conversation = {}) {
  const title = conversation.title || conversation.person || conversation.name || conversation.id || "Söhbət";
  const type = conversation.type || (conversation.ticketId ? "task" : (conversation.participants || []).length > 2 ? "group" : "direct");
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    ...conversation,
    title,
    person: conversation.person || title,
    type,
    status: conversation.archived || conversation.status === "Arxiv" ? "Arxiv" : "Aktiv",
    archived: Boolean(conversation.archived || conversation.status === "Arxiv"),
    initials: conversation.initials || getInitials(title),
    team: conversation.team || conversation.department || (type === "group" ? "Qrup" : "Daxili"),
    participants: Array.isArray(conversation.participants) ? conversation.participants : [],
    preview: conversation.preview || lastMessage?.text || "Mesaj yoxdur",
    time: conversation.time || lastMessage?.time || conversation.createdAt || "Yeni",
    unread: Number(conversation.unread || 0),
    messages,
  };
}

function buildMessageParticipantOptions(settings = {}, employees = []) {
  const users = (settings.users || []).map((user) => ({
    id: user.id,
    name: user.name || user.email || user.id,
    role: user.role || "İstifadəçi",
    team: user.role || "Sistem",
    source: "user",
  }));
  const staff = (employees || []).map((employee) => ({
    id: employee.id,
    name: employee.name || employee.fullName || employee.id,
    role: employee.position || employee.role || "Əməkdaş",
    team: employee.department || "HR",
    source: "employee",
  }));
  const byKey = new Map();

  [...users, ...staff]
    .filter((item) => item.id && item.name)
    .forEach((item) => {
      const key = normalize(`${item.source}-${item.id}-${item.name}`);
      if (!byKey.has(key)) byKey.set(key, item);
    });

  return [...byKey.values()];
}

function buildMessageContextOptions({ customers = [], orders = [], credits = [], tickets = [] } = {}) {
  const customerOptions = customers.slice(0, 60).map((customer) => ({
    type: "customer",
    id: customer.fin || customer.id,
    label: customer.name || customer.fin || customer.id,
    detail: customer.fin ? `Müştəri · FİN ${customer.fin}` : "Müştəri",
  }));
  const orderOptions = orders.slice(0, 60).map((order) => ({
    type: "order",
    id: order.id,
    label: order.id,
    detail: `${order.customer || order.customerName || "Sifariş"} · ${money(order.amount || order.total || order.totalAmount || 0)}`,
  }));
  const creditOptions = credits.slice(0, 60).map((credit) => ({
    type: "credit",
    id: credit.id,
    label: credit.contractId || credit.id,
    detail: `${credit.customer || "Kredit"} · qalıq ${money(credit.remaining || credit.balance || credit.amount || 0)}`,
  }));
  const ticketOptions = tickets.slice(0, 60).map((ticket) => ({
    type: "support",
    id: ticket.id,
    label: ticket.title || ticket.id,
    detail: `${ticket.module || "Support"} · ${ticket.status || "Aktiv"}`,
  }));

  return [
    { type: "", id: "", label: "Bağlantı yoxdur", detail: "Ümumi daxili yazışma" },
    ...customerOptions,
    ...orderOptions,
    ...creditOptions,
    ...ticketOptions,
  ];
}

function getMessageContextPayload(linkedType, linkedId, { customers = [], orders = [], credits = [], tickets = [] } = {}) {
  if (!linkedType || !linkedId) return {};

  if (linkedType === "customer") {
    const customer = customers.find((item) => item.fin === linkedId || item.id === linkedId);
    return {
      linkedType,
      linkedId,
      customerFin: customer?.fin || linkedId,
      linkedLabel: customer?.name || linkedId,
    };
  }

  if (linkedType === "order") {
    const order = orders.find((item) => item.id === linkedId);
    return {
      linkedType,
      linkedId,
      orderId: linkedId,
      customerFin: order?.fin,
      linkedLabel: order ? `${order.id} · ${order.customer || order.customerName || "Sifariş"}` : linkedId,
    };
  }

  if (linkedType === "credit") {
    const credit = credits.find((item) => item.id === linkedId || item.contractId === linkedId);
    return {
      linkedType,
      linkedId,
      creditId: credit?.id || linkedId,
      orderId: credit?.orderId,
      customerFin: credit?.fin,
      linkedLabel: credit?.contractId || credit?.id || linkedId,
    };
  }

  if (linkedType === "support") {
    const ticket = tickets.find((item) => item.id === linkedId);
    return {
      linkedType: ticket?.linkedType || "support",
      linkedId,
      ticketId: linkedId,
      orderId: ticket?.orderId,
      creditId: ticket?.creditId,
      customerFin: ticket?.fin,
      linkedLabel: ticket?.title || linkedId,
    };
  }

  return { linkedType, linkedId };
}

function upsertSupportConversation(conversations = [], ticket, comment) {
  const threadId = getSupportThreadId(ticket);
  const message = buildSupportMessageFromComment(comment);
  const existing = conversations.find((conversation) => conversation.id === threadId || conversation.ticketId === ticket.id);

  if (!existing) {
    return [buildSupportConversation(ticket, comment), ...(conversations || [])];
  }

  return conversations.map((conversation) =>
    conversation.id === existing.id
      ? {
          ...conversation,
          ticketId: ticket.id,
          linkedType: ticket.linkedType,
          linkedId: ticket.linkedId,
          orderId: ticket.orderId,
          creditId: ticket.creditId,
          customerFin: ticket.fin,
          preview: comment.text,
          time: comment.at || "indi",
          unread: 0,
          messages: [...(conversation.messages || []), message],
        }
      : conversation,
  );
}

function buildSupportTicketContext(ticket, { orders = [], credits = [], customers = [], conversations = [] }) {
  const order =
    orders.find((item) => item.id === ticket.orderId || (ticket.linkedType === "order" && item.id === ticket.linkedId)) ||
    orders.find((item) => item.creditId === ticket.creditId);
  const credit =
    credits.find((item) => item.id === ticket.creditId || (ticket.linkedType === "credit" && item.id === ticket.linkedId)) ||
    credits.find((item) => item.orderId === order?.id);
  const customer =
    customers.find((item) => item.fin === ticket.fin || item.fin === order?.fin || item.fin === credit?.fin) ||
    customers.find((item) => normalize(item.name) === normalize(ticket.customer || order?.customer || credit?.customer));
  const thread = conversations.find((conversation) => conversation.id === getSupportThreadId(ticket) || conversation.ticketId === ticket.id);
  const comments = Array.isArray(ticket.comments) ? ticket.comments : [];
  const linkedLabel =
    ticket.linkedLabel ||
    credit?.contractId ||
    order?.id ||
    customer?.name ||
    ticket.linkedId ||
    "Ümumi task";

  return {
    ...ticket,
    order,
    credit,
    customerRecord: customer,
    thread,
    comments,
    linkedLabel,
    commentCount: comments.length + (thread?.messages?.length || 0),
    latestComment: comments[comments.length - 1]?.text || thread?.preview || "Comment yoxdur",
  };
}

function getReceivableAgingBucket(days = 0) {
  const value = Math.max(0, Number(days || 0));
  if (value === 0) return "Cari";
  if (value <= 30) return "1-30 gün";
  if (value <= 60) return "31-60 gün";
  if (value <= 90) return "61-90 gün";
  return "90+ gün";
}

function getReceivableRiskCategory({ amount = 0, overdueDays = 0, type = "Debitor" }) {
  const value = Number(amount || 0);
  const days = Number(overdueDays || 0);
  if (value <= 0) return "Bağlı";
  if (days > 90 || value >= 10000) return "Kritik";
  if (days > 30 || value >= 5000) return "Yüksək";
  if (days > 0 || value >= 1500 || type === "Kreditor") return "Nəzarət";
  return "Sağlam";
}

function getReceivableCollectionStatus({ amount = 0, overdueDays = 0, type = "Debitor" }) {
  const value = Number(amount || 0);
  const days = Number(overdueDays || 0);
  if (value <= 0) return "Bağlandı";
  if (type === "Kreditor") return days > 0 ? "Ödəniş prioriteti" : "Ödəniş planı";
  if (days > 90) return "Hüquqi eskalasiya";
  if (days > 30) return "Eskalasiyada";
  if (days > 7) return "Kolleksiyada";
  if (days > 0) return "Xatırlatma";
  return "İzləmədə";
}

function getReceivableNextAction(row) {
  if (Number(row.amount || 0) <= 0) return "Arxivdə saxla";
  if (row.type === "Kreditor") {
    return Number(row.overdueDays || 0) > 0 ? "Vendor ödənişini bağla" : "Ödəniş tarixini təsdiqlə";
  }
  if (Number(row.overdueDays || 0) > 90) return "Hüquqi mərhələyə ötür";
  if (Number(row.overdueDays || 0) > 30) return "Menecer eskalasiyası";
  if (Number(row.overdueDays || 0) > 7) return "Kollektor zəngi";
  if (Number(row.overdueDays || 0) > 0) return "SMS xatırlatma";
  return "Planlı izləmə";
}

function buildReceivableAgingSummary(rows = []) {
  const buckets = ["Cari", "1-30 gün", "31-60 gün", "61-90 gün", "90+ gün"];
  return buckets.map((bucket) => {
    const bucketRows = rows.filter((row) => row.agingBucket === bucket);
    return {
      bucket,
      count: bucketRows.length,
      amount: bucketRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    };
  });
}

function enrichReceivableRow(row) {
  const agingBucket = getReceivableAgingBucket(row.overdueDays);
  const riskCategory = getReceivableRiskCategory(row);
  const collectionStatus = getReceivableCollectionStatus(row);
  return {
    ...row,
    agingBucket,
    riskCategory,
    collectionStatus,
    nextAction: getReceivableNextAction({ ...row, agingBucket, riskCategory, collectionStatus }),
  };
}

function buildReceivableRows({ customers = [], orders = [], credits = [], vendors = [], purchaseOrders = [] }) {
  const matchedCreditIds = new Set();

  const createCreditDebtRow = (credit, customer = null) => {
    const plan = getCreditDisplayPlan(credit);
    const balance = Number(plan.balance || 0);
    if (balance <= 0 || isCreditClosed(credit, plan)) return null;

    const paymentState = getCreditPaymentState(credit, plan);
    const relatedOrder = getCreditOrder(credit, orders);
    const device = credit.device || credit.product || relatedOrder?.products || "Cihaz qeyd edilməyib";

    return enrichReceivableRow({
      id: `DB-CR-${credit.id}`,
      type: "Debitor",
      party: customer?.name || credit.customer || "Müştəri qeyd edilməyib",
      source: credit.contractId || credit.id,
      sourceType: "credit",
      sourceTypeLabel: "Kredit müqaviləsi",
      amount: balance,
      orderBalance: 0,
      creditBalance: balance,
      customerDebt: 0,
      overdueDays: Number(paymentState.daysOverdue || 0),
      owner: credit.seller || relatedOrder?.sellerBonuses?.[0]?.seller || relatedOrder?.seller || "Kredit",
      status: paymentState.isOverdue ? "Gecikmə" : "Aktiv",
      detail: `${credit.id} · ${device} · ${plan.months} ay`,
      orderIds: credit.orderId ? [credit.orderId] : [],
      openOrderIds: [],
      creditIds: [credit.id],
      contractIds: [credit.contractId].filter(Boolean),
      closingMode: "cash-in",
    });
  };

  const customerRows = customers.flatMap((customer) => {
    const relatedOrders = getCustomerOrders(customer, orders);
    const relatedCredits = getCustomerRelatedCredits(customer, credits);
    const rows = [];
    const manualDebt = Math.max(0, Number(customer.debt || 0));

    if (manualDebt > 0) {
      rows.push(
        enrichReceivableRow({
          id: `DB-CUST-${customer.fin || normalize(customer.name)}`,
          type: "Debitor",
          party: customer.name,
          source: customer.fin || customer.name,
          sourceType: "manual",
          sourceTypeLabel: "Manual borc",
          amount: manualDebt,
          orderBalance: 0,
          creditBalance: 0,
          customerDebt: manualDebt,
          overdueDays: Number(customer.delay || 0),
          owner: "CRM",
          status: Number(customer.delay || 0) > 0 ? "Gecikmə" : "Aktiv",
          detail: "Müştəri kartındakı ayrıca borc",
          orderIds: [],
          openOrderIds: [],
          creditIds: [],
          contractIds: [],
          closingMode: "cash-in",
        }),
      );
    }

    relatedOrders
      .filter((order) => getOrderPaymentMethod(order) !== "Kredit" && !order.creditId)
      .forEach((order) => {
        const balance = getOrderBalance(order);
        if (balance <= 0) return;

        const dueDate = parsePaymentDate(order.dueDate) || addDays(order.date || currentBusinessDate, 7);
        const today = parsePaymentDate(currentBusinessDate);
        const overdueDays = dueDate && today ? Math.max(0, daysBetween(dueDate, today)) : 0;

        rows.push(
          enrichReceivableRow({
            id: `DB-ORD-${order.id}`,
            type: "Debitor",
            party: customer.name,
            source: order.id,
            sourceType: "order",
            sourceTypeLabel: "Nağd/qalıqlı sifariş",
            amount: balance,
            orderBalance: balance,
            creditBalance: 0,
            customerDebt: 0,
            overdueDays,
            owner: order.sellerBonuses?.[0]?.seller || order.seller || "Satış",
            status: overdueDays > 0 ? "Gecikmə" : "Aktiv",
            detail: `${order.id} · ${summarizeOrderProducts(order)}`,
            orderIds: [order.id],
            openOrderIds: [order.id],
            creditIds: [],
            contractIds: [],
            closingMode: "cash-in",
          }),
        );
      });

    relatedCredits.forEach((credit) => {
      matchedCreditIds.add(credit.id);
      const row = createCreditDebtRow(credit, customer);
      if (row) rows.push(row);
    });

    return rows;
  });

  const orphanCreditRows = credits
    .filter((credit) => !matchedCreditIds.has(credit.id))
    .map((credit) => createCreditDebtRow(credit))
    .filter(Boolean);

  const vendorRows = vendors.flatMap((vendor) => {
    const vendorPos = (purchaseOrders || []).filter((po) => po.vendor === vendor.name);
    const payablePos = vendorPos.filter((po) => {
      const status = normalize(po.status);
      return !status.includes("ödən") && !status.includes("oden") && !status.includes("imtina") && !status.includes("cancel");
    });
    const pendingAmount = vendorPos
      .filter((po) => {
        const status = normalize(po.status);
        return !status.includes("ödən") && !status.includes("oden") && !status.includes("imtina") && !status.includes("cancel");
      })
      .reduce((sum, po) => sum + Number(po.amount || 0), 0);
    const latestPo = vendorPos[0];
    const today = parsePaymentDate(currentBusinessDate);
    const overdueDays = Math.max(
      vendor.status !== "Aktiv" && pendingAmount > 0 ? 5 : 0,
      ...payablePos.map((po) => {
        const dueDate = parsePaymentDate(po.paymentDueDate || po.expectedAt) || addDays(po.date || currentBusinessDate, 30);
        return dueDate && today ? Math.max(0, daysBetween(dueDate, today)) : 0;
      }),
    );

    if (pendingAmount <= 0) return [];

    return [
      enrichReceivableRow({
      id: `CR-${vendor.name}`,
      type: "Kreditor",
      party: vendor.name,
      source: vendor.country,
      sourceType: "vendor",
      sourceTypeLabel: "Vendor/PO",
      amount: pendingAmount,
      overdueDays,
      owner: "Vendor/Maliyyə",
      status: pendingAmount > 0 ? "Ödəniş gözləyir" : vendor.status,
      detail: latestPo ? `${vendorPos.length} PO · son: ${latestPo.id}` : `${vendor.sku} SKU · PO yoxdur`,
      poIds: payablePos.map((po) => po.id),
      closingMode: "cash-out",
      }),
    ];
  });

  return [...customerRows, ...orphanCreditRows, ...vendorRows].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
}

function buildProjectPortfolioSource(projects = [], orders = [], expenses = [], products = []) {
  if ((projects || []).length > 0) return projects;
  if ((orders || []).length === 0 && (expenses || []).length === 0) return [];

  const linkedProducts = [
    ...new Set(
      orders.flatMap((order) => (order.productLines || []).map((line) => line.product).filter(Boolean)),
    ),
  ].slice(0, 8);
  const expenseCategories = [...new Set((expenses || []).map((expense) => expense.category).filter(Boolean))].slice(0, 8);
  const revenue = total(orders, "amount");
  const catalogCostBase = orders.reduce(
    (sum, order) =>
      sum +
      (order.productLines || []).reduce((lineSum, line) => {
        const product = products.find((item) => normalize(item.name) === normalize(line.product));
        return lineSum + Number(line.qty || 0) * Number(product?.costPrice || Math.round(Number(line.price || 0) * 0.68));
      }, 0),
    0,
  );
  const budget = Math.max(revenue || 0, catalogCostBase + total(expenses, "amount"));

  return [
    {
      id: `AUTO-ROI-${currentBusinessDate.slice(0, 7)}`,
      name: "Avtomatik satış layihəsi",
      owner: "Satış/Maliyyə",
      start: orders[orders.length - 1]?.date || currentBusinessDate,
      end: currentBusinessDate,
      budget,
      linkedProducts,
      expenseCategories,
      status: "Avtomatik",
      autoGenerated: true,
    },
  ];
}

function isDateWithinProject(dateValue, project) {
  const date = parsePaymentDate(dateValue);
  const start = parsePaymentDate(project.start);
  const end = parsePaymentDate(project.end);
  if (!date) return true;
  if (start && daysBetween(date, start) > 0) return false;
  if (end && daysBetween(end, date) > 0) return false;
  return true;
}

function getProjectOrderCost(order, productsByName = new Map()) {
  const lines = Array.isArray(order.productLines) ? order.productLines : [];
  const lineCost = lines.reduce((sum, line) => {
    const product = productsByName.get(normalize(line.product));
    const unitCost = Number(product?.costPrice || Math.round(Number(line.price || 0) * 0.68));
    return sum + Number(line.qty || 0) * unitCost;
  }, 0);
  return Math.round(lineCost || Number(order.amount || 0) * 0.68);
}

function buildProjectRoiRows({ projects, orders, expenses, products = [] }) {
  const portfolio = buildProjectPortfolioSource(projects, orders, expenses, products);
  const productsByName = buildProductLookup(products);

  return portfolio.map((project) => {
    const linkedProducts = new Set(project.linkedProducts || []);
    const linkedCategories = new Set(project.expenseCategories || []);
    const projectOrders = orders.filter((order) => {
      const productMatch =
        linkedProducts.size === 0 ||
        (order.productLines || []).some((line) => linkedProducts.has(line.product));
      return productMatch && isDateWithinProject(order.date, project);
    });
    const matchedExpenses = expenses.filter((expense) => {
      const categoryMatch = linkedCategories.size === 0 || linkedCategories.has(expense.category);
      const explicitMatch = expense.projectId === project.id || normalize(expense.description).includes(normalize(project.name));
      return (categoryMatch || explicitMatch) && isDateWithinProject(expense.date, project);
    });
    const approvedExpenses = matchedExpenses.filter((expense) => expense.status === "Təsdiq edildi");
    const pendingExpenses = matchedExpenses.filter((expense) => expense.status !== "Təsdiq edildi");
    const revenue = projectOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    const collected = projectOrders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
    const productCost = projectOrders.reduce((sum, order) => sum + getProjectOrderCost(order, productsByName), 0);
    const approvedExpenseCost = total(approvedExpenses, "amount");
    const pendingExpenseCost = total(pendingExpenses, "amount");
    const totalCost = productCost + approvedExpenseCost;
    const committedCost = totalCost + pendingExpenseCost;
    const profit = revenue - totalCost;
    const projectedProfit = revenue - committedCost;
    const investmentBase = Number(project.budget || committedCost || totalCost || revenue || 1);
    const roi = investmentBase > 0 ? (profit / investmentBase) * 100 : 0;
    const budgetUsage = Number(project.budget || 0) > 0 ? (committedCost / Number(project.budget || 1)) * 100 : 0;
    const collectionRate = revenue > 0 ? (collected / revenue) * 100 : 0;
    const status =
      profit < 0 || projectedProfit < 0
        ? "Risk"
        : collectionRate < 50 && revenue > 0
          ? "Yığım riski"
          : budgetUsage > 100
            ? "Büdcə aşımı"
            : roi >= 45
              ? "Yüksək ROI"
              : roi >= 15
                ? "Aktiv"
                : project.status || "Nəzarət";

    return {
      ...project,
      orders: projectOrders.length,
      orderIds: projectOrders.map((order) => order.id),
      revenue,
      collected,
      productCost,
      approvedExpenseCost,
      pendingExpenseCost,
      totalCost,
      committedCost,
      profit,
      projectedProfit,
      roi,
      budgetUsage,
      collectionRate,
      investmentBase,
      expenseCount: matchedExpenses.length,
      reportStatus: project.lastExportAt ? "Export olunub" : "Export gözləyir",
      nextAction: status === "Risk" || status === "Büdcə aşımı" ? "Xərci yoxla" : status === "Yığım riski" ? "Yığımı sürətləndir" : "Hesabat hazır",
      status,
    };
  });
}


function ensureNotificationProviders(providers = []) {
  const storedById = new Map((providers || []).map((provider) => [provider.id, provider]));
  const defaults = initialState.notificationProviders || [];
  const merged = defaults.map((provider) => ({
    ...provider,
    ...(storedById.get(provider.id) || {}),
  }));
  const knownIds = new Set(merged.map((provider) => provider.id));
  return [...merged, ...(providers || []).filter((provider) => !knownIds.has(provider.id))];
}

function ensureNotificationRules(rules = []) {
  const storedById = new Map((rules || []).map((rule) => [rule.id, rule]));
  const defaults = initialState.notificationRules || [];
  const merged = defaults.map((rule) => ({
    ...rule,
    ...(storedById.get(rule.id) || {}),
  }));
  const knownIds = new Set(merged.map((rule) => rule.id));
  return [...merged, ...(rules || []).filter((rule) => !knownIds.has(rule.id))];
}

function getNotificationChannelEnabled(channel, settings = {}) {
  const key = normalize(channel);
  const toggles = settings.toggles || {};
  if (key.includes("sms")) return toggles.sms !== false;
  if (key.includes("email")) return toggles.email === true;
  if (key.includes("push")) return toggles.push !== false;
  return true;
}

function renderNotificationTemplate(template = "", values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function getNotificationEventKey(rule = {}, event = {}) {
  return [
    rule.id || "RULE",
    event.entityId || event.id || event.target || event.recipient || "EVENT",
  ].join(":");
}

function getNotificationLogTime(log = {}) {
  const iso = Date.parse(log.sentAtIso || "");
  if (!Number.isNaN(iso)) return iso;
  const fallback = Date.parse(log.sentAt || "");
  return Number.isNaN(fallback) ? 0 : fallback;
}

function splitNotificationEventsByCooldown(rule = {}, events = [], sendLog = [], now = new Date()) {
  const cooldownMs = Math.max(0, Number(rule.cooldownHours || 0)) * 60 * 60 * 1000;
  const ready = [];
  const held = [];

  events.forEach((event) => {
    const dedupeKey = getNotificationEventKey(rule, event);
    const enriched = { ...event, dedupeKey };
    const recentLog = (sendLog || []).find(
      (log) => log.dedupeKey === dedupeKey || (log.ruleId === rule.id && log.entityId === event.entityId),
    );
    const coolingDown = Boolean(cooldownMs > 0 && recentLog && now.getTime() - getNotificationLogTime(recentLog) < cooldownMs);

    if (coolingDown) {
      held.push({
        ...enriched,
        heldReason: `${rule.cooldownHours || 0} saat cooldown`,
        lastSentAt: recentLog.sentAt || recentLog.sentAtIso || "",
      });
      return;
    }

    ready.push(enriched);
  });

  return { ready, held };
}

function getCreditPaymentLeadDays(paymentState) {
  const today = parsePaymentDate(baseCreditDate);
  const dueDate = paymentState?.dueDate;
  if (!today || !dueDate) return null;
  return daysBetween(today, dueDate);
}

function buildNotificationProviderRows(providers = [], settings = {}, sendLog = []) {
  return ensureNotificationProviders(providers).map((provider) => {
    const enabled = getNotificationChannelEnabled(provider.channel, settings);
    const rows = sendLog.filter((log) => log.providerId === provider.id);
    const failures = rows.filter((log) => normalize(log.status).includes("uğursuz") || normalize(log.status).includes("blok")).length;
    return {
      ...provider,
      enabled,
      sentCount: rows.filter((log) => normalize(log.status).includes("göndərildi")).length,
      failureCount: failures,
      lastSentAt: rows[0]?.sentAt || provider.lastSentAt || "",
      health: !enabled ? "Kanal bağlıdır" : provider.status === "Aktiv" && failures === 0 ? "Hazır" : provider.status,
    };
  });
}

function buildNotificationEvent(rule, values = {}) {
  return {
    id: values.id || `${rule.id}-${values.entityId || Date.now()}`,
    entityId: values.entityId || "",
    dedupeKey: values.dedupeKey || "",
    recipient: values.recipient || values.customer || values.owner || "Daxili komanda",
    target: values.target || values.phone || values.email || "internal",
    subject: values.subject || rule.name,
    body: renderNotificationTemplate(rule.template, values) || values.body || rule.trigger,
    amount: Number(values.amount || 0),
    module: values.module || "notifications",
    dueDate: values.dueDate || "",
    context: values.context || values.contractId || values.orderId || values.poId || values.product || "",
    actionTarget: values.actionTarget || "",
    priority: values.priority || "Orta",
  };
}

function buildNotificationRuleEvents(rule, { credits = [], stock = [], warehouseStock = {}, products = [], purchaseOrders = [], expenses = [], orders = [] }) {
  const productsByName = buildProductLookup(products);
  const stockSource = [...(stock || []), ...flattenWarehouseStock(warehouseStock || {})];

  if (rule.id === "RULE-CREDIT-OVERDUE") {
    return credits
      .map((credit) => {
        const plan = getCreditDisplayPlan(credit);
        return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
      })
      .filter((item) => item.paymentState.isOverdue || item.paymentState.isDueToday)
      .map((item) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${item.credit.id}`,
          entityId: item.credit.id,
          customer: item.credit.customer,
          recipient: item.credit.customer,
          target: item.credit.phone || item.credit.fin || item.credit.customer,
          contractId: item.credit.contractId || item.credit.id,
          amount: item.paymentState.nextInstallment?.amount || item.plan.monthly,
          dueDate: item.paymentState.nextInstallment?.due || item.credit.next,
          status: item.paymentState.isOverdue ? `${item.paymentState.daysOverdue} gün gecikib` : "bu gün ödənilməlidir",
          context: `${item.credit.contractId || item.credit.id} · ${item.credit.device || item.credit.product || "Cihaz"}`,
          actionTarget: item.credit.id,
          module: "credits",
          priority: item.paymentState.isOverdue ? "Yüksək" : "Orta",
        }),
      );
  }

  if (rule.id === "RULE-CREDIT-UPCOMING") {
    return credits
      .map((credit) => {
        const plan = getCreditDisplayPlan(credit);
        const paymentState = getCreditPaymentState(credit, plan);
        return { credit, plan, paymentState, leadDays: getCreditPaymentLeadDays(paymentState) };
      })
      .filter((item) => Number(item.leadDays || 0) >= 1 && Number(item.leadDays || 0) <= 3)
      .map((item) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${item.credit.id}`,
          entityId: item.credit.id,
          customer: item.credit.customer,
          recipient: item.credit.customer,
          target: item.credit.phone || item.credit.fin || item.credit.customer,
          contractId: item.credit.contractId || item.credit.id,
          amount: item.paymentState.nextInstallment?.amount || item.plan.monthly,
          dueDate: item.paymentState.nextInstallment?.due || item.credit.next,
          leadDays: item.leadDays,
          context: `${item.credit.contractId || item.credit.id} · ${item.credit.device || item.credit.product || "Cihaz"}`,
          actionTarget: item.credit.id,
          module: "credits",
          priority: Number(item.leadDays) <= 1 ? "Yüksək" : "Orta",
        }),
      );
  }

  if (rule.id === "RULE-LOW-STOCK") {
    return stockSource
      .filter((item) => isLowStockItem(item, productsByName))
      .map((item) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${normalize(item.product)}`,
          entityId: item.product,
          recipient: "Anbar",
          target: "warehouse-team",
          product: item.product,
          available: getAvailableQuantity(item),
          module: "warehouse",
          priority: "Yüksək",
        }),
      );
  }

  if (rule.id === "RULE-PO-APPROVAL") {
    return (purchaseOrders || [])
      .filter((po) => normalize(po.status).includes("gözl"))
      .map((po) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${po.id}`,
          entityId: po.id,
          recipient: po.vendor || "Satınalma",
          target: po.vendor || "procurement",
          poId: po.id,
          amount: po.amount,
          module: "vendors",
          priority: Number(po.amount || 0) >= 5000 ? "Yüksək" : "Orta",
        }),
      );
  }

  if (rule.id === "RULE-PAYROLL") {
    return expenses
      .filter((expense) => expense.source === "HR Payroll" && normalize(expense.status).includes("gözl"))
      .map((expense) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${expense.id}`,
          entityId: expense.id,
          recipient: "HR/Maliyyə",
          target: "finance-team",
          amount: expense.amount,
          module: "finance",
          priority: "Orta",
        }),
      );
  }

  if (rule.id === "RULE-DELIVERY-SLA") {
    return orders
      .filter((order) => order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 5)
      .map((order) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${order.id}`,
          entityId: order.id,
          recipient: order.customer || "Təhvil komandası",
          target: order.fin || order.customer,
          orderId: order.id,
          module: "deliveries",
          priority: "Yüksək",
        }),
      );
  }

  return [];
}

function buildNotificationAutomationRows({ notificationRules, providers = [], settings = {}, sendLog = [], credits, stock, warehouseStock = {}, products = [], purchaseOrders, expenses, orders }) {
  const providerRows = buildNotificationProviderRows(providers, settings, sendLog);
  const providerById = new Map(providerRows.map((provider) => [provider.id, provider]));
  const productsByName = buildProductLookup(products);
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const dueSoonCredits = credits.filter((credit) => {
    const paymentState = getCreditPaymentState(credit, getCreditDisplayPlan(credit));
    const leadDays = getCreditPaymentLeadDays(paymentState);
    return Number(leadDays || 0) >= 1 && Number(leadDays || 0) <= 3;
  });
  const stockSource = [...(stock || []), ...flattenWarehouseStock(warehouseStock || {})];
  const lowStock = stockSource.filter((item) => isLowStockItem(item, productsByName));
  const pendingPo = (purchaseOrders || []).filter((po) => po.status === "Təsdiq gözləyir");
  const pendingPayroll = expenses.filter((expense) => expense.source === "HR Payroll" && expense.status === "Təsdiq gözləyir");
  const lateDeliveries = orders.filter((order) => order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 5);
  const now = new Date();

  const queueByRule = {
    "RULE-CREDIT-OVERDUE": {
      count: overdueCredits.length,
      event: overdueCredits[0]?.customer || "Gecikmə yoxdur",
    },
    "RULE-CREDIT-UPCOMING": {
      count: dueSoonCredits.length,
      event: dueSoonCredits[0]?.customer || "Yaxınlaşan ödəniş yoxdur",
    },
    "RULE-LOW-STOCK": {
      count: lowStock.length,
      event: lowStock[0]?.product || "Stok normaldır",
    },
    "RULE-PO-APPROVAL": {
      count: pendingPo.length,
      event: pendingPo[0]?.id || "PO növbəsi boşdur",
    },
    "RULE-PAYROLL": {
      count: pendingPayroll.length,
      event: pendingPayroll[0] ? money(pendingPayroll[0].amount) : "Payroll təsdiqdə deyil",
    },
    "RULE-DELIVERY-SLA": {
      count: lateDeliveries.length,
      event: lateDeliveries[0]?.id || "Təhvil SLA riski yoxdur",
    },
  };

  return ensureNotificationRules(notificationRules).map((rule) => {
    const allEvents = buildNotificationRuleEvents(rule, { credits, stock, warehouseStock, products, purchaseOrders, expenses, orders });
    const { ready: events, held: cooldownEvents } = splitNotificationEventsByCooldown(rule, allEvents, sendLog, now);
    const provider = providerById.get(rule.providerId) || providerRows.find((item) => item.channel === rule.channel);
    const channelEnabled = getNotificationChannelEnabled(rule.channel, settings);
    const lastLog = sendLog.find((log) => log.ruleId === rule.id);
    const queueCount = events.length;
    const totalEventCount = allEvents.length || queueByRule[rule.id]?.count || 0;

    return {
      ...rule,
      provider,
      providerName: provider?.name || "Provider seçilməyib",
      queueCount,
      totalEventCount,
      cooldownCount: cooldownEvents.length,
      events,
      cooldownEvents,
      lastEvent: events[0]?.recipient || cooldownEvents[0]?.recipient || queueByRule[rule.id]?.event || "Siqnal yoxdur",
      lastRunAt: lastLog?.sentAt || rule.lastRunAt || "",
      sentCount: Number(rule.sentCount || 0),
      health:
        rule.status !== "Aktiv"
          ? rule.status
          : !channelEnabled
            ? "Kanal bağlıdır"
            : !provider || provider.status !== "Aktiv"
              ? "Provider hazır deyil"
              : queueCount > 0
                ? "Göndəriş hazırdır"
                : cooldownEvents.length > 0
                  ? "Cooldown-da saxlanıb"
                : "Növbə boşdur",
    };
  });
}

function createNotificationSendLogEntry({ rule = {}, event = {}, provider = {}, stamp, status = "Göndərildi", source = "Avtomatik" }) {
  const channel = rule.channel || provider.channel || event.channel || "Push";
  const sentAtIso = new Date().toISOString();
  return {
    id: `NTF-${Date.now()}-${String(Math.random()).slice(2, 6)}`,
    ruleId: rule.id || "MANUAL",
    ruleName: rule.name || "Manual göndəriş",
    dedupeKey: event.dedupeKey || getNotificationEventKey(rule, event),
    providerId: provider.id || rule.providerId || "",
    providerName: provider.name || "Provider seçilməyib",
    channel,
    source,
    recipient: event.recipient || event.target || "Daxili komanda",
    target: event.target || event.recipient || "internal",
    entityId: event.entityId || "",
    module: event.module || "notifications",
    subject: event.subject || rule.name || "Bildiriş",
    body: event.body || rule.template || "",
    amount: Number(event.amount || 0),
    dueDate: event.dueDate || "",
    context: event.context || "",
    actionTarget: event.actionTarget || "",
    priority: event.priority || "Orta",
    status,
    sentAt: stamp || new Date().toLocaleString("az-AZ"),
    sentAtIso,
  };
}

function buildNotificationDeliveriesForRules({ rules = [], providerRows = [], settings = {}, stamp, source = "Avtomatik qayda" }) {
  return rules.flatMap((rule) => {
    const provider =
      providerRows.find((item) => item.id === rule.providerId) ||
      providerRows.find((item) => item.channel === rule.channel) ||
      {};
    const channelEnabled = getNotificationChannelEnabled(rule.channel, settings);
    const status = !channelEnabled || provider.status !== "Aktiv" ? "Bloklandı" : "Göndərildi";

    return (rule.events || []).map((event) =>
      createNotificationSendLogEntry({
        rule,
        event,
        provider,
        stamp,
        status,
        source,
      }),
    );
  });
}

function buildProductionPlanRows(productionPlans, stock, warehouseStock = {}, products = [], warehouses = []) {
  const aggregateStockByProduct = new Map((stock || []).map((item) => [item.product, item]));
  const productsByName = buildProductLookup(products);
  const warehouseById = new Map((warehouses || []).map((warehouse) => [warehouse.id, warehouse]));

  return (productionPlans || []).map((plan) => {
    const completed = normalize(plan.status).includes("istehsal edildi");
    const warehouseId =
      plan.warehouseId ||
      Object.entries(warehouseStock || {}).find(([, rows]) =>
        (rows || []).some((row) => (plan.materials || []).some((material) => material.product === row.product)),
      )?.[0] ||
      warehouses[0]?.id ||
      "";
    const warehouseRows = warehouseStock?.[warehouseId] || [];
    const sourceRows = warehouseRows.length > 0 ? warehouseRows : stock || [];
    const sourceByProduct = new Map(sourceRows.map((item) => [item.product, item]));
    const issuedByProduct = new Map((plan.issuedMaterials || []).map((item) => [item.product, item]));

    const materials = (plan.materials || []).map((material) => {
      const stockItem = sourceByProduct.get(material.product) || aggregateStockByProduct.get(material.product);
      const product = productsByName.get(normalize(material.product));
      const issued = issuedByProduct.get(material.product);
      const available = stockItem ? getAvailableQuantity(stockItem) : 0;
      const needed = Number(material.needed ?? Number(material.qty || 0) * Number(plan.plannedQty || 0));
      const configuredCost = issued?.unitCost ?? material.unitCost ?? product?.costPrice;
      const unitCost = Number(configuredCost || stockItem?.costPrice || stockItem?.price || product?.salePrice || 0);
      const cost = Math.round(Number(issued?.cost ?? material.cost ?? needed * unitCost));

      return {
        ...material,
        needed,
        available,
        availableAfter: completed ? issued?.availableAfter ?? available : available,
        unitPrice: unitCost,
        unitCost,
        cost,
        enough: completed || available >= needed,
      };
    });
    const materialCost = Number(plan.actualMaterialCost ?? materials.reduce((sum, material) => sum + Number(material.cost || 0), 0));
    const totalCost = Number(plan.actualTotalCost ?? materialCost + Number(plan.laborCost || 0) + Number(plan.overheadCost || 0));
    const unitCost = Number(plan.actualUnitCost ?? (Number(plan.plannedQty || 0) > 0 ? Math.round(totalCost / Number(plan.plannedQty || 1)) : 0));
    const projectedRevenue = Number(plan.salePrice || 0) * Number(plan.plannedQty || 0);
    const projectedProfit = projectedRevenue - totalCost;
    const bottleneck = completed ? null : materials.find((material) => !material.enough);
    const producedQty = Number(plan.producedQty || (completed ? plan.plannedQty : 0) || 0);

    return {
      ...plan,
      warehouseId,
      warehouseName: warehouseById.get(warehouseId)?.name || plan.warehouseName || "Anbar seçilməyib",
      materials,
      materialCost,
      totalCost,
      unitCost,
      projectedRevenue,
      projectedProfit,
      producedQty,
      margin: projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0,
      bottleneck: bottleneck?.product || (completed ? "İstehsal bağlandı" : "Xammal kifayətdir"),
      canProduce: !completed && !bottleneck && Number(plan.plannedQty || 0) > 0,
      issueStatus: completed ? "Xammal çıxıldı" : bottleneck ? "Xammal çatmır" : "Çıxışa hazır",
      receiptStatus: completed ? `${producedQty} hazır məhsul mədaxil` : "Mədaxil gözləyir",
      status: completed ? "İstehsal edildi" : bottleneck ? "Xammal riski" : plan.status || "Planlandı",
    };
  });
}

function buildOnboardingRows(onboarding = {}, snapshot = {}) {
  const warehouseStockRows = Object.values(snapshot.warehouseStock || {}).flatMap((rows) => rows || []);
  const creditRecords = buildAllCreditRecords(snapshot.orders || [], snapshot.credits || []);
  const payrollReady = (snapshot.expenses || []).some((expense) => expense.source === "HR Payroll");
  const reportReady = (snapshot.reportExports || []).length > 0;
  const backupReady = Boolean(snapshot.integritySnapshot || snapshot.goLiveSnapshot);
  const checks = {
    "ONB-1": Boolean(snapshot.settings?.company && snapshot.settings?.voen),
    "ONB-2": (snapshot.warehouses || []).length > 0,
    "ONB-3": (snapshot.products || []).length > 0 && warehouseStockRows.some((item) => Number(item.total || 0) > 0),
    "ONB-4": (snapshot.settings?.users || []).length > 1 || (snapshot.settings?.roles || []).length > 0,
    "ONB-5": (snapshot.financeAccounts || []).length > 0,
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
    { id: "ONB-8", title: "Vendor və PO axını", owner: "Procurement", module: "vendors", detail: "Vendor, minimum stok və PO təsdiq/mədaxil axını hazırlanır." },
    { id: "ONB-9", title: "Hesabat və analitika export", owner: "Rəhbərlik", module: "reports", detail: "Executive hesabat, ROI və audit snapshot-ları export edilir." },
    { id: "ONB-10", title: "Backup və go-live yoxlaması", owner: "Administrator", module: "settings", detail: "Integrity, backup və go-live readiness yoxlaması saxlanılır." },
  ];
  const storedById = new Map((onboarding.steps || []).map((step) => [step.id, step]));
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

function buildHelpModuleGuides({ moduleReadiness = { items: [] }, onboardingRows = { steps: [] } }) {
  const readinessByModule = new Map((moduleReadiness.items || []).map((item) => [item.module, item]));
  const onboardingByModule = new Map((onboardingRows.steps || []).map((step) => [step.module, step]));

  return navItems
    .filter((item) => !["dashboard", "messages", "notifications"].includes(item.id))
    .map((item) => {
      const meta = pageMeta[item.id] || {};
      const readiness = readinessByModule.get(item.id);
      const onboarding = onboardingByModule.get(item.id);
      const permission = getPageActionPermission(item.id) || navPermissionByType[item.id] || "Oxunuş";
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

function buildHelpArticles(articles = [], moduleGuides = [], onboardingRows = { steps: [] }) {
  const generated = [
    {
      id: "HELP-START",
      title: "Sistemi real istifadəyə necə başlatmaq olar",
      category: "Onboarding",
      answer: "Ayarlar, anbar, məhsul, rol, maliyyə, HR, satış/kredit, vendor, hesabat və backup addımlarını ardıcıl tamamlayın.",
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

function getOrderBalance(order) {
  return Math.max(0, Number(order.amount || 0) - Number(order.paid || 0));
}

function getOrderBonusAmount(order) {
  const paid = Number(order.paid || 0);
  return Math.round(
    getOrderSellerBonuses(order).reduce((sum, sellerBonus) => sum + (paid * Number(sellerBonus.bonus || 0)) / 100, 0),
  );
}

function getOrderDeliveryStatus(order) {
  if (order.status === "Təhvil verilib") return "Təhvil verilib";
  return order.deliveryStatus || "Təhvil gözləyir";
}

function getOrderPaymentMethod(order) {
  return order.paymentMethod || (getOrderBalance(order) > 0 ? "Qalıqlı" : "Nağd");
}

function normalizeOrderProductLines(rows = []) {
  return rows
    .filter((row) => row?.product)
    .map((row) => ({
      product: String(row.product || "").trim(),
      qty: Math.max(1, Math.round(Number(row.qty || 1))),
      price: Math.max(0, Number(row.price || 0)),
      serials: Array.isArray(row.serials) ? row.serials.filter(Boolean) : [],
    }));
}

export function isDeliveryQueueOrder(order) {
  return Boolean(
    order &&
      order.status !== "Təhvil verilib" &&
      Array.isArray(order.productLines) &&
      normalizeOrderProductLines(order.productLines).length > 0,
  );
}

function getDeliveryDisplayStage(order) {
  if (order?.status === "Təhvil verilib") return "Təhvil verildi";
  return "Anbarda";
}

function getDeliveryTotalQuantity(order) {
  return normalizeOrderProductLines(order?.productLines || []).reduce((sum, line) => sum + Number(line.qty || 0), 0);
}

export function getDeliveredQuantities(order) {
  const raw = order?.deliveredQuantities;
  const map = new Map();
  if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([product, qty]) => {
      map.set(String(product), Math.max(0, Number(qty || 0)));
    });
  }
  return map;
}

// Qismən təhvil planı: hər sətir üçün nə qədəri anbardan verilə bilər, nə qədəri backorder qalır.
export function getDeliveryPlan(order, warehouseStock = {}) {
  const productLines = normalizeOrderProductLines(order?.productLines || []);
  const warehouseId = order?.warehouseId;
  const rows = (warehouseId && warehouseStock?.[warehouseId]) || [];
  const deliveredMap = getDeliveredQuantities(order);
  const stockLeft = new Map();

  const lines = productLines.map((line) => {
    const ordered = Number(line.qty || 0);
    const delivered = Math.min(ordered, deliveredMap.get(line.product) || 0);
    const remaining = Math.max(0, ordered - delivered);
    const item = rows.find((row) => row.product === line.product);
    if (!stockLeft.has(line.product)) {
      stockLeft.set(line.product, Math.max(0, Number(item?.total || 0)));
    }
    const physical = stockLeft.get(line.product);
    const deliverable = Math.max(0, Math.min(remaining, physical));
    stockLeft.set(line.product, physical - deliverable);
    return {
      product: line.product,
      price: Number(line.price || 0),
      ordered,
      delivered,
      remaining,
      physical,
      deliverable,
      shortage: Math.max(0, remaining - deliverable),
      hasStockRow: Boolean(item),
    };
  });

  const orderedTotal = lines.reduce((sum, line) => sum + line.ordered, 0);
  const deliveredTotal = lines.reduce((sum, line) => sum + line.delivered, 0);
  const remainingTotal = lines.reduce((sum, line) => sum + line.remaining, 0);
  const deliverableTotal = lines.reduce((sum, line) => sum + line.deliverable, 0);
  const shortageTotal = lines.reduce((sum, line) => sum + line.shortage, 0);

  return {
    lines,
    orderedTotal,
    deliveredTotal,
    remainingTotal,
    deliverableTotal,
    shortageTotal,
    partial: deliverableTotal > 0 && shortageTotal > 0,
    complete: remainingTotal === 0,
  };
}

export function getDeliveryStockCheck(order, warehouseStock = {}) {
  if (!order) {
    return { ok: false, status: "Sifariş yoxdur", reason: "Sifariş tapılmadı.", issues: [] };
  }

  if (order.status === "Təhvil verilib") {
    return { ok: false, status: "Təhvil verilib", reason: "Bu sifariş artıq təhvil verilib.", issues: [], plan: null };
  }

  const productLines = normalizeOrderProductLines(order.productLines || []);
  if (productLines.length === 0) {
    return { ok: false, status: "Məhsul yoxdur", reason: "Sifarişdə təhvil veriləcək məhsul yoxdur.", issues: [] };
  }

  const warehouseId = order.warehouseId;
  if (!warehouseId) {
    return { ok: false, status: "Anbar seçilməyib", reason: "Sifariş üçün anbar seçilməyib.", issues: [] };
  }

  const plan = getDeliveryPlan({ ...order, warehouseId }, warehouseStock);

  if (plan.remainingTotal === 0) {
    return { ok: false, status: "Təhvil verilib", reason: "Sifarişin bütün məhsulları təhvil verilib.", issues: [], plan };
  }

  const issues = plan.lines
    .filter((line) => line.shortage > 0)
    .map(
      (line) =>
        `${line.product}: anbarda ${line.deliverable}/${line.remaining} ədəd var — ${line.shortage} ədəd təchizat gözlənilir (backorder)`,
    );

  if (plan.deliverableTotal === 0) {
    return {
      ok: false,
      status: "Çatışmazlıq (backorder)",
      reason: issues[0] || "Anbarda təhvil üçün qalıq yoxdur.",
      issues,
      plan,
    };
  }

  if (plan.shortageTotal > 0) {
    return {
      ok: true,
      partial: true,
      status: "Qismən təhvilə hazır",
      reason: `${plan.deliverableTotal}/${plan.remainingTotal} ədəd indi təhvil verilə bilər, ${plan.shortageTotal} ədəd backorder qalır.`,
      issues,
      plan,
    };
  }

  return {
    ok: true,
    partial: false,
    status: "Təhvilə hazır",
    reason: "Bütün qalan məhsullar anbardadır və çıxarıla bilər.",
    issues: [],
    plan,
  };
}


function buildSellerBonusRows(rows = []) {
  return rows
    .filter((row) => row?.seller)
    .slice(0, 3)
    .map((row) => ({
      seller: row.seller,
      bonus: Math.max(0, Number(row.bonus || 0)),
    }));
}

function summarizeSellerBonusRows(rows = []) {
  return buildSellerBonusRows(rows)
    .map((row) => `${row.seller} ${Number(row.bonus || 0)}%`)
    .join(", ");
}

function calculateOrderLineTotal(productLines = []) {
  return normalizeOrderProductLines(productLines).reduce(
    (sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0),
    0,
  );
}

function productLineSignature(productLines = []) {
  return normalizeOrderProductLines(productLines)
    .map((line) => `${line.product}:${line.qty}:${line.price}`)
    .join("|");
}

function buildSalesCreditForOrder(order, storedCredit) {
  const totalAmount = Number(order.amount || 0);
  const initialPayment = Number(order.initialPayment || 0);
  const months = Number(order.creditMonths || storedCredit?.months || 12);
  const creditPlan = buildCreditPlan({ total: totalAmount, initialPayment, months });
  const payments = Array.isArray(storedCredit?.payments) ? storedCredit.payments : [];
  const installments = creditPlan.installments.map((installment, index) => ({
    ...installment,
    due: storedCredit?.installments?.[index]?.due || installment.due,
  }));
  const baseCredit = {
    ...(storedCredit || {}),
    id: order.creditId || storedCredit?.id || getCreditIdForOrder(order),
    salesSource: true,
    createdFrom: "Satış modulu",
    orderId: order.id,
    contractId: order.contractId || storedCredit?.contractId || `MQ-${order.id}`,
    customer: order.customer,
    fin: order.fin,
    product: summarizeOrderProducts(order),
    device: summarizeOrderProducts(order),
    productLines: order.productLines || [],
    seller: order.seller,
    warehouseName: order.warehouseName,
    total: creditPlan.total,
    initialPayment: creditPlan.initialPayment,
    balance: creditPlan.balance,
    monthly: creditPlan.monthly,
    lastPayment: creditPlan.lastPayment,
    months: creditPlan.months,
    paidMonths: 0,
    rate: 0,
    next: installments[0]?.due || "—",
    status: "Aktiv",
    installments,
    payments,
  };
  const paidPrincipal = payments.reduce((sum, payment) => sum + Number(payment.principal || 0), 0);
  if (paidPrincipal <= 0) {
    return isCreditClosed(storedCredit || baseCredit, { ...creditPlan, installments })
      ? { ...baseCredit, balance: 0, paidMonths: creditPlan.months, rate: 100, status: "Tamamlandı" }
      : baseCredit;
  }

  const paymentResult = applyCreditPrincipalPayment(baseCredit, paidPrincipal);
  return {
    ...baseCredit,
    balance: paymentResult.nextBalance,
    installments: paymentResult.installments,
    paidMonths: paymentResult.nextPaidMonths,
    rate: Math.round((paymentResult.nextPaidMonths / Math.max(1, creditPlan.months)) * 100),
    next: paymentResult.nextDue,
    monthly: paymentResult.nextMonthly,
    status: paymentResult.nextBalance <= 0 ? "Tamamlandı" : paymentResult.status,
  };
}

function getShortSellerName(name) {
  return String(name || "")
    .trim()
    .split(" ")[0];
}

function getOrderBonusText(order) {
  const bonuses = getOrderSellerBonuses(order);
  if (bonuses.length === 0) return "Bonus yoxdur";
  return bonuses.map((item) => `${getShortSellerName(item.seller)} ${Number(item.bonus || 0)}%`).join(", ");
}

function matchesSalesOrderFilter(order, filter) {
  if (filter === "Kredit") return getOrderPaymentMethod(order) === "Kredit";
  if (filter === "Nağd") return getOrderPaymentMethod(order) === "Nağd";
  if (filter === "Qalıqlı") return getOrderBalance(order) > 0;
  if (filter === "Təhvil gözləyən") return order.status !== "Təhvil verilib";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  if (filter === "Riskli") return getOrderBalance(order) > 0 || (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3);
  return true;
}

function matchesSalesOrderSearch(order, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  return normalize(
    [
      order.id,
      order.customer,
      order.fin,
      order.phone,
      order.products,
      summarizeOrderProducts(order),
      order.paymentMethod,
      order.paymentStatus,
      order.status,
      order.warehouseName,
      order.creditId,
      order.contractId,
      getOrderSellerBonuses(order).map((seller) => seller.seller).join(" "),
    ].join(" "),
  ).includes(q);
}

function matchesSalesDateRange(order, dateFrom, dateTo) {
  const orderDate = parsePaymentDate(order.date);
  if (!orderDate) return !dateFrom && !dateTo;
  const from = dateFrom ? parsePaymentDate(dateFrom) : null;
  const to = dateTo ? parsePaymentDate(dateTo) : null;
  if (from && orderDate < from) return false;
  if (to && orderDate > to) return false;
  return true;
}

function getSalesOrderRiskStatus(order) {
  if (order.status === "Təhvil verilib" && getOrderBalance(order) <= 0) return "Tamamlanıb";
  if (getOrderBalance(order) > 0 && order.status !== "Təhvil verilib") return "Borclu + təhvil";
  if (getOrderBalance(order) > 0) return "Borclu";
  if (order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 3) return "Təhvil riski";
  if (order.status !== "Təhvil verilib") return "Təhvil gözləyir";
  return "Sağlam";
}

function getSalesCashImpact(order) {
  return Math.max(0, Number(order.paid || 0));
}

function getDeliveryStageIndex(order) {
  return Math.max(0, stages.indexOf(order.status));
}

function getDeliveryAgeDays(order) {
  const orderDate = parsePaymentDate(order.date);
  const today = parsePaymentDate(baseDeliveryDate);
  if (!orderDate || !today) return 0;
  return Math.max(0, daysBetween(orderDate, today));
}

function getDeliveryRisk(order) {
  if (order.status === "Təhvil verilib") return "Tamamlandı";
  if (getDeliveryStageIndex(order) >= 2 && (!order.driver || order.driver === "—")) return "Sürücü yoxdur";
  if (order.status === "Təhvilə çıxıb" || order.status === "Hazırdır") return "Bu gün prioritet";
  if (getDeliveryAgeDays(order) >= 6) return "Gecikmə riski";
  return "Normal";
}

function getDeliveryActionLabel(order) {
  if (order.status === "Təhvil verilib") return "Tamamlanıb";
  if (order.status === "Təhvilə çıxıb") return "Təhvili tamamla";
  return "Növbəti mərhələ";
}

function enrichDeliveryOrder(order) {
  const stageIndex = getDeliveryStageIndex(order);
  return {
    ...order,
    stageIndex,
    progress: ((stageIndex + 1) / stages.length) * 100,
    ageDays: getDeliveryAgeDays(order),
    risk: getDeliveryRisk(order),
    balance: getOrderBalance(order),
    deliveryStatusText: getOrderDeliveryStatus(order),
  };
}

function matchesDeliveryFilter(order, filter) {
  if (filter === "Hamısı") return true;
  if (filter === "Aktiv") return order.status !== "Təhvil verilib";
  if (filter === "Gecikmə riski") return order.risk === "Gecikmə riski";
  if (filter === "Sürücü yoxdur") return order.risk === "Sürücü yoxdur";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  return order.status === filter;
}

function buildDriverDeliveryStats(orders) {
  const driverMap = new Map();
  orders
    .filter((order) => order.driver && order.driver !== "—")
    .forEach((order) => {
      const current = driverMap.get(order.driver) || {
        driver: order.driver,
        active: 0,
        completed: 0,
        outForDelivery: 0,
        risk: 0,
      };
      if (order.status === "Təhvil verilib") {
        current.completed += 1;
      } else {
        current.active += 1;
      }
      if (order.status === "Təhvilə çıxıb" || order.status === "Yoldadır") {
        current.outForDelivery += 1;
      }
      if (order.risk !== "Normal" && order.risk !== "Tamamlandı") {
        current.risk += 1;
      }
      driverMap.set(order.driver, current);
    });
  const maxActive = Math.max(1, ...[...driverMap.values()].map((item) => item.active + item.outForDelivery));
  return [...driverMap.values()].map((item) => ({
    ...item,
    load: ((item.active + item.outForDelivery) / maxActive) * 100,
  }));
}

function sortByFinanceDate(rows) {
  return [...rows].sort((a, b) => {
    const dateA = parsePaymentDate(a.date)?.getTime() || 0;
    const dateB = parsePaymentDate(b.date)?.getTime() || 0;
    return dateB - dateA;
  });
}

export function buildFinanceLedger({ orders, expenses, cashEntries }) {
  const salesRows = orders
    .filter((order) => Number(order.paid || 0) > 0)
    .map((order) => {
      const paymentMethod = getOrderPaymentMethod(order);
      const account = ["Kart", "Köçürmə"].includes(paymentMethod) ? "Bank hesabı" : "Kassa";
      return {
        id: `SALE-${order.id}`,
        date: order.date,
        type: "Satış",
        source: "Satış modulu",
        category: paymentMethod,
        account,
        title: order.id,
        description: summarizeOrderProducts(order),
        party: order.customer,
        principal: Number(order.paid || 0),
        penalty: 0,
        amount: Number(order.paid || 0),
        direction: "in",
        status: order.paymentStatus || paymentMethod,
        orderId: order.id,
        creditId: order.creditId || "",
        contractId: order.contractId || "",
        poId: "",
      };
    });

  const creditRows = cashEntries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    type: entry.type || "Kredit",
    source: entry.source || "Kredit modulu",
    category: entry.category || "Kredit ödənişi",
    account: entry.account || "Kassa",
    title: entry.creditId || entry.orderId || entry.receivableId || entry.id,
    description: entry.contractId || entry.note || "Müqavilə qeyd edilməyib",
    party: entry.customer,
    principal: Number(entry.principal || 0),
    penalty: Number(entry.penalty || 0),
    amount: Number(entry.amount || 0),
    direction: "in",
    status: "Kassaya daxil oldu",
    orderId: entry.orderId || "",
    creditId: entry.creditId || "",
    contractId: entry.contractId || "",
    poId: "",
  }));

  const expenseRows = expenses.map((expense) => {
    const approved = expense.status === "Təsdiq edildi";
    const rejected = expense.status === "İmtina edildi";
    const cashImpact = hasExpenseCashImpact(expense);
    const direction = !cashImpact ? "accrual" : approved ? "out" : rejected ? "ignored" : "pending";
    return {
      id: expense.id,
      date: expense.date,
      type: "Xərc",
      source: expense.source || "Maliyyə modulu",
      category: expense.category,
      account: !cashImpact ? "Uçot xərci" : direction === "ignored" ? "Təsirsiz" : expense.account || "Kassa",
      title: expense.description,
      description: expense.category,
      party: "Şirkət xərci",
      principal: 0,
      penalty: 0,
      amount: Number(expense.amount || 0),
      direction,
      status: cashImpact ? expense.status : `${expense.status} · cash təsiri yoxdur`,
      orderId: expense.orderId || "",
      creditId: expense.creditId || "",
      contractId: expense.contractId || "",
      poId: expense.poId || "",
      expenseId: expense.id,
    };
  });

  return sortByFinanceDate([...salesRows, ...creditRows, ...expenseRows]);
}

function matchesFinanceFilter(row, filter) {
  if (filter === "Daxilolma") return row.direction === "in";
  if (filter === "Xərc") return row.type === "Xərc";
  if (filter === "Satış") return row.type === "Satış";
  if (filter === "Kredit") return row.type === "Kredit";
  if (filter === "Gecikmə gəliri") return Number(row.penalty || 0) > 0;
  if (filter === "Təsdiq gözləyir") return row.direction === "pending";
  if (filter === "Cash təsirsiz") return row.direction === "accrual";
  return true;
}

function matchesFinanceDateRange(row, dateFrom, dateTo) {
  const rowDate = parsePaymentDate(row.date);
  if (!rowDate) return !dateFrom && !dateTo;
  const fromDate = dateFrom ? parsePaymentDate(dateFrom) : null;
  const toDate = dateTo ? parsePaymentDate(dateTo) : null;
  if (fromDate && rowDate < fromDate) return false;
  if (toDate && rowDate > toDate) return false;
  return true;
}

function matchesFinanceSearch(row, query) {
  if (!query.trim()) return true;
  return normalize([
    row.id,
    row.type,
    row.source,
    row.category,
    row.account,
    row.title,
    row.description,
    row.party,
    row.status,
    row.orderId,
    row.creditId,
    row.contractId,
    row.poId,
    row.expenseId,
  ].join(" ")).includes(normalize(query));
}

export function buildDailyCashSummary(ledger, openingBalance = 0, targetDate = baseFinanceDate) {
  const target = parsePaymentDate(targetDate);
  const targetKey = formatDateInput(target || new Date());
  const previousRows = ledger.filter((row) => {
    const rowDate = parsePaymentDate(row.date);
    return rowDate && target && rowDate < target;
  });
  const dayRows = ledger.filter((row) => formatDateInput(parsePaymentDate(row.date) || new Date(0)) === targetKey);
  const sumRows = (rows, direction) =>
    rows
      .filter((row) => row.direction === direction)
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const previousInflow = sumRows(previousRows, "in");
  const previousOutflow = sumRows(previousRows, "out");
  const opening = Number(openingBalance || 0) + previousInflow - previousOutflow;
  const inflow = sumRows(dayRows, "in");
  const outflow = sumRows(dayRows, "out");
  const pendingOutflow = sumRows(dayRows, "pending");
  const accrual = sumRows(dayRows, "accrual");
  const penalty = dayRows.reduce((sum, row) => sum + Number(row.penalty || 0), 0);

  return {
    date: targetKey,
    label: formatPaymentDate(target),
    opening,
    inflow,
    outflow,
    pendingOutflow,
    accrual,
    penalty,
    closing: opening + inflow - outflow,
    projectedClosing: opening + inflow - outflow - pendingOutflow,
    rows: dayRows,
  };
}

export function buildExpenseCategoryRows(expenses) {
  const byCategory = expenses.reduce((map, expense) => {
    const current = map.get(expense.category) || {
      category: expense.category,
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    };
    current.total += Number(expense.amount || 0);
    if (expense.status === "Təsdiq edildi") current.approved += Number(expense.amount || 0);
    if (expense.status === "Təsdiq gözləyir") current.pending += Number(expense.amount || 0);
    if (expense.status === "İmtina edildi") current.rejected += Number(expense.amount || 0);
    map.set(expense.category, current);
    return map;
  }, new Map());

  return [...byCategory.values()].sort((a, b) => b.total - a.total);
}

export function filterRows(rows, query) {
  if (!query.trim()) return rows;
  const q = normalize(query);
  return rows.filter((row) => normalize(Object.values(row).join(" ")).includes(q));
}

function buildQuantityMap(items) {
  return items.reduce((map, item) => {
    if (!item.product) return map;
    map.set(item.product, (map.get(item.product) || 0) + Number(item.qty || 0));
    return map;
  }, new Map());
}

function isSerialTrackedProduct(item = {}) {
  if (typeof item.serialTracked === "boolean") return item.serialTracked;
  return Number(item.price || 0) >= 1500;
}

function buildSerialPrefix(product = "", warehouseId = "") {
  const productCode = normalize(product).replace(/[^a-z0-9]/g, "").slice(0, 4).toLocaleUpperCase("az-AZ") || "SKU";
  const warehouseCode = String(warehouseId || "WH").replace(/[^A-Z0-9]/gi, "").slice(-3).toLocaleUpperCase("az-AZ");
  return `${productCode}${warehouseCode}`;
}

function ensureStockItemSerials(item, warehouseId = "WH") {
  if (!isSerialTrackedProduct(item)) return { ...item, serials: item.serials || [] };

  const totalCount = Math.max(0, Math.round(Number(item.total || 0)));
  const reservedCount = Math.max(0, Math.round(Number(item.reserved || 0)));
  const existingSerials = Array.isArray(item.serials) ? item.serials : [];
  const nonSoldSerials = existingSerials.filter((serial) => serial.status !== "Satılıb");
  const serials = [...existingSerials];
  const prefix = buildSerialPrefix(item.product, warehouseId);

  for (let index = nonSoldSerials.length; index < totalCount; index += 1) {
    serials.push({
      imei: `${prefix}-${String(index + 1).padStart(5, "0")}`,
      status: index < reservedCount ? "Rezervdə" : "Anbarda",
      warehouseId,
      product: item.product,
    });
  }

  let reservedSeen = 0;
  const normalizedSerials = serials.map((serial) => {
    if (serial.status === "Satılıb") return serial;
    reservedSeen += 1;
    return {
      ...serial,
      status: reservedSeen <= reservedCount ? "Rezervdə" : "Anbarda",
      warehouseId: serial.warehouseId || warehouseId,
      product: serial.product || item.product,
    };
  });

  return {
    ...item,
    serials: normalizedSerials,
  };
}

function ensureWarehouseSerials(warehouseStock = {}) {
  return Object.fromEntries(
    Object.entries(warehouseStock).map(([warehouseId, rows]) => [
      warehouseId,
      (rows || []).map((item) => ensureStockItemSerials(item, warehouseId)),
    ]),
  );
}

function getAvailableSerialsForProduct(warehouseStock = {}, warehouseId, product) {
  const item = (warehouseStock?.[warehouseId] || []).find((row) => row.product === product);
  if (!item || !isSerialTrackedProduct(item)) return [];
  return (item.serials || []).filter((serial) => serial.status === "Anbarda").map((serial) => serial.imei);
}

function getSerialSummary(serials = []) {
  return {
    available: serials.filter((serial) => serial.status === "Anbarda").length,
    reserved: serials.filter((serial) => serial.status === "Rezervdə").length,
    sold: serials.filter((serial) => serial.status === "Satılıb").length,
  };
}

function updateSerialStatuses(rows, productLines, nextStatus, orderId) {
  return rows.map((item) => {
    const matchingLines = productLines.filter((line) => line.product === item.product);
    if (matchingLines.length === 0 || !Array.isArray(item.serials) || item.serials.length === 0) return item;

    const requestedSerials = new Set(matchingLines.flatMap((line) => line.serials || []).filter(Boolean));
    const neededFallback = matchingLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    let fallbackCount = 0;

    return {
      ...item,
      serials: item.serials.map((serial) => {
        const explicit = requestedSerials.has(serial.imei);
        const fallback =
          requestedSerials.size === 0 &&
          serial.status !== "Satılıb" &&
          fallbackCount < neededFallback &&
          (nextStatus === "Satılıb" ? serial.status === "Rezervdə" : serial.status === "Anbarda");

        if (!explicit && !fallback) return serial;
        fallbackCount += fallback ? 1 : 0;
        return {
          ...serial,
          status: nextStatus,
          orderId,
          reservedAt: nextStatus === "Rezervdə" ? currentBusinessDate : serial.reservedAt,
          soldAt: nextStatus === "Satılıb" ? currentBusinessDate : serial.soldAt,
        };
      }),
    };
  });
}

function releaseOrderSerialReservations(rows, productLines, orderId) {
  return rows.map((item) => {
    const matchingLines = productLines.filter((line) => line.product === item.product);
    if (matchingLines.length === 0 || !Array.isArray(item.serials) || item.serials.length === 0) return item;

    const requestedSerials = new Set(matchingLines.flatMap((line) => line.serials || []).filter(Boolean));
    const fallbackLimit = matchingLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    let releasedCount = 0;

    return {
      ...item,
      serials: item.serials.map((serial) => {
        const explicit = requestedSerials.has(serial.imei);
        const sameOrder = serial.orderId === orderId;
        const fallback = requestedSerials.size === 0 && sameOrder && releasedCount < fallbackLimit;
        if (serial.status !== "Rezervdə" || (!explicit && !fallback)) return serial;
        releasedCount += 1;
        return {
          ...serial,
          status: "Anbarda",
          orderId: "",
          reservedAt: "",
        };
      }),
    };
  });
}

function adjustStockRows(rows, quantities, { totalDelta = 0, reservedDelta = 0, createMissing = false }) {
  const seen = new Set();
  const next = rows.map((item) => {
    const qty = quantities.get(item.product) || 0;
    if (!qty) return item;
    seen.add(item.product);
    return {
      ...item,
      // Qalıq heç vaxt mənfi olmur; rezerv qalıqdan çox ola bilər (backorder).
      total: Math.max(0, item.total + totalDelta * qty),
      reserved: Math.max(0, item.reserved + reservedDelta * qty),
    };
  });
  if (!createMissing) return next;
  // Anbarda sətri olmayan məhsul da satıla bilər — sıfır qalıqla rezerv sətri açılır.
  quantities.forEach((qty, product) => {
    if (!qty || seen.has(product) || next.some((item) => item.product === product)) return;
    next.push({
      product,
      total: 0,
      reserved: Math.max(0, reservedDelta * qty),
      price: 0,
      serials: [],
    });
  });
  return next;
}


function getDefaultUsers() {
  return initialState.settings?.users || [];
}

function mergeUsers(savedUsers = []) {
  const savedById = new Map(savedUsers.map((user) => [user.id, user]));
  const defaults = getDefaultUsers().map((user) => ({
    ...user,
    ...(savedById.get(user.id) || {}),
  }));
  const defaultIds = new Set(defaults.map((user) => user.id));
  const customUsers = savedUsers.filter((user) => user.id && !defaultIds.has(user.id));
  return [...defaults, ...customUsers];
}

function mergeRoles(savedRoles = []) {
  const savedByName = new Map(savedRoles.map((role) => [role.name, role]));

  return defaultRoles.map((defaultRole) => {
    const saved = savedByName.get(defaultRole.name);
    if (!saved) return defaultRole;

    return {
      ...defaultRole,
      ...saved,
      permissions:
        defaultRole.name === "Super Admin"
          ? permissionCatalog.map((item) => item.key)
          : [...new Set([...(defaultRole.permissions || []), ...(saved.permissions || [])])],
    };
  });
}

export function uniqueModuleIds(moduleIds = []) {
  return uniquePermissionModuleIds(moduleIds, navItems);
}

export function getDefaultModuleAccessForRole(roleName, roles = defaultRoles) {
  return getDefaultModuleAccessForRoleFromCatalog(roleName, roles, navItems);
}

export function normalizeUserModuleAccess(user, roles) {
  return normalizeUserModuleAccessFromCatalog(user, roles, navItems);
}

function ensureSettings(settings = {}) {
  const baseSettings = initialState.settings || {};
  const roles = mergeRoles(Array.isArray(settings.roles) ? settings.roles : []);
  const users = mergeUsers(Array.isArray(settings.users) ? settings.users : baseSettings.users || []).map((user) => ({
    ...user,
    moduleAccess: normalizeUserModuleAccess(user, roles),
  }));
  const fallbackUser = users.find((user) => user.status === "Aktiv") || users[0] || null;
  const sessionUserId =
    settings.sessionUserId === null
      ? null
      : users.some((user) => user.id === settings.sessionUserId && user.status === "Aktiv")
        ? settings.sessionUserId
        : fallbackUser?.id || null;
  const sessionUser = users.find((user) => user.id === sessionUserId) || null;
  const currentRole =
    sessionUser?.role && roles.some((role) => role.name === sessionUser.role)
      ? sessionUser.role
      : settings.currentRole && roles.some((role) => role.name === settings.currentRole)
        ? settings.currentRole
        : roles[0]?.name || defaultRoles[0].name;

  return {
    ...baseSettings,
    ...settings,
    toggles: {
      ...(baseSettings.toggles || {}),
      ...(settings.toggles || {}),
    },
    roles,
    users,
    sessionUserId,
    currentRole,
  };
}

function normalizeOperationalLabels(snapshot = {}) {
  return {
    ...snapshot,
    onboarding: {
      ...(snapshot.onboarding || {}),
      companyStage: normalize(snapshot.onboarding?.companyStage).includes("demo")
        ? "Go-live hazırlığı"
        : snapshot.onboarding?.companyStage,
    },
    invoiceSettings: {
      ...(snapshot.invoiceSettings || {}),
      eTaxMode: normalize(snapshot.invoiceSettings?.eTaxMode).includes("demo")
        ? "E-qaimə inteqrasiya rejimi"
        : snapshot.invoiceSettings?.eTaxMode,
    },
    productionPlans: (snapshot.productionPlans || []).map((plan) => ({
      ...plan,
      product: normalize(plan.product).includes("showroom demo") ? "Showroom nümayiş dəsti" : plan.product,
    })),
  };
}

function hydrateState(snapshot = {}) {
  const warehouseStock = ensureWarehouseSerials(
    snapshot.warehouseStock || initialState.warehouseStock || {},
  );
  const merged = normalizeOperationalLabels({
    ...initialState,
    ...snapshot,
    warehouseStock,
    settings: ensureSettings({
      ...(initialState.settings || {}),
      ...(snapshot.settings || {}),
    }),
    auditLog: Array.isArray(snapshot.auditLog) ? snapshot.auditLog : [],
    purchaseOrders: Array.isArray(snapshot.purchaseOrders) ? snapshot.purchaseOrders : [],
    kpiTargets: Array.isArray(snapshot.kpiTargets) && snapshot.kpiTargets.length > 0 ? snapshot.kpiTargets : initialState.kpiTargets || [],
    kpiPeriods: Array.isArray(snapshot.kpiPeriods) ? snapshot.kpiPeriods : [],
    kpiPayouts: Array.isArray(snapshot.kpiPayouts) ? snapshot.kpiPayouts : [],
    reportExports: Array.isArray(snapshot.reportExports) ? snapshot.reportExports : [],
    receivableClosures: Array.isArray(snapshot.receivableClosures) ? snapshot.receivableClosures : [],
    notificationProviders: ensureNotificationProviders(snapshot.notificationProviders || initialState.notificationProviders || []),
    notificationRules: ensureNotificationRules(snapshot.notificationRules || initialState.notificationRules || []),
    notificationSendLog: Array.isArray(snapshot.notificationSendLog) ? snapshot.notificationSendLog : [],
    notificationDispatchSnapshot: snapshot.notificationDispatchSnapshot || null,
    apiWebhooks: ensureApiWebhooks(snapshot.apiWebhooks || initialState.apiWebhooks || []),
    apiSecrets: ensureApiSecrets(snapshot.apiSecrets || initialState.apiSecrets || []),
    apiWebhookLogs: Array.isArray(snapshot.apiWebhookLogs) ? snapshot.apiWebhookLogs : [],
    apiIntegrationSnapshot: snapshot.apiIntegrationSnapshot || null,
    accountingClose: snapshot.accountingClose || null,
    receivableSync: snapshot.receivableSync || null,
    notificationSweepAt: snapshot.notificationSweepAt || null,
    integritySnapshot: snapshot.integritySnapshot || null,
    goLiveSnapshot: snapshot.goLiveSnapshot || null,
    productionHardeningSnapshot: snapshot.productionHardeningSnapshot || null,
    dbMeta: {
      ...(snapshot.dbMeta || {}),
      provider: snapshot.dbMeta?.provider && snapshot.dbMeta.provider !== "Local persistent DB" ? snapshot.dbMeta.provider : defaultDbProvider,
      runtime: snapshot.dbMeta?.runtime || "browser",
      version: localDbSchemaVersion,
      schemaVersion: localDbSchemaVersion,
      baselineVersion: localDbBaselineVersion,
      lastWriteAt: snapshot.dbMeta?.lastWriteAt || baseFinanceDate,
    },
  });

  return merged;
}

function loadPersistentState() {
  if (typeof window === "undefined") return hydrateState(initialState);

  try {
    const raw = window.localStorage.getItem(localDbKey);
    if (!raw) return hydrateState(initialState);
    const snapshot = JSON.parse(raw);
    if (Number(snapshot?.dbMeta?.baselineVersion || 0) < localDbBaselineVersion) {
      return hydrateState(initialState);
    }
    return hydrateState(snapshot);
  } catch {
    return hydrateState(initialState);
  }
}

function getCurrentUser(settings = {}) {
  const safeSettings = ensureSettings(settings);
  return safeSettings.users.find((user) => user.id === safeSettings.sessionUserId) || null;
}

export function getActiveRole(settings = {}) {
  const safeSettings = ensureSettings(settings);
  const user = safeSettings.users.find((item) => item.id === safeSettings.sessionUserId);
  if (user?.role === "Platform Super Admin") {
    return { name: "Platform Super Admin", scope: "Bütün platforma və əsas ERP tenant-ına tam giriş", permissions: permissionCatalog.map((item) => item.key) };
  }
  return safeSettings.roles.find((role) => role.name === safeSettings.currentRole) || safeSettings.roles[0];
}

function hasRolePermission(settings, permission) {
  if (!permission) return true;
  const user = getCurrentUser(settings);
  if (!user) return false;
  if (user.role === "Platform Super Admin") return true;
  const role = getActiveRole(settings);
  return Array.isArray(role?.permissions) && role.permissions.includes(permission);
}

function hasUserModuleAccess(settings, moduleId) {
  if (!moduleId) return true;
  const user = getCurrentUser(settings);
  if (!user) return false;
  if (user.role === "Platform Super Admin") return true;
  return normalizeUserModuleAccess(user, ensureSettings(settings).roles).includes(moduleId);
}

function getDuplicateValues(rows = [], key, label) {
  const seen = new Set();
  const duplicates = new Set();

  rows.forEach((row) => {
    const value = row?.[key];
    if (!value) return;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });

  return [...duplicates].map((value) => ({
    id: `${label}-${value}`,
    severity: "Kritik",
    area: label,
    title: "Dublikat identifikator",
    detail: `${value} təkrar istifadə olunub`,
    fix: "ID/FIN unikal saxlanmalıdır",
  }));
}

function buildStateIntegrityReport(snapshot = {}, creditRows = []) {
  const issues = [];
  const orders = snapshot.orders || [];
  const customers = snapshot.customers || [];
  const warehouses = snapshot.warehouses || [];
  const purchaseOrders = snapshot.purchaseOrders || [];
  const contracts = snapshot.contracts || [];
  const stock = snapshot.stock || [];
  const warehouseStock = snapshot.warehouseStock || {};
  const credits = creditRows.length > 0 ? creditRows : snapshot.credits || [];
  const employees = snapshot.employees || [];
  const departments = snapshot.departments || [];
  const leaveRequests = snapshot.leaveRequests || [];
  const vacancies = snapshot.vacancies || [];
  const users = snapshot.settings?.users || [];
  const currentUser = getCurrentUser(snapshot.settings || {});

  issues.push(...getDuplicateValues(orders, "id", "Satış"));
  issues.push(...getDuplicateValues(customers, "fin", "CRM"));
  issues.push(...getDuplicateValues(warehouses, "id", "Anbar"));
  issues.push(...getDuplicateValues(purchaseOrders, "id", "PO"));
  issues.push(...getDuplicateValues(contracts, "id", "Müqavilə"));
  issues.push(...getDuplicateValues(credits, "id", "Kredit"));
  issues.push(...getDuplicateValues(departments, "name", "HR şöbə"));
  issues.push(...getDuplicateValues(leaveRequests, "id", "HR məzuniyyət"));
  issues.push(...getDuplicateValues(vacancies, "id", "HR vakansiya"));

  if (!currentUser) {
    issues.push({
      id: "AUTH-NO-SESSION",
      severity: "Kritik",
      area: "Auth",
      title: "Aktiv sessiya yoxdur",
      detail: "Permission yoxlaması üçün aktiv istifadəçi seçilməlidir",
      fix: "Ayarlar bölməsində aktiv istifadəçi ilə giriş edin",
    });
  }

  if (users.filter((user) => user.status === "Aktiv").length === 0) {
    issues.push({
      id: "AUTH-NO-ACTIVE-USER",
      severity: "Kritik",
      area: "Auth",
      title: "Aktiv istifadəçi yoxdur",
      detail: "Sistemə giriş üçün ən azı bir aktiv istifadəçi lazımdır",
      fix: "Super Admin istifadəçisini aktiv saxlayın",
    });
  }

  const stockGroups = [
    { label: "Ümumi stok", rows: stock },
    ...Object.entries(warehouseStock).map(([warehouseId, rows]) => ({
      label: `Anbar ${warehouseId}`,
      rows: rows || [],
    })),
  ];

  stockGroups.forEach((group) => {
    group.rows.forEach((item) => {
      const totalQty = Number(item.total || 0);
      const reservedQty = Number(item.reserved || 0);
      if (totalQty < 0 || reservedQty < 0) {
        issues.push({
          id: `STOCK-NEG-${group.label}-${item.product}`,
          severity: "Kritik",
          area: "Anbar",
          title: "Mənfi stok göstəricisi",
          detail: `${group.label}: ${item.product}`,
          fix: "Mədaxil/məxaric tarixçəsini yoxlayın",
        });
      }
      if (reservedQty > totalQty) {
        issues.push({
          id: `STOCK-RES-${group.label}-${item.product}`,
          severity: "Xəbərdarlıq",
          area: "Anbar",
          title: "Çatışmazlıq (backorder)",
          detail: `${group.label}: ${item.product} — rezerv ${reservedQty}, qalıq ${totalQty}, çatışmayan ${reservedQty - totalQty}`,
          fix: "Təchizatdan mədaxil edin və ya sifarişi bağlayın",
        });
      }
      if (Array.isArray(item.serials) && item.serials.length > 0) {
        const activeSerials = item.serials.filter((serial) => serial.status !== "Satılıb").length;
        if (activeSerials < totalQty) {
          issues.push({
            id: `SERIAL-MISS-${group.label}-${item.product}`,
            severity: "Xəbərdarlıq",
            area: "IMEI",
            title: "Serial sayı stokdan azdır",
            detail: `${group.label}: ${item.product} üçün aktiv serial ${activeSerials}, stok ${totalQty}`,
            fix: "IMEI/serial reyestrini tamamlayın",
          });
        }
      }
    });
  });

  const creditIds = new Set(credits.map((credit) => credit.orderId || credit.id));
  orders.forEach((order) => {
    const amount = Number(order.amount || 0);
    const paid = Number(order.paid || 0);
    if (paid > amount) {
      issues.push({
        id: `ORDER-OVERPAID-${order.id}`,
        severity: "Xəbərdarlıq",
        area: "Satış",
        title: "Ödəniş sifariş məbləğini keçir",
        detail: `${order.id}: ödənilib ${money(paid)}, məbləğ ${money(amount)}`,
        fix: "Artıq ödənişi kredit və ya avans kimi ayırın",
      });
    }
    if (order.paymentMethod === "Kredit" && !creditIds.has(order.id) && !creditIds.has(order.creditId)) {
      issues.push({
        id: `ORDER-CREDIT-MISS-${order.id}`,
        severity: "Kritik",
        area: "Satış/Kredit",
        title: "Kredit satışı kredit portfelində yoxdur",
        detail: `${order.id}: ${order.customer}`,
        fix: "Satışdan kredit datasını yenidən sinxronlaşdırın",
      });
    }
  });

  credits.forEach((credit) => {
    const plan = getCreditDisplayPlan(credit);
    if (Number(plan.balance || 0) < 0 || Number(plan.balance || 0) > Number(plan.total || 0)) {
      issues.push({
        id: `CREDIT-BAL-${credit.id}`,
        severity: "Kritik",
        area: "Kredit",
        title: "Kredit balansı uyğunsuzdur",
        detail: `${credit.id}: balans ${money(plan.balance)} / total ${money(plan.total)}`,
        fix: "Ödəniş tarixçəsini və əsas məbləğ silinməsini yoxlayın",
      });
    }
    if (!isCreditClosed(credit, plan) && !getCreditPaymentState(credit, plan).nextInstallment) {
      issues.push({
        id: `CREDIT-NEXT-${credit.id}`,
        severity: "Xəbərdarlıq",
        area: "Kredit",
        title: "Növbəti ödəniş tarixi yoxdur",
        detail: `${credit.id}: ${credit.customer}`,
        fix: "Ödəniş cədvəlini yeniləyin",
      });
    }
  });

  const employeeKeys = new Set(employees.map((employee) => getEmployeeKey(employee)));
  const employeeNames = new Set(employees.map((employee) => employee.name));
  employees.forEach((employee) => {
    const employeeKey = getEmployeeKey(employee);
    if (employee.managerId === employeeKey || employee.managerName === employee.name) {
      issues.push({
        id: `HR-SELF-MANAGER-${employeeKey}`,
        severity: "Kritik",
        area: "HR",
        title: "Əməkdaş özü-özünə tabedir",
        detail: `${employee.name} üçün rəhbər əlaqəsi özünə işarə edir`,
        fix: "Əməkdaş kartında birbaşa rəhbərlik və ya düzgün rəhbər seçin",
      });
    } else if (employee.managerId && !employeeKeys.has(employee.managerId)) {
      issues.push({
        id: `HR-MANAGER-MISSING-${employeeKey}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Rəhbər qeydi tapılmadı",
        detail: `${employee.name}: ${employee.managerId}`,
        fix: "Əməkdaş kartında tabeçilik əlaqəsini yeniləyin",
      });
    } else if (!employee.managerId && employee.managerName && !employeeNames.has(employee.managerName)) {
      issues.push({
        id: `HR-MANAGER-NAME-MISSING-${employeeKey}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Rəhbər adı reyestrdə yoxdur",
        detail: `${employee.name}: ${employee.managerName}`,
        fix: "Rəhbəri siyahıdan yenidən seçin",
      });
    }
  });

  const departmentNames = new Set([
    ...departments.map((department) => department.name),
    ...employees.map((employee) => employee.department),
  ].filter(Boolean));
  departments.forEach((department) => {
    if (department.parentDepartment === department.name) {
      issues.push({
        id: `HR-DEPARTMENT-SELF-${department.name}`,
        severity: "Kritik",
        area: "HR",
        title: "Şöbə özü-özünün üst şöbəsidir",
        detail: department.name,
        fix: "Şöbə kartındakı üst şöbə dəyərini dəyişin",
      });
    } else if (department.parentDepartment && !departmentNames.has(department.parentDepartment)) {
      issues.push({
        id: `HR-DEPARTMENT-PARENT-MISSING-${department.name}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Üst şöbə tapılmadı",
        detail: `${department.name}: ${department.parentDepartment}`,
        fix: "Şöbə strukturunu yeniləyin və ya üst şöbəni yaradın",
      });
    }
  });

  leaveRequests.forEach((request) => {
    const start = new Date(request.from || "");
    const end = new Date(request.to || "");
    const employeeFound = request.employeeId ? employeeKeys.has(request.employeeId) : employeeNames.has(request.employeeName);
    if (!employeeFound) {
      issues.push({
        id: `HR-LEAVE-EMPLOYEE-MISSING-${request.id}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Məzuniyyət əməkdaşı tapılmadı",
        detail: request.employeeName || request.employeeId || request.id,
        fix: "Məzuniyyət qeydini aktiv əməkdaşla bağlayın",
      });
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start || Number(request.days || 0) <= 0) {
      issues.push({
        id: `HR-LEAVE-DATE-${request.id}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Məzuniyyət tarixi uyğunsuzdur",
        detail: `${request.employeeName || request.id}: ${request.from || "—"} - ${request.to || "—"}`,
        fix: "Başlanğıc, bitiş və gün sayını yeniləyin",
      });
    }
  });

  const critical = issues.filter((issue) => issue.severity === "Kritik").length;
  const warnings = issues.filter((issue) => issue.severity !== "Kritik").length;
  const score = Math.max(0, Math.round(100 - critical * 18 - warnings * 6));

  return {
    checkedAt: new Date().toISOString(),
    score,
    status: critical > 0 ? "Risk" : warnings > 0 ? "Nəzarət" : "Sağlam",
    critical,
    warnings,
    issueCount: issues.length,
    issues,
  };
}

function buildGoLiveReadiness(snapshot = {}, integrityReport = {}) {
  const settings = ensureSettings(snapshot.settings || {});
  const dbMeta = snapshot.dbMeta || {};
  const auditLog = snapshot.auditLog || [];
  const roles = settings.roles || [];
  const users = settings.users || [];
  const hasActiveAdmin = users.some((user) => user.status === "Aktiv" && user.role === "Super Admin");
  const hasBackupPermission = roles.some(
    (role) => role.name === "Super Admin" && (role.permissions || []).includes("system.backup"),
  );
  const hasBackupTrace = Boolean(dbMeta.lastBackupAt || dbMeta.lastRestoreAt);
  const hasCriticalBusinessData =
    (snapshot.orders || []).length > 0 &&
    (snapshot.warehouses || []).length > 0 &&
    (snapshot.employees || []).length > 0 &&
    (snapshot.customers || []).length > 0;
  const isServerRuntime = dbMeta.runtime === "server";
  const isExternalDb = isServerRuntime && !normalize(dbMeta.provider || "").includes("local persistent");
  const integrityClear = Number(integrityReport.critical || 0) === 0;

  const items = [
    {
      area: "Backend DB",
      requirement: "PostgreSQL/Supabase kimi real server DB",
      status: isExternalDb ? "Hazır" : "Bloker",
      risk: "Yüksək",
      next: isExternalDb
        ? "Connection monitor aktiv saxlanılsın"
        : `Brauzer local adapteri ${targetDbProvider} backend adapteri ilə əvəz edilməlidir`,
    },
    {
      area: "Auth/RBAC",
      requirement: "Aktiv admin, rol və kritik permission xəritəsi",
      status: hasActiveAdmin && hasBackupPermission ? "Hazır" : "Bloker",
      risk: hasActiveAdmin ? "Orta" : "Yüksək",
      next: hasActiveAdmin ? "Server-side token yoxlaması əlavə olunmalıdır" : "Super Admin istifadəçisi aktiv edilməlidir",
    },
    {
      area: "Data integrity",
      requirement: "Stok, kredit, satış və audit bütövlüyü",
      status: integrityClear ? "Hazır" : "Bloker",
      risk: integrityClear ? "Aşağı" : "Yüksək",
      next: integrityClear ? "Planlı günlük yoxlama saxlanılsın" : "Integrity panelində kritik siqnallar bağlanmalıdır",
    },
    {
      area: "Backup/Restore",
      requirement: "Export/import və bərpa izi",
      status: hasBackupTrace ? "Hazır" : "Nəzarət",
      risk: hasBackupTrace ? "Aşağı" : "Orta",
      next: hasBackupTrace ? "Avtomatik backup qrafiki qurulsun" : "İlk backup export/import yoxlaması aparılsın",
    },
    {
      area: "Audit",
      requirement: "Əməliyyatların audit log-a düşməsi",
      status: auditLog.length >= 5 ? "Hazır" : "Nəzarət",
      risk: auditLog.length >= 5 ? "Aşağı" : "Orta",
      next: auditLog.length >= 5 ? "Audit log serverdə immutable saxlanmalıdır" : "Kritik əməliyyatlar üzrə audit nümunələri yaradılmalıdır",
    },
    {
      area: "Biznes axınları",
      requirement: "Satış, kredit, anbar, təhvil, maliyyə, HR data zənciri",
      status: hasCriticalBusinessData ? "Hazır" : "Bloker",
      risk: hasCriticalBusinessData ? "Aşağı" : "Yüksək",
      next: hasCriticalBusinessData ? "UAT ssenariləri imzalanmalıdır" : "Əsas modullara başlanğıc data əlavə olunmalıdır",
    },
    {
      area: "Monitoring",
      requirement: "Error, uptime, webhook və backup monitorinqi",
      status: "Nəzarət",
      risk: "Orta",
      next: "Production hostda error logging və uptime monitor qurulmalıdır",
    },
    {
      area: "Deployment",
      requirement: "Docker/nginx/env/smoke test faylları",
      status: deploymentToolkitReady ? "Hazır" : "Hazırlanır",
      risk: deploymentToolkitReady ? "Aşağı" : "Orta",
      next: deploymentToolkitReady
        ? "Staging serverdə npm run smoke nəticəsi saxlanılsın"
        : "Build artefaktı staging-də smoke testdən keçirilməlidir",
    },
  ];
  const blockers = items.filter((item) => item.status === "Bloker").length;
  const watch = items.filter((item) => item.status === "Nəzarət" || item.status === "Hazırlanır").length;
  const ready = items.filter((item) => item.status === "Hazır").length;
  const score = Math.max(0, Math.round((ready / items.length) * 100 - blockers * 8));

  return {
    checkedAt: new Date().toISOString(),
    status: blockers > 0 ? "Bloker var" : watch > 0 ? "Staging hazırdır" : "Go-live hazır",
    score,
    blockers,
    watch,
    ready,
    items,
  };
}

function buildProductionHardeningReport(snapshot = {}, { goLiveReport = {}, apiWebhookRows = [], apiSecretRows = [], notificationProviderRows = [] } = {}) {
  const dbMeta = snapshot.dbMeta || {};
  const auditLog = snapshot.auditLog || [];
  const isServerRuntime = dbMeta.runtime === "server";
  const providerName = normalize(dbMeta.provider || "");
  const isExternalDb = isServerRuntime && !providerName.includes("local persistent");
  const immutableAudit = normalize(dbMeta.auditMode || import.meta.env?.VITE_AUDIT_MODE || "").includes("immutable") || auditLog.length > 0;
  const backupReady = Boolean(dbMeta.lastBackupAt || dbMeta.lastRestoreAt || snapshot.productionHardeningSnapshot?.backupCheckedAt);
  const deploymentReady = Boolean(snapshot.goLiveSnapshot || goLiveReport.checkedAt || deploymentToolkitReady);
  const apiReady = apiWebhookRows.length > 0 && apiWebhookRows.some((row) => row.lastTestAt || row.health === "Test OK");
  const activeNotificationProviders = notificationProviderRows.filter((provider) => provider.status === "Aktiv" && provider.enabled !== false);
  const secretsHealthy = apiSecretRows.length > 0 && apiSecretRows.every((secret) => !normalize(secret.health).includes("tapılmadı"));

  const items = [
    {
      area: "Backend sərtləşdirmə",
      status: isServerRuntime && immutableAudit ? "Hazır" : "Nəzarət",
      score: isServerRuntime && immutableAudit ? 100 : immutableAudit ? 70 : 45,
      detail: `${dbMeta.provider || defaultDbProvider} · ${dbMeta.runtime || "browser"} · audit ${dbMeta.auditMode || "client audit"}`,
      next: isServerRuntime ? "Server-side permission və migration yoxlaması davamlı saxlanılsın" : "Frontend local cache əsas data mənbəyi olmamalıdır",
    },
    {
      area: "Backup/Restore",
      status: backupReady ? "Hazır" : "Nəzarət",
      score: backupReady ? 100 : 65,
      detail: dbMeta.lastBackupAt || dbMeta.lastRestoreAt || "Backup izi hələ yaradılmayıb",
      next: backupReady ? "Gündəlik avtomatik server snapshot planlaşdırılsın" : "İlk backup export/import və ya server snapshot yaradılmalıdır",
    },
    {
      area: "Deployment monitorinqi",
      status: deploymentReady && goLiveReport.score >= 70 ? "Hazır" : "Nəzarət",
      score: deploymentReady ? Math.max(70, Number(goLiveReport.score || 70)) : 55,
      detail: `Go-live ${goLiveReport.status || "yoxlanmayıb"} · deploy toolkit ${deploymentToolkitReady ? "hazır" : "yoxdur"}`,
      next: "Health endpoint, smoke test və deploy nəticəsi release checklist-də saxlanmalıdır",
    },
    {
      area: "Real provider inteqrasiyaları",
      status: apiReady && activeNotificationProviders.length >= 2 && secretsHealthy ? "Hazır" : "Nəzarət",
      score: apiReady && activeNotificationProviders.length >= 2 && secretsHealthy ? 95 : 68,
      detail: `${activeNotificationProviders.length} bildiriş provider · ${apiWebhookRows.length} webhook · ${apiSecretRows.length} secret`,
      next: "SMS/email/payment provider-lər backend secret-lərlə canlı mühitdə yoxlanmalıdır",
    },
    {
      area: "Kodun modullara parçalanması",
      status: "Nəzarət",
      score: 60,
      detail: "UI və biznes məntiqi hələ əsasən App qatındadır",
      next: "Satış, kredit, anbar, maliyyə, HR, KPI və API ayrıca route/module paketlərinə çıxarılmalıdır",
    },
  ];
  const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  const blockers = items.filter((item) => item.status === "Bloker").length;
  const watch = items.filter((item) => item.status === "Nəzarət").length;

  return {
    checkedAt: new Date().toISOString(),
    status: blockers > 0 ? "Bloker var" : watch > 0 ? "Production nəzarəti" : "Production hazır",
    score,
    blockers,
    watch,
    ready: items.filter((item) => item.status === "Hazır").length,
    items,
  };
}

function buildModuleReadiness(snapshot = {}, integrityReport = {}) {
  const orders = snapshot.orders || [];
  const customers = snapshot.customers || [];
  const warehouses = snapshot.warehouses || [];
  const products = snapshot.products || [];
  const warehouseStock = snapshot.warehouseStock || {};
  const expenses = snapshot.expenses || [];
  const cashEntries = snapshot.cashEntries || [];
  const purchaseOrders = snapshot.purchaseOrders || [];
  const employees = snapshot.employees || [];
  const departments = snapshot.departments || [];
  const credits = buildAllCreditRecords(orders, snapshot.credits || []);
  const contracts = snapshot.contracts || [];
  const salesBonuses = buildSalesBonusRows(orders);
  const integrityIssues = integrityReport.issues || [];
  const hasCriticalIntegrity = Number(integrityReport.critical || 0) > 0;
  const deliveryOrders = orders.filter(isDeliveryQueueOrder);
  const blockedDeliveries = deliveryOrders.filter((order) => {
    const warehouseId = order.warehouseId || warehouses[0]?.id || "";
    return !getDeliveryStockCheck({ ...order, warehouseId }, warehouseStock).ok;
  });
  const allStockRows = Object.values(warehouseStock).flatMap((rows) => rows || []);
  const totalStock = allStockRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reservedStock = allStockRows.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const lowStockRows = allStockRows.filter((item) => {
    const product = products.find((row) => normalize(row.name) === normalize(item.product));
    const reorderLevel = Number(item.reorderLevel ?? product?.reorderLevel ?? 0);
    return reorderLevel > 0 && getAvailableQuantity(item) <= reorderLevel;
  });
  const creditOrders = orders.filter((order) => getOrderPaymentMethod(order) === "Kredit");
  const salesLinkIssues = creditOrders.filter(
    (order) =>
      !credits.some((credit) => credit.orderId === order.id || credit.id === order.creditId) ||
      !contracts.some((contract) => contract.orderId === order.id || contract.id === order.contractId),
  );
  const customer360Rows = customers.filter(
    (customer) =>
      getCustomerOrders(customer, orders).length > 0 ||
      getCustomerRelatedCredits(customer, credits).length > 0 ||
      getCustomerContracts(customer, contracts).length > 0,
  );
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const unpaidCreditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const approvedCashExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense));
  const payrollExpense = expenses.find((expense) => expense.source === "HR Payroll");
  const openPurchaseOrders = purchaseOrders.filter((po) => !["Təsdiq edildi", "Ləğv edildi"].includes(po.status));
  const approvedPurchaseOrders = purchaseOrders.filter((po) => po.status === "Təsdiq edildi");
  const vendorNames = new Set((snapshot.vendors || []).map((vendor) => normalize(vendor.name)));
  const missingVendorPo = purchaseOrders.filter((po) => po.vendor && !vendorNames.has(normalize(po.vendor)));
  const employeesWithManagers = employees.filter((employee) => employee.managerId || employee.managerName);
  const hrIntegrityIssues = integrityIssues.filter((issue) => issue.area === "HR");

  const statusFrom = ({ blockers = 0, warnings = 0, hasData = true }) => {
    if (blockers > 0) return "Bloker";
    if (warnings > 0 || !hasData) return "Nəzarət";
    return "Hazır";
  };

  const items = [
    {
      module: "sales",
      title: "Satış",
      status: statusFrom({ blockers: salesLinkIssues.length, warnings: orders.length === 0 ? 1 : 0, hasData: orders.length > 0 }),
      primary: `${orders.length} sifariş`,
      secondary: `${creditOrders.length} kredit satış`,
      detail: "Sifariş, rezerv, bonus, kredit və müqavilə bağlantısı",
      next: salesLinkIssues.length
        ? "Kredit satışlarda müqavilə/kredit linklərini tamamlayın"
        : orders.length
          ? "UAT üçün real satış ssenarilərini işlədin"
          : "İlk satış sifarişini yaradın",
    },
    {
      module: "warehouse",
      title: "Anbar",
      status: statusFrom({ blockers: hasCriticalIntegrity ? 1 : 0, warnings: lowStockRows.length, hasData: warehouses.length > 0 && products.length > 0 }),
      primary: `${totalStock} ümumi stok`,
      secondary: `${reservedStock} rezerv`,
      detail: "Qalıq, minimum stok, mədaxil, import/export və PO örtüyü",
      next: lowStockRows.length
        ? "Minimumdan aşağı məhsullar üçün PO yaradın"
        : totalStock
          ? "Cycle count və export yoxlamasını saxlayın"
          : "Anbara ilk mədaxili edin",
    },
    {
      module: "deliveries",
      title: "Təhvil",
      status: statusFrom({ blockers: blockedDeliveries.length, warnings: deliveryOrders.length, hasData: true }),
      primary: `${deliveryOrders.length} gözləyir`,
      secondary: `${blockedDeliveries.length} bloklu`,
      detail: "Yalnız rezervli sifarişlər görünür, Təhvil verildi stokdan çıxır",
      next: blockedDeliveries.length
        ? "Bloklu təhvillərdə rezerv/stok uyğunsuzluğunu bağlayın"
        : deliveryOrders.length
          ? "Hazır sifarişləri Təhvil verildi ilə tamamlayın"
          : "Açıq təhvil növbəsi yoxdur",
    },
    {
      module: "credits",
      title: "Kredit",
      status: statusFrom({ blockers: salesLinkIssues.length, warnings: overdueCredits.length, hasData: credits.length > 0 }),
      primary: `${credits.length} müqavilə`,
      secondary: money(unpaidCreditBalance),
      detail: "Hər kredit satışı ayrıca müqavilə və ödəniş cədvəli kimi qalır",
      next: overdueCredits.length
        ? "Gecikən kreditlər üzrə ödəniş və xatırlatma işlədin"
        : credits.length
          ? "Aylıq ödəniş tarixlərini UAT-da yoxlayın"
          : "Kredit satış yaradın",
    },
    {
      module: "crm",
      title: "CRM 360",
      status: statusFrom({ warnings: customers.length > 0 && customer360Rows.length === 0 ? 1 : 0, hasData: customers.length > 0 }),
      primary: `${customers.length} müştəri`,
      secondary: `${customer360Rows.length} 360 kart`,
      detail: "Müştəri, müqavilə, cihaz, ödəniş və qalıq borc görünüşü",
      next: customers.length
        ? "Müştəri kartlarında kredit və satış tarixçəsini yoxlayın"
        : "İlk müştərini yaradın",
    },
    {
      module: "finance",
      title: "Maliyyə",
      status: statusFrom({ warnings: expenses.length + cashEntries.length === 0 ? 1 : 0, hasData: true }),
      primary: `${cashEntries.length} kassa girişi`,
      secondary: `${approvedCashExpenses.length} təsdiqli xərc`,
      detail: "Satış, kredit ödənişi, PO xərci və payroll accrual ayrılır",
      next: payrollExpense?.cashImpact === false
        ? "Kassa/bank hesabları üzrə real açılış balanslarını yoxlayın"
        : "HR payroll cash-neutral accrual kimi yaradılmalıdır",
    },
    {
      module: "vendors",
      title: "Vendor + PO",
      status: statusFrom({ blockers: missingVendorPo.length, warnings: openPurchaseOrders.length, hasData: (snapshot.vendors || []).length > 0 }),
      primary: `${purchaseOrders.length} PO`,
      secondary: `${approvedPurchaseOrders.length} təsdiqli`,
      detail: "Zavod sifarişi, təsdiq, anbara mədaxil və maliyyə xərci",
      next: missingVendorPo.length
        ? "Vendoru olmayan PO-ları vendor kartına bağlayın"
        : openPurchaseOrders.length
          ? "Açıq PO-ları təsdiqləyin və anbara mədaxil edin"
          : "Minimum stok siqnallarından yeni PO yaradın",
    },
    {
      module: "hr",
      title: "HR",
      status: statusFrom({ blockers: hrIntegrityIssues.filter((issue) => issue.severity === "Kritik").length, warnings: employees.length === 0 ? 1 : 0, hasData: employees.length > 0 }),
      primary: `${employees.length} əməkdaş`,
      secondary: `${departments.length} şöbə`,
      detail: "Struktur ağacı, əməkdaş CRUD, məzuniyyət, vakansiya və payroll",
      next: employeesWithManagers.length
        ? "Struktur ağacını periodik yeniləyin"
        : "Kim kimə tabedir məlumatını tamamlayın",
    },
    {
      module: "kpi",
      title: "KPI",
      status: statusFrom({ warnings: salesBonuses.length === 0 ? 1 : 0, hasData: employees.length > 0 }),
      primary: `${salesBonuses.length} bonus sətri`,
      secondary: `${employees.length} əməkdaş`,
      detail: "Satış bonusları KPI nəticələrinə ayrıca düşür",
      next: salesBonuses.length
        ? "Aylıq bonus filterlərini yoxlayın"
        : "Bonuslu satış yaradın",
    },
  ];

  const ready = items.filter((item) => item.status === "Hazır").length;
  const watch = items.filter((item) => item.status === "Nəzarət").length;
  const blockers = items.filter((item) => item.status === "Bloker").length;
  const score = Math.max(0, Math.round((ready / Math.max(items.length, 1)) * 100 - blockers * 10));

  return {
    checkedAt: new Date().toISOString(),
    status: blockers > 0 ? "Bloker var" : watch > 0 ? "Təhvil nəzarətdə" : "Təhvilə hazır",
    ready,
    watch,
    blockers,
    score,
    items,
  };
}

function addStockToRows(rows, product, qty, price, warehouseId = "", productMeta = {}) {
  const amount = Math.max(0, Math.round(Number(qty || 0)));
  if (!product || amount <= 0) return rows;

  const exists = rows.some((item) => item.product === product);
  if (exists) {
    return rows.map((item) => {
      if (item.product !== product) return item;

      const nextItem = {
        ...item,
        total: Number(item.total || 0) + amount,
        price: Number(price || item.price || 0),
        ...(Number.isFinite(Number(productMeta.costPrice)) ? { costPrice: Number(productMeta.costPrice) } : {}),
        ...(productMeta.sku ? { sku: productMeta.sku } : {}),
        ...(productMeta.category ? { category: productMeta.category } : {}),
        ...(productMeta.unit ? { unit: productMeta.unit } : {}),
        ...(typeof productMeta.serialTracked === "boolean" ? { serialTracked: productMeta.serialTracked } : {}),
        ...(Number.isFinite(Number(productMeta.reorderLevel)) ? { reorderLevel: Number(productMeta.reorderLevel) } : {}),
      };
      return {
        ...nextItem,
        serials: ensureStockItemSerials(nextItem, warehouseId).serials,
      };
    });
  }

  return [
    ...rows,
    ensureStockItemSerials(
      {
        product,
        total: amount,
        reserved: 0,
        price: Number(price || 0),
        ...(Number.isFinite(Number(productMeta.costPrice)) ? { costPrice: Number(productMeta.costPrice) } : {}),
        ...(productMeta.sku ? { sku: productMeta.sku } : {}),
        ...(productMeta.category ? { category: productMeta.category } : {}),
        ...(productMeta.unit ? { unit: productMeta.unit } : {}),
        ...(typeof productMeta.serialTracked === "boolean" ? { serialTracked: productMeta.serialTracked } : {}),
        ...(Number.isFinite(Number(productMeta.reorderLevel)) ? { reorderLevel: Number(productMeta.reorderLevel) } : {}),
      },
      warehouseId,
    ),
  ];
}

function buildPayrollExpense(employees) {
  const payrollRows = buildHrEmployeeRecords(employees);
  const netTotal = payrollRows.reduce((sum, employee) => sum + Number(employee.netSalary || 0), 0);
  const grossTotal = payrollRows.reduce((sum, employee) => sum + Number(employee.salary || 0) + Number(employee.bonus || 0), 0);
  const deductions = payrollRows.reduce((sum, employee) => sum + Number(employee.tax || 0) + Number(employee.social || 0), 0);
  const employerCost = payrollRows.reduce((sum, employee) => sum + Number(employee.employerCost || 0), 0);

  return {
    id: `PAY-${baseFinanceDate.slice(0, 7)}`,
    description: `HR payroll - ${baseFinanceDate.slice(0, 7)}`,
    category: "Payroll",
    date: baseFinanceDate,
    amount: employerCost || netTotal,
    status: "Təsdiq gözləyir",
    source: "HR Payroll",
    cashImpact: false,
    cashImpactNote: "HR payroll uçot/accrual xərcidir, real kassadan avtomatik çıxılmır.",
    grossTotal,
    deductions,
    netTotal,
    employerCost,
    payrollRows,
  };
}

export function getModuleForPermission(permission) {
  return getModuleForPermissionFromCatalog(permission, modulePermissionCatalog);
}

function hasEffectivePermission(settings, permission) {
  if (!hasRolePermission(settings, permission)) return false;
  return hasUserModuleAccess(settings, getModuleForPermission(permission));
}

function canAccessNavItem(settings, id) {
  const permission = navPermissionByType[id];
  return hasUserModuleAccess(settings, id) && (!permission || hasRolePermission(settings, permission));
}

function getPageActionPermission(moduleId) {
  return pageActionPermissionByType[moduleId] || null;
}

function hasPageAction(moduleId) {
  return Boolean(pageMeta[moduleId]?.action) && !pageActionlessModules.has(moduleId);
}

export function userHasEffectivePermission(user, roles, permission) {
  if (!permission) return true;
  if (!user) return false;
  if (user.role === "Super Admin" || user.role === "Platform Super Admin") return true;
  const role = roles.find((item) => item.name === user.role);
  const roleAllows = Array.isArray(role?.permissions) && role.permissions.includes(permission);
  const moduleId = getModuleForPermission(permission);
  const moduleAllows = !moduleId || normalizeUserModuleAccess(user, roles).includes(moduleId);
  return roleAllows && moduleAllows;
}

// Bu kolleksiyalar artıq real Supabase cədvəllərində saxlanılır — blob snapshot-a yazılmır.
export const dbBackedCollections = [
  "customers",
  "products",
  "orders",
  "invoices",
  "stock",
  "warehouses",
  "vendors",
  "accounting",
];

export function stripDbBackedCollections(state) {
  const next = { ...state };
  dbBackedCollections.forEach((key) => {
    if (key in next) delete next[key];
  });
  return next;
}

function App() {

  const [state, setState] = useState(() => hydrateState(initialState));
  const [tenantStateReady, setTenantStateReady] = useState(false);
  const tenantSnapshotUnavailable = useRef(false);
  const { activeTenantId, isPlatformAdmin, user: authUser } = useAuth();
  const { customers: dbCustomers, create: createDbCustomer, remove: deleteDbCustomer } = useCustomers(activeTenantId);
  const { products: dbProducts, create: createDbProduct, update: updateDbProduct, remove: deleteDbProduct } = useProducts(activeTenantId);
  const { orders: dbOrders, create: createDbOrder, updateHeader: updateDbOrder, remove: deleteDbOrder } = useOrders(activeTenantId);

  useEffect(() => {
    let cancelled = false;
    setTenantStateReady(false);
    if (!activeTenantId) return () => { cancelled = true; };

    supabase
      .from("tenant_state_snapshots")
      .select("state, schema_version")
      .eq("tenant_id", activeTenantId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          tenantSnapshotUnavailable.current = true;
          const cacheKey = `${localDbKey}.${activeTenantId}`;
          let cachedState = null;
          try {
            cachedState = JSON.parse(window.localStorage.getItem(cacheKey) || "null");
          } catch {
            cachedState = null;
          }
          console.warn("[tenant-state] server snapshot unavailable; tenant cache is active", {
            code: error.code,
            message: error.message,
          });
          setState(hydrateState(cachedState || initialState));
        } else {
          tenantSnapshotUnavailable.current = false;
          setState(hydrateState(data?.state || initialState));
        }
        setTenantStateReady(true);
      });

    return () => { cancelled = true; };
  }, [activeTenantId]);

  // Read-bridge: overlay DB data onto legacy state when present.
  useEffect(() => {
    if (!activeTenantId || !tenantStateReady) return;
    if (dbCustomers.length === 0 && dbProducts.length === 0 && dbOrders.length === 0) return;
    setState((prev) => ({
      ...prev,
      ...(dbCustomers.length ? { customers: dbCustomers.map(dbCustomerToLegacy) } : {}),
      ...(dbProducts.length ? { products: dbProducts.map(dbProductToLegacy) } : {}),
      ...(dbOrders.length ? { orders: dbOrders.map(dbOrderToLegacy) } : {}),
    }));
  }, [activeTenantId, tenantStateReady, dbCustomers, dbProducts, dbOrders]);

  const location = useLocation();
  const navigate = useNavigate();
  const [active, setActiveState] = useState(() => moduleFromPath(location.pathname));
  const setActive = useCallback((id) => {
    setActiveState(id);
    const target = pathForModule(id);
    if (location.pathname !== target && !location.pathname.startsWith(target + "/")) {
      navigate(target);
    }
  }, [navigate, location.pathname]);
  useEffect(() => {
    const fromUrl = moduleFromPath(location.pathname);
    setActiveState((prev) => (prev === fromUrl ? prev : fromUrl));
    // Köhnə/alias URL-lərini kanonik yeni ünvana yönləndir.
    const target = canonicalPath(location.pathname);
    if (target && target !== "/") {
      navigate(target + location.search + location.hash, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);


  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [selectedCreditId, setSelectedCreditId] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [notificationFilter, setNotificationFilter] = useState("Cəmi");
  const [conversationId, setConversationId] = useState("c1");
  const [draftMessage, setDraftMessage] = useState("");
  const [selectedSupportTicketId, setSelectedSupportTicketId] = useState("");
  const [remoteAuthStatus, setRemoteAuthStatus] = useState(remoteApiEnabled ? "checking" : "local");
  const [authError, setAuthError] = useState("");
  const [remoteUser, setRemoteUser] = useState(null);
  const remoteSaveTimer = useRef(null);
  const tenantSaveTimer = useRef(null);
  const syncedAuditIds = useRef(new Set());
  const notificationAutoRunRef = useRef("");
  const creditRecords = useMemo(
    () => buildAllCreditRecords(state.orders, state.credits),
    [state.orders, state.credits],
  );
  const salesBonusRows = useMemo(() => buildSalesBonusRows(state.orders), [state.orders]);
  const kpiEmployeeRows = useMemo(
    () => buildKpiEmployeeScoreRows(state.employees, salesBonusRows),
    [state.employees, salesBonusRows],
  );
  const kpiTargetRows = useMemo(
    () =>
      buildKpiTargetRows({
        targets: state.kpiTargets || [],
        employees: state.employees,
        employeeRows: kpiEmployeeRows,
        salesBonuses: salesBonusRows,
      }),
    [state.kpiTargets, state.employees, kpiEmployeeRows, salesBonusRows],
  );
  const activeKpiPeriod = useMemo(() => {
    const period = getKpiPeriodKey();
    const existing = (state.kpiPeriods || []).find((item) => item.period === period);
    return buildKpiPeriodSnapshot({
      period,
      targetRows: kpiTargetRows,
      employeeRows: kpiEmployeeRows,
      salesBonuses: salesBonusRows,
      existing,
    });
  }, [state.kpiPeriods, kpiTargetRows, kpiEmployeeRows, salesBonusRows]);
  const currentUser = useMemo(() => getCurrentUser(state.settings), [state.settings]);
  const activeRoleInfo = useMemo(() => getActiveRole(state.settings), [state.settings]);
  const { can: dbCan, role: dbRole } = usePermissions();
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => {
      // "Şirkətlər" (platform) is only for super-admins
      if (item.id === "platform") return isPlatformAdmin;
      if (item.id === "roles") return dbRole === "owner" || dbRole === "admin";
      const legacyOk = canAccessNavItem(state.settings, item.id);
      const dbOk = dbRole ? dbCan(item.id, "view") : true;
      return legacyOk && dbOk;
    }),
    [state.settings, remoteUser?.role, dbRole, dbCan, isPlatformAdmin],
  );

  const receivableRows = useMemo(
    () =>
      buildReceivableRows({
        customers: state.customers,
        orders: state.orders,
        credits: creditRecords,
        vendors: state.vendors,
        purchaseOrders: state.purchaseOrders || [],
      }),
    [state.customers, state.orders, creditRecords, state.vendors, state.purchaseOrders],
  );
  const projectRoiRows = useMemo(
    () =>
      buildProjectRoiRows({
        projects: state.projects || [],
        orders: state.orders,
        expenses: state.expenses,
        products: state.products || [],
      }),
    [state.projects, state.orders, state.expenses, state.products],
  );
  const notificationProviderRows = useMemo(
    () => buildNotificationProviderRows(state.notificationProviders || [], state.settings, state.notificationSendLog || []),
    [state.notificationProviders, state.settings, state.notificationSendLog],
  );
  const notificationAutomationRows = useMemo(
    () =>
      buildNotificationAutomationRows({
        notificationRules: state.notificationRules || [],
        providers: state.notificationProviders || [],
        settings: state.settings,
        sendLog: state.notificationSendLog || [],
        credits: creditRecords,
        stock: state.stock,
        warehouseStock: state.warehouseStock,
        products: state.products || [],
        purchaseOrders: state.purchaseOrders || [],
        expenses: state.expenses,
        orders: state.orders,
      }),
    [state.notificationRules, state.notificationProviders, state.settings, state.notificationSendLog, creditRecords, state.stock, state.warehouseStock, state.products, state.purchaseOrders, state.expenses, state.orders],
  );

  useEffect(() => {
    const creditRules = notificationAutomationRows.filter(
      (rule) =>
        ["RULE-CREDIT-OVERDUE", "RULE-CREDIT-UPCOMING"].includes(rule.id) &&
        rule.status === "Aktiv" &&
        Number(rule.queueCount || 0) > 0,
    );
    const autoKey = creditRules
      .flatMap((rule) => (rule.events || []).map((event) => event.dedupeKey || getNotificationEventKey(rule, event)))
      .sort()
      .join("|");

    if (!autoKey || notificationAutoRunRef.current === autoKey) return;
    notificationAutoRunRef.current = autoKey;

    const stamp = getActionStamp();
    const deliveries = buildNotificationDeliveriesForRules({
      rules: creditRules,
      providerRows: notificationProviderRows,
      settings: state.settings,
      stamp,
      source: "Avtomatik kredit monitoru",
    });

    if (deliveries.length === 0) return;
    persistNotificationDeliveries(deliveries);

    setState((current) => {
      const existingKeys = new Set((current.notificationSendLog || []).map((log) => log.dedupeKey).filter(Boolean));
      const freshDeliveries = deliveries.filter((delivery) => !delivery.dedupeKey || !existingKeys.has(delivery.dedupeKey));
      if (freshDeliveries.length === 0) return current;

      const sentCount = freshDeliveries.filter((item) => item.status === "Göndərildi").length;
      const blockedCount = freshDeliveries.length - sentCount;
      const touchedRuleIds = new Set(freshDeliveries.map((item) => item.ruleId));
      const providerUse = freshDeliveries.reduce((map, item) => {
        if (!item.providerId) return map;
        map.set(item.providerId, (map.get(item.providerId) || 0) + (item.status === "Göndərildi" ? 1 : 0));
        return map;
      }, new Map());

      return appendAudit(
        {
          ...current,
          notificationSweepAt: stamp,
          notificationSendLog: [...freshDeliveries, ...(current.notificationSendLog || [])].slice(0, 120),
          notificationDispatchSnapshot: {
            at: stamp,
            total: freshDeliveries.length,
            sent: sentCount,
            blocked: blockedCount,
            rules: creditRules.length,
            source: "Avtomatik kredit monitoru",
            autoRunKey: autoKey,
          },
          notificationRules: ensureNotificationRules(current.notificationRules || []).map((rule) =>
            touchedRuleIds.has(rule.id)
              ? {
                  ...rule,
                  lastRunAt: stamp,
                  sentCount:
                    Number(rule.sentCount || 0) +
                    freshDeliveries.filter((item) => item.ruleId === rule.id && item.status === "Göndərildi").length,
                  failedCount:
                    Number(rule.failedCount || 0) +
                    freshDeliveries.filter((item) => item.ruleId === rule.id && item.status !== "Göndərildi").length,
                  lastStatus: freshDeliveries.some((item) => item.ruleId === rule.id && item.status !== "Göndərildi")
                    ? "Qismən bloklandı"
                    : "Göndərildi",
                }
              : rule,
          ),
          notificationProviders: ensureNotificationProviders(current.notificationProviders || []).map((provider) =>
            providerUse.has(provider.id)
              ? {
                  ...provider,
                  lastSentAt: stamp,
                  sentCount: Number(provider.sentCount || 0) + providerUse.get(provider.id),
                }
              : provider,
          ),
          notifications: [
            ...freshDeliveries.slice(0, 10).map((delivery) => ({
              id: `IN-${delivery.id}`,
              type: delivery.channel,
              title: `${delivery.ruleName}: ${delivery.status}`,
              body: `${delivery.recipient} · ${delivery.body}`,
              time: stamp,
              unread: true,
              deliveryId: delivery.id,
              module: delivery.module,
              entityId: delivery.entityId,
              actionTarget: delivery.actionTarget,
            })),
            ...(current.notifications || []),
          ],
        },
        {
          module: "Bildiriş",
          action: "Avtomatik kredit monitoru işlədi",
          detail: `${sentCount} göndərildi · ${blockedCount} bloklandı · ${creditRules.length} qayda`,
          status: "Avtomatik",
          role: "System",
        },
      );
    });
  }, [notificationAutomationRows, notificationProviderRows, state.settings]);

  const productionRows = useMemo(
    () => buildProductionPlanRows(state.productionPlans || [], state.stock, state.warehouseStock, state.products || [], state.warehouses),
    [state.productionPlans, state.stock, state.warehouseStock, state.products, state.warehouses],
  );
  const onboardingRows = useMemo(() => buildOnboardingRows(state.onboarding, state), [state.onboarding, state]);
  const invoiceRows = useMemo(
    () =>
      buildInvoiceRows({
        orders: state.orders,
        settings: state.settings,
        invoiceSettings: state.invoiceSettings,
      }),
    [state.orders, state.settings, state.invoiceSettings],
  );
  const payrollTaxRows = useMemo(
    () => buildPayrollTaxCalculatorRows(buildHrEmployeeRecords(state.employees)),
    [state.employees],
  );
  const messageConversations = useMemo(
    () => (state.conversations || []).map(normalizeMessageThread),
    [state.conversations],
  );
  const messageParticipantOptions = useMemo(
    () => buildMessageParticipantOptions(state.settings, state.employees),
    [state.settings, state.employees],
  );
  const messageContextOptions = useMemo(
    () =>
      buildMessageContextOptions({
        customers: state.customers,
        orders: state.orders,
        credits: creditRecords,
        tickets: state.supportTickets || [],
      }),
    [state.customers, state.orders, creditRecords, state.supportTickets],
  );
  const financeOpeningBalance = useMemo(
    () => total(state.financeAccounts || [], "openingBalance"),
    [state.financeAccounts],
  );
  const accountingData = useMemo(
    () =>
      buildAccountingData({
        orders: state.orders,
        expenses: state.expenses,
        cashEntries: state.cashEntries || [],
        credits: creditRecords,
        stock: state.stock,
        invoices: invoiceRows,
        openingBalance: financeOpeningBalance,
      }),
    [state.orders, state.expenses, state.cashEntries, creditRecords, state.stock, invoiceRows, financeOpeningBalance],
  );
  const taxCalendarRows = useMemo(
    () =>
      buildTaxCalendarRows({
        taxCalendar: state.taxCalendar || [],
        invoices: invoiceRows,
        payrollTaxRows,
        accounting: accountingData,
      }),
    [state.taxCalendar, invoiceRows, payrollTaxRows, accountingData],
  );
  const currencyExposureRows = useMemo(
    () =>
      buildCurrencyExposureRows({
        currencyRates: state.currencyRates || [],
        orders: state.orders,
        credits: creditRecords,
        cashEntries: state.cashEntries || [],
      }),
    [state.currencyRates, state.orders, creditRecords, state.cashEntries],
  );
  const apiWebhookRows = useMemo(
    () =>
      buildApiWebhookRows({
        apiWebhooks: state.apiWebhooks || [],
        apiSecrets: state.apiSecrets || [],
        apiWebhookLogs: state.apiWebhookLogs || [],
        invoices: invoiceRows,
        credits: creditRecords,
        stock: state.stock,
        products: state.products || [],
        purchaseOrders: state.purchaseOrders || [],
        expenses: state.expenses,
      }),
    [state.apiWebhooks, state.apiSecrets, state.apiWebhookLogs, invoiceRows, creditRecords, state.stock, state.products, state.purchaseOrders, state.expenses],
  );
  const apiSecretRows = useMemo(
    () => buildApiSecretRows(state.apiSecrets || [], state.apiWebhooks || []),
    [state.apiSecrets, state.apiWebhooks],
  );
  const todayActionRows = useMemo(
    () =>
      buildTodayActionRows({
        credits: creditRecords,
        orders: state.orders,
        expenses: state.expenses,
        stock: state.stock,
        products: state.products || [],
        invoices: invoiceRows,
        taxRows: taxCalendarRows,
      }),
    [creditRecords, state.orders, state.expenses, state.stock, state.products, invoiceRows, taxCalendarRows],
  );
  const integrityReport = useMemo(
    () => buildStateIntegrityReport(state, creditRecords),
    [state, creditRecords],
  );
  const goLiveReport = useMemo(
    () => buildGoLiveReadiness(state, integrityReport),
    [state, integrityReport],
  );
  const productionHardeningReport = useMemo(
    () =>
      buildProductionHardeningReport(state, {
        goLiveReport,
        apiWebhookRows,
        apiSecretRows,
        notificationProviderRows,
      }),
    [state, goLiveReport, apiWebhookRows, apiSecretRows, notificationProviderRows],
  );
  const moduleReadiness = useMemo(
    () => buildModuleReadiness(state, integrityReport),
    [state, integrityReport],
  );
  const helpModuleGuides = useMemo(
    () => buildHelpModuleGuides({ moduleReadiness, onboardingRows }),
    [moduleReadiness, onboardingRows],
  );
  const helpArticles = useMemo(
    () => buildHelpArticles(state.knowledgeBase || [], helpModuleGuides, onboardingRows),
    [state.knowledgeBase, helpModuleGuides, onboardingRows],
  );

  useEffect(() => {
    if (Number(state.dbMeta?.baselineVersion || 0) >= localDbBaselineVersion) return;
    setState(hydrateState(initialState));
  }, [state.dbMeta?.baselineVersion]);

  useEffect(() => {
    if (!remoteApiEnabled) return undefined;
    let active = true;
    const token = getRemoteToken();

    if (!token) {
      setState((current) =>
        hydrateState({
          ...current,
          settings: { ...current.settings, sessionUserId: null },
        }),
      );
      setRemoteAuthStatus("signedOut");
      return undefined;
    }

    getRemoteSession()
      .then(async (session) => {
        if (!active) return;
        setRemoteUser(session.user);
        if (session.user.mustChangePassword) {
          setRemoteAuthStatus("signedIn");
          setAuthError("");
          return;
        }
        const payload = await loadRemoteState();
        if (!active) return;
        const tenantUsers = payload.state?.settings?.users || initialState.settings.users || [];
        const sessionUser = { ...session.user, moduleAccess: session.user.companyModules || navItems.map((item) => item.id) };
        const users = tenantUsers.some((user) => user.id === session.user.id)
          ? tenantUsers.map((user) => (user.id === session.user.id ? { ...user, ...sessionUser } : user))
          : [sessionUser, ...tenantUsers];
        setState(
          hydrateState({
            ...(payload.state || initialState),
            settings: {
              ...(payload.state?.settings || initialState.settings),
              users,
              sessionUserId: session.user.id,
              currentRole: session.user.role,
            },
          }),
        );
        setRemoteAuthStatus("signedIn");
        setAuthError("");
      })
      .catch((error) => {
        if (!active) return;
        setRemoteUser(null);
        setRemoteToken("");
        setState((current) =>
          hydrateState({
            ...current,
            settings: { ...current.settings, sessionUserId: null },
          }),
        );
        setRemoteAuthStatus("signedOut");
        setAuthError(error instanceof Error ? error.message : "Server sessiyası açılmadı.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const cacheKey = activeTenantId ? `${localDbKey}.${activeTenantId}` : localDbKey;
      window.localStorage.setItem(cacheKey, JSON.stringify(state));
    } catch {
      notify("Local DB yazılışı mümkün olmadı.", "warning");
    }
    if (activeTenantId && authUser?.id && tenantStateReady && !tenantSnapshotUnavailable.current) {
      window.clearTimeout(tenantSaveTimer.current);
      tenantSaveTimer.current = window.setTimeout(() => {
        supabase
          .from("tenant_state_snapshots")
          .upsert(
            {
              tenant_id: activeTenantId,
              state: stripDbBackedCollections(state),
              schema_version: localDbSchemaVersion,
              updated_at: new Date().toISOString(),
              updated_by: authUser.id,
            },
            { onConflict: "tenant_id" },
          )
          .then(({ error }) => {
            if (error) {
              console.error("[tenant-state] save failed", error);
              setAuthError("Şirkət datası serverdə saxlanmadı. Administrator icazəsini yoxlayın.");
            }
          });
      }, 800);
    }


    if (!remoteApiEnabled || !getRemoteToken()) {
      return () => window.clearTimeout(tenantSaveTimer.current);
    }
    window.clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = window.setTimeout(() => {
      saveRemoteState(state).catch((error) => {
        setAuthError(error instanceof Error ? error.message : "Serverə yazılış alınmadı.");
      });
    }, 500);
    return () => {
      window.clearTimeout(remoteSaveTimer.current);
      window.clearTimeout(tenantSaveTimer.current);
    };
  }, [state, remoteUser?.role, activeTenantId, authUser?.id, tenantStateReady]);

  useEffect(() => {
    const entry = state.auditLog?.[0];
    if (!entry?.id || !activeTenantId || !authUser?.id || syncedAuditIds.current.has(entry.id)) return;

    syncedAuditIds.current.add(entry.id);
    supabase
      .from("audit_events")
      .upsert(
        {
          id: entry.id,
          tenant_id: activeTenantId,
          actor_id: authUser.id,
          actor_role: entry.role || activeRoleInfo?.name || "System",
          module: entry.module || "Sistem",
          action: entry.action || "Əməliyyat",
          detail: entry.detail || "",
          status: entry.status || "Tamamlandı",
          payload: entry,
          occurred_at: entry.date || new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .then(({ error }) => {
        if (error) {
          syncedAuditIds.current.delete(entry.id);
          console.warn("[audit] immutable server log unavailable", {
            code: error.code,
            message: error.message,
          });
        }
      });
  }, [state.auditLog, activeTenantId, authUser?.id, activeRoleInfo?.name]);

  useEffect(() => {
    if (state.employees.length === 0) return;

    setState((current) => {
      const payrollExpense = buildPayrollExpense(current.employees);
      const existing = current.expenses.find((expense) => expense.id === payrollExpense.id);
      const nextExpense = existing
        ? {
            ...existing,
            ...payrollExpense,
            status: existing.status || payrollExpense.status,
          }
        : payrollExpense;
      const isSame =
        existing &&
        Number(existing.amount || 0) === payrollExpense.amount &&
        Number(existing.grossTotal || 0) === payrollExpense.grossTotal &&
        Number(existing.deductions || 0) === payrollExpense.deductions &&
        existing.source === payrollExpense.source &&
        existing.cashImpact === payrollExpense.cashImpact;

      if (isSame) return current;

      const expenses = existing
        ? current.expenses.map((expense) => (expense.id === payrollExpense.id ? nextExpense : expense))
        : [nextExpense, ...current.expenses];

      return appendAudit(
        {
          ...current,
          expenses,
        },
        {
          module: "HR/Maliyyə",
          action: existing ? "Payroll expense yeniləndi" : "Payroll expense yaradıldı",
          detail: `${money(payrollExpense.amount)} payroll maliyyəyə avtomatik düşdü`,
          status: "Avtomatik",
          role: "System",
        },
      );
    });
  }, [state.employees]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [active]);

  useEffect(() => {
    if (!currentUser) return;
    if (visibleNavItems.some((item) => item.id === active)) return;
    setActive(visibleNavItems[0]?.id || "dashboard");
  }, [active, currentUser, visibleNavItems]);

  const filtered = useMemo(
    () => ({
      customers: filterRows(state.customers, query),
      orders: filterRows(state.orders, query),
      stock: filterRows(state.stock, query),
      warehouses: filterRows(state.warehouses, query),
      expenses: filterRows(state.expenses, query),
      cashEntries: filterRows(state.cashEntries || [], query),
      invoices: filterRows(invoiceRows, query),
      accountingJournal: filterRows(accountingData.journalRows, query),
      accountingChart: filterRows(accountingData.chartRows, query),
      taxCalendar: filterRows(taxCalendarRows, query),
      currency: filterRows(currencyExposureRows, query),
      apiWebhooks: filterRows(apiWebhookRows, query),
      credits: filterRows(creditRecords, query),
      vendors: filterRows(state.vendors, query),
      employees: filterRows(state.employees, query),
      contracts: filterRows(state.contracts, query),
      receivables: filterRows(receivableRows, query),
      projects: filterRows(projectRoiRows, query),
      productionPlans: filterRows(productionRows, query),
      supportTickets: filterRows(state.supportTickets || [], query),
      knowledgeBase: filterRows(state.knowledgeBase || [], query),
      notifications: filterRows(state.notifications, query),
      conversations: filterRows(messageConversations, query),
    }),
    [
      query,
      state,
      creditRecords,
      receivableRows,
      projectRoiRows,
      productionRows,
      invoiceRows,
      accountingData,
      taxCalendarRows,
      currencyExposureRows,
      apiWebhookRows,
      messageConversations,
    ],
  );

  const dashboardStats = useMemo(() => {
    const openOrders = state.orders.filter((order) => order.status !== "Təhvil verilib");
    const pending = state.expenses.filter((expense) => expense.status === "Təsdiq gözləyir");
    return {
      revenue: total(state.orders, "amount"),
      activeCustomers: state.customers.length,
      openOrders: openOrders.length,
      pending: pending.length,
      reserved: total(state.stock, "reserved"),
      available: state.stock.reduce((sum, item) => sum + item.total - item.reserved, 0),
    };
  }, [state]);

  function notify(message, variant = "success") {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 3200);
  }

  const handleGitHubPush = useCallback(
    (commit) => {
      notify(`GitHub-a son push uğurlu: ${commit.sha}`, "success");
    },
    [notify]
  );

  const gitHubSync = useGitHubSync({ enabled: true, onPush: handleGitHubPush });

  function can(permission) {
    return hasEffectivePermission(state.settings, permission);
  }

  function requirePermission(permission, action) {
    if (can(permission)) return true;

    const roleName = activeRoleInfo?.name || "Rol seçilməyib";
    notify(`${roleName}: ${action} üçün icazə yoxdur.`, "warning");
    setState((current) =>
      appendAudit(current, {
        module: "Permission",
        action: "Əməliyyat bloklandı",
        detail: `${roleName}: ${action}`,
        status: "İcazə yoxdur",
        role: roleName,
      }),
    );
    return false;
  }

  function requireSystemBackup(action) {
    return requirePermission("system.backup", action);
  }

  function auditCurrentState(nextState, audit) {
    return appendAudit(nextState, {
      ...audit,
      role: getActiveRole(nextState.settings)?.name || activeRoleInfo?.name || "System",
    });
  }

  function auditOperation(audit) {
    setState((current) =>
      appendAudit(current, {
        ...audit,
        role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
      }),
    );
  }

  function getCreateAudit(type, values) {
    const auditByType = {
      crm: { module: "CRM", action: "Müştəri yaradıldı", detail: values.name },
      sales: {
        module: "Satış",
        action: values.paymentMethod === "Kredit" ? "Kredit satış yaradıldı" : "Satış yaradıldı",
        detail: `${values.customer || "Müştəri"} · ${money(Number(values.orderTotal ?? values.amount ?? 0))}`,
      },
      dashboard: {
        module: "Satış",
        action: values.paymentMethod === "Kredit" ? "Kredit satış yaradıldı" : "Satış yaradıldı",
        detail: `${values.customer || "Müştəri"} · ${money(Number(values.orderTotal ?? values.amount ?? 0))}`,
      },
      finance: {
        module: "Maliyyə",
        action: "Xərc yaradıldı",
        detail: `${values.description || "Xərc"} · ${money(Number(values.amount || 0))}`,
      },
      credits: {
        module: "Kredit",
        action: "Manual kredit yaradıldı",
        detail: `${values.customer || "Müştəri"} · ${money(Number(values.total || 0))}`,
      },
      vendors: { module: "Vendor", action: "Vendor yaradıldı", detail: values.name },
      product: { module: "Məhsul", action: "Məhsul yaradıldı", detail: values.name },
      hr: { module: "HR", action: "Əməkdaş yaradıldı", detail: values.name },
      contracts: { module: "Müqavilə", action: "Müqavilə yaradıldı", detail: values.customer },
    };

    return auditByType[type] || { module: "Sistem", action: "Qeyd yaradıldı", detail: type };
  }

  function hasCreatePermission(type, values) {
    const permission = createPermissionByType[type];
    if (!permission) return true;

    const isCreditSale = (type === "sales" || type === "dashboard") && values.paymentMethod === "Kredit";
    if (can(permission) || (isCreditSale && can("credits.manage"))) return true;

    const action = isCreditSale ? "kredit satış yaratmaq" : createConfig[type]?.title || "qeyd yaratmaq";
    return requirePermission(permission, action);
  }

  function choosePage(id) {
    if (!canAccessNavItem(state.settings, id)) {
      notify("Bu modul aktiv istifadəçi üçün gizlədilib.", "warning");
      return;
    }
    setActive(id);
    setMobileNav(false);
  }

  function loginUser(userId) {
    const user = state.settings.users.find((item) => item.id === userId && item.status === "Aktiv");
    if (!user) {
      notify("Aktiv istifadəçi seçin.", "warning");
      return;
    }

    setState((current) =>
      appendAudit(
        {
          ...current,
          settings: {
            ...current.settings,
            sessionUserId: user.id,
            currentRole: user.role,
          },
        },
        {
          module: "Auth",
          action: "Giriş edildi",
          detail: `${user.name} · ${user.role}`,
          role: user.role,
        },
      ),
    );
    notify(`${user.name} kimi giriş edildi.`);
  }

  async function loginWithPassword({ email, password }) {
    if (!remoteApiEnabled) return;
    setRemoteAuthStatus("checking");
    setAuthError("");
    try {
      const login = await loginRemote(email, password);
      setRemoteToken(login.token);
      setRemoteUser(login.user);
      if (login.user.mustChangePassword) {
        setRemoteAuthStatus("signedIn");
        notify("İlk giriş üçün yeni parol təyin edin.");
        return;
      }
      const payload = await loadRemoteState();
      const tenantUsers = payload.state?.settings?.users || initialState.settings.users || [];
      const sessionUser = { ...login.user, moduleAccess: login.user.companyModules || navItems.map((item) => item.id) };
      const users = tenantUsers.some((user) => user.id === login.user.id)
        ? tenantUsers.map((user) => (user.id === login.user.id ? { ...user, ...sessionUser } : user))
        : [sessionUser, ...tenantUsers];
      setState(
        hydrateState({
          ...(payload.state || initialState),
          settings: {
            ...(payload.state?.settings || initialState.settings),
            users,
            sessionUserId: login.user.id,
            currentRole: login.user.role,
          },
        }),
      );
      setRemoteAuthStatus("signedIn");
      notify(`${login.user.name} kimi giriş edildi.`);
    } catch (error) {
      setRemoteToken("");
      setRemoteUser(null);
      setRemoteAuthStatus("signedOut");
      setAuthError(error instanceof Error ? error.message : "Giriş alınmadı.");
    }
  }

  function logoutUser() {
    const userName = currentUser?.name || "İstifadəçi";
    setState((current) =>
      appendAudit(
        {
          ...current,
          settings: {
            ...current.settings,
            sessionUserId: null,
          },
        },
        {
          module: "Auth",
          action: "Çıxış edildi",
          detail: userName,
          role: activeRoleInfo?.name || "System",
        },
      ),
    );
    if (remoteApiEnabled) {
      logoutRemote().catch(() => undefined);
      setRemoteToken("");
      setRemoteUser(null);
      setRemoteAuthStatus("signedOut");
    }
    notify(`${userName} sistemdən çıxdı.`);
  }

  async function createUser(values) {
    if (!requirePermission("settings.manage", "istifadəçi yaratmaq")) return;

    const userName = String(values.name || "").trim();
    const email = String(values.email || "").trim();
    const role = values.role || defaultRoles[0].name;
    const roleOptions = state.settings.roles || defaultRoles;
    const moduleAccess = normalizeUserModuleAccess(
      {
        role,
        moduleAccess: Array.isArray(values.moduleAccess) ? values.moduleAccess : undefined,
      },
      roleOptions,
    );

    if (!userName || !email) {
      notify("İstifadəçi adı və email daxil edin.", "warning");
      return;
    }

    let user = {
      id: `USR-${Date.now()}`,
      name: userName,
      email,
      role,
      status: "Aktiv",
      moduleAccess,
    };

    if (remoteApiEnabled) {
      const password = String(values.password || "");
      if (password.length < 8) {
        notify("Server istifadəçisi üçün ən azı 8 simvoldan ibarət parol daxil edin.", "warning");
        return;
      }
      try {
        const remote = await createRemoteUser({ ...user, password });
        user = { ...remote.user, moduleAccess };
      } catch (error) {
        notify(error instanceof Error ? error.message : "İstifadəçi yaradılmadı.", "warning");
        return;
      }
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: [user, ...(current.settings.users || [])],
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "İstifadəçi yaradıldı",
          detail: `${user.name} · ${user.role}`,
        },
      ),
    );
    notify(`${user.name} istifadəçisi yaradıldı.`);
  }

  function updateUserStatus(userId, status) {
    if (!requirePermission("settings.manage", "istifadəçi statusunu dəyişmək")) return;

    setState((current) => {
      const nextUsers = (current.settings.users || []).map((user) =>
        user.id === userId ? { ...user, status } : user,
      );
      const nextSessionUserId = status !== "Aktiv" && current.settings.sessionUserId === userId ? null : current.settings.sessionUserId;

      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: nextUsers,
            sessionUserId: nextSessionUserId,
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "İstifadəçi statusu dəyişdi",
          detail: `${userId}: ${status}`,
        },
      );
    });
  }

  function toggleUserModuleAccess(userId, moduleId) {
    if (!requirePermission("settings.manage", "istifadəçi modul icazəsini dəyişmək")) return;

    setState((current) => {
      const users = current.settings.users || [];
      const targetUser = users.find((user) => user.id === userId);
      if (!targetUser || targetUser.role === "Super Admin") return current;
      const module = modulePermissionCatalog.find((item) => item.id === moduleId);
      const role = (current.settings.roles || defaultRoles).find((item) => item.name === targetUser.role);
      if (module?.permission && !(role?.permissions || []).includes(module.permission)) {
        return appendAudit(current, {
          module: "Ayarlar/Auth",
          action: "Modul icazəsi bloklandı",
          detail: `${targetUser.name}: ${module.label}`,
          status: "İcazə yoxdur",
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        });
      }

      const currentAccess = normalizeUserModuleAccess(targetUser, current.settings.roles || defaultRoles);
      const nextAccess = currentAccess.includes(moduleId)
        ? currentAccess.filter((id) => id !== moduleId)
        : [...currentAccess, moduleId];
      const safeAccess = nextAccess.length > 0 ? nextAccess : ["dashboard"];

      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: users.map((user) =>
              user.id === userId ? { ...user, moduleAccess: safeAccess } : user,
            ),
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "Modul icazəsi dəyişdi",
          detail: `${targetUser.name}: ${moduleId}`,
        },
      );
    });
  }

  function getActionStamp() {
    return new Intl.DateTimeFormat("az-AZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  }

  function runInvoiceAction() {
    const targetInvoice =
      invoiceRows.find((invoice) => invoice.eTaxStatus === "Göndərişə hazır") ||
      invoiceRows.find((invoice) => !invoice.invoiceSentAt);

    if (!targetInvoice) {
      notify("Göndəriləcək faktura tapılmadı.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const batchId = `ETX-${Date.now().toString().slice(-6)}`;

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          orders: current.orders.map((order) =>
            order.id === targetInvoice.orderId
              ? {
                  ...order,
                  eTaxStatus: "E-qaimə göndərildi",
                  invoiceBatchId: batchId,
                  invoiceSentAt: stamp,
                }
              : order,
          ),
        },
        {
          module: "Faktura",
          action: "E-qaimə göndərildi",
          detail: `${targetInvoice.id} · ${targetInvoice.customer} · ${batchId}`,
        },
      ),
    );
    notify(`${targetInvoice.id} e-qaimə növbəsinə göndərildi.`);
  }

  function runAccountingAction() {
    const stamp = getActionStamp();
    const journalCount = accountingData.journalRows.length;

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          accountingClose: {
            period: baseFinanceDate.slice(0, 7),
            exportedAt: stamp,
            journalCount,
            balance: accountingData.balance.assets,
            netProfit: accountingData.pl.netProfit,
          },
        },
        {
          module: "Mühasibat",
          action: "Jurnal export",
          detail: `${journalCount} jurnal sətri export üçün hazırlandı`,
        },
      ),
    );
    notify("Jurnal export hazırlandı və mühasibat bağlanışına yazıldı.");
  }

  function runTaxAction() {
    const targetTax =
      taxCalendarRows.find(
        (row) => ["Gecikib", "Bu gün", "Yaxınlaşır"].includes(row.status) && !row.paymentTaskId,
      ) ||
      taxCalendarRows.find((row) => Number(row.amount || 0) > 0 && !row.paymentTaskId);

    if (!targetTax) {
      notify("Aktiv vergi öhdəliyi tapılmadı.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const expenseId = `TAXPAY-${targetTax.id}`;
    const amount = Math.max(0, Math.round(Number(targetTax.amount || 0)));

    setState((current) => {
      const hasExpense = current.expenses.some((expense) => expense.id === expenseId);
      const expenses = hasExpense
        ? current.expenses
        : [
            {
              id: expenseId,
              description: `${targetTax.title} - ${targetTax.period}`,
              category: "Vergi",
              date: baseFinanceDate,
              amount,
              status: "Təsdiq gözləyir",
              source: "Vergi təqvimi",
            },
            ...current.expenses,
          ];

      const currentTaxCalendar = current.taxCalendar || [];
      const taxCalendar = currentTaxCalendar.some((item) => item.id === targetTax.id)
        ? currentTaxCalendar.map((item) =>
            item.id === targetTax.id
              ? {
                  ...item,
                  paymentStatus: "Ödəniş tapşırığı",
                  paymentTaskId: expenseId,
                  checkedAt: stamp,
                }
              : item,
          )
        : [
            {
              id: targetTax.id,
              title: targetTax.title,
              type: targetTax.type,
              period: targetTax.period,
              dueDate: targetTax.dueDate,
              owner: targetTax.owner,
              source: targetTax.source || "Avtomatik",
              paymentStatus: "Ödəniş tapşırığı",
              paymentTaskId: expenseId,
              checkedAt: stamp,
            },
            ...currentTaxCalendar,
          ];

      return auditCurrentState(
        {
          ...current,
          expenses,
          taxCalendar,
        },
        {
          module: "Vergi/Maliyyə",
          action: "Ödəniş tapşırığı yaradıldı",
          detail: `${targetTax.title} · ${money(amount)}`,
        },
      );
    });
    notify(`${targetTax.title} üçün ödəniş tapşırığı maliyyəyə düşdü.`);
  }

  function runReceivableSyncAction() {
    const debtorTotal = receivableRows
      .filter((row) => row.type === "Debitor")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const creditorTotal = receivableRows
      .filter((row) => row.type === "Kreditor")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const overdueCount = receivableRows.filter((row) => Number(row.overdueDays || 0) > 0).length;
    const highRiskCount = receivableRows.filter((row) => ["Kritik", "Yüksək"].includes(row.riskCategory)).length;
    const agingSummary = buildReceivableAgingSummary(receivableRows);
    const stamp = getActionStamp();

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          receivableSync: {
            at: stamp,
            debtorTotal,
            creditorTotal,
            overdueCount,
            highRiskCount,
            agingSummary,
            rows: receivableRows.length,
          },
        },
        {
          module: "Debitor/Kreditor",
          action: "Balans sinxronizasiya edildi",
          detail: `${receivableRows.length} tərəf · net ${money(debtorTotal - creditorTotal)}`,
        },
      ),
    );
    notify("Debitor/kreditor reyestri yeniləndi.");
  }

  function closeReceivableDebt(rowId) {
    if (!requirePermission("receivables.manage", "debitor/kreditor borcunu bağlamaq")) return;

    const targetRow = receivableRows.find((row) => row.id === rowId);
    if (!targetRow || Number(targetRow.amount || 0) <= 0) {
      notify("Bağlanacaq açıq borc tapılmadı.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const closureId = `RC-${Date.now()}`;

    setState((current) => {
      const closureBase = {
        id: closureId,
        rowId: targetRow.id,
        type: targetRow.type,
        party: targetRow.party,
        at: stamp,
        riskCategory: targetRow.riskCategory,
        agingBucket: targetRow.agingBucket,
        collectionStatus: "Bağlandı",
        owner: activeRoleInfo?.name || "System",
      };

      if (targetRow.type === "Debitor") {
        const creditIds = new Set(targetRow.creditIds || []);
        const openOrderIds = new Set(targetRow.openOrderIds || []);
        const currentCredits = buildAllCreditRecords(current.orders || [], current.credits || []);
        const updatedCredits = new Map();
        const paymentByOrderId = new Map();
        const paymentByCreditId = new Map();
        const closedAmount = getReceivableClosureAmount(targetRow);

        currentCredits
          .filter((credit) => creditIds.has(credit.id))
          .forEach((credit) => {
            const plan = getCreditDisplayPlan(credit);
            const balance = Number(plan.balance || 0);
            if (balance <= 0) return;

            const paymentResult = applyCreditPrincipalPayment(credit, balance);
            paymentByCreditId.set(credit.id, paymentResult);
            if (credit.orderId) paymentByOrderId.set(credit.orderId, paymentResult);

            updatedCredits.set(credit.id, {
              ...credit,
              balance: paymentResult.nextBalance,
              installments: paymentResult.installments,
              paidMonths: paymentResult.nextPaidMonths,
              rate: 100,
              monthly: paymentResult.nextMonthly,
              next: paymentResult.nextDue,
              status: paymentResult.status,
              payments: [
                {
                  date: baseFinanceDate,
                  principal: paymentResult.appliedPrincipal,
                  penalty: 0,
                  cashIn: paymentResult.appliedPrincipal,
                  note: "Debitor bağlanışı",
                  closureId,
                },
                ...(credit.payments || []),
              ],
            });
          });

        const nextOrders = (current.orders || []).map((order) => {
          let nextOrder = order;
          const creditId = order.creditId || getCreditIdForOrder(order);
          const paymentResult = paymentByOrderId.get(order.id) || paymentByCreditId.get(creditId);

          if (paymentResult) {
            nextOrder = {
              ...nextOrder,
              paid: Math.min(Number(nextOrder.amount || 0), Number(nextOrder.paid || 0) + Number(paymentResult.appliedPrincipal || 0)),
              creditBalance: paymentResult.nextBalance,
              creditMonthly: paymentResult.nextMonthly,
              creditLastPayment: paymentResult.installments[paymentResult.installments.length - 1]?.amount || 0,
              paymentStatus: paymentResult.nextBalance <= 0 ? "Ödənilib" : "Kredit satış",
            };
          }

          if (openOrderIds.has(order.id)) {
            nextOrder = {
              ...nextOrder,
              paid: Number(nextOrder.amount || 0),
              paymentStatus: "Ödənilib",
            };
          }

          return nextOrder;
        });

        const existingCreditIds = new Set((current.credits || []).map((credit) => credit.id));
        const nextCredits = [
          ...Array.from(updatedCredits.values()).filter((credit) => !existingCreditIds.has(credit.id)),
          ...(current.credits || []).map((credit) => updatedCredits.get(credit.id) || credit),
        ];
        const cashEntry = {
          id: `RCV-${Date.now()}`,
          type: "Debitor",
          source: "Debitor/Kreditor",
          category: "Borc bağlanışı",
          receivableId: targetRow.id,
          creditId: targetRow.creditIds?.[0] || "",
          orderId: targetRow.openOrderIds?.[0] || "",
          contractId: targetRow.contractIds?.[0] || "",
          customer: targetRow.party,
          principal: Math.max(0, closedAmount),
          penalty: 0,
          amount: Math.max(0, closedAmount),
          date: baseFinanceDate,
          note: `${targetRow.detail} · ${targetRow.riskCategory}`,
          closureId,
        };
        const closure = {
          ...closureBase,
          amount: cashEntry.amount,
          direction: "cash-in",
          sourceIds: [...(targetRow.creditIds || []), ...(targetRow.openOrderIds || []), targetRow.source].filter(Boolean),
        };

        return auditCurrentState(
          {
            ...current,
            customers: (current.customers || []).map((customer) =>
              targetRow.sourceType === "manual" &&
              (customer.fin === targetRow.source || normalize(customer.name) === normalize(targetRow.party))
                ? { ...customer, debt: 0, delay: 0, receivableStatus: "Bağlandı" }
                : customer,
            ),
            orders: nextOrders,
            credits: nextCredits,
            cashEntries: cashEntry.amount > 0 ? [cashEntry, ...(current.cashEntries || [])] : current.cashEntries || [],
            receivableClosures: [closure, ...(current.receivableClosures || [])].slice(0, 30),
          },
          {
            module: "Debitor/Kreditor",
            action: "Debitor borcu bağlandı",
            detail: `${targetRow.party} · ${money(cashEntry.amount)} · ${targetRow.riskCategory}`,
          },
        );
      }

      const poIds = new Set(targetRow.poIds || []);
      const payablePos = (current.purchaseOrders || []).filter((po) => poIds.has(po.id));
      const closedAmount = getReceivableClosureAmount(targetRow);
      const existingExpenseIds = new Set((current.expenses || []).map((expense) => expense.id));
      const paymentExpenses = payablePos
        .filter((po) => !existingExpenseIds.has(`EXP-${po.id}`))
        .map((po) => ({
          id: `EXP-${po.id}`,
          description: `Kreditor bağlanışı - ${po.product}`,
          category: "Vendor ödənişi",
          date: baseFinanceDate,
          amount: Number(po.amount || 0),
          status: "Təsdiq edildi",
          source: "Debitor/Kreditor",
          cashImpact: true,
          poId: po.id,
          vendor: po.vendor,
          closureId,
        }));
      const closure = {
        ...closureBase,
        amount: closedAmount,
        direction: "cash-out",
        sourceIds: [...poIds],
      };

      return auditCurrentState(
        {
          ...current,
          purchaseOrders: (current.purchaseOrders || []).map((po) =>
            poIds.has(po.id)
              ? {
                  ...po,
                  status: "Ödənilib",
                  paidAt: baseFinanceDate,
                  paymentStatus: "Bağlandı",
                  closureId,
                }
              : po,
          ),
          expenses: [
            ...paymentExpenses,
            ...(current.expenses || []).map((expense) =>
              poIds.has(expense.poId)
                ? {
                    ...expense,
                    status: "Təsdiq edildi",
                    paidAt: baseFinanceDate,
                    closureId,
                  }
                : expense,
            ),
          ],
          receivableClosures: [closure, ...(current.receivableClosures || [])].slice(0, 30),
        },
        {
          module: "Debitor/Kreditor",
          action: "Kreditor borcu bağlandı",
          detail: `${targetRow.party} · ${money(closedAmount)} · ${targetRow.riskCategory}`,
        },
      );
    });

    notify(`${targetRow.party} üzrə borc bağlanış workflow-u tamamlandı.`, "success");
  }

  function exportReport(title = "PDF export", format = "PDF") {
    if (!requirePermission("reports.export", "hesabat export etmək")) return;

    const stamp = getActionStamp();
    const reportPackage = buildReportPackage({
      orders: state.orders,
      credits: creditRecords,
      vendors: state.vendors,
      employees: state.employees,
      expenses: state.expenses,
      warehouseStock: state.warehouseStock,
      products: state.products || [],
      purchaseOrders: state.purchaseOrders || [],
      productionPlans: productionRows,
      invoices: invoiceRows,
      cashEntries: state.cashEntries || [],
    });
    const exportRow = {
      id: `RPT-${Date.now().toString().slice(-6)}`,
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
    queueMicrotask(() => {
      if (!activeTenantId) return;
      void saveWorkflowRecord({
        tenantId: activeTenantId,
        module: "reports",
        record: {
          record_type: "report_export",
          record_no: exportRow.id,
          status: "completed",
          title: exportRow.title,
          completed_at: new Date().toISOString(),
          payload: exportRow,
        },
      }).catch((error) => notify(`Hesabat exportu sinxronlaЕџmadД±: ${error.message}`, "warning"));
    });
  }

  function runProjectsExportAction() {
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
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          projects: (current.projects || []).map((project) => ({
            ...project,
            lastExportAt: stamp,
            exportCount: Number(project.exportCount || 0) + 1,
            lastRoi: projectRoiRows.find((row) => row.id === project.id)?.roi ?? project.lastRoi,
            status: projectRoiRows.find((row) => row.id === project.id)?.status || project.status,
          })),
          reportExports: [
            {
              id: `RPT-ROI-${Date.now().toString().slice(-6)}`,
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

  function syncProductionWorkflow(plan, status, extraPayload = {}) {
    if (!activeTenantId || !plan?.id) return;
    void saveWorkflowRecord({
      tenantId: activeTenantId,
      module: "production",
      record: {
        record_type: "production_order", record_no: plan.id, status, title: plan.product,
        due_at: plan.dueDate ? `${plan.dueDate}T18:00:00` : null,
        amount: Number(plan.totalCost || plan.actualTotalCost || 0),
        completed_at: status === "completed" ? new Date().toISOString() : null,
        payload: {
          warehouse_id: plan.warehouseId, warehouse_name: plan.warehouseName,
          planned_qty: Number(plan.plannedQty || 0), produced_qty: Number(plan.producedQty || 0),
          waste_rate: Number(plan.wasteRate || 0), labor_cost: Number(plan.laborCost || 0),
          overhead_cost: Number(plan.overheadCost || 0), actual_material_cost: Number(plan.actualMaterialCost || 0),
          actual_unit_cost: Number(plan.actualUnitCost || 0), issued_materials: plan.issuedMaterials || [],
          receipt: plan.receipt || null, note: plan.note || "", ...extraPayload,
        },
      },
      lines: (plan.materials || []).map((material) => ({
        description: material.product, quantity: Number(material.qty || material.needed || 0),
        unit_price: Number(material.unitCost || 0),
        payload: { available: Number(material.available || 0), enough: material.enough !== false },
      })),
      approvals: status === "draft" ? [{ role_code: "production_manager" }, { role_code: "warehouse_manager" }] : undefined,
    }).catch((error) => notify(`İstehsal workflow sinxronlaşmadı: ${error.message}`, "warning"));
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
    }).catch((error) => notify(`HR workflow sinxronlaЕџmadД±: ${error.message}`, "warning"));
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
        title: thread.title || thread.person || "Daxili yazД±Еџma",
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
    }).catch((error) => notify(`Mesaj workflow sinxronlaЕџmadД±: ${error.message}`, "warning"));
  }

  function persistNotificationDeliveries(deliveries = []) {
    if (!activeTenantId) return;
    deliveries.forEach((delivery) => {
      const channelMap = { SMS: "sms", Email: "email", Push: "push" };
      const wasSent = normalize(delivery.status).includes("nd");
      void queueNotification({
        tenantId: activeTenantId,
        notification: {
          entity_type: delivery.module || "notifications",
          recipient: delivery.recipient || "Daxili komanda",
          channel: channelMap[delivery.channel] || "in_app",
          provider: delivery.providerName || null,
          subject: delivery.subject || null,
          body: delivery.body || delivery.subject || "BildiriЕџ",
          status: wasSent ? "sent" : "failed",
          sent_at: wasSent ? delivery.sentAtIso : null,
          last_error: wasSent ? null : delivery.status,
          metadata: {
            rule_id: delivery.ruleId,
            dedupe_key: delivery.dedupeKey,
            priority: delivery.priority,
            action_target: delivery.actionTarget,
          },
        },
      }).catch((error) => notify(`BildiriЕџ logu sinxronlaЕџmadД±: ${error.message}`, "warning"));
    });
  }

  function createProductionPlan(values) {
    if (!requirePermission("production.manage", "istehsal planı yaratmaq")) return;
    const stamp = getActionStamp();
    let createdPlan = null;

    setState((current) => {
      const warehouse = current.warehouses.find((item) => item.id === values.warehouseId);
      const plan = {
        id: `BOM-${Date.now().toString().slice(-6)}`,
        product: values.product.trim(),
        plannedQty: Math.max(1, Number(values.plannedQty || 1)),
        warehouseId: values.warehouseId,
        warehouseName: warehouse?.name || "Anbar seçilməyib",
        salePrice: Math.max(0, Number(values.salePrice || 0)),
        laborCost: Math.max(0, Number(values.laborCost || 0)),
        overheadCost: Math.max(0, Number(values.overheadCost || 0)),
        wasteRate: Math.max(0, Number(values.wasteRate || 0)),
        dueDate: values.dueDate || "",
        note: values.note?.trim() || "",
        status: "Planlandı",
        createdAt: stamp,
        updatedAt: stamp,
        materials: (values.materials || []).map((material) => ({
          product: material.product,
          qty: Math.max(0.01, Number(material.qty || 0)),
          unitCost: Math.max(0, Number(material.unitCost || 0)),
        })),
      };
      createdPlan = plan;

      return auditCurrentState(
        { ...current, productionPlans: [plan, ...(current.productionPlans || [])] },
        {
          module: "İstehsalat",
          action: "İstehsal planı yaradıldı",
          detail: `${plan.id} · ${plan.product} · ${plan.plannedQty} ədəd · ${plan.warehouseName}`,
        },
      );
    });
    queueMicrotask(() => createdPlan && syncProductionWorkflow(createdPlan, "draft"));
    notify("İstehsal planı və BOM yaradıldı.");
  }

  function updateProductionPlan(planId, values) {
    if (!requirePermission("production.manage", "istehsal planını redaktə etmək")) return;
    const stamp = getActionStamp();
    let syncedPlan = null;

    setState((current) => {
      const existing = (current.productionPlans || []).find((item) => item.id === planId);
      if (!existing) return current;
      if (normalize(existing.status).includes("istehsal edildi") || normalize(existing.status).includes("istehsaldadır")) {
        notify("Başlanmış və ya tamamlanmış istehsal planı redaktə edilə bilməz.", "warning");
        return current;
      }
      const warehouse = current.warehouses.find((item) => item.id === values.warehouseId);
      const updated = {
        ...existing,
        product: values.product.trim(),
        plannedQty: Math.max(1, Number(values.plannedQty || 1)),
        warehouseId: values.warehouseId,
        warehouseName: warehouse?.name || existing.warehouseName,
        salePrice: Math.max(0, Number(values.salePrice || 0)),
        laborCost: Math.max(0, Number(values.laborCost || 0)),
        overheadCost: Math.max(0, Number(values.overheadCost || 0)),
        wasteRate: Math.max(0, Number(values.wasteRate || 0)),
        dueDate: values.dueDate || "",
        note: values.note?.trim() || "",
        updatedAt: stamp,
        materials: (values.materials || []).map((material) => ({
          product: material.product,
          qty: Math.max(0.01, Number(material.qty || 0)),
          unitCost: Math.max(0, Number(material.unitCost || 0)),
        })),
      };
      syncedPlan = updated;

      return auditCurrentState(
        {
          ...current,
          productionPlans: (current.productionPlans || []).map((item) => (item.id === planId ? updated : item)),
        },
        {
          module: "İstehsalat",
          action: "İstehsal planı redaktə edildi",
          detail: `${planId} · ${updated.product} · ${updated.plannedQty} ədəd`,
        },
      );
    });
    queueMicrotask(() => syncedPlan && syncProductionWorkflow(syncedPlan, "draft"));
    notify("İstehsal planındakı dəyişikliklər saxlanıldı.");
  }

  function deleteProductionPlan(planId) {
    if (!requirePermission("production.manage", "istehsal planını silmək")) return;
    let cancelledPlan = null;
    setState((current) => {
      const existing = (current.productionPlans || []).find((item) => item.id === planId);
      if (!existing) return current;
      if (normalize(existing.status).includes("istehsal edildi") || normalize(existing.status).includes("istehsaldadır")) {
        notify("Başlanmış və ya tamamlanmış plan audit və stok izi səbəbilə silinə bilməz.", "warning");
        return current;
      }
      cancelledPlan = existing;
      return auditCurrentState(
        {
          ...current,
          productionPlans: (current.productionPlans || []).filter((item) => item.id !== planId),
        },
        {
          module: "İstehsalat",
          action: "İstehsal planı silindi",
          detail: `${planId} · ${existing.product}`,
          status: "Silindi",
        },
      );
    });
    queueMicrotask(() => cancelledPlan && syncProductionWorkflow(cancelledPlan, "cancelled", { cancelled: true }));
    notify("İstehsal planı silindi.");
  }

  function startProductionPlan(planId) {
    if (!requirePermission("production.manage", "istehsala başlamaq")) return;
    const stamp = getActionStamp();
    let startedPlan = null;
    setState((current) => {
      const rows = buildProductionPlanRows(
        current.productionPlans || [],
        current.stock,
        current.warehouseStock,
        current.products || [],
        current.warehouses || [],
      );
      const plan = rows.find((item) => item.id === planId);
      if (!plan || !plan.canProduce) {
        notify(`İstehsala başlamaq mümkün deyil: ${plan?.bottleneck || "plan tapılmadı"}.`, "warning");
        return current;
      }
      startedPlan = { ...plan, status: "İstehsaldadır", startedAt: stamp };
      return auditCurrentState(
        {
          ...current,
          productionPlans: (current.productionPlans || []).map((item) =>
            item.id === planId ? { ...item, status: "İstehsaldadır", startedAt: stamp, updatedAt: stamp } : item,
          ),
        },
        {
          module: "İstehsalat",
          action: "İstehsala başlandı",
          detail: `${plan.id} · ${plan.product} · ${plan.plannedQty} ədəd`,
        },
      );
    });
    queueMicrotask(() => startedPlan && syncProductionWorkflow(startedPlan, "in_progress", { material_reserved: true }));
    notify(`${planId} istehsala buraxıldı.`);
  }

  function completeProductionPlan(planId) {
    if (!requirePermission("production.manage", "istehsal planını tamamlamaq")) return;

    const stamp = getActionStamp();
    let syncedCompletedPlan = null;
    setState((current) => {
      const rows = buildProductionPlanRows(
        current.productionPlans || [],
        current.stock,
        current.warehouseStock,
        current.products || [],
        current.warehouses || [],
      );
      const plan = rows.find((item) => item.id === planId);
      if (!plan) {
        notify("İstehsal planı tapılmadı.", "warning");
        return current;
      }
      if (normalize(plan.status).includes("istehsal edildi")) {
        notify("Bu istehsal planı artıq tamamlanıb.", "warning");
        return current;
      }
      if (!plan.canProduce) {
        notify(`${plan.id} tamamlanmadı: ${plan.bottleneck}.`, "warning");
        return current;
      }

      const materialQuantities = new Map(plan.materials.map((material) => [material.product, Number(material.needed || 0)]));
      const warehouseId = plan.warehouseId || current.warehouses[0]?.id;
      const warehouse = current.warehouses.find((item) => item.id === warehouseId);
      const issuedMaterials = plan.materials.map((material) => ({
        product: material.product,
        qty: Number(material.needed || 0),
        unitCost: Number(material.unitCost || 0),
        cost: Number(material.cost || 0),
        availableBefore: Number(material.available || 0),
        availableAfter: Math.max(0, Number(material.available || 0) - Number(material.needed || 0)),
      }));
      const existingProduct = (current.products || []).find((product) => normalize(product.name) === normalize(plan.product));
      const finishedProduct = existingProduct
        ? {
            ...existingProduct,
            category: existingProduct.category || "İstehsalat",
            unit: existingProduct.unit || "ədəd",
            salePrice: Number(plan.salePrice || existingProduct.salePrice || 0),
            costPrice: Number(plan.unitCost || existingProduct.costPrice || 0),
            status: "Aktiv",
          }
        : {
            id: `PRD-BOM-${Date.now()}`,
            name: plan.product,
            sku: `BOM-${Date.now().toString().slice(-6)}`,
            category: "İstehsalat",
            unit: "ədəd",
            salePrice: Number(plan.salePrice || 0),
            costPrice: Number(plan.unitCost || 0),
            reorderLevel: 0,
            serialTracked: false,
            status: "Aktiv",
          };
      const products = existingProduct
        ? (current.products || []).map((product) => (product.id === existingProduct.id ? finishedProduct : product))
        : [finishedProduct, ...(current.products || [])];
      const nextWarehouseRows = addStockToRows(
        adjustStockRows(current.warehouseStock?.[warehouseId] || [], materialQuantities, { totalDelta: -1 }),
        finishedProduct.name,
        plan.plannedQty,
        finishedProduct.salePrice,
        warehouseId,
        finishedProduct,
      );
      const nextStock = addStockToRows(
        adjustStockRows(current.stock, materialQuantities, { totalDelta: -1 }),
        finishedProduct.name,
        plan.plannedQty,
        finishedProduct.salePrice,
        "",
        finishedProduct,
      );
      const completedPlan = {
        ...plan,
        status: "İstehsal edildi",
        completedAt: stamp,
        producedQty: Number(plan.plannedQty || 0),
        actualMaterialCost: Number(plan.materialCost || 0),
        actualTotalCost: Number(plan.totalCost || 0),
        actualUnitCost: Number(plan.unitCost || 0),
        issuedMaterials,
        receipt: {
          warehouseId,
          warehouseName: warehouse?.name || plan.warehouseName,
          product: finishedProduct.name,
          qty: Number(plan.plannedQty || 0),
          unitCost: Number(plan.unitCost || 0),
          salePrice: Number(plan.salePrice || 0),
          at: stamp,
        },
      };
      syncedCompletedPlan = completedPlan;

      return auditCurrentState(
        {
          ...current,
          products,
          productionPlans: (current.productionPlans || []).map((item) => (item.id === planId ? completedPlan : item)),
          warehouseStock: {
            ...current.warehouseStock,
            [warehouseId]: nextWarehouseRows,
          },
          stock: nextStock,
        },
        {
          module: "İstehsalat/Anbar",
          action: "Xammal çıxışı və hazır məhsul mədaxili",
          detail: `${plan.id} · ${finishedProduct.name} ${plan.plannedQty} ədəd · maya ${money(plan.unitCost)}`,
        },
      );
    });
    queueMicrotask(() => syncedCompletedPlan && syncProductionWorkflow(syncedCompletedPlan, "completed", { stock_posted: true }));
    notify(`${planId} üzrə xammal çıxıldı və hazır məhsul anbara mədaxil edildi.`);
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

    const stamp = getActionStamp();
    let toast = `${targetWebhook.id} webhook testi işlənir.`;

    setState((current) => {
      const webhooks = ensureApiWebhooks(current.apiWebhooks || []);
      const secrets = ensureApiSecrets(current.apiSecrets || []);
      const sourceWebhook = webhooks.find((webhook) => webhook.id === targetWebhook.id) || targetWebhook;
      const secret = secrets.find((item) => item.key === sourceWebhook.secretKey);
      const secretReady = sourceWebhook.authType === "None" || secret?.status === "Aktiv";
      const isRetry = Number(sourceWebhook.retryQueue || 0) > 0 || mode === "retry";
      const endpointActive = sourceWebhook.status === "Aktiv";
      const success = endpointActive && secretReady;
      const responseCode = success ? 200 : !secretReady ? 401 : 503;
      const retryMax = Number(sourceWebhook.retryMax || 3);
      const currentFailures = Number(sourceWebhook.failureCount || 0);
      const retryQueue = Number(sourceWebhook.retryQueue || 0);
      const attempt = isRetry ? Math.min(retryMax, currentFailures + 1 || 1) : 1;
      const nextRetryQueue = success ? Math.max(0, retryQueue - 1) : Math.min(retryMax, retryQueue + 1);
      const nextFailureCount = success ? 0 : Math.min(retryMax, currentFailures + 1);
      const result = success ? "Uğurlu" : nextFailureCount >= retryMax ? "Bloklandı" : "Retry gözləyir";
      const latencyMs = success ? 118 + Math.round(Math.random() * 35) : 620 + Math.round(Math.random() * 120);
      const error = success
        ? ""
        : !secretReady
          ? "Secret/token aktiv deyil və ya tapılmadı"
          : "Endpoint cavab vermədi";
      const log = {
        id: `API-LOG-${Date.now().toString().slice(-6)}`,
        webhookId: sourceWebhook.id,
        webhookName: sourceWebhook.name,
        event: sourceWebhook.event,
        method: sourceWebhook.method || "POST",
        target: sourceWebhook.target,
        payload: targetWebhook.lastPayload || sourceWebhook.lastPayloadOverride || sourceWebhook.event,
        attempt,
        result,
        responseCode,
        latencyMs,
        retryQueue: nextRetryQueue,
        error,
        mode: isRetry ? "Retry test" : "Canlı test",
        at: stamp,
        nextRetryAt: success ? "" : `${sourceWebhook.retryBackoffSeconds || 60}s sonra`,
      };
      const nextWebhook = {
        ...sourceWebhook,
        status: endpointActive ? "Aktiv" : sourceWebhook.status,
        processedCount: Number(sourceWebhook.processedCount || 0) + (success && targetWebhook.queueCount > 0 ? 1 : 0),
        failureCount: nextFailureCount,
        retryQueue: nextRetryQueue,
        lastPayloadOverride: `${sourceWebhook.event} test · ${stamp}`,
        lastTestAt: stamp,
        lastResponseCode: responseCode,
        lastLatencyMs: latencyMs,
        lastError: error,
        nextRetryAt: log.nextRetryAt,
      };
      const nextSecrets = secrets.map((item) =>
        item.key === sourceWebhook.secretKey
          ? {
              ...item,
              lastUsedAt: stamp,
            }
          : item,
      );
      const sentCount = success ? 1 : 0;

      toast = success
        ? `${sourceWebhook.id} webhook testi uğurludur (${responseCode}).`
        : `${sourceWebhook.id} test uğursuz oldu, retry növbəsinə yazıldı.`;

      return auditCurrentState(
        {
          ...current,
          apiWebhooks: webhooks.map((webhook) => (webhook.id === sourceWebhook.id ? nextWebhook : webhook)),
          apiSecrets: nextSecrets,
          apiWebhookLogs: [log, ...(current.apiWebhookLogs || [])].slice(0, 80),
          apiIntegrationSnapshot: {
            at: stamp,
            webhookId: sourceWebhook.id,
            result,
            responseCode,
            sent: sentCount,
            retryQueue: nextRetryQueue,
            failed: success ? 0 : 1,
          },
        },
        {
          module: "API/Webhook",
          action: isRetry ? "Webhook retry testi" : "Webhook test nəticəsi",
          detail: `${sourceWebhook.id} · ${sourceWebhook.event} · ${responseCode} · ${result}`,
        },
      );
    });
    notify(toast, toast.includes("uğursuz") ? "warning" : "success");
  }

  function runNotificationDispatchAction() {
    if (!requirePermission("notifications.manage", "bildiriş növbəsini göndərmək")) return;

    const readyRules = notificationAutomationRows.filter((rule) => rule.queueCount > 0 && rule.status === "Aktiv");
    if (readyRules.length === 0) {
      notify("Göndəriş üçün aktiv bildiriş növbəsi yoxdur.", "warning");
      return;
    }

    const stamp = getActionStamp();
    const deliveries = buildNotificationDeliveriesForRules({
      rules: readyRules,
      providerRows: notificationProviderRows,
      settings: state.settings,
      stamp,
      source: "Manual növbə",
    });

    if (deliveries.length === 0) {
      notify("Qaydalarda hadisə tapılmadı.", "warning");
      return;
    }

    const sentCount = deliveries.filter((item) => item.status === "Göndərildi").length;
    const blockedCount = deliveries.length - sentCount;
    if (activeTenantId) {
      deliveries.forEach((delivery) => {
        const channelMap = { SMS: "sms", Email: "email", Push: "push" };
        void queueNotification({
          tenantId: activeTenantId,
          notification: {
            entity_type: delivery.module || "notifications",
            recipient: delivery.recipient || "Daxili komanda",
            channel: channelMap[delivery.channel] || "in_app",
            provider: delivery.providerName || null,
            subject: delivery.subject || null,
            body: delivery.body || delivery.subject || "BildiriЕџ",
            status: delivery.status === "GГ¶ndЙ™rildi" ? "sent" : "failed",
            sent_at: delivery.status === "GГ¶ndЙ™rildi" ? delivery.sentAtIso : null,
            last_error: delivery.status === "GГ¶ndЙ™rildi" ? null : delivery.status,
            metadata: {
              rule_id: delivery.ruleId,
              dedupe_key: delivery.dedupeKey,
              priority: delivery.priority,
              action_target: delivery.actionTarget,
            },
          },
        }).catch((error) => notify(`BildiriЕџ logu sinxronlaЕџmadД±: ${error.message}`, "warning"));
      });
    }
    const touchedRuleIds = new Set(deliveries.map((item) => item.ruleId));
    const providerUse = deliveries.reduce((map, item) => {
      if (!item.providerId) return map;
      map.set(item.providerId, (map.get(item.providerId) || 0) + (item.status === "Göndərildi" ? 1 : 0));
      return map;
    }, new Map());

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          notificationSweepAt: stamp,
          notificationSendLog: [...deliveries, ...(current.notificationSendLog || [])].slice(0, 120),
          notificationDispatchSnapshot: {
            at: stamp,
            total: deliveries.length,
            sent: sentCount,
            blocked: blockedCount,
            rules: readyRules.length,
            source: "Manual növbə",
          },
          notificationRules: ensureNotificationRules(current.notificationRules || []).map((rule) =>
            touchedRuleIds.has(rule.id)
              ? {
                  ...rule,
                  lastRunAt: stamp,
                  sentCount: Number(rule.sentCount || 0) + deliveries.filter((item) => item.ruleId === rule.id && item.status === "Göndərildi").length,
                  failedCount: Number(rule.failedCount || 0) + deliveries.filter((item) => item.ruleId === rule.id && item.status !== "Göndərildi").length,
                  lastStatus: deliveries.some((item) => item.ruleId === rule.id && item.status !== "Göndərildi") ? "Qismən bloklandı" : "Göndərildi",
                }
              : rule,
          ),
          notificationProviders: ensureNotificationProviders(current.notificationProviders || []).map((provider) =>
            providerUse.has(provider.id)
              ? {
                  ...provider,
                  lastSentAt: stamp,
                  sentCount: Number(provider.sentCount || 0) + providerUse.get(provider.id),
                }
              : provider,
          ),
          notifications: [
            ...deliveries.slice(0, 8).map((delivery) => ({
              id: `IN-${delivery.id}`,
              type: delivery.channel,
              title: `${delivery.ruleName}: ${delivery.status}`,
              body: `${delivery.recipient} · ${delivery.body}`,
              time: stamp,
              unread: true,
              deliveryId: delivery.id,
              module: delivery.module,
              entityId: delivery.entityId,
              actionTarget: delivery.actionTarget,
            })),
            ...(current.notifications || []),
          ],
        },
        {
          module: "Bildiriş",
          action: "Provider göndəriş növbəsi işləndi",
          detail: `${sentCount} göndərildi · ${blockedCount} bloklandı · ${readyRules.length} qayda`,
        },
      ),
    );

    notify(`Bildiriş növbəsi işləndi: ${sentCount} göndərildi, ${blockedCount} bloklandı.`);
  }

  function runKpiPeriodAction(requestedAction = "next") {
    if (!requirePermission("kpi.manage", "KPI periodunu işləmək")) return;

    const period = activeKpiPeriod.period || getKpiPeriodKey();
    const nextAction =
      requestedAction !== "next"
        ? requestedAction
        : activeKpiPeriod.status !== "Period bağlandı"
          ? "close"
          : activeKpiPeriod.approvalStatus !== "Təsdiq edildi"
            ? "approve"
            : activeKpiPeriod.payoutStatus !== "Ödənildi"
              ? "payout"
              : "complete";

    if (nextAction === "complete") {
      notify(`${period} KPI periodu artıq bağlanıb, təsdiqlənib və ödənilib.`);
      return;
    }

    if (nextAction === "payout" && activeKpiPeriod.approvalStatus !== "Təsdiq edildi") {
      notify("Payout üçün əvvəl KPI periodunu təsdiq edin.", "warning");
      return;
    }

    const stamp = getActionStamp();
    let toast =
      nextAction === "close"
        ? `${period} KPI periodu bağlandı və təsdiq gözləyir.`
        : nextAction === "approve"
          ? `${period} KPI periodu təsdiq edildi.`
          : `${period} KPI payout-u maliyyə xərcinə yazıldı.`;

    setState((current) => {
      const salesBonuses = buildSalesBonusRows(current.orders || []);
      const employeeRows = buildKpiEmployeeScoreRows(current.employees || [], salesBonuses);
      const targetRows = buildKpiTargetRows({
        targets: current.kpiTargets || [],
        employees: current.employees || [],
        employeeRows,
        salesBonuses,
      });
      const existing = (current.kpiPeriods || []).find((item) => item.period === period) || {};
      const baseSnapshot = buildKpiPeriodSnapshot({
        period,
        targetRows,
        employeeRows,
        salesBonuses,
        existing,
        stamp,
      });

      let nextPeriod = baseSnapshot;
      let nextExpenses = current.expenses || [];
      let nextPayouts = current.kpiPayouts || [];
      let audit = {
        module: "KPI",
        action: "KPI periodu bağlandı",
        detail: `${period} · score ${baseSnapshot.companyScore}% · payout ${money(baseSnapshot.payoutAmount)}`,
      };

      if (nextAction === "close") {
        nextPeriod = {
          ...baseSnapshot,
          status: "Period bağlandı",
          approvalStatus: "Təsdiq gözləyir",
          payoutStatus: baseSnapshot.payoutStatus === "Ödənildi" ? "Ödənildi" : "Gözləyir",
          closedAt: baseSnapshot.closedAt || stamp,
          updatedAt: stamp,
        };
      }

      if (nextAction === "approve") {
        nextPeriod = {
          ...baseSnapshot,
          status: "Period bağlandı",
          approvalStatus: "Təsdiq edildi",
          approvedAt: stamp,
          approvedBy: currentUser?.name || activeRoleInfo?.name || "System",
          updatedAt: stamp,
        };
        audit = {
          module: "KPI",
          action: "KPI periodu təsdiq edildi",
          detail: `${period} · ${money(baseSnapshot.payoutAmount)} payout fondu təsdiqləndi`,
        };
      }

      if (nextAction === "payout") {
        const expenseId = `EXP-KPI-${period}`;
        const expense = {
          id: expenseId,
          description: `KPI payout - ${period}`,
          category: "KPI/Bonus payout",
          date: baseFinanceDate,
          amount: baseSnapshot.payoutAmount,
          status: "Təsdiq edildi",
          source: "KPI Payout",
          cashImpact: true,
          kpiPeriodId: baseSnapshot.id,
        };
        const payout = {
          id: `KPI-PAY-${period}`,
          period,
          amount: baseSnapshot.payoutAmount,
          at: stamp,
          status: "Ödənildi",
          expenseId,
          rows: baseSnapshot.payoutRows,
        };

        nextExpenses = nextExpenses.some((item) => item.id === expenseId)
          ? nextExpenses.map((item) => (item.id === expenseId ? { ...item, ...expense } : item))
          : [expense, ...nextExpenses];
        nextPayouts = nextPayouts.some((item) => item.id === payout.id)
          ? nextPayouts.map((item) => (item.id === payout.id ? payout : item))
          : [payout, ...nextPayouts];
        nextPeriod = {
          ...baseSnapshot,
          status: "Period bağlandı",
          approvalStatus: "Təsdiq edildi",
          payoutStatus: "Ödənildi",
          paidAt: stamp,
          payoutExpenseId: expenseId,
          updatedAt: stamp,
        };
        audit = {
          module: "KPI",
          action: "KPI payout ödənildi",
          detail: `${period} · ${money(baseSnapshot.payoutAmount)} maliyyə xərcinə yazıldı`,
        };
      }

      const nextPeriods = (current.kpiPeriods || []).some((item) => item.period === period)
        ? (current.kpiPeriods || []).map((item) => (item.period === period ? nextPeriod : item))
        : [nextPeriod, ...(current.kpiPeriods || [])];

      return auditCurrentState(
        {
          ...current,
          kpiPeriods: nextPeriods,
          kpiPayouts: nextPayouts,
          expenses: nextExpenses,
        },
        audit,
      );
    });

    if (toast) notify(toast);
  }

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

  function createRecord(type, values) {
    if (!hasCreatePermission(type, values)) return;

    if (type === "sales" || type === "dashboard") {
      const warehouseId = values.warehouseId || state.warehouses[0]?.id;
      const productLines = (Array.isArray(values.products) ? values.products : [])
        .filter((item) => item.product)
        .map((item) => ({ product: item.product, qty: Number(item.qty || 0) }));
      const warehouseRows = state.warehouseStock?.[warehouseId] || [];
      const invalidQtyLine = productLines.some((line) => line.qty <= 0);
      // Çatışmayan qalıq satışı bloklamır — sifariş backorder (mənfi mövcud) kimi qeyd olunur.
      const shortageLines = productLines
        .map((line) => {
          const item = warehouseRows.find((row) => row.product === line.product);
          const free = item ? getFreeQuantity(item) : 0;
          const shortage = Math.max(0, line.qty - free);
          return shortage > 0 ? `${line.product} (${shortage} ədəd)` : null;
        })
        .filter(Boolean);

      if (
        !values.customer ||
        !warehouseId ||
        productLines.length === 0 ||
        invalidQtyLine ||
        Number(values.orderTotal || 0) <= 0
      ) {
        notify("Sifariş üçün müştəri, anbar və ən azı bir məhsul (say > 0) seçin.", "warning");
        return;
      }

      if (shortageLines.length > 0) {
        notify(
          `Qalıq çatışmır — sifariş backorder kimi yaradıldı: ${shortageLines.join(", ")}. Təchizatdan gətirilib təhvil verilməlidir.`,
          "warning",
        );
      }

      // Persist to DB (Supabase). Realtime bridge will merge into state.orders.
      if (activeTenantId && createDbOrder) {
        const customersByName = new Map(
          (dbCustomers || []).map((c) => [String(c.name || "").toLowerCase(), c]),
        );
        const productsBySku = new Map(
          (dbProducts || []).map((p) => [String(p.sku || "").toLowerCase(), p]),
        );
        const productsByName = new Map(
          (dbProducts || []).map((p) => [String(p.name || "").toLowerCase(), p]),
        );
        const orderProducts = Array.isArray(values.products) ? values.products : [];
        const items = orderProducts
          .filter((it) => it.product)
          .map((it, idx) => {
            const key = String(it.product || "").toLowerCase();
            const prod = productsBySku.get(key) || productsByName.get(key) || null;
            const qty = Number(it.qty || 0);
            const unitPrice = Number(it.price || prod?.price || 0);
            return {
              line_no: idx + 1,
              product_id: prod?.id || null,
              description: it.product,
              qty,
              unit_price: unitPrice,
              discount_pct: 0,
              vat_rate: Number(prod?.vat_rate ?? 18),
            };
          });
        const customerRow = customersByName.get(String(values.customer || "").toLowerCase());
        const orderNo = `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
          Math.random() * 9000 + 1000,
        )}`;
        createDbOrder({
          order_no: orderNo,
          customer_id: customerRow?.id || null,
          order_date: values.date || new Date().toISOString().slice(0, 10),
          status: "draft",
          currency: "AZN",
          notes: values.note || null,
          items,
        }).catch((err) => {
          console.error("[orders] DB insert failed:", err);
          notify(`DB-yə saxlanılmadı: ${err.message || err}`, "warning");
        });
      }
    }

    if (type === "warehouse") {
      const id = `WH-${Date.now()}`;
      const warehouse = {
        id,
        code: values.code || `ANB-${state.warehouses.length + 1}`,
        name: values.name,
        city: values.city,
        address: values.address,
        manager: values.manager,
        type: values.type,
        capacity: Number(values.capacity || 0),
        status: values.status || "Aktiv",
      };
      setState((current) => ({
        ...current,
        warehouses: [warehouse, ...current.warehouses],
        warehouseStock: {
          ...current.warehouseStock,
          [id]: [],
        },
      }));
      setSelectedWarehouseId(id);
      setModal(null);
      notify("Yeni anbar yaradıldı.");
      auditOperation({
        module: "Anbar",
        action: "Anbar yaradıldı",
        detail: `${warehouse.name} (${warehouse.code})`,
      });
      return;
    }

    if (type === "product") {
      const name = String(values.name || "").trim();
      const sku = String(values.sku || "").trim().toUpperCase();
      if (!name || !sku) {
        notify("Məhsul adı və SKU daxil edin.", "warning");
        return;
      }
      if (state.products.some((product) => normalize(product.sku) === normalize(sku))) {
        notify("Bu SKU artıq məhsul kataloqunda var.", "warning");
        return;
      }
      const product = {
        id: `PRD-${Date.now()}`,
        name,
        sku,
        category: values.category || "Digər",
        unit: values.unit || "ədəd",
        salePrice: Math.max(0, Number(values.salePrice || 0)),
        costPrice: Math.max(0, Number(values.costPrice || 0)),
        reorderLevel: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
        serialTracked: values.serialTracked === "Bəli",
        status: "Aktiv",
      };
      // Persist to DB — Realtime bridge will merge into state.products
      if (activeTenantId && createDbProduct) {
        createDbProduct({
          sku,
          name,
          description: values.category || null,
          unit: values.unit || "ədəd",
          price: Math.max(0, Number(values.salePrice || 0)),
          currency: "AZN",
          vat_rate: 18,
          is_active: true,
        }).catch((err) => {
          console.error("[products] DB insert failed:", err);
          notify(`Məhsul DB-yə saxlanılmadı: ${err.message || err}`, "warning");
        });
      }
      setState((current) =>
        auditCurrentState(
          { ...current, products: [product, ...(current.products || [])] },
          getCreateAudit("product", product),
        ),
      );
      setModal(null);
      notify(`${product.name} məhsul kataloquna əlavə edildi.`);
      return;
    }

    if (type === "crm" && activeTenantId && createDbCustomer && values.name) {
      createDbCustomer({
        name: String(values.name).trim(),
        phone: values.phone || null,
        tax_id: values.fin || null,
        notes: values.category ? `Kateqoriya: ${values.category}` : null,
      }).catch((err) => {
        console.error("[customers] DB insert failed:", err);
        notify(`Müştəri DB-yə saxlanılmadı: ${err.message || err}`, "warning");
      });
    }

    setState((current) => {
      if (type === "crm") {
        return {
          ...current,
          customers: [
            {
              fin: values.fin || `FIN${current.customers.length + 1}`,
              name: values.name,
              phone: values.phone,
              category: values.category,
              limit: Number(values.limit || 0),
              debt: Number(values.debt || 0),
              delay: 0,
            },
            ...current.customers,
          ],
        };
      }

      if (type === "sales" || type === "dashboard") {
        const nextId = `SF-${Date.now()}`;
        const orderProducts = Array.isArray(values.products) ? values.products : [];
        const orderSellers = Array.isArray(values.sellers) ? values.sellers : [];
        const amount = Number(values.orderTotal ?? values.amount ?? 0);
        const paymentMethod = values.paymentMethod || "Nağd";
        const isCreditSale = paymentMethod === "Kredit";
        const creditPlan = isCreditSale
          ? buildCreditPlan({
              total: amount,
              initialPayment: values.initialPayment,
              months: values.creditMonths,
            })
          : null;
        const paid = isCreditSale
          ? creditPlan.initialPayment
          : ["Nağd", "Kart", "Köçürmə"].includes(paymentMethod)
            ? amount
            : 0;
        const creditId = isCreditSale ? `KR-${String(nextId).replace(/\D/g, "")}` : null;
        const contractId = isCreditSale
          ? `MQ-${currentBusinessDate.slice(0, 4)}-${Date.now()}`
          : null;
        const warehouseId = values.warehouseId || current.warehouses?.[0]?.id;
        const warehouseName =
          current.warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || "Baş Anbar";
        const productLines = orderProducts
          .filter((item) => item.product)
          .map((item) => ({
            product: item.product,
            qty: Number(item.qty || 0),
            price: Number(item.price || 0),
            serials: Array.isArray(item.serials) ? item.serials.filter(Boolean) : [],
          }));
        const productSummary = orderProducts
          .filter((item) => item.product)
          .map((item) => `${item.product}${Number(item.qty) > 1 ? ` x${Number(item.qty)}` : ""}`)
          .join(", ");
        const sellerSummary = orderSellers
          .filter((item) => item.seller)
          .map((item) => `${item.seller} ${Number(item.bonus || 0)}%`)
          .join(", ");
        const sellerBonuses = orderSellers
          .filter((item) => item.seller)
          .map((item) => ({
            seller: item.seller,
            bonus: Number(item.bonus || 0),
          }));
        const reservedByProduct = buildQuantityMap(productLines);
        const nextWarehouseStock =
          warehouseId && current.warehouseStock?.[warehouseId]
            ? {
                ...current.warehouseStock,
                [warehouseId]: updateSerialStatuses(
                  adjustStockRows(current.warehouseStock[warehouseId], reservedByProduct, {
                    reservedDelta: 1,
                    createMissing: true,
                  }),
                  productLines,
                  "Rezervdə",
                  nextId,
                ),
              }
            : current.warehouseStock;
        return {
          ...current,
          warehouseStock: nextWarehouseStock,
          stock: adjustStockRows(current.stock, reservedByProduct, { reservedDelta: 1, createMissing: true }),
          credits: isCreditSale
            ? [
                {
                  id: creditId,
                  customer: values.customer,
                  fin: values.fin || "Yeni FİN",
                  orderId: nextId,
                  contractId,
                  product: productSummary,
                  device: productSummary,
                  total: amount,
                  initialPayment: creditPlan.initialPayment,
                  balance: creditPlan.balance,
                  monthly: creditPlan.monthly,
                  lastPayment: creditPlan.lastPayment,
                  months: creditPlan.months,
                  paidMonths: 0,
                  rate: 0,
                  next: creditPlan.installments[0]?.due || "—",
                  status: "Aktiv",
                  installments: creditPlan.installments,
                  createdFrom: "Satış sifarişi",
                },
                ...current.credits,
              ]
            : current.credits,
          orders: [
            {
              id: nextId,
              customer: values.customer,
              fin: values.fin || "Yeni FİN",
              products: productSummary || values.products,
              productLines,
              seller: sellerSummary || values.seller || "Təyin edilməyib",
              sellerBonuses,
              amount,
              paid,
              status: values.status || "Anbardadır",
              date: values.date || currentBusinessDate,
              address: values.address || "Qeyd edilməyib",
              driver: "—",
              warehouseId,
              warehouseName,
              paymentMethod,
              paymentStatus: paymentMethod === "Kredit" ? "Kredit satış" : "Ödənilib",
              creditId,
              contractId,
              creditMonths: creditPlan?.months || null,
              initialPayment: creditPlan?.initialPayment || 0,
              creditBalance: creditPlan?.balance || 0,
              creditMonthly: creditPlan?.monthly || 0,
              creditLastPayment: creditPlan?.lastPayment || 0,
              deliveryStatus: "Təhvil gözləyir",
              note: values.note || "",
              bonusTotal: Number(values.bonusTotal || 0),
            },
            ...current.orders,
          ],
          contracts: isCreditSale
            ? [
                {
                  id: contractId,
                  customer: values.customer,
                  fin: values.fin || "Yeni FİN",
                  product: productSummary,
                  amount,
                  status: "Hazırlanır",
                  orderId: nextId,
                },
                ...current.contracts,
              ]
            : current.contracts,
        };
      }

      if (type === "finance") {
        return {
          ...current,
          expenses: [
            {
              id: `MX-${Date.now()}`,
              description: values.description,
              category: values.category,
              date: values.date || currentBusinessDate,
              amount: Number(values.amount || 0),
              status: "Təsdiq gözləyir",
            },
            ...current.expenses,
          ],
        };
      }

      if (type === "credits") {
        const creditPlan = buildCreditPlan({
          total: values.total,
          initialPayment: values.initialPayment,
          months: values.months,
        });
        return {
          ...current,
          credits: [
            {
              id: `KR-${Date.now()}`,
              customer: values.customer,
              contractId: values.contractId,
              product: values.product,
              device: values.product,
              total: creditPlan.total,
              initialPayment: creditPlan.initialPayment,
              balance: creditPlan.balance,
              monthly: creditPlan.monthly,
              lastPayment: creditPlan.lastPayment,
              months: creditPlan.months,
              paidMonths: 0,
              rate: 0,
              next: values.next || creditPlan.installments[0]?.due || "—",
              status: "Aktiv",
              installments: creditPlan.installments,
            },
            ...current.credits,
          ],
        };
      }

      if (type === "vendors") {
        const vendor = normalizeVendor(values);
        if (!vendor.name || !vendor.country) return current;
        return {
          ...current,
          vendors: [vendor, ...current.vendors],
        };
      }

      if (type === "hr") {
        const manager = current.employees.find(
          (employee) => getEmployeeKey(employee) === values.managerId || employee.name === values.managerName,
        );
        const documentsComplete = Math.max(0, Math.min(100, Number(values.documentsComplete ?? 100)));
        const documentReviewRequired = documentsComplete < 100;
        return {
          ...current,
          employees: [
            {
              id: `EMP-${Date.now()}`,
              initials: values.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toLocaleUpperCase("az-AZ"),
              name: values.name,
              position: values.position,
              department: values.department,
              departmentParent: values.departmentParent || "",
              managerId: manager ? getEmployeeKey(manager) : "",
              managerName: manager?.name || values.managerName || "",
              level: values.level || "Komanda üzvü",
              salary: Number(values.salary || 0),
              kpi: Number(values.kpi || 85),
              hireDate: values.hireDate || currentBusinessDate,
              workMode: values.workMode || "Ofis",
              shift: values.shift || "09:00-18:00",
              employmentType: values.employmentType || "Tam ştat",
              leaveBalance: Math.max(0, Number(values.leaveBalance || 0)),
              usedLeave: 0,
              documentsComplete,
              hrStatus: documentReviewRequired ? "Məlumat gözləyir" : "Stabil",
              documentReviewRequired,
              skills: String(values.skills || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            },
            ...current.employees,
          ],
        };
      }

      if (type === "contracts") {
        return {
          ...current,
          contracts: [
            {
              id: `MQ-${currentBusinessDate.slice(0, 4)}-${Date.now()}`,
              customer: values.customer,
              fin: values.fin || "Yeni FİN",
              product: values.product,
              amount: Number(values.amount || 0),
              status: "Hazırlanır",
            },
            ...current.contracts,
          ],
        };
      }

      return current;
    });
    setModal(null);
    notify("Yeni qeyd əlavə olundu.");
    auditOperation(getCreateAudit(type, values));
  }

  function updateVendor(vendorKey, values) {
    if (!requirePermission("vendors.manage", "vendoru redaktə etmək")) return;

    const currentVendor = (state.vendors || []).find((vendor) => getVendorKey(vendor) === vendorKey);
    const nextVendor = normalizeVendor(values, currentVendor);
    if (!currentVendor || !nextVendor.name || !nextVendor.country) {
      notify("Vendor adı və ölkə daxil edin.", "warning");
      return;
    }
    if ((state.vendors || []).some((vendor) => getVendorKey(vendor) !== vendorKey && normalize(vendor.name) === normalize(nextVendor.name))) {
      notify("Bu adda vendor artıq mövcuddur.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          vendors: (current.vendors || []).map((vendor) => (getVendorKey(vendor) === vendorKey ? nextVendor : vendor)),
          purchaseOrders: (current.purchaseOrders || []).map((po) =>
            po.vendor === currentVendor.name
              ? {
                  ...po,
                  vendor: nextVendor.name,
                  supplierSource: po.supplierSource === currentVendor.name ? nextVendor.name : po.supplierSource,
                }
              : po,
          ),
        },
        {
          module: "Vendor",
          action: "Vendor redaktə edildi",
          detail: `${currentVendor.name} → ${nextVendor.name}`,
        },
      ),
    );
    setModal(null);
    notify(`${nextVendor.name} vendor məlumatları yeniləndi.`);
  }

  function deleteVendor(vendorKey) {
    if (!requirePermission("vendors.manage", "vendoru silmək")) return;

    const targetVendor = (state.vendors || []).find((vendor) => getVendorKey(vendor) === vendorKey);
    if (!targetVendor) return;
    const openPoCount = (state.purchaseOrders || []).filter((po) => po.vendor === targetVendor.name && isPurchaseOrderOpen(po)).length;
    if (openPoCount > 0) {
      notify("Bu vendor üzrə açıq PO var. Əvvəl PO-nu təsdiqləyin və ya vendoru Passiv edin.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          vendors: (current.vendors || []).filter((vendor) => getVendorKey(vendor) !== vendorKey),
        },
        {
          module: "Vendor",
          action: "Vendor silindi",
          detail: targetVendor.name,
          status: "Tamamlandı",
        },
      ),
    );
    setModal(null);
    notify(`${targetVendor.name} vendor reyestrindən silindi.`);
  }

  function updateWarehouse(id, values) {
    if (!requirePermission("warehouse.manage", "anbarı redaktə etmək")) return;

    setState((current) => ({
      ...current,
      warehouses: current.warehouses.map((warehouse) =>
        warehouse.id === id
          ? {
              ...warehouse,
              code: values.code,
              name: values.name,
              city: values.city,
              address: values.address,
              manager: values.manager,
              type: values.type,
              capacity: Number(values.capacity || 0),
              status: values.status,
            }
          : warehouse,
      ),
    }));
    setModal(null);
    notify("Anbar məlumatları yeniləndi.");
    auditOperation({
      module: "Anbar",
      action: "Anbar redaktə edildi",
      detail: `${values.name} (${values.code})`,
    });
  }

  function recordStockIntake(values) {
    if (!requirePermission("warehouse.manage", "anbara mədaxil etmək")) return;

    const warehouseId = values.warehouseId;
    const warehouse = state.warehouses.find((item) => item.id === warehouseId);
    const product = String(values.product || "").trim();
    const qty = Math.max(0, Math.round(Number(values.qty || 0)));
    const price = Math.max(0, Number(values.price || 0));

    if (!warehouse || !product || qty <= 0) {
      notify("Mədaxil üçün anbar, məhsul və etibarlı miqdar daxil edin.", "warning");
      return;
    }

    setState((current) => {
      const knownProduct = (current.products || []).find((item) => normalize(item.name) === normalize(product));
      const catalogProduct = knownProduct
        ? {
            ...knownProduct,
            salePrice: price || Number(knownProduct.salePrice || 0),
          }
        : {
            id: `PRD-${Date.now()}`,
            name: product,
            sku: `SKU-${Date.now().toString().slice(-6)}`,
            category: "Digər",
            unit: "ədəd",
            salePrice: price,
            costPrice: 0,
            reorderLevel: 0,
            serialTracked: price >= 1500,
            status: "Aktiv",
          };
      const products = knownProduct
        ? current.products.map((item) => (item.id === knownProduct.id ? catalogProduct : item))
        : [catalogProduct, ...(current.products || [])];

      return auditCurrentState(
        {
          ...current,
          products,
          warehouseStock: {
            ...current.warehouseStock,
            [warehouseId]: addStockToRows(
              current.warehouseStock?.[warehouseId] || [],
              product,
              qty,
              price,
              warehouseId,
              catalogProduct,
            ),
          },
          stock: addStockToRows(current.stock, product, qty, price, "", catalogProduct),
        },
        {
          module: "Anbar",
          action: "İlkin mədaxil edildi",
          detail: `${product}: ${qty} ədəd · ${warehouse.name}`,
        },
      );
    });
    setModal(null);
    notify(`${product}: ${qty} ədəd ${warehouse.name} anbarına mədaxil edildi.`);
  }

  function importWarehouseStock(rows) {
    if (!requirePermission("warehouse.manage", "anbara toplu import etmək")) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      notify("İmport üçün etibarlı CSV sətri tapılmadı.", "warning");
      return;
    }

    setState((current) => {
      let nextProducts = [...(current.products || [])];
      let nextStock = [...(current.stock || [])];
      const nextWarehouseStock = { ...(current.warehouseStock || {}) };
      const productBySku = new Map(nextProducts.filter((product) => product.sku).map((product) => [normalize(product.sku), product]));
      const productByName = new Map(nextProducts.map((product) => [normalize(product.name), product]));
      const warehouseById = new Map((current.warehouses || []).map((warehouse) => [warehouse.id, warehouse]));
      const touchedProducts = new Set();
      const touchedWarehouses = new Set();

      rows.forEach((row, index) => {
        const warehouse = warehouseById.get(row.warehouseId);
        if (!warehouse) return;

        const matchedProduct = (row.sku && productBySku.get(normalize(row.sku))) || productByName.get(normalize(row.product));
        const product = matchedProduct
          ? {
              ...matchedProduct,
              category: row.category || matchedProduct.category || "Digər",
              unit: row.unit || matchedProduct.unit || "ədəd",
              salePrice: row.salePrice ?? Number(matchedProduct.salePrice || 0),
              costPrice: row.costPrice ?? Number(matchedProduct.costPrice || 0),
              reorderLevel: row.reorderLevel ?? Number(matchedProduct.reorderLevel || 0),
              serialTracked: row.serialTracked ?? Boolean(matchedProduct.serialTracked),
              status: matchedProduct.status || "Aktiv",
            }
          : {
              id: `PRD-IMP-${Date.now()}-${index}`,
              name: row.product,
              sku: row.sku || `SKU-IMP-${Date.now().toString().slice(-6)}-${index + 1}`,
              category: row.category || "Digər",
              unit: row.unit || "ədəd",
              salePrice: row.salePrice ?? 0,
              costPrice: row.costPrice ?? 0,
              reorderLevel: row.reorderLevel ?? 0,
              serialTracked: row.serialTracked ?? false,
              status: "Aktiv",
            };

        if (matchedProduct) {
          nextProducts = nextProducts.map((item) => (item.id === product.id ? product : item));
        } else {
          nextProducts = [product, ...nextProducts];
        }
        productBySku.set(normalize(product.sku), product);
        productByName.set(normalize(product.name), product);

        const salePrice = row.salePrice ?? Number(product.salePrice || 0);
        nextWarehouseStock[warehouse.id] = addStockToRows(
          nextWarehouseStock[warehouse.id] || [],
          product.name,
          row.qty,
          salePrice,
          warehouse.id,
          product,
        );
        nextStock = addStockToRows(nextStock, product.name, row.qty, salePrice, "", product);
        touchedProducts.add(product.id);
        touchedWarehouses.add(warehouse.id);
      });

      return auditCurrentState(
        {
          ...current,
          products: nextProducts,
          stock: nextStock,
          warehouseStock: nextWarehouseStock,
        },
        {
          module: "Anbar",
          action: "Toplu stok import edildi",
          detail: `${rows.length} sətir · ${touchedProducts.size} məhsul · ${touchedWarehouses.size} anbar`,
        },
      );
    });
    setModal(null);
    notify(`${rows.length} stok sətri anbara import edildi.`);
  }

  function updateProduct(productId, values) {
    if (!requirePermission("warehouse.manage", "məhsul kataloqunu redaktə etmək")) return;

    const currentProduct = state.products.find((product) => product.id === productId);
    const name = String(values.name || "").trim();
    const sku = String(values.sku || "").trim().toUpperCase();
    if (!currentProduct || !name || !sku) {
      notify("Məhsul adı və SKU daxil edin.", "warning");
      return;
    }
    if (state.products.some((product) => product.id !== productId && normalize(product.sku) === normalize(sku))) {
      notify("Bu SKU artıq məhsul kataloqunda var.", "warning");
      return;
    }

    const nextProduct = {
      ...currentProduct,
      name,
      sku,
      category: values.category || "Digər",
      unit: values.unit || "ədəd",
      salePrice: Math.max(0, Number(values.salePrice || 0)),
      costPrice: Math.max(0, Number(values.costPrice || 0)),
      reorderLevel: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
      serialTracked: values.serialTracked === "Bəli",
    };
    setState((current) => {
      const renameStockItem = (item, warehouseId = "") => {
        if (item.product !== currentProduct.name) return item;
        const nextItem = {
          ...item,
          product: nextProduct.name,
          price: nextProduct.salePrice || item.price,
          serialTracked: nextProduct.serialTracked,
          reorderLevel: nextProduct.reorderLevel,
        };
        return {
          ...nextItem,
          serials: ensureStockItemSerials(nextItem, warehouseId).serials,
        };
      };
      const warehouseStock = Object.fromEntries(
        Object.entries(current.warehouseStock || {}).map(([warehouseId, rows]) => [
          warehouseId,
          (rows || []).map((item) => renameStockItem(item, warehouseId)),
        ]),
      );
      return auditCurrentState(
        {
          ...current,
          products: current.products.map((product) => (product.id === productId ? nextProduct : product)),
          stock: current.stock.map((item) => renameStockItem(item)),
          warehouseStock,
        },
        {
          module: "Məhsul",
          action: "Məhsul redaktə edildi",
          detail: `${nextProduct.sku} · ${nextProduct.name}`,
        },
      );
    });
    // Persist to DB — Realtime bridge will refresh state
    if (activeTenantId && updateDbProduct) {
      const dbRow =
        (dbProducts || []).find((p) => p.id === productId) ||
        (dbProducts || []).find((p) => String(p.sku).toLowerCase() === String(currentProduct.sku).toLowerCase());
      if (dbRow) {
        updateDbProduct(dbRow.id, {
          sku: nextProduct.sku,
          name: nextProduct.name,
          description: nextProduct.category || null,
          unit: nextProduct.unit,
          price: nextProduct.salePrice,
        }).catch((err) => {
          console.error("[products] DB update failed:", err);
          notify(`Məhsul DB-də yenilənmədi: ${err.message || err}`, "warning");
        });
      }
    }
    setModal(null);
    notify(`${nextProduct.name} məhsul məlumatları yeniləndi.`);
  }

  function deleteProduct(productId) {
    if (!requirePermission("warehouse.manage", "məhsul kataloqunu silmək")) return;
    const currentProduct = state.products.find((product) => product.id === productId);
    if (!currentProduct) {
      notify("Məhsul tapılmadı.", "warning");
      return;
    }
    if (!window.confirm(`${currentProduct.name} məhsulunu silmək istədiyinizə əminsiniz?`)) return;

    // Optimistic local removal + related stock cleanup
    setState((current) => {
      const stripRows = (rows) => (rows || []).filter((row) => row.product !== currentProduct.name);
      const warehouseStock = Object.fromEntries(
        Object.entries(current.warehouseStock || {}).map(([wid, rows]) => [wid, stripRows(rows)]),
      );
      return auditCurrentState(
        {
          ...current,
          products: current.products.filter((p) => p.id !== productId),
          stock: stripRows(current.stock),
          warehouseStock,
        },
        { module: "Məhsul", action: "Məhsul silindi", detail: `${currentProduct.sku} · ${currentProduct.name}` },
      );
    });

    // Persist to DB
    if (activeTenantId && deleteDbProduct) {
      const dbRow =
        (dbProducts || []).find((p) => p.id === productId) ||
        (dbProducts || []).find((p) => String(p.sku).toLowerCase() === String(currentProduct.sku).toLowerCase());
      if (dbRow) {
        deleteDbProduct(dbRow.id).catch((err) => {
          notify(`Məhsul DB-dən silinmədi: ${err.message || err}`, "warning");
        });
      }
    }
    setModal(null);
    notify(`${currentProduct.name} silindi.`);
  }

  function deleteCustomer(fin) {
    if (!requirePermission("crm.manage", "müştəri silmək")) return;
    const currentCustomer = (state.customers || []).find((c) => c.fin === fin);
    if (!currentCustomer) {
      notify("Müştəri tapılmadı.", "warning");
      return;
    }
    if (!window.confirm(`${currentCustomer.name} müştərisini silmək istədiyinizə əminsiniz?`)) return;

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          customers: (current.customers || []).filter((c) => c.fin !== fin),
        },
        { module: "CRM", action: "Müştəri silindi", detail: `${currentCustomer.fin} · ${currentCustomer.name}` },
      ),
    );

    if (activeTenantId && deleteDbCustomer) {
      const dbRow =
        (dbCustomers || []).find((c) => c.id === currentCustomer.id) ||
        (dbCustomers || []).find((c) => (c.tax_id || "") === fin) ||
        (dbCustomers || []).find((c) => normalize(c.name) === normalize(currentCustomer.name));
      if (dbRow) {
        deleteDbCustomer(dbRow.id).catch((err) => {
          notify(`Müştəri DB-dən silinmədi: ${err.message || err}`, "warning");
        });
      }
    }
    notify(`${currentCustomer.name} silindi.`);
  }



  function saveFinanceAccount(accountId, values) {
    if (!requirePermission("finance.manage", "kassa və bank hesabını idarə etmək")) return;

    const name = String(values.name || "").trim();
    const code = String(values.code || "").trim().toUpperCase();
    if (!name || !code) {
      notify("Hesab adı və kodu daxil edin.", "warning");
      return;
    }
    const existing = (state.financeAccounts || []).find((account) => account.id === accountId);
    if ((state.financeAccounts || []).some((account) => account.id !== accountId && normalize(account.code) === normalize(code))) {
      notify("Bu hesab kodu artıq istifadə olunur.", "warning");
      return;
    }

    const account = {
      id: accountId || `ACC-${Date.now()}`,
      name,
      code,
      type: values.type || "Kassa",
      currency: values.currency || "AZN",
      openingBalance: Math.max(0, Number(values.openingBalance || 0)),
      status: values.status || "Aktiv",
      updatedAt: new Date().toISOString(),
    };
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          financeAccounts: existing
            ? current.financeAccounts.map((item) => (item.id === account.id ? account : item))
            : [account, ...(current.financeAccounts || [])],
        },
        {
          module: "Maliyyə",
          action: existing ? "Maliyyə hesabı redaktə edildi" : "Maliyyə hesabı yaradıldı",
          detail: `${account.code} · ${account.name} · ${money(account.openingBalance)}`,
        },
      ),
    );
    setModal(null);
    notify(`${account.name} hesabı yadda saxlanıldı.`);
  }

  function deleteWarehouse(id) {
    if (!requirePermission("warehouse.manage", "anbarı silmək")) return;

    const warehouse = state.warehouses.find((item) => item.id === id);
    const warehouseItems = state.warehouseStock?.[id] || [];
    const totalQty = warehouseItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const reservedQty = warehouseItems.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
    const deliveryCount = state.orders.filter((order) => isDeliveryQueueOrder(order) && order.warehouseId === id).length;
    const openPoCount = (state.purchaseOrders || []).filter(
      (po) => po.warehouseId === id && !["Təsdiq edildi", "Ləğv edildi"].includes(po.status),
    ).length;

    if (totalQty > 0 || reservedQty > 0 || deliveryCount > 0 || openPoCount > 0) {
      const reason = [
        totalQty > 0 ? `${totalQty} stok` : "",
        reservedQty > 0 ? `${reservedQty} rezerv` : "",
        deliveryCount > 0 ? `${deliveryCount} açıq təhvil` : "",
        openPoCount > 0 ? `${openPoCount} açıq PO` : "",
      ].filter(Boolean).join(" · ");
      notify(`${warehouse?.name || id} silinmədi: əvvəl ${reason} bağlanmalıdır.`, "warning");
      auditOperation({
        module: "Anbar",
        action: "Anbar silinməsi bloklandı",
        detail: `${warehouse?.name || id} · ${reason}`,
        status: "Bloklandı",
      });
      return;
    }

    const remaining = state.warehouses.filter((warehouse) => warehouse.id !== id);
    setState((current) => {
      const nextWarehouseStock = { ...current.warehouseStock };
      delete nextWarehouseStock[id];
      return {
        ...current,
        warehouses: current.warehouses.filter((warehouse) => warehouse.id !== id),
        warehouseStock: nextWarehouseStock,
      };
    });
    if (selectedWarehouseId === id) {
      setSelectedWarehouseId(remaining[0]?.id || "all");
    }
    notify("Anbar silindi.");
    auditOperation({
      module: "Anbar",
      action: "Anbar silindi",
      detail: id,
    });
  }

  function advanceOrder(id) {
    if (!requirePermission("delivery.complete", "təhvil mərhələsini dəyişmək")) return;

    setState((current) => ({
      ...current,
      orders: current.orders.map((order) => {
        if (order.id !== id) return order;
        const index = stages.indexOf(order.status);
        if (index < 0 || index === stages.length - 1) return order;
        return { ...order, status: stages[index + 1] };
      }),
    }));
    notify(`${id} növbəti mərhələyə keçirildi.`);
    auditOperation({
      module: "Təhvil",
      action: "Sifariş mərhələsi dəyişdi",
      detail: id,
    });
  }

  function completeWarehouseDelivery(orderId) {
    if (!requirePermission("delivery.complete", "təhvili tamamlamaq")) return;

    const targetOrder = state.orders.find((order) => order.id === orderId);

    if (
      !targetOrder ||
      targetOrder.status === "Təhvil verilib" ||
      !Array.isArray(targetOrder.productLines) ||
      targetOrder.productLines.length === 0
    ) {
      notify("Bu sifariş üçün təhvil əməliyyatı aparıla bilmədi.", "warning");
      return;
    }

    const initialCheck = getDeliveryStockCheck(
      { ...targetOrder, warehouseId: targetOrder.warehouseId || state.warehouses?.[0]?.id },
      state.warehouseStock,
    );
    if (!initialCheck.ok) {
      notify(initialCheck.reason || "Təhvil üçün anbar rezervi kifayət etmir.", "warning");
      auditOperation({
        module: "Təhvil/Anbar",
        action: "Təhvil bloklandı",
        detail: `${orderId} · ${initialCheck.reason}`,
        status: "Bloklandı",
      });
      return;
    }

    setState((current) => {
      const order = current.orders.find((item) => item.id === orderId);
      if (!order || order.status === "Təhvil verilib" || !Array.isArray(order.productLines)) {
        return current;
      }

      const warehouseId = order.warehouseId || current.warehouses?.[0]?.id;
      const stockCheck = getDeliveryStockCheck({ ...order, warehouseId }, current.warehouseStock);
      if (!stockCheck.ok) {
        return appendAudit(current, {
          module: "Təhvil/Anbar",
          action: "Təhvil bloklandı",
          detail: `${orderId} · ${stockCheck.reason}`,
          status: "Bloklandı",
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        });
      }

      const plan = stockCheck.plan || getDeliveryPlan({ ...order, warehouseId }, current.warehouseStock);
      const deliverableLines = plan.lines.filter((line) => line.deliverable > 0);
      if (deliverableLines.length === 0) return current;

      const quantities = buildQuantityMap(
        deliverableLines.map((line) => ({ product: line.product, qty: line.deliverable })),
      );
      const serialLines = deliverableLines.map((line) => ({ product: line.product, qty: line.deliverable }));
      const nextWarehouseStock =
        warehouseId && current.warehouseStock?.[warehouseId]
          ? {
              ...current.warehouseStock,
              [warehouseId]: updateSerialStatuses(
                adjustStockRows(current.warehouseStock[warehouseId], quantities, {
                  totalDelta: -1,
                  reservedDelta: -1,
                }),
                serialLines,
                "Satılıb",
                orderId,
              ),
            }
          : current.warehouseStock;

      const nextDelivered = {};
      plan.lines.forEach((line) => {
        nextDelivered[line.product] = line.delivered + line.deliverable;
      });
      const fullyDelivered = plan.lines.every((line) => line.delivered + line.deliverable >= line.ordered);
      const deliveredNow = deliverableLines.reduce((sum, line) => sum + line.deliverable, 0);
      const remainingAfter = plan.remainingTotal - deliveredNow;

      return appendAudit(
        {
          ...current,
          warehouseStock: nextWarehouseStock,
          stock: adjustStockRows(current.stock, quantities, {
            totalDelta: -1,
            reservedDelta: -1,
          }),
          orders: current.orders.map((item) =>
            item.id === orderId
              ? {
                  ...item,
                  deliveredQuantities: nextDelivered,
                  status: fullyDelivered ? "Təhvil verilib" : item.status,
                  deliveryStatus: fullyDelivered
                    ? "Təhvil verildi"
                    : `Qismən təhvil (${plan.deliveredTotal + deliveredNow}/${plan.orderedTotal})`,
                  deliveredAt: formatPaymentDate(parsePaymentDate(baseDeliveryDate)),
                  deliveredBy: currentUser?.name || currentUser?.email || "System",
                }
              : item,
          ),
        },
        {
          module: "Təhvil/Anbar",
          action: fullyDelivered ? "Təhvil tamamlandı" : "Qismən təhvil",
          detail: `${orderId} · ${summarizeOrderProducts(order)} · ${deliveredNow} ədəd anbardan çıxıldı${
            fullyDelivered ? "" : ` · ${remainingAfter} ədəd backorder qalır`
          }`,
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        },
      );
    });

    const resultPlan = initialCheck.plan;
    if (resultPlan && resultPlan.shortageTotal > 0) {
      notify(
        `${orderId}: ${resultPlan.deliverableTotal} ədəd təhvil verildi, ${resultPlan.shortageTotal} ədəd backorder olaraq qaldı.`,
        "warning",
      );
    } else {
      notify(`${orderId} təhvil verildi və məhsul anbardan çıxıldı.`, "success");
    }
  }


  function transferWarehouseStock({ fromWarehouseId, toWarehouseId, product, qty }) {
    if (!requirePermission("warehouse.manage", "anbar transferi etmək")) return;

    const amount = Math.max(1, Math.round(Number(qty || 0)));
    const fromRows = state.warehouseStock[fromWarehouseId] || [];
    const sourceItem = fromRows.find((item) => item.product === product);
    const available = sourceItem ? getAvailableQuantity(sourceItem) : 0;

    if (!sourceItem || !toWarehouseId || fromWarehouseId === toWarehouseId || available < amount) {
      notify("Transfer üçün kifayət qədər satış qalığı yoxdur.", "warning");
      return;
    }

    setState((current) => {
      const sourceRows = current.warehouseStock[fromWarehouseId] || [];
      const targetRows = current.warehouseStock[toWarehouseId] || [];
      const latestSource = sourceRows.find((item) => item.product === product);
      const latestAvailable = latestSource ? getAvailableQuantity(latestSource) : 0;

      if (!latestSource || latestAvailable < amount) return current;

      const nextSourceRows = sourceRows.map((item) =>
        item.product === product ? { ...item, total: Math.max(item.reserved, Number(item.total || 0) - amount) } : item,
      );
      const targetHasProduct = targetRows.some((item) => item.product === product);
      const nextTargetRows = targetHasProduct
        ? targetRows.map((item) =>
            item.product === product ? { ...item, total: Number(item.total || 0) + amount } : item,
          )
        : [
            ...targetRows,
            {
              product,
              total: amount,
              reserved: 0,
              price: Number(latestSource.price || 0),
            },
          ];

      return {
        ...current,
        warehouseStock: {
          ...current.warehouseStock,
          [fromWarehouseId]: nextSourceRows,
          [toWarehouseId]: nextTargetRows,
        },
      };
    });

    const sourceName = state.warehouses.find((warehouse) => warehouse.id === fromWarehouseId)?.name || fromWarehouseId;
    const targetName = state.warehouses.find((warehouse) => warehouse.id === toWarehouseId)?.name || toWarehouseId;
    notify(`${product}: ${amount} ədəd ${sourceName} → ${targetName} transfer edildi.`, "success");
    auditOperation({
      module: "Anbar",
      action: "Stok transfer edildi",
      detail: `${product}: ${amount} ədəd ${sourceName} → ${targetName}`,
    });
  }

  function setExpenseStatus(id, status) {
    if (!requirePermission("finance.manage", "xərc statusunu dəyişmək")) return;

    setState((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === id ? { ...expense, status } : expense,
      ),
    }));
    notify(`Xərc əməliyyatı: ${status}.`);
    auditOperation({
      module: "Maliyyə",
      action: "Xərc statusu dəyişdi",
      detail: `${id}: ${status}`,
    });
  }

  function getSalesOrderLinkedCredit(snapshot, order) {
    if (!order) return null;
    return (snapshot.credits || []).find(
      (credit) => credit.orderId === order.id || credit.id === order.creditId || credit.id === getCreditIdForOrder(order),
    );
  }

  function openSalesOrderEditor(orderId) {
    if (!requirePermission("sales.create", "satış əməliyyatını redaktə etmək")) return;
    setModal({ type: "salesOperation", orderId });
  }

  function openSalesOrderDelete(orderId) {
    if (!requirePermission("sales.create", "satış əməliyyatını silmək")) return;
    setModal({ type: "salesOperationDelete", orderId });
  }

  function openLinkedSalesOrder(orderId) {
    const targetOrder = state.orders.find((order) => order.id === orderId);

    if (!targetOrder) {
      notify("Bağlı sifariş tapılmadı.", "warning");
      return;
    }

    setSelectedOrder(orderId);
    setQuery("");
    setActive("sales");
    setMobileNav(false);
    auditOperation({
      module: "Kredit/Satış",
      action: "Bağlı sifarişə keçid edildi",
      detail: `${orderId} · ${targetOrder.customer}`,
    });
  }

  function openLinkedCredit(creditId) {
    const targetCredit = creditRecords.find((credit) => credit.id === creditId);

    if (!targetCredit) {
      notify("Bağlı kredit tapılmadı.", "warning");
      return;
    }

    setSelectedCreditId(creditId);
    setQuery("");
    setActive("credits");
    setMobileNav(false);
    auditOperation({
      module: "CRM/Kredit",
      action: "Bağlı kreditə keçid edildi",
      detail: `${creditId} · ${targetCredit.customer}`,
    });
  }

  function openVendorModule(sourceId = "") {
    setQuery("");
    setActive("vendors");
    setMobileNav(false);
    auditOperation({
      module: "Maliyyə/Vendor",
      action: "PO mənbəyinə keçid edildi",
      detail: sourceId || "Vendor modulu",
    });
  }

  function openVendorDelete(vendorKey) {
    if (!requirePermission("vendors.manage", "vendoru silmək")) return;
    setModal({ type: "vendorDelete", vendorKey });
  }

  function validateSalesOrderEdit(order, values) {
    const nextProductLines = normalizeOrderProductLines(values.productLines);
    const nextWarehouseId = values.warehouseId || order.warehouseId || state.warehouses?.[0]?.id;
    const oldWarehouseId = order.warehouseId || state.warehouses?.[0]?.id;
    const nextStatus = values.status || order.status;
    const delivered = order.status === "Təhvil verilib";
    const productOrWarehouseChanged =
      nextWarehouseId !== oldWarehouseId ||
      productLineSignature(nextProductLines) !== productLineSignature(order.productLines || []);

    if (nextProductLines.length === 0) {
      notify("Satış əməliyyatında ən azı bir məhsul sətri olmalıdır.", "warning");
      return false;
    }
    if (Number(values.amount ?? calculateOrderLineTotal(nextProductLines)) <= 0) {
      notify("Satış məbləği 0-dan böyük olmalıdır.", "warning");
      return false;
    }
    if (delivered && productOrWarehouseChanged) {
      notify("Təhvil verilmiş satışda məhsul və anbar dəyişmək üçün geri qaytarma əməliyyatı lazımdır.", "warning");
      return false;
    }
    if (delivered && nextStatus !== "Təhvil verilib") {
      notify("Təhvil verilmiş satışı əvvəlki mərhələyə qaytarmaq üçün ayrıca geri qaytarma axını lazımdır.", "warning");
      return false;
    }
    if (!delivered && nextStatus === "Təhvil verilib") {
      notify("Məhsulu anbardan çıxarmaq üçün Təhvil modulundakı tamamla əməliyyatından istifadə edin.", "warning");
      return false;
    }
    if (!productOrWarehouseChanged) return true;

    const warehouseRows = state.warehouseStock?.[nextWarehouseId] || [];
    const oldQuantities =
      oldWarehouseId === nextWarehouseId ? buildQuantityMap(order.productLines || []) : new Map();
    const nextQuantities = buildQuantityMap(nextProductLines);
    const insufficient = [...nextQuantities.entries()].find(([product, qty]) => {
      const stockItem = warehouseRows.find((item) => item.product === product);
      const currentOrderReservation = oldQuantities.get(product) || 0;
      return !stockItem || getAvailableQuantity(stockItem) + currentOrderReservation < qty;
    });

    if (insufficient) {
      notify(`${insufficient[0]} üçün seçilən anbarda kifayət qədər satış qalığı yoxdur.`, "warning");
      return false;
    }
    return true;
  }

  function updateSalesOrder(orderId, values) {
    if (!requirePermission("sales.create", "satış əməliyyatını redaktə etmək")) return;
    const existingOrder = state.orders.find((order) => order.id === orderId);
    if (!existingOrder) {
      notify("Satış əməliyyatı tapılmadı.", "warning");
      return;
    }
    if (!validateSalesOrderEdit(existingOrder, values)) return;

    // Persist header changes to DB when the order originated from DB
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (activeTenantId && updateDbOrder && uuidRe.test(String(orderId))) {
      const statusMap = {
        "Yeni": "draft",
        "Təsdiqlənib": "confirmed",
        "Yolda": "shipped",
        "Təhvil verilib": "delivered",
        "Ləğv edilib": "cancelled",
      };
      const custRow = (dbCustomers || []).find(
        (c) => String(c.name).toLowerCase() === String(values.customer || existingOrder.customer || "").toLowerCase(),
      );
      const patch = {
        customer_id: custRow?.id ?? null,
        order_date: values.date || existingOrder.date || new Date().toISOString().slice(0, 10),
        notes: values.note ?? existingOrder.note ?? null,
        status: statusMap[values.status || existingOrder.status] || "draft",
      };
      updateDbOrder(orderId, patch).catch((err) => {
        console.error("[orders] DB update failed:", err);
        notify(`Sifariş DB-də yenilənmədi: ${err.message || err}`, "warning");
      });
    }


    setState((current) => {
      const order = current.orders.find((item) => item.id === orderId);
      if (!order) return current;

      const productLines = normalizeOrderProductLines(values.productLines);
      const sellerBonuses = buildSellerBonusRows(values.sellers);
      const sellerSummary = summarizeSellerBonusRows(sellerBonuses) || order.seller || "Təyin edilməyib";
      const oldWarehouseId = order.warehouseId || current.warehouses?.[0]?.id;
      const nextWarehouseId = values.warehouseId || oldWarehouseId;
      const warehouseName =
        current.warehouses.find((warehouse) => warehouse.id === nextWarehouseId)?.name ||
        order.warehouseName ||
        "Baş Anbar";
      const amount = Math.max(0, Number(values.amount ?? calculateOrderLineTotal(productLines)));
      const paymentMethod = values.paymentMethod || order.paymentMethod || "Nağd";
      const isCreditSale = paymentMethod === "Kredit";
      const creditPlan = isCreditSale
        ? buildCreditPlan({
            total: amount,
            initialPayment: Math.min(amount, Math.max(0, Number(values.initialPayment ?? order.initialPayment ?? order.paid ?? 0))),
            months: values.creditMonths || order.creditMonths || 12,
          })
        : null;
      const paid = isCreditSale
        ? creditPlan.initialPayment
        : Math.min(amount, Math.max(0, Number(values.paid ?? order.paid ?? amount)));
      const paymentStatus = isCreditSale ? "Kredit satış" : paid >= amount ? "Ödənilib" : paid > 0 ? "Qalıqlı" : "Ödəniş gözləyir";
      const linkedCredit = getSalesOrderLinkedCredit(current, order);
      const creditId = isCreditSale ? order.creditId || linkedCredit?.id || getCreditIdForOrder(order) : null;
      const contractId = isCreditSale ? order.contractId || linkedCredit?.contractId || `MQ-${currentBusinessDate.slice(0, 4)}-${Date.now()}` : null;
      const delivered = order.status === "Təhvil verilib";
      const productOrWarehouseChanged =
        nextWarehouseId !== oldWarehouseId ||
        productLineSignature(productLines) !== productLineSignature(order.productLines || []);

      let warehouseStock = current.warehouseStock;
      let stock = current.stock;
      if (!delivered && productOrWarehouseChanged) {
        const oldQuantities = buildQuantityMap(order.productLines || []);
        const nextQuantities = buildQuantityMap(productLines);
        warehouseStock = { ...(current.warehouseStock || {}) };

        if (oldWarehouseId && warehouseStock[oldWarehouseId]) {
          warehouseStock[oldWarehouseId] = releaseOrderSerialReservations(
            adjustStockRows(warehouseStock[oldWarehouseId], oldQuantities, { reservedDelta: -1 }),
            order.productLines || [],
            order.id,
          );
        }
        if (nextWarehouseId && warehouseStock[nextWarehouseId]) {
          warehouseStock[nextWarehouseId] = updateSerialStatuses(
            adjustStockRows(warehouseStock[nextWarehouseId], nextQuantities, { reservedDelta: 1 }),
            productLines,
            "Rezervdə",
            order.id,
          );
        }
        stock = adjustStockRows(
          adjustStockRows(current.stock, oldQuantities, { reservedDelta: -1 }),
          nextQuantities,
          { reservedDelta: 1 },
        );
      }

      const nextOrder = {
        ...order,
        customer: values.customer || order.customer,
        fin: values.fin || order.fin,
        productLines,
        products: productLines.map((line) => `${line.product}${line.qty > 1 ? ` x${line.qty}` : ""}`).join(", "),
        seller: sellerSummary,
        sellerBonuses,
        amount,
        paid,
        status: values.status || order.status,
        date: values.date || order.date || currentBusinessDate,
        address: values.address || order.address || "Qeyd edilməyib",
        warehouseId: nextWarehouseId,
        warehouseName,
        paymentMethod,
        paymentStatus,
        creditId,
        contractId,
        creditMonths: creditPlan?.months || null,
        initialPayment: creditPlan?.initialPayment || 0,
        creditBalance: creditPlan?.balance || 0,
        creditMonthly: creditPlan?.monthly || 0,
        creditLastPayment: creditPlan?.lastPayment || 0,
        note: values.note || "",
        bonusTotal: Number(values.bonusTotal ?? (paid * sellerBonuses.reduce((sum, item) => sum + Number(item.bonus || 0), 0)) / 100),
      };

      const nextCredits = isCreditSale
        ? (() => {
            const creditRecord = buildSalesCreditForOrder(nextOrder, linkedCredit);
            const exists = (current.credits || []).some((credit) => credit.id === creditRecord.id || credit.orderId === order.id);
            return exists
              ? current.credits.map((credit) => (credit.id === creditRecord.id || credit.orderId === order.id ? creditRecord : credit))
              : [creditRecord, ...(current.credits || [])];
          })()
        : (current.credits || []).filter((credit) => credit.orderId !== order.id && credit.id !== order.creditId);

      const nextContracts = isCreditSale
        ? (() => {
            const contractRecord = {
              id: contractId,
              customer: nextOrder.customer,
              fin: nextOrder.fin,
              product: summarizeOrderProducts(nextOrder),
              amount,
              status: current.contracts.find((contract) => contract.id === contractId)?.status || "Hazırlanır",
              orderId: order.id,
            };
            const exists = current.contracts.some((contract) => contract.id === contractId || contract.orderId === order.id);
            return exists
              ? current.contracts.map((contract) => (contract.id === contractId || contract.orderId === order.id ? contractRecord : contract))
              : [contractRecord, ...current.contracts];
          })()
        : current.contracts.filter((contract) => contract.orderId !== order.id && contract.id !== order.contractId);

      return auditCurrentState(
        {
          ...current,
          stock,
          warehouseStock,
          orders: current.orders.map((item) => (item.id === order.id ? nextOrder : item)),
          credits: nextCredits,
          contracts: nextContracts,
        },
        {
          module: "Satış",
          action: "Satış əməliyyatı redaktə edildi",
          detail: `${order.id} · ${nextOrder.customer} · ${money(amount)}`,
        },
      );
    });
    setModal(null);
    notify(`${orderId} satış əməliyyatı yeniləndi.`);
  }

  function deleteSalesOrder(orderId) {
    if (!requirePermission("sales.create", "satış əməliyyatını silmək")) return;
    const targetOrder = state.orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      notify("Satış əməliyyatı tapılmadı.", "warning");
      return;
    }

    // DB delete for UUID ids (order_items cascade)
    const isUuid = typeof orderId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (isUuid && deleteDbOrder) {
      Promise.resolve(deleteDbOrder(orderId)).catch((e) => {
        notify(`Silmə DB xətası: ${e?.message || e}`, "warning");
      });
    }

    setState((current) => {
      const order = current.orders.find((item) => item.id === orderId);
      if (!order) return current;

      const linkedCredit = getSalesOrderLinkedCredit(current, order);
      const linkedCreditIds = new Set([order.creditId, linkedCredit?.id, getCreditIdForOrder(order)].filter(Boolean));
      const delivered = order.status === "Təhvil verilib";
      let warehouseStock = current.warehouseStock;
      let stock = current.stock;

      if (!delivered && Array.isArray(order.productLines) && order.productLines.length > 0) {
        const quantities = buildQuantityMap(order.productLines);
        const warehouseId = order.warehouseId || current.warehouses?.[0]?.id;
        warehouseStock = { ...(current.warehouseStock || {}) };
        if (warehouseId && warehouseStock[warehouseId]) {
          warehouseStock[warehouseId] = releaseOrderSerialReservations(
            adjustStockRows(warehouseStock[warehouseId], quantities, { reservedDelta: -1 }),
            order.productLines,
            order.id,
          );
        }
        stock = adjustStockRows(current.stock, quantities, { reservedDelta: -1 });
      }

      return auditCurrentState(
        {
          ...current,
          stock,
          warehouseStock,
          orders: current.orders.filter((item) => item.id !== order.id),
          credits: (current.credits || []).filter(
            (credit) => credit.orderId !== order.id && !linkedCreditIds.has(credit.id),
          ),
          contracts: current.contracts.filter((contract) => contract.orderId !== order.id && contract.id !== order.contractId),
          cashEntries: (current.cashEntries || []).filter((entry) => !linkedCreditIds.has(entry.creditId)),
        },
        {
          module: "Satış",
          action: "Satış əməliyyatı silindi",
          detail: `${order.id} · ${order.customer} · ${delivered ? "təhvil verilmiş satış" : "rezerv açıldı"}`,
        },
      );
    });
    setModal(null);
    notify(`${orderId} satış əməliyyatı silindi.`);
  }

  function openExpenseEditor(expenseId) {
    if (!requirePermission("finance.manage", "xərc əməliyyatını redaktə etmək")) return;
    setModal({ type: "expenseOperation", expenseId });
  }

  function openExpenseDelete(expenseId) {
    if (!requirePermission("finance.manage", "xərc əməliyyatını silmək")) return;
    setModal({ type: "expenseOperationDelete", expenseId });
  }

  function updateExpense(expenseId, values) {
    if (!requirePermission("finance.manage", "xərc əməliyyatını redaktə etmək")) return;
    const amount = Math.max(0, Number(values.amount || 0));
    if (!values.description || !values.category || amount <= 0) {
      notify("Xərc üçün təsvir, kateqoriya və düzgün məbləğ daxil edin.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          expenses: current.expenses.map((expense) =>
            expense.id === expenseId
              ? {
                  ...expense,
                  description: values.description,
                  category: values.category,
                  date: values.date || expense.date || currentBusinessDate,
                  amount,
                  status: values.status || expense.status,
                  note: values.note || expense.note || "",
                }
              : expense,
          ),
        },
        {
          module: "Maliyyə",
          action: "Xərc əməliyyatı redaktə edildi",
          detail: `${expenseId} · ${values.description} · ${money(amount)}`,
        },
      ),
    );
    setModal(null);
    notify(`${expenseId} xərc əməliyyatı yeniləndi.`);
  }

  function deleteExpense(expenseId) {
    if (!requirePermission("finance.manage", "xərc əməliyyatını silmək")) return;
    const targetExpense = state.expenses.find((expense) => expense.id === expenseId);
    if (!targetExpense) {
      notify("Xərc əməliyyatı tapılmadı.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          expenses: current.expenses.filter((expense) => expense.id !== expenseId),
        },
        {
          module: "Maliyyə",
          action: "Xərc əməliyyatı silindi",
          detail: `${expenseId} · ${targetExpense.description} · ${money(targetExpense.amount)}`,
        },
      ),
    );
    setModal(null);
    notify(`${expenseId} xərc əməliyyatı silindi.`);
  }

  function updateEmployeeStructure(employeeName, values) {
    if (!requirePermission("hr.manage", "HR strukturunu dəyişmək")) return;

    setState((current) => {
      const manager = current.employees.find((employee) => employee.name === values.managerName && employee.name !== employeeName);
      return {
        ...current,
        employees: current.employees.map((employee) =>
          employee.name === employeeName
            ? {
                ...employee,
                department: values.department,
                departmentParent: values.departmentParent || "",
                position: values.position,
                managerId: manager ? getEmployeeKey(manager) : "",
                managerName: manager?.name || "",
                level: values.level,
              }
            : employee,
        ),
      };
    });
    notify(`${employeeName} struktur ağacında yeniləndi.`);
    auditOperation({
      module: "HR",
      action: "Struktur yeniləndi",
      detail: employeeName,
    });
  }

  function openEmployeeEditor(employee) {
    if (!requirePermission("hr.manage", "əməkdaş məlumatlarını redaktə etmək")) return;
    setModal({ type: "hr", mode: "edit", employeeId: getEmployeeKey(employee) });
  }

  function updateEmployee(employeeId, values) {
    if (!requirePermission("hr.manage", "əməkdaş məlumatlarını redaktə etmək")) return;

    setState((current) => {
      const existing = current.employees.find((employee) => getEmployeeKey(employee) === employeeId);
      if (!existing) return current;

      const nextName = String(values.name || "").trim();
      const manager = current.employees.find(
        (employee) => getEmployeeKey(employee) === values.managerId && getEmployeeKey(employee) !== employeeId,
      );
      const documentsComplete = Math.max(0, Math.min(100, Number(values.documentsComplete ?? 100)));
      const hrStatus = values.hrStatus === "Məlumat gözləyir" ? "Məlumat gözləyir" : "Stabil";
      const updatedEmployee = {
        ...existing,
        initials: nextName
          .split(" ")
          .filter(Boolean)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toLocaleUpperCase("az-AZ"),
        name: nextName,
        position: values.position,
        department: values.department,
        departmentParent: values.departmentParent || "",
        managerId: manager ? getEmployeeKey(manager) : "",
        managerName: manager?.name || "",
        level: values.level || "Komanda üzvü",
        salary: Number(values.salary || 0),
        kpi: Number(values.kpi || 0),
        hireDate: values.hireDate || "",
        workMode: values.workMode || "Ofis",
        shift: values.shift || "09:00-18:00",
        employmentType: values.employmentType || "Tam ştat",
        leaveBalance: Math.max(0, Number(values.leaveBalance || 0)),
        documentsComplete,
        hrStatus,
        documentReviewRequired: hrStatus === "Məlumat gözləyir" || documentsComplete < 100,
        skills: String(values.skills || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      };
      const previousDepartment = String(existing.department || "").trim();
      const shouldPreservePreviousDepartment =
        previousDepartment &&
        normalize(previousDepartment) !== normalize(updatedEmployee.department) &&
        !current.employees.some(
          (employee) => getEmployeeKey(employee) !== employeeId && normalize(employee.department) === normalize(previousDepartment),
        ) &&
        !(current.departments || []).some((department) => normalize(department.name) === normalize(previousDepartment));
      const preservedDepartments = shouldPreservePreviousDepartment
        ? [
            {
              id: `DEP-${Date.now()}`,
              name: previousDepartment,
              parentDepartment: getDepartmentParentName(existing),
              description: "",
              status: "Aktiv",
              createdAt: getActionStamp(),
            },
            ...(current.departments || []),
          ]
        : current.departments || [];

      return auditCurrentState(
        {
          ...current,
          departments: preservedDepartments,
          employees: current.employees.map((employee) => {
            if (getEmployeeKey(employee) === employeeId) return updatedEmployee;
            if (employee.managerId === employeeId || (!employee.managerId && employee.managerName === existing.name)) {
              return { ...employee, managerId: employeeId, managerName: nextName };
            }
            return employee;
          }),
        },
        {
          module: "HR",
          action: "Əməkdaş redaktə edildi",
          detail: `${existing.name} → ${nextName}`,
        },
      );
    });
    setModal(null);
    notify(`${values.name} əməkdaş məlumatları yeniləndi.`);
  }

  function openDepartmentCreator() {
    if (!requirePermission("hr.manage", "şöbə əlavə etmək")) return;
    setModal({ type: "department" });
  }

  function createDepartment(values) {
    if (!requirePermission("hr.manage", "şöbə əlavə etmək")) return;

    const name = String(values.name || "").trim();
    const parentDepartment = String(values.parentDepartment || "").trim();
    if (!name) {
      notify("Şöbə adı daxil edin.", "warning");
      return;
    }
    if (normalize(name) === normalize(parentDepartment)) {
      notify("Şöbə özünə tabe ola bilməz.", "warning");
      return;
    }
    const exists = [...state.departments, ...state.employees.map((employee) => ({ name: employee.department }))].some(
      (department) => normalize(department.name) === normalize(name),
    );
    if (exists) {
      notify("Bu adlı şöbə artıq mövcuddur.", "warning");
      return;
    }

    const department = {
      id: `DEP-${Date.now()}`,
      name,
      parentDepartment,
      description: String(values.description || "").trim(),
      status: values.status || "Aktiv",
      createdAt: getActionStamp(),
    };
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          departments: [department, ...(current.departments || [])],
        },
        {
          module: "HR",
          action: "Şöbə əlavə edildi",
          detail: parentDepartment ? `${name} → ${parentDepartment}` : name,
        },
      ),
    );
    setModal(null);
    notify(`${name} şöbəsi əlavə edildi.`);
  }

  function openLeaveRequestCreator() {
    if (!requirePermission("hr.manage", "məzuniyyət qeydi yaratmaq")) return;
    setModal({ type: "leaveRequest" });
  }

  function createLeaveRequest(values) {
    if (!requirePermission("hr.manage", "məzuniyyət qeydi yaratmaq")) return;

    const employee = state.employees.find((item) => getEmployeeKey(item) === values.employeeId);
    const from = parsePaymentDate(values.from);
    const to = parsePaymentDate(values.to);
    if (!employee || !from || !to || to < from) {
      notify("Əməkdaş və düzgün məzuniyyət tarixlərini seçin.", "warning");
      return;
    }
    const days = Math.floor((to.getTime() - from.getTime()) / dayInMs) + 1;
    const request = {
      id: `LEAVE-${Date.now()}`,
      employeeId: getEmployeeKey(employee),
      employeeName: employee.name,
      department: employee.department,
      type: values.type || "İllik məzuniyyət",
      from: values.from,
      to: values.to,
      days,
      approver: getEmployeeManagerName(employee, state.employees) || "HR",
      status: "Təsdiq gözləyir",
      createdAt: getActionStamp(),
    };
    setState((current) =>
      auditCurrentState(
        { ...current, leaveRequests: [request, ...(current.leaveRequests || [])] },
        { module: "HR", action: "Məzuniyyət qeydi yaradıldı", detail: `${employee.name} · ${days} gün` },
      ),
    );
    queueMicrotask(() => syncHrWorkflow("leave_request", request, "pending", [
      { role_code: "line_manager" },
      { role_code: "hr_manager" },
    ]));
    setModal(null);
    notify(`${employee.name} üçün məzuniyyət qeydi yaradıldı.`);
  }

  function updateLeaveRequestStatus(requestId, status) {
    if (!requirePermission("hr.manage", "məzuniyyət statusunu dəyişmək")) return;

    const nextStatus = status === "Təsdiq edildi" ? "Təsdiq edildi" : "İmtina edildi";
    const request = (state.leaveRequests || []).find((item) => item.id === requestId);
    const stamp = getActionStamp();
    if (!request) return;

    setState((current) => {
      return auditCurrentState(
        {
          ...current,
          leaveRequests: (current.leaveRequests || []).map((item) =>
            item.id === requestId
              ? {
                  ...item,
                  status: nextStatus,
                  decidedAt: stamp,
                }
              : item,
          ),
        },
        {
          module: "HR",
          action: "Məzuniyyət statusu dəyişdi",
          detail: `${request.employeeName || requestId} · ${nextStatus}`,
        },
      );
    });
    notify(`Məzuniyyət sorğusu: ${nextStatus}.`);
    queueMicrotask(() => syncHrWorkflow(
      "leave_request",
      { ...request, status: nextStatus, decidedAt: stamp },
      status === "TЙ™sdiq edildi" ? "approved" : "rejected",
    ));
  }

  function markPayrollPaid(employeeId) {
    if (!requirePermission("hr.manage", "payroll statusunu dəyişmək")) return;

    const employee = state.employees.find((item) => getEmployeeKey(item) === employeeId);
    if (!employee) return;
    const documentsComplete =
      employee.documentReviewRequired || employee.hrStatus === "Məlumat gözləyir"
        ? Number(employee.documentsComplete || 0)
        : 100;
    const documentHealth = getHrDocumentHealth({ ...employee, documentsComplete });
    if (documentHealth.missingCount > 0 && !employee.payrollPaidAt) {
      notify("Sənədlər tamamlanmadan payroll ödənişi bağlana bilməz.", "warning");
      return;
    }

    const stamp = getActionStamp();
    setState((current) => {
      return auditCurrentState(
        {
          ...current,
          employees: current.employees.map((item) =>
            getEmployeeKey(item) === employeeId
              ? {
                  ...item,
                  payrollStatus: "Ödənildi",
                  payrollPaidAt: stamp,
                  payrollPeriod: baseFinanceDate.slice(0, 7),
                }
              : item,
          ),
        },
        {
          module: "HR/Payroll",
          action: "Payroll ödəniş statusu dəyişdi",
          detail: `${employee.name} · Ödənildi · ${baseFinanceDate.slice(0, 7)}`,
        },
      );
    });
    notify("Payroll statusu ödənildi kimi bağlandı.");
    queueMicrotask(() => syncHrWorkflow(
      "payroll_line",
      { ...employee, id: `${employeeId}-${baseFinanceDate.slice(0, 7)}`, employeeId, employeeName: employee.name, payrollPaidAt: stamp },
      "paid",
    ));
  }

  function updateEmployeeDocuments(employeeId, documentsComplete = 100) {
    if (!requirePermission("hr.manage", "əməkdaş sənədlərini yeniləmək")) return;

    const nextScore = Math.max(0, Math.min(100, Number(documentsComplete || 0)));
    const employee = state.employees.find((item) => getEmployeeKey(item) === employeeId);
    const stamp = getActionStamp();
    if (!employee) return;

    setState((current) => {
      const documentReviewRequired = nextScore < 100;
      const nextPayrollStatus = employee.payrollPaidAt
        ? "Ödənildi"
        : documentReviewRequired
          ? "Sənəd gözləyir"
          : employee.payrollStatus === "Sənəd gözləyir"
            ? "Hesablama hazırdır"
            : employee.payrollStatus || "Hesablama hazırdır";

      return auditCurrentState(
        {
          ...current,
          employees: current.employees.map((item) =>
            getEmployeeKey(item) === employeeId
              ? {
                  ...item,
                  documentsComplete: nextScore,
                  documentReviewRequired,
                  hrStatus: documentReviewRequired ? "Məlumat gözləyir" : "Stabil",
                  payrollStatus: nextPayrollStatus,
                  documentUpdatedAt: stamp,
                }
              : item,
          ),
        },
        {
          module: "HR",
          action: "Əməkdaş sənədləri yeniləndi",
          detail: `${employee.name} · ${nextScore}%`,
        },
      );
    });
    notify(nextScore === 100 ? "Əməkdaş sənədləri tamamlandı." : "Əməkdaş sənəd statusu yeniləndi.");
    queueMicrotask(() => syncHrWorkflow(
      "employee_document_check",
      { id: `${employeeId}-documents`, employeeId, employeeName: employee.name, documentsComplete: nextScore, updatedAt: stamp },
      nextScore === 100 ? "completed" : "pending",
    ));
  }

  function openVacancyCreator() {
    if (!requirePermission("hr.manage", "vakansiya yaratmaq")) return;
    setModal({ type: "vacancy" });
  }

  function createVacancy(values) {
    if (!requirePermission("hr.manage", "vakansiya yaratmaq")) return;

    const role = String(values.role || "").trim();
    const department = String(values.department || "").trim();
    if (!role || !department) {
      notify("Vakansiya üçün rol və şöbə seçin.", "warning");
      return;
    }
    const vacancy = {
      id: `VAC-${Date.now()}`,
      role,
      department,
      candidates: 0,
      stage: "Namizəd gözlənilir",
      owner: values.owner || "HR",
      targetDate: values.targetDate || "",
      status: "Aktiv vakansiya",
      createdAt: getActionStamp(),
    };
    setState((current) =>
      auditCurrentState(
        { ...current, vacancies: [vacancy, ...(current.vacancies || [])] },
        { module: "HR", action: "Vakansiya yaradıldı", detail: `${role} · ${department}` },
      ),
    );
    setModal(null);
    notify(`${role} vakansiyası yaradıldı.`);
  }

  function openEmployeeDelete(employee) {
    if (!requirePermission("hr.manage", "əməkdaş silmək")) return;
    setModal({ type: "employeeDelete", employeeId: getEmployeeKey(employee) });
  }

  function deleteEmployee(employeeId, replacementManagerId = "") {
    if (!requirePermission("hr.manage", "əməkdaş silmək")) return;

    setState((current) => {
      const employee = current.employees.find((item) => getEmployeeKey(item) === employeeId);
      if (!employee) return current;

      const directReports = current.employees.filter(
        (item) => item.managerId === employeeId || (!item.managerId && item.managerName === employee.name),
      );
      const directReportKeys = new Set(directReports.map((item) => getEmployeeKey(item)));
      const replacement = current.employees.find(
        (item) =>
          getEmployeeKey(item) === replacementManagerId &&
          getEmployeeKey(item) !== employeeId &&
          !directReportKeys.has(getEmployeeKey(item)),
      );
      const remainingEmployees = current.employees.filter((item) => getEmployeeKey(item) !== employeeId);
      const employeeDepartment = String(employee.department || "").trim();
      const shouldPreserveDepartment =
        employeeDepartment &&
        !remainingEmployees.some((item) => normalize(item.department) === normalize(employeeDepartment)) &&
        !(current.departments || []).some((department) => normalize(department.name) === normalize(employeeDepartment));
      const preservedDepartments = shouldPreserveDepartment
        ? [
            {
              id: `DEP-${Date.now()}`,
              name: employeeDepartment,
              parentDepartment: getDepartmentParentName(employee),
              description: "",
              status: "Aktiv",
              createdAt: getActionStamp(),
            },
            ...(current.departments || []),
          ]
        : current.departments || [];

      return auditCurrentState(
        {
          ...current,
          departments: preservedDepartments,
          employees: remainingEmployees
            .map((item) =>
              item.managerId === employeeId || (!item.managerId && item.managerName === employee.name)
                ? {
                    ...item,
                    managerId: replacement ? getEmployeeKey(replacement) : "",
                    managerName: replacement?.name || "",
                  }
                : item,
            ),
        },
        {
          module: "HR",
          action: "Əməkdaş silindi",
          detail: `${employee.name} · ${directReports.length} tabe əməkdaş yenidən təyin edildi`,
        },
      );
    });
    setModal(null);
    notify("Əməkdaş silindi və tabeçilik xətti yeniləndi.");
  }

  function sendCreditSms(id) {
    if (!requirePermission("credits.manage", "kredit SMS göndərmək")) return;

    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === id);
    const provider = notificationProviderRows.find((item) => item.channel === "SMS") || {};
    const stamp = getActionStamp();
    const status = getNotificationChannelEnabled("SMS", state.settings) && provider.status === "Aktiv" ? "Göndərildi" : "Bloklandı";
    const delivery = createNotificationSendLogEntry({
      rule: {
        id: "MANUAL-CREDIT-SMS",
        name: "Manual kredit SMS",
        channel: "SMS",
        providerId: provider.id,
        template: "{creditId} üzrə SMS xatırlatma",
      },
      provider,
      event: {
        entityId: id,
        recipient: targetCredit?.customer || "Müştəri",
        target: targetCredit?.fin || targetCredit?.customer || id,
        creditId: id,
        body: `${id} üzrə SMS müştəriyə göndərildi.`,
        module: "credits",
        priority: "Orta",
      },
      stamp,
      status,
      source: "Manual kredit",
    });

    setState((current) => ({
      ...current,
      notificationSendLog: [delivery, ...(current.notificationSendLog || [])].slice(0, 100),
      notificationProviders: ensureNotificationProviders(current.notificationProviders || []).map((item) =>
        item.id === provider.id && status === "Göndərildi"
          ? { ...item, lastSentAt: stamp, sentCount: Number(item.sentCount || 0) + 1 }
          : item,
      ),
      notifications: [
        {
          id: `IN-${delivery.id}`,
          type: "SMS",
          title: `Kredit ödənişi xatırlatması ${status.toLowerCase()}`,
          body: delivery.body,
          time: stamp,
          unread: true,
          deliveryId: delivery.id,
        },
        ...current.notifications,
      ],
    }));
    notify("SMS xatırlatma göndərildi.");
    auditOperation({
      module: "Kredit",
      action: "SMS xatırlatma göndərildi",
      detail: `${id} · ${status}`,
    });
  }

  function updateCreditPaymentDate(creditId, month, due) {
    if (!requirePermission("credits.manage", "kredit ödəniş tarixini dəyişmək")) return;

    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === creditId);

    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return;
    }

    setState((current) => ({
      ...current,
      credits: (() => {
        const exists = current.credits.some((credit) => credit.id === creditId);
        const source = exists ? null : targetCredit;
        const nextCredits = exists ? current.credits : [source, ...current.credits];

        return nextCredits.map((credit) => {
          if (credit.id !== creditId) return credit;

          const plan = getCreditDisplayPlan(credit);
          const installments = plan.installments.map((installment) =>
            installment.month === month ? { ...installment, due } : installment,
          );
          const nextIndex = Math.min(Number(credit.paidMonths || 0), Math.max(0, installments.length - 1));

          return {
            ...credit,
            installments,
            next: installments[nextIndex]?.due || credit.next,
          };
        });
      })(),
    }));
    notify("Ödəniş tarixi yeniləndi.");
    auditOperation({
      module: "Kredit",
      action: "Ödəniş tarixi redaktə edildi",
      detail: `${creditId} · ${month}. ay · ${due}`,
    });
  }

  function receiveCreditPayment(creditId, values) {
    if (!requirePermission("credits.manage", "kredit ödənişi qəbul etmək")) return;

    const principalAmount = Math.max(0, Math.round(Number(values.principalAmount || 0)));
    const penaltyAmount = Math.max(0, Math.round(Number(values.penaltyAmount || 0)));
    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === creditId);

    if (principalAmount <= 0 && penaltyAmount <= 0) {
      notify("Ödəniş məbləği daxil edin.", "warning");
      return;
    }

    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return;
    }

    const paymentResult = applyCreditPrincipalPayment(targetCredit, principalAmount);
    const cashAmount = paymentResult.appliedPrincipal + penaltyAmount;
    const cashEntry = {
      id: `KS-${Date.now()}`,
      source: "Kredit ödənişi",
      creditId,
      orderId: targetCredit.orderId,
      customer: targetCredit.customer,
      contractId: targetCredit.contractId,
      device: targetCredit.device || targetCredit.product,
      principal: paymentResult.appliedPrincipal,
      penalty: penaltyAmount,
      amount: cashAmount,
      date: baseCreditDate,
      note: values.note || "",
    };

    setState((current) => {
      return {
        ...current,
        cashEntries: [cashEntry, ...(current.cashEntries || [])],
        orders: current.orders.map((order) => {
          const isLinkedOrder = targetCredit.orderId
            ? order.id === targetCredit.orderId
            : order.creditId === creditId || getCreditIdForOrder(order) === creditId;

          if (!isLinkedOrder) return order;

          const nextPaid = Math.min(
            Number(order.amount || 0),
            Number(order.paid || 0) + paymentResult.appliedPrincipal,
          );

          return {
            ...order,
            paid: nextPaid,
            creditBalance: paymentResult.nextBalance,
            creditMonthly: paymentResult.nextMonthly,
            creditLastPayment: paymentResult.installments[paymentResult.installments.length - 1]?.amount || 0,
            paymentStatus: paymentResult.nextBalance <= 0 ? "Ödənilib" : "Kredit satış",
          };
        }),
        credits: (() => {
          const exists = current.credits.some((credit) => credit.id === creditId);
          const source = exists ? null : targetCredit;
          const nextCredits = exists ? current.credits : [source, ...current.credits];

          return nextCredits.map((item) =>
            item.id === creditId
              ? {
                ...item,
                balance: paymentResult.nextBalance,
                installments: paymentResult.installments,
                paidMonths: paymentResult.nextPaidMonths,
                rate: Math.round((paymentResult.nextPaidMonths / Math.max(1, Number(item.months || 12))) * 100),
                monthly: paymentResult.nextMonthly,
                next: paymentResult.nextDue,
                status: paymentResult.status,
                payments: [
                  {
                    date: baseCreditDate,
                    principal: paymentResult.appliedPrincipal,
                    penalty: penaltyAmount,
                    cashIn: cashAmount,
                    extraApplied: paymentResult.extraPrincipal,
                  },
                  ...(item.payments || []),
                ],
              }
              : item,
          );
        })(),
      };
    });

    notify(
      `${targetCredit.id}: ${money(cashAmount)} kassaya daxil oldu. Əsas borc ${money(paymentResult.appliedPrincipal)} azaldı.`,
    );
    auditOperation({
      module: "Kredit/Maliyyə",
      action: "Kredit ödənişi qəbul edildi",
      detail: `${creditId}: əsas ${money(paymentResult.appliedPrincipal)}, gecikmə ${money(penaltyAmount)}`,
    });
  }

  function createPurchaseOrder(row) {
    if (!requirePermission("vendors.po", "PO yaratmaq")) return false;

    const qty = Math.max(1, Math.round(Number(row.orderGap || row.recommendedQty || row.qty || 0)));
    const warehouse = state.warehouses.find((item) => item.id === row.warehouseId) || state.warehouses[0];
    const catalogProduct = (state.products || []).find((item) => normalize(item.name) === normalize(row.product));

    if (!warehouse || !row.product) {
      notify("PO yaratmaq üçün məhsul və anbar məlumatı lazımdır.", "warning");
      return false;
    }

    const unitCost = Math.max(
      0,
      Number(row.unitCost ?? row.costPrice ?? catalogProduct?.costPrice ?? Math.round(Number(row.price || catalogProduct?.salePrice || 0) * 0.76)),
    );
    const salePrice = Math.max(0, Number(row.salePrice ?? catalogProduct?.salePrice ?? row.price ?? unitCost));
    const amount = Math.max(0, Math.round(Number(row.amount ?? qty * unitCost)));
    const reorderPoint = Number(row.reorderPoint ?? catalogProduct?.reorderLevel ?? 0);
    const availableAtOrder = Number(row.available ?? 0);

    const po = {
      id: `PO-${Date.now()}`,
      product: row.product,
      vendor: row.vendor,
      supplierSource: row.supplierSource || row.factory || row.vendor,
      procurementType: row.procurementType || "Zavod sifarişi",
      qty,
      unitCost,
      price: salePrice,
      amount,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      status: "Təsdiq gözləyir",
      date: row.date || baseFinanceDate,
      expectedAt: row.expectedAt || "",
      reorderPoint,
      availableAtOrder,
      orderedForMinimum: reorderPoint > 0 && availableAtOrder <= reorderPoint,
      note: row.note || "",
    };

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          purchaseOrders: [po, ...(current.purchaseOrders || [])],
        },
        {
          module: "Vendor",
          action: "PO yaradıldı",
          detail: `${po.product}: ${po.qty} ədəd · ${po.vendor}`,
        },
      ),
    );
    notify(`${po.id} yaradıldı və təsdiq gözləyir.`);
    return true;
  }

  function approvePurchaseOrder(poId) {
    if (!requirePermission("vendors.po", "PO təsdiqləmək və anbara mədaxil etmək")) return;

    const targetPo = (state.purchaseOrders || []).find((item) => item.id === poId);

    if (!targetPo || targetPo.status === "Təsdiq edildi") {
      notify("PO təsdiqlənmədi.", "warning");
      return;
    }

    setState((current) => {
      const po = (current.purchaseOrders || []).find((item) => item.id === poId);
      if (!po || po.status === "Təsdiq edildi") return current;

      const warehouseId = po.warehouseId || current.warehouses[0]?.id;
      const warehouseName =
        current.warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || po.warehouseName || "Anbar";
      const nextPo = {
        ...po,
        warehouseId,
        warehouseName,
        status: "Təsdiq edildi",
        approvedAt: baseFinanceDate,
        receivedAt: baseFinanceDate,
      };
      const procurementExpense = {
        id: `EXP-${po.id}`,
        description: `PO alış - ${po.product}`,
        category: "Satınalma",
        date: baseFinanceDate,
        amount: Number(po.amount || 0),
        status: "Təsdiq gözləyir",
        source: "Vendor PO",
        poId: po.id,
      };
      const nextExpenses = current.expenses.some((expense) => expense.id === procurementExpense.id)
        ? current.expenses
        : [procurementExpense, ...current.expenses];
      const catalogProduct = (current.products || []).find((item) => normalize(item.name) === normalize(po.product));
      const stockPrice = Number(po.price || catalogProduct?.salePrice || po.unitCost || 0);

      return auditCurrentState(
        {
          ...current,
          purchaseOrders: (current.purchaseOrders || []).map((item) => (item.id === poId ? nextPo : item)),
          warehouseStock: {
            ...current.warehouseStock,
            [warehouseId]: addStockToRows(
              current.warehouseStock?.[warehouseId] || [],
              po.product,
              po.qty,
              stockPrice,
              warehouseId,
              catalogProduct,
            ),
          },
          stock: addStockToRows(current.stock, po.product, po.qty, stockPrice, "", catalogProduct),
          expenses: nextExpenses,
        },
        {
          module: "Vendor/Anbar/Maliyyə",
          action: "PO təsdiqləndi və mədaxil edildi",
          detail: `${po.product}: ${po.qty} ədəd ${warehouseName} anbarına daxil oldu`,
        },
      );
    });

    notify(`${targetPo.id} təsdiqləndi və anbara mədaxil edildi.`, "success");
  }

  function markAllNotificationsRead() {
    if (!requirePermission("notifications.manage", "bildirişləri idarə etmək")) return;

    const stamp = getActionStamp();
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          notificationSweepAt: stamp,
          notifications: current.notifications.map((item) => ({ ...item, unread: false })),
        },
        {
          module: "Bildiriş",
          action: "Hamısı oxundu",
          detail: `Son yoxlama: ${stamp}`,
        },
      ),
    );
    notify("Bütün bildirişlər oxunmuş işarələndi.");
  }

  function toggleSetting(key) {
    if (!requirePermission("settings.manage", "ayarları dəyişmək")) return;

    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        toggles: {
          ...current.settings.toggles,
          [key]: !current.settings.toggles[key],
        },
      },
    }));
    auditOperation({
      module: "Ayarlar",
      action: "Toggle dəyişdi",
      detail: key,
    });
  }

  function updateCompany(field, value) {
    if (!requirePermission("settings.manage", "şirkət məlumatlarını dəyişmək")) return;

    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [field]: value,
      },
    }));
    auditOperation({
      module: "Ayarlar",
      action: "Şirkət məlumatı dəyişdi",
      detail: field,
    });
  }

  function saveSettings() {
    if (!requirePermission("settings.manage", "ayarları yadda saxlamaq")) return;

    notify("Sistem tənzimləmələri yadda saxlanıldı.");
    auditOperation({
      module: "Ayarlar",
      action: "Ayarlar yadda saxlandı",
      detail: "Şirkət və sistem tənzimləmələri",
    });
  }

  function runIntegrityCheck() {
    if (!requireSystemBackup("integrity yoxlaması")) return;

    const report = buildStateIntegrityReport(state, creditRecords);
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          integritySnapshot: report,
        },
        {
          module: "Sistem/DB",
          action: "Integrity yoxlaması",
          detail: `${report.issueCount} siqnal · score ${report.score}%`,
          status: report.status,
        },
      ),
    );
    notify(`Integrity yoxlandı: ${report.status}, score ${report.score}%.`);
  }

  function runGoLiveCheck() {
    if (!requireSystemBackup("go-live yoxlaması")) return;

    const report = buildGoLiveReadiness(state, integrityReport);
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          goLiveSnapshot: report,
        },
        {
          module: "Sistem/Go-live",
          action: "Go-live readiness yoxlandı",
          detail: `${report.blockers} bloker · score ${report.score}%`,
          status: report.status,
        },
      ),
    );
    notify(`Go-live yoxlandı: ${report.status}, score ${report.score}%.`);
  }

  function runProductionHardeningCheck() {
    if (!requireSystemBackup("production hardening yoxlaması")) return;

    const report = buildProductionHardeningReport(
      {
        ...state,
        productionHardeningSnapshot: {
          ...(state.productionHardeningSnapshot || {}),
          backupCheckedAt: new Date().toISOString(),
        },
      },
      {
        goLiveReport,
        apiWebhookRows,
        apiSecretRows,
        notificationProviderRows,
      },
    );
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          productionHardeningSnapshot: report,
        },
        {
          module: "Production Hardening",
          action: "Production hardening yoxlandı",
          detail: `${report.ready} hazır · ${report.watch} nəzarətdə · score ${report.score}%`,
          status: report.status,
        },
      ),
    );
    notify(`Production hardening yoxlandı: ${report.status}, score ${report.score}%.`);
  }

  function exportBackup() {
    if (!requireSystemBackup("backup export")) return;

    const exportedAt = new Date().toISOString();
    const payload = {
      app: "ERP+CRM AZ",
      schemaVersion: localDbSchemaVersion,
      exportedAt,
      exportedBy: currentUser?.email || currentUser?.name || "System",
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `erpaz-backup-${baseFinanceDate}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    const sizeKb = `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 }).format(blob.size / 1024)} KB`;

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          dbMeta: {
            ...(current.dbMeta || {}),
            lastBackupAt: exportedAt,
            lastBackupBy: currentUser?.email || currentUser?.name || "System",
          },
        },
        {
          module: "Sistem/DB",
          action: "Backup export",
          detail: `Schema v${localDbSchemaVersion} · ${sizeKb}`,
        },
      ),
    );
    notify("Backup JSON faylı hazırlandı.");
  }

  function importBackup(file) {
    if (!requireSystemBackup("backup import")) return;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const incomingState = parsed.state || parsed;
        const hydrated = hydrateState(incomingState);
        const restoredCredits = buildAllCreditRecords(hydrated.orders || [], hydrated.credits || []);
        const report = buildStateIntegrityReport(hydrated, restoredCredits);
        const importedAt = new Date().toISOString();

        setState(
          appendAudit(
            {
              ...hydrated,
              integritySnapshot: report,
              dbMeta: {
                ...(hydrated.dbMeta || {}),
                provider:
                  hydrated.dbMeta?.provider && hydrated.dbMeta.provider !== "Local persistent DB"
                    ? hydrated.dbMeta.provider
                    : defaultDbProvider,
                runtime: hydrated.dbMeta?.runtime || "browser",
                version: localDbSchemaVersion,
                schemaVersion: localDbSchemaVersion,
                lastRestoreAt: importedAt,
                lastRestoreFile: file.name,
              },
            },
            {
              module: "Sistem/DB",
              action: "Backup import",
              detail: `${file.name} · ${report.issueCount} integrity siqnalı`,
              status: report.status,
              role: activeRoleInfo?.name || "System",
            },
          ),
        );
        notify(`Backup import edildi. Integrity: ${report.status}.`);
      } catch {
        notify("Backup faylı oxunmadı. JSON strukturunu yoxlayın.", "warning");
      }
    };
    reader.onerror = () => notify("Backup faylı oxunarkən xəta baş verdi.", "warning");
    reader.readAsText(file);
  }

  function changeCurrentRole(roleName) {
    if (!requirePermission("settings.manage", "aktiv rolu dəyişmək")) return;

    setState((current) =>
      appendAudit(
        {
          ...current,
          settings: {
            ...current.settings,
            users: (current.settings.users || []).map((user) =>
              user.id === current.settings.sessionUserId
                ? { ...user, role: roleName, moduleAccess: getDefaultModuleAccessForRole(roleName, current.settings.roles || defaultRoles) }
                : user,
            ),
            currentRole: roleName,
          },
        },
        {
          module: "Ayarlar",
          action: "Aktiv rol dəyişdi",
          detail: roleName,
          role: getActiveRole(current.settings)?.name || "System",
        },
      ),
    );
    notify(`Aktiv rol: ${roleName}`);
  }

  function addSupportTicketComment(ticketId, text) {
    if (!requirePermission("support.manage", "support taskına comment yazmaq")) return;
    const body = String(text || "").trim();
    if (!body) return;
    const stamp = getActionStamp();
    const comment = {
      id: `COM-${Date.now().toString().slice(-6)}`,
      author: activeRoleInfo?.name || "Admin",
      text: body,
      at: stamp,
      mine: true,
    };

    setState((current) => {
      const targetTicket = (current.supportTickets || []).find((ticket) => ticket.id === ticketId);
      if (!targetTicket) return current;
      const nextTicket = {
        ...targetTicket,
        status: targetTicket.status === "Bağlandı" ? "İcrada" : targetTicket.status,
        comments: [...(targetTicket.comments || []), comment],
      };
      return auditCurrentState(
        {
          ...current,
          supportTickets: (current.supportTickets || []).map((ticket) => (ticket.id === ticketId ? nextTicket : ticket)),
          conversations: upsertSupportConversation(current.conversations || [], nextTicket, comment),
        },
        {
          module: "Support/Mesaj",
          action: "Task comment əlavə edildi",
          detail: `${ticketId} · ${body.slice(0, 80)}`,
        },
      );
    });
    notify("Comment task və mesaj thread-inə əlavə edildi.");
  }

  function updateSupportTicketStatus(ticketId, status) {
    if (!requirePermission("support.manage", "support task statusunu dəyişmək")) return;
    const stamp = getActionStamp();
    const comment = {
      id: `COM-${Date.now().toString().slice(-6)}`,
      author: activeRoleInfo?.name || "Admin",
      text: `Status dəyişdi: ${status}`,
      at: stamp,
      mine: true,
    };

    setState((current) => {
      const targetTicket = (current.supportTickets || []).find((ticket) => ticket.id === ticketId);
      if (!targetTicket) return current;
      const nextTicket = {
        ...targetTicket,
        status,
        resolvedAt: status === "Bağlandı" ? stamp : targetTicket.resolvedAt,
        comments: [...(targetTicket.comments || []), comment],
        tasks: (targetTicket.tasks || []).map((task) => ({
          ...task,
          status: status === "Bağlandı" ? "Tamamlandı" : status === "İcrada" ? "İcrada" : task.status,
        })),
      };
      return auditCurrentState(
        {
          ...current,
          supportTickets: (current.supportTickets || []).map((ticket) => (ticket.id === ticketId ? nextTicket : ticket)),
          conversations: upsertSupportConversation(current.conversations || [], nextTicket, comment),
        },
        {
          module: "Support",
          action: "Task statusu dəyişdi",
          detail: `${ticketId} · ${status}`,
        },
      );
    });
    notify(`${ticketId} statusu yeniləndi: ${status}.`);
  }

  function openSupportConversation(ticketId) {
    const ticket = state.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) {
      notify("Support task tapılmadı.", "warning");
      return;
    }
    setConversationId(getSupportThreadId(ticket));
    setQuery("");
    setActive("messages");
    setMobileNav(false);
    auditOperation({
      module: "Support/Mesaj",
      action: "Task thread-inə keçid edildi",
      detail: `${ticket.id} · ${ticket.title}`,
    });
  }

  function openSupportTicket(ticketId) {
    const ticket = state.supportTickets.find((item) => item.id === ticketId);
    if (!ticket) {
      notify("Support task tapılmadı.", "warning");
      return;
    }
    setSelectedSupportTicketId(ticketId);
    setQuery("");
    setActive("support");
    setMobileNav(false);
    auditOperation({
      module: "Mesaj/Support",
      action: "Bağlı task-a keçid edildi",
      detail: `${ticket.id} · ${ticket.title}`,
    });
  }

  function openLinkedCustomer(fin) {
    const customer = state.customers.find((item) => item.fin === fin);
    if (!customer) {
      notify("Bağlı müştəri tapılmadı.", "warning");
      return;
    }
    setQuery(fin);
    setActive("crm");
    setMobileNav(false);
    auditOperation({
      module: "Support/CRM",
      action: "Bağlı müştəriyə keçid edildi",
      detail: `${customer.name} · ${fin}`,
    });
  }

  function selectMessageThread(id) {
    setConversationId(id);
    setState((current) => {
      const target = (current.conversations || []).find((conversation) => conversation.id === id);
      if (!target || Number(target.unread || 0) === 0) return current;
      return {
        ...current,
        conversations: (current.conversations || []).map((conversation) =>
          conversation.id === id
            ? {
                ...conversation,
                unread: 0,
                messages: (conversation.messages || []).map((message) => ({
                  ...message,
                  readAt: message.readAt || currentBusinessDate,
                })),
              }
            : conversation,
        ),
      };
    });
  }

  function createMessageConversation(values = {}) {
    if (!requirePermission("messages.manage", "mesaj söhbəti və qrup yaratmaq")) return;
    const stamp = getActionStamp();
    const participantIds = values.participantIds || [];
    const participantNames = messageParticipantOptions
      .filter((participant) => participantIds.includes(participant.id))
      .map((participant) => participant.name);
    const currentName = currentUser?.name || activeRoleInfo?.name || "Admin";
    const participants = [...new Set([currentName, ...participantNames].filter(Boolean))];
    const context = getMessageContextPayload(values.linkedType, values.linkedId, {
      customers: state.customers,
      orders: state.orders,
      credits: creditRecords,
      tickets: state.supportTickets || [],
    });
    const contextLabel =
      messageContextOptions.find((item) => item.type === values.linkedType && item.id === values.linkedId)?.label ||
      context.linkedLabel ||
      "";
    const type = values.type || (participants.length > 2 ? "group" : "direct");
    const title =
      values.title?.trim() ||
      (type === "group" ? "Yeni qrup" : participantNames[0]) ||
      contextLabel ||
      "Yeni söhbət";
    const body = values.firstMessage?.trim();
    const initialMessages = body
      ? [
          {
            id: `MSG-TEXT-${Date.now().toString().slice(-6)}`,
            from: currentName,
            text: body,
            time: stamp,
            mine: true,
            status: "Göndərildi",
            readAt: stamp,
          },
        ]
      : [];
    const conversation = normalizeMessageThread({
      id: `MSG-${Date.now().toString().slice(-6)}`,
      type,
      title,
      person: title,
      initials: getInitials(title),
      team: values.team || (type === "group" ? "Qrup" : "Daxili"),
      participants,
      participantIds,
      createdAt: stamp,
      createdBy: currentName,
      status: "Aktiv",
      archived: false,
      preview: body || "Söhbət yaradıldı",
      time: stamp,
      unread: 0,
      ...context,
      messages: initialMessages,
    });

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          conversations: [conversation, ...(current.conversations || [])],
        },
        {
          module: "Mesajlar",
          action: type === "group" ? "Qrup yaradıldı" : "Söhbət yaradıldı",
          detail: `${title}${contextLabel ? ` · ${contextLabel}` : ""}`,
        },
      ),
    );
    setConversationId(conversation.id);
    setDraftMessage("");
    notify(type === "group" ? "Qrup yaradıldı." : "Yeni söhbət yaradıldı.");
    queueMicrotask(() => syncCommunicationWorkflow(conversation));
  }

  function archiveMessageConversation(id) {
    if (!requirePermission("messages.manage", "mesaj söhbətini arxivləmək")) return;
    const target = state.conversations.find((conversation) => conversation.id === id);
    if (!target) {
      notify("Söhbət tapılmadı.", "warning");
      return;
    }
    const nextArchived = !(target.archived || target.status === "Arxiv");
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          conversations: (current.conversations || []).map((conversation) =>
            conversation.id === id
              ? {
                  ...conversation,
                  archived: nextArchived,
                  status: nextArchived ? "Arxiv" : "Aktiv",
                }
              : conversation,
          ),
        },
        {
          module: "Mesajlar",
          action: nextArchived ? "Söhbət arxivləndi" : "Söhbət arxivdən çıxarıldı",
          detail: target.title || target.person || id,
        },
      ),
    );
    notify(nextArchived ? "Söhbət arxivləndi." : "Söhbət arxivdən çıxarıldı.");
    queueMicrotask(() => syncCommunicationWorkflow(
      { ...target, archived: nextArchived, status: nextArchived ? "Arxiv" : "Aktiv" },
      nextArchived ? "archived" : "active",
    ));
  }

  function deleteMessageConversation(id) {
    if (!requirePermission("messages.manage", "mesaj söhbətini silmək")) return;
    const target = state.conversations.find((conversation) => conversation.id === id);
    if (!target) {
      notify("Söhbət tapılmadı.", "warning");
      return;
    }
    const nextConversation = state.conversations.find((conversation) => conversation.id !== id);
    setState((current) =>
      auditCurrentState(
        {
          ...current,
          conversations: (current.conversations || []).filter((conversation) => conversation.id !== id),
        },
        {
          module: "Mesajlar",
          action: "Söhbət silindi",
          detail: target.title || target.person || id,
        },
      ),
    );
    setConversationId(nextConversation?.id || "");
    notify("Söhbət silindi.");
  }

  function sendMessage() {
    if (!requirePermission("messages.send", "daxili mesaj göndərmək")) return;
    const body = draftMessage.trim();
    if (!body) return;
    const stamp = getActionStamp();
    const sender = currentUser?.name || activeRoleInfo?.name || "Admin";
    const selectedThreadForSync = (state.conversations || []).find((conversation) => conversation.id === conversationId);
    const comment = {
      id: `COM-${Date.now().toString().slice(-6)}`,
      author: sender,
      text: body,
      at: stamp,
      mine: true,
    };
    setState((current) => {
      const selectedConversation = (current.conversations || []).find((conversation) => conversation.id === conversationId);
      if (!selectedConversation) return current;
      const ticketId = selectedConversation?.ticketId;
      const nextConversations = (current.conversations || []).map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              preview: body,
              unread: 0,
              time: stamp,
              status: "Aktiv",
              archived: false,
              messages: [
                ...(conversation.messages || []),
                {
                  id: `MSG-TEXT-${Date.now().toString().slice(-6)}`,
                  from: sender,
                  text: body,
                  time: stamp,
                  mine: true,
                  status: "Göndərildi",
                  readAt: stamp,
                  commentId: comment.id,
                },
              ],
            }
          : conversation,
      );
      const nextTickets = ticketId
        ? (current.supportTickets || []).map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  status: ticket.status === "Bağlandı" ? "İcrada" : ticket.status,
                  comments: [...(ticket.comments || []), comment],
                }
              : ticket,
          )
        : current.supportTickets;

      return auditCurrentState(
        {
          ...current,
          conversations: nextConversations,
          supportTickets: nextTickets,
        },
        {
          module: ticketId ? "Mesaj/Support" : "Mesaj",
          action: ticketId ? "Bağlı task-a mesaj yazıldı" : "Daxili mesaj göndərildi",
          detail: selectedConversation?.title || selectedConversation?.person || ticketId || conversationId,
        },
      );
    });
    setDraftMessage("");
    if (selectedThreadForSync) {
      queueMicrotask(() => syncCommunicationWorkflow({
        ...selectedThreadForSync,
        preview: body,
        archived: false,
        messages: [
          ...(selectedThreadForSync.messages || []),
          { id: comment.id, from: sender, text: body, time: stamp, status: "GГ¶ndЙ™rildi", readAt: stamp },
        ],
      }));
    }
  }

  if (remoteUser?.mustChangePassword && remoteAuthStatus === "signedIn") {
    return <PasswordChangeScreen user={remoteUser} onLogout={logoutUser} />;
  }

  if (!currentUser || (remoteApiEnabled && remoteAuthStatus === "checking")) {
    return (
      <>
        <LoginScreen
          users={state.settings.users || []}
          roles={state.settings.roles || defaultRoles}
          onLogin={loginUser}
          authMode={remoteApiEnabled ? "password" : "local"}
          onPasswordLogin={loginWithPassword}
          isLoading={remoteAuthStatus === "checking"}
          authError={authError}
        />
        <ToastStack toasts={toasts} />
      </>
    );
  }

  const meta = pageMeta[active];
  const pageHasHeaderAction = hasPageAction(active);
  const actionPermission = getPageActionPermission(active);
  const canPerformPageAction = pageHasHeaderAction && (!actionPermission || can(actionPermission));
  const actionDeniedReason =
    pageHasHeaderAction && actionPermission && !can(actionPermission)
      ? `${activeRoleInfo?.name || "Rol"}: ${meta.action} üçün icazə yoxdur.`
      : "";

  return (
    <div className="app-shell">
      <Sidebar
        active={active}
        items={visibleNavItems}
        currentUser={currentUser}
        activeRole={activeRoleInfo}
        mobileNav={mobileNav}
        onClose={() => setMobileNav(false)}
        onSelect={choosePage}
      />

      <div className="workspace">
        <Topbar
          query={query}
          setQuery={setQuery}
          unread={state.notifications.filter((item) => item.unread).length}
          messages={state.conversations.reduce((sum, item) => sum + item.unread, 0)}
          onMenu={() => setMobileNav(true)}
          onMessages={() => choosePage("messages")}
          onNotifications={() => choosePage("notifications")}
          currentUser={currentUser}
          activeRole={activeRoleInfo}
          users={state.settings.users || []}
          onLogin={loginUser}
          onLogout={logoutUser}
          canSwitchUser={!remoteApiEnabled}
          gitHubSync={isPlatformAdmin ? gitHubSync : null}
        />

        <main className="main">
          <PageHeader
            meta={meta}
            onAction={openAction}
            showAction={pageHasHeaderAction}
            canAct={canPerformPageAction}
            disabledReason={actionDeniedReason}
          />

          <Suspense fallback={<div className="page-suspense-loader" style={{ padding: 32, opacity: 0.6 }}>Yüklənir…</div>}>
          {active === "platform" && <PlatformAdminPage />}
          {active === "assistant" && <AssistantPage />}
          {active === "roles" && <RolesPermissionsPage />}
          {active === "access-check" && <AccessCheckPage />}
          {active === "audit" && <AuditLogPage />}
          {active === "periods" && <PeriodsPage />}
          {active === "currencies" && <CurrenciesPage />}
          {active === "financial-statements" && <FinancialStatementsPage />}
          {active === "data-reconciliation" && <DataReconciliationPage />}

          
          



          {active === "dashboard" && (
            <DashboardPage
              stats={dashboardStats}
              orders={filtered.orders}
              stock={state.stock}
              expenses={state.expenses}
              notifications={state.notifications}
              actions={todayActionRows}
              moduleReadiness={moduleReadiness}
              advanceOrder={advanceOrder}
              setActive={choosePage}
            />
          )}
          {active === "crm" && <CrmCustomersPageV2 />}
          {active === "crm-deals" && <CrmDealsPage />}
          {active === "crm-activities" && <CrmActivitiesPage />}
          {active === "crm-tasks" && <CrmTasksPage />}


          {active === "sales-dashboard" && <SalesDashboardPage />}
          {active === "sales-quotes" && <QuotesPage />}
          {active === "sales-shipments" && <ShipmentsPage />}
          {active === "sales" && <SalesOrdersPage />}
          {active === "stock" && <StockPage />}
          {active === "cashbook" && <CashbookPage />}
          {active === "ar-invoices" && <SalesInvoicesPage />}
          {active === "warehouse" && (
            <WarehousePage
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              products={state.products || []}
              orders={state.orders}
              purchaseOrders={state.purchaseOrders || []}
              selectedWarehouseId={selectedWarehouseId}
              query={query}
              onSelect={setSelectedWarehouseId}
              onEdit={(warehouseId) =>
                setModal({ type: "warehouse", mode: "edit", warehouseId })
              }
              onDelete={deleteWarehouse}
              onCompleteDelivery={completeWarehouseDelivery}
              onTransferStock={transferWarehouseStock}
              onReceiveStock={() => setModal({ type: "stockIntake" })}
              onOpenImport={() => setModal({ type: "warehouseImport" })}
              onCreateProduct={() => setModal({ type: "product", mode: "create" })}
              onEditProduct={(productId) => setModal({ type: "product", mode: "edit", productId })}
              onTrackAction={(action, detail) => auditOperation({ module: "Anbar", action, detail })}
            />
          )}
          {active === "deliveries" && (
            <DeliveriesPage
              orders={filtered.orders}
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              onCompleteDelivery={completeWarehouseDelivery}
            />
          )}
          {active === "finance" && (
            <FinancePage
              expenses={filtered.expenses}
              cashEntries={filtered.cashEntries}
              orders={filtered.orders}
            credits={creditRecords}
            currencyRows={filtered.currency}
            setExpenseStatus={setExpenseStatus}
            accounts={state.financeAccounts || []}
            openingBalance={financeOpeningBalance}
            onCreateAccount={() => setModal({ type: "financeAccount", mode: "create" })}
            onEditAccount={(accountId) => setModal({ type: "financeAccount", mode: "edit", accountId })}
            onEditExpense={openExpenseEditor}
            onDeleteExpense={openExpenseDelete}
            onOpenSalesOrder={openLinkedSalesOrder}
            onOpenCredit={openLinkedCredit}
            onOpenVendors={openVendorModule}
            />
          )}
          {active === "invoices" && (
            <InvoicesPage
              invoices={filtered.invoices}
              summary={buildInvoiceSummary(invoiceRows)}
              invoiceSettings={state.invoiceSettings}
              onExport={exportReport}
              onOpenSalesOrder={openLinkedSalesOrder}
            />
          )}
          {active === "accounting" && <AccountingPageV2 />}
          {active === "tax" && (
            <TaxPage
              taxRows={filtered.taxCalendar}
              payrollTaxRows={payrollTaxRows}
              invoiceSummary={buildInvoiceSummary(invoiceRows)}
              accounting={accountingData}
            />
          )}
          {active === "credits" && (
            <CreditsPage
              credits={filtered.credits}
              sendCreditSms={sendCreditSms}
              onUpdatePaymentDate={updateCreditPaymentDate}
              onReceivePayment={receiveCreditPayment}
              onCreateCredit={() => setModal({ type: "sales", presetPaymentMethod: "Kredit" })}
              onOpenSalesOrder={openLinkedSalesOrder}
              selectedCreditId={selectedCreditId}
              onClearSelectedCredit={() => setSelectedCreditId("")}
            />
          )}
          {active === "receivables" && (
            <ReceivablesPage
              rows={filtered.receivables}
              syncMeta={state.receivableSync}
              closures={state.receivableClosures || []}
              onCloseDebt={closeReceivableDebt}
            />
          )}
          {active === "vendors" && (
            <VendorManagementPage
              vendors={filtered.vendors}
              warehouseStock={state.warehouseStock}
              products={state.products || []}
              warehouses={state.warehouses}
              orders={state.orders}
              purchaseOrders={state.purchaseOrders || []}
              onCreateVendor={() => setModal({ type: "vendors", mode: "create" })}
              onEditVendor={(vendorKey) => setModal({ type: "vendors", mode: "edit", vendorKey })}
              onDeleteVendor={openVendorDelete}
              onCreatePurchaseOrder={createPurchaseOrder}
              onOpenPurchaseOrderModal={() => setModal({ type: "purchaseOrder" })}
              onApprovePurchaseOrder={approvePurchaseOrder}
              canManagePo={can("vendors.po")}
              canManageVendors={can("vendors.manage")}
            />
          )}
          {active === "procurement" && <ProcurementPage />}
          {active === "projects" && <ProjectsPage projects={filtered.projects} snapshot={state.projectRoiSnapshot} />}
          {active === "production" && (
            <ProductionPage
              plans={filtered.productionPlans}
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              onCreatePlan={createProductionPlan}
              onUpdatePlan={updateProductionPlan}
              onDeletePlan={deleteProductionPlan}
              onStartPlan={startProductionPlan}
              onCompletePlan={completeProductionPlan}
              canManage={can("production.manage")}
            />
          )}
          {active === "hr" && (
            <HrPage
              employees={filtered.employees}
              allEmployees={state.employees}
              departments={state.departments || []}
              leaveRequests={state.leaveRequests || []}
              vacancies={state.vacancies || []}
              onUpdateEmployeeStructure={updateEmployeeStructure}
              onEditEmployee={openEmployeeEditor}
              onDeleteEmployee={openEmployeeDelete}
              onCreateDepartment={openDepartmentCreator}
              onCreateLeaveRequest={openLeaveRequestCreator}
              onCreateVacancy={openVacancyCreator}
              onUpdateLeaveStatus={updateLeaveRequestStatus}
              onMarkPayrollPaid={markPayrollPaid}
              onUpdateEmployeeDocuments={updateEmployeeDocuments}
            />
          )}
          {active === "kpi" && (
            <KpiPage
              employees={state.employees}
              salesBonuses={salesBonusRows}
              targetRows={kpiTargetRows}
              employeeRows={kpiEmployeeRows}
              activePeriod={activeKpiPeriod}
              periods={state.kpiPeriods || []}
              payouts={state.kpiPayouts || []}
              onRunPeriodAction={runKpiPeriodAction}
            />
          )}
          {active === "contracts" && (
            <ContractsPage
              contracts={filtered.contracts}
              onExport={(id) => setModal({ type: "contractPrint", contractId: id })}
            />
          )}
          {active === "reports" && (
            <ReportsPage
              orders={state.orders}
              credits={creditRecords}
              vendors={state.vendors}
              employees={state.employees}
              expenses={state.expenses}
              warehouseStock={state.warehouseStock}
              warehouses={state.warehouses}
              products={state.products || []}
              purchaseOrders={state.purchaseOrders || []}
              productionPlans={productionRows}
              invoices={invoiceRows}
              cashEntries={state.cashEntries || []}
              exports={state.reportExports || []}
              onExport={exportReport}
              canExport={can("reports.export")}
              snapshotDate={currentBusinessDate}
              buildExecutiveInsights={buildExecutiveInsights}
              buildReportPackage={buildReportPackage}
            />
          )}
          {active === "support" && (
            <SupportPage
              tickets={filtered.supportTickets}
              orders={state.orders}
              credits={creditRecords}
              customers={state.customers}
              conversations={state.conversations || []}
              selectedTicketId={selectedSupportTicketId}
              onSelectTicket={setSelectedSupportTicketId}
              onAddComment={addSupportTicketComment}
              onUpdateStatus={updateSupportTicketStatus}
              onOpenConversation={openSupportConversation}
              onOpenSalesOrder={openLinkedSalesOrder}
              onOpenCredit={openLinkedCredit}
              onOpenCustomer={openLinkedCustomer}
            />
          )}
          {active === "help" && (
            <HelpCenterPage
              articles={filterRows(helpArticles, query)}
              guides={filterRows(helpModuleGuides, query)}
              onboardingRows={onboardingRows}
              snapshot={state.helpGuideSnapshot}
              onOpenModule={choosePage}
            />
          )}
          {active === "onboarding" && (
            <OnboardingPage
              onboarding={state.onboarding}
              rows={onboardingRows}
              onOpenModule={choosePage}
            />
          )}
          {active === "messages" && (
            <MessagesPageV2
              conversations={filtered.conversations}
              conversationId={conversationId}
              setConversationId={selectMessageThread}
              draftMessage={draftMessage}
              setDraftMessage={setDraftMessage}
              sendMessage={sendMessage}
              canSend={can("messages.send")}
              canManage={can("messages.manage")}
              currentUser={currentUser}
              participants={messageParticipantOptions}
              contextOptions={messageContextOptions}
              onCreateConversation={createMessageConversation}
              onArchiveConversation={archiveMessageConversation}
              onDeleteConversation={deleteMessageConversation}
              onOpenSalesOrder={openLinkedSalesOrder}
              onOpenCredit={openLinkedCredit}
              onOpenSupportTicket={openSupportTicket}
              onOpenCustomer={openLinkedCustomer}
            />
          )}
          {active === "notifications" && (
            <NotificationsPage
              notifications={filtered.notifications}
              automationRows={notificationAutomationRows}
              providerRows={notificationProviderRows}
              sendLog={state.notificationSendLog || []}
              dispatchSnapshot={state.notificationDispatchSnapshot}
              filter={notificationFilter}
              setFilter={setNotificationFilter}
              markAll={markAllNotificationsRead}
              runDispatch={runNotificationDispatchAction}
              lastSweepAt={state.notificationSweepAt}
              canManage={can("notifications.manage")}
            />
          )}
          {active === "api" && (
            <ApiPage
              webhooks={filtered.apiWebhooks}
              secrets={apiSecretRows}
              logs={state.apiWebhookLogs || []}
              snapshot={state.apiIntegrationSnapshot}
              dbMeta={state.dbMeta}
              auditLog={state.auditLog || []}
              onRunTest={runApiAction}
              onRotateSecret={rotateApiSecret}
              canManage={can("api.manage")}
            />
          )}
          {active === "settings" && (
            <SettingsPage
              settings={state.settings}
              activeRole={activeRoleInfo}
              auditLog={state.auditLog || []}
              dbMeta={state.dbMeta}
              integrityReport={integrityReport}
              integritySnapshot={state.integritySnapshot}
              goLiveReport={goLiveReport}
              goLiveSnapshot={state.goLiveSnapshot}
              productionHardeningReport={productionHardeningReport}
              productionHardeningSnapshot={state.productionHardeningSnapshot}
              permissionCatalog={permissionCatalog}
              modulePermissionCatalog={modulePermissionCatalog}
              toggleSetting={toggleSetting}
              updateCompany={updateCompany}
              onSaveSettings={saveSettings}
              onChangeRole={changeCurrentRole}
              users={state.settings.users || []}
              onCreateUser={createUser}
              onUpdateUserStatus={updateUserStatus}
              onToggleUserModule={toggleUserModuleAccess}
              onRunIntegrityCheck={runIntegrityCheck}
              onRunGoLiveCheck={runGoLiveCheck}
              onRunProductionHardeningCheck={runProductionHardeningCheck}
              onExportBackup={exportBackup}
              onImportBackup={importBackup}
              notify={notify}
              requiresPassword={remoteApiEnabled}
              canManageSettings={can("settings.manage")}
              canRunSystemBackup={can("system.backup")}
            />
          )}
          </Suspense>
        </main>
      </div>

      <FloatingAssistant />

      {modal && (
        <CreateModal
          type={modal.type}
          mode={modal.mode}
          config={createConfig[modal.type]}
          warehouse={
            modal.warehouseId
              ? state.warehouses.find((warehouse) => warehouse.id === modal.warehouseId)
              : null
          }
          product={
            modal.productId
              ? state.products.find((product) => product.id === modal.productId)
              : null
          }
          contract={
            modal.contractId
              ? state.contracts.find((contract) => contract.id === modal.contractId)
              : null
          }
          salesOrder={
            modal.orderId
              ? state.orders.find((order) => order.id === modal.orderId)
              : null
          }
          expense={
            modal.expenseId
              ? state.expenses.find((expense) => expense.id === modal.expenseId)
              : null
          }
          financeAccount={
            modal.accountId
              ? state.financeAccounts.find((account) => account.id === modal.accountId)
              : null
          }
          employee={
            modal.employeeId
              ? state.employees.find((employee) => getEmployeeKey(employee) === modal.employeeId)
              : null
          }
          vendor={
            modal.vendorKey
              ? state.vendors.find((vendor) => getVendorKey(vendor) === modal.vendorKey)
              : null
          }
          companySettings={state.settings}
          orderOptions={{
            customers: state.customers,
            products: state.products || [],
            vendors: state.vendors || [],
            employees: state.employees || [],
            departments: state.departments || [],
            stock: state.stock,
            warehouses: state.warehouses,
            warehouseStock: state.warehouseStock,
            purchaseOrders: state.purchaseOrders || [],
            sellers: state.employees.filter((employee) => employee.department === "Satış"),
          }}
          salesDefaults={{
            paymentMethod: modal.presetPaymentMethod,
          }}
          onClose={() => setModal(null)}
          onCreate={createRecord}
          onUpdateWarehouse={updateWarehouse}
          onReceiveStock={recordStockIntake}
          onCreatePurchaseOrder={createPurchaseOrder}
          onImportWarehouseStock={importWarehouseStock}
          onUpdateProduct={updateProduct}
          onDeleteProduct={deleteProduct}
          onSaveFinanceAccount={saveFinanceAccount}
          onUpdateSalesOrder={updateSalesOrder}
          onDeleteSalesOrder={deleteSalesOrder}
          onUpdateExpense={updateExpense}
          onDeleteExpense={deleteExpense}
          onSaveVendor={updateVendor}
          onRequestVendorDelete={openVendorDelete}
          onDeleteVendor={deleteVendor}
          onSaveEmployee={updateEmployee}
          onCreateDepartment={createDepartment}
          onDeleteEmployee={deleteEmployee}
          onCreateLeaveRequest={createLeaveRequest}
          onCreateVacancy={createVacancy}
        />
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
}

const GROUP_LABELS = {
  crm: "CRM",
  sales: "Satış",
  supply: "Təchizat & Anbar",
  finance: "Maliyyə",
  ops: "Əməliyyat",
  analytics: "Analitika",
  system: "Sistem",
};
const GROUP_ICONS = {
  crm: Users,
  sales: ShoppingCart,
  supply: Warehouse,
  finance: Wallet,
  ops: Package,
  analytics: BarChart3,
  system: Settings,
};

function SidebarNav({ items, active, onSelect }) {
  const groups = [];
  const seen = new Set();
  for (const item of items) {
    if (item.group) {
      if (!seen.has(item.group)) {
        seen.add(item.group);
        groups.push({ type: "group", id: item.group, children: items.filter((x) => x.group === item.group) });
      }
    } else {
      groups.push({ type: "item", item });
    }
  }
  const activeGroup = items.find((x) => x.id === active)?.group;
  const [open, setOpen] = useState(() => ({ [activeGroup]: true }));
  useEffect(() => {
    if (activeGroup) setOpen((o) => ({ ...o, [activeGroup]: true }));
  }, [activeGroup]);

  return (
    <nav className="nav-list">
      {groups.map((entry) => {
        if (entry.type === "item") {
          const Icon = navIcons[entry.item.id] || Settings;
          return (
            <button
              key={entry.item.id}
              className={`nav-item ${active === entry.item.id ? "active" : ""}`}
              onClick={() => onSelect(entry.item.id)}
            >
              <Icon size={17} />
              <span>{entry.item.label}</span>
            </button>
          );
        }
        const isOpen = !!open[entry.id];
        const GroupIcon = GROUP_ICONS[entry.id] || Users;
        const hasActive = entry.children.some((c) => c.id === active);
        return (
          <div key={entry.id} className={`nav-group ${isOpen ? "open" : ""}`}>
            <button
              type="button"
              className={`nav-item nav-group-head ${hasActive ? "active-group" : ""}`}
              onClick={() => setOpen((o) => ({ ...o, [entry.id]: !o[entry.id] }))}
              aria-expanded={isOpen}
            >
              <GroupIcon size={17} />
              <span style={{ flex: 1, textAlign: "left" }}>{GROUP_LABELS[entry.id] || entry.id}</span>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {isOpen && (
              <div className="nav-group-children" style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 18, marginTop: 2 }}>
                {entry.children.map((child) => {
                  const Icon = navIcons[child.id];
                  return (
                    <button
                      key={child.id}
                      className={`nav-item ${active === child.id ? "active" : ""}`}
                      onClick={() => onSelect(child.id)}
                    >
                      {Icon && <Icon size={15} />}
                      <span>{child.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Sidebar({ active, items = navItems, currentUser, activeRole, mobileNav, onClose, onSelect }) {
  return (
    <>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name">ERP+CRM AZ</div>
            <div className="brand-subtitle">Azərbaycan Sistemi</div>
          </div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Menyunu bağla">
            <X size={18} />
          </button>
        </div>

        <SidebarNav items={items} active={active} onSelect={onSelect} />


        <div className="admin-card">
          <div className="avatar">
            {String(currentUser?.name || "AD")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toLocaleUpperCase("az-AZ")}
          </div>
          <div>
            <div className="admin-name">{currentUser?.name || "Administrator"}</div>
            <div className="admin-mail">{activeRole?.name || currentUser?.email}</div>
          </div>
        </div>
      </aside>
      {mobileNav && <button className="scrim" onClick={onClose} aria-label="Menyunu bağla" />}
    </>
  );
}

function formatTimeAgo(date) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "indicə";
  if (minutes < 60) return `${minutes} dəq əvvəl`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat əvvəl`;
  return `${Math.floor(hours / 24)} gün əvvəl`;
}

function Topbar({
  query,
  setQuery,
  unread,
  messages,
  onMenu,
  onMessages,
  onNotifications,
  currentUser,
  activeRole,
  users = [],
  onLogin,
  onLogout,
  canSwitchUser = true,
  gitHubSync,
}) {
  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu" onClick={onMenu} aria-label="Menyunu aç">
        <Menu size={20} />
      </button>
      <div className="searchbox">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Müştəri, sifariş, məhsul axtar..."
        />
        {query && (
          <button className="clear-search" onClick={() => setQuery("")} aria-label="Axtarışı sil">
            <X size={14} />
          </button>
        )}
      </div>
      <div className="top-actions">
        {canSwitchUser && (
          <label className="user-switcher">
            <UserCog size={16} />
            <select
              aria-label="Aktiv istifadəçi"
              value={currentUser?.id || ""}
              onChange={(event) => onLogin(event.target.value)}
            >
              {users
                .filter((user) => user.status === "Aktiv")
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.role}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="session-pill">
          <span>{currentUser?.name}</span>
          <strong>{activeRole?.name}</strong>
        </div>
        <button className="icon-btn badge-host" onClick={onMessages} aria-label="Mesajlar">
          <MessageSquare size={20} />
          <span className="counter">{messages}</span>
        </button>
        <button className="icon-btn badge-host" onClick={onNotifications} aria-label="Bildirişlər">
          <Bell size={20} />
          <span className="counter danger">{unread}</span>
        </button>
        {gitHubSync && (
          <div
            className="sync-pill"
            title={
              gitHubSync?.isLovableOnly
                ? "Layihə Lovable Cloud ilə sinxronizasiya olunur"
                : gitHubSync?.lastCommit
                  ? `${gitHubSync.lastCommit.sha} · ${gitHubSync.lastCommit.message} · ${formatTimeAgo(gitHubSync.lastSyncAt)}`
                  : gitHubSync?.error || "GitHub sync status"
            }
          >
            <GitBranch size={16} />
            <span className={`sync-dot ${gitHubSync?.status || "idle"}`} />
            <span className="sync-label">
              {gitHubSync?.isLovableOnly
                ? "Lovable Cloud"
                : gitHubSync?.status === "error"
                  ? "Sync xətası"
                  : gitHubSync?.lastSyncAt
                    ? formatTimeAgo(gitHubSync.lastSyncAt)
                    : "Yoxlanır..."}
            </span>
          </div>
        )}

        <button className="secondary-btn logout-btn" onClick={onLogout}>
          Çıxış
        </button>
      </div>
    </header>
  );
}

function PageHeader({ meta, onAction, showAction = true, canAct = true, disabledReason = "" }) {
  if (!meta) return null;
  const actionLabel = meta.action || "";
  return (
    <div className="page-header">
      <div>
        <h1>{meta.title}</h1>
        <p>{meta.subtitle}</p>
      </div>
      {showAction && actionLabel && (
        <button className="primary-btn" onClick={onAction} disabled={!canAct} title={!canAct ? disabledReason : ""}>
          {actionLabel.includes("Yeni") ? <Plus size={16} /> : <Check size={16} />}
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function PasswordChangeScreen({ user, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (newPassword.length < 8 || newPassword !== confirmation) {
      setError("Yeni parol ən azı 8 simvol olmalı və təkrar ilə uyğun gəlməlidir.");
      return;
    }
    try {
      await changeRemotePassword(currentPassword, newPassword);
      window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Parol dəyişdirilmədi.");
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <ShieldCheck size={36} />
        <h1>Yeni parol təyin edin</h1>
        <p>{user.name}, təhlükəsizlik üçün ilkin parolu dəyişdirin.</p>
        <form className="login-form" onSubmit={submit}>
          <label><span>İlkin parol</span><input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label><span>Yeni parol</span><input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label><span>Yeni parolun təkrarı</span><input type="password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {error ? <div className="login-error">{error}</div> : null}
          <button type="submit" className="primary-btn">Parolu dəyiş</button>
          <button type="button" className="secondary-btn" onClick={onLogout}>Çıxış</button>
        </form>
      </div>
    </div>
  );
}

const companyModuleCopy = {
  dashboard: ["İdarəetmə paneli", "Əsas göstəricilər və ümumi əməliyyat icmalı"],
  crm: ["Müştərilər (CRM)", "Müştəri bazası, əlaqələr və 360° görünüş"],
  sales: ["Satış", "Sifarişlər, satış axını və bonuslar"],
  warehouse: ["Anbar və stok", "Qalıqlar, rezervlər və anbar əməliyyatları"],
  deliveries: ["Təhvil və logistika", "Çatdırılma mərhələləri və təhvil nəzarəti"],
  finance: ["Maliyyə", "Kassa, xərclər və maliyyə təsdiqləri"],
  invoices: ["Fakturalar və e-qaimə", "Faktura yaradılması və ödəniş izləmə"],
  accounting: ["Mühasibat", "Mühasibat yazılışları və maliyyə hesabatları"],
  tax: ["Vergi təqvimi", "Vergi öhdəlikləri və son tarixlər"],
  credits: ["Kreditlər", "Kredit satışları və ödəniş cədvəlləri"],
  receivables: ["Debitor və kreditor", "Alacaq və borc balanslarının idarəsi"],
  vendors: ["Təchizatçılar", "Vendorlar, kvotalar və satınalma əlaqələri"],
  projects: ["Layihələr və ROI", "Layihə gəlirliliyi və investisiya analizi"],
  production: ["İstehsalat", "İstehsal planları və material axını"],
  hr: ["İnsan resursları (HR)", "Əməkdaşlar, şöbələr və məzuniyyətlər"],
  kpi: ["KPI və performans", "Hədəflər, nəticələr və bonus hesablamaları"],
  contracts: ["Müqavilələr", "Müqavilə şablonları və sənədlər"],
  reports: ["Hesabatlar", "İdarəetmə hesabatları və export"],
  support: ["Dəstək", "Sorğular, tapşırıqlar və xidmət izləmə"],
  help: ["Kömək mərkəzi", "Təlimatlar və istifadəçi bələdçisi"],
  onboarding: ["İlkin quraşdırma", "Şirkətin sistemə qoşulma addımları"],
  messages: ["Daxili mesajlar", "Komanda daxilində yazışmalar"],
  notifications: ["Bildirişlər", "Sistem xəbərdarlıqları və avtomatlaşdırma"],
  api: ["API inteqrasiyaları", "Xarici sistemlər və webhook bağlantıları"],
  settings: ["Sistem ayarları", "İstifadəçilər, rollar və ümumi sazlamalar"],
};

function CompanyModulePicker({ modules, value, onToggle }) {
  return (
    <div className="company-module-picker">
      {modules.map((module) => {
        const Icon = navIcons[module.id] || Boxes;
        const [label, description] = companyModuleCopy[module.id] || [module.label, "ERP modulu"];
        const selected = value.includes(module.id);
        const required = module.id === "dashboard";
        return (
          <label key={module.id} className="company-module-card">
            <input type="checkbox" checked={selected} disabled={required} onChange={() => onToggle(module.id)} />
            <span className="company-module-icon"><Icon size={18} /></span>
            <span className="company-module-copy"><strong>{label}</strong><small>{description}</small></span>
            <span className="company-module-state">{selected ? <Check size={16} /> : null}</span>
            {required ? <em>Məcburi</em> : null}
          </label>
        );
      })}
    </div>
  );
}

function slugifyPlatform(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

const PLATFORM_PLANS = ["starter", "business", "enterprise"];
const PLATFORM_MODULE_CHOICES = navItems
  .filter((n) => !["platform"].includes(n.id))
  .map((n) => ({ id: n.id, label: n.label }));

function PlatformAdminPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState(null); // { email, password }
  const [editing, setEditing] = useState(null); // tenant obj or null
  const emptyForm = {
    name: "", slug: "", admin_email: "", max_users: 10,
    plan_name: "starter", expires_at: "", notes: "",
    modules: PLATFORM_MODULE_CHOICES.map((m) => m.id),
  };
  const [form, setForm] = useState(emptyForm);

  const checkAdmin = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    setIsAdmin(!!data);
    setChecked(true);
  }, [user?.id]);

  const refreshTenants = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc("platform_list_tenants");
    if (err) setError(err.message);
    else { setTenants(data || []); setError(""); }
    setLoading(false);
  }, []);

  useEffect(() => { checkAdmin(); }, [checkAdmin]);
  useEffect(() => { if (isAdmin) refreshTenants(); }, [isAdmin, refreshTenants]);

  async function bootstrap() {
    setBusy(true);
    const { error: err } = await supabase.rpc("platform_bootstrap_admin");
    setBusy(false);
    if (err) return setError(err.message);
    await checkAdmin();
  }

  function toggleModule(id) {
    setForm((f) => ({
      ...f,
      modules: f.modules.includes(id) ? f.modules.filter((m) => m !== id) : [...f.modules, id],
    }));
  }

  function startEdit(t) {
    setEditing(t);
    setForm({
      name: t.name || "",
      slug: t.slug || "",
      admin_email: "",
      max_users: t.max_users ?? 10,
      plan_name: t.plan_name || "starter",
      expires_at: t.expires_at || "",
      notes: t.notes || "",
      modules: t.modules?.length ? t.modules : PLATFORM_MODULE_CHOICES.map((m) => m.id),
    });
  }
  function cancelEdit() { setEditing(null); setForm(emptyForm); }

  async function syncTenantLimits(tenantId) {
    const { error: limitError } = await supabase.rpc("platform_set_tenant_limits", {
      _tenant: tenantId,
      _max_users: Number(form.max_users) || 10,
      _max_warehouses: 3,
      _max_storage_mb: form.plan_name === "enterprise" ? 10240 : form.plan_name === "business" ? 4096 : 1024,
      _enabled_modules: form.modules,
    });
    if (limitError) throw limitError;
  }

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      if (editing) {
        const { error: e1 } = await supabase.rpc("platform_update_tenant", {
          _tenant: editing.id, _name: form.name.trim(),
          _max_users: Number(form.max_users) || 10,
          _plan: form.plan_name, _expires_at: form.expires_at || null,
          _notes: form.notes || null,
        });
        if (e1) throw e1;
        const { error: e2 } = await supabase.rpc("platform_set_tenant_modules", {
          _tenant: editing.id, _modules: form.modules,
        });
        if (e2) throw e2;
        await syncTenantLimits(editing.id);
      } else {
        const base = (form.slug || slugifyPlatform(form.name) || "sirket").slice(0, 40);
        let finalSlug = base; let lastErr = null; let createdTenantId = null;
        for (let i = 0; i < 4; i++) {
          const { data: newId, error: rpcErr } = await supabase.rpc("platform_create_tenant", {
            _name: form.name.trim(), _slug: finalSlug,
            _max_users: Number(form.max_users) || 10,
            _plan: form.plan_name, _modules: form.modules,
            _expires_at: form.expires_at || null, _notes: form.notes || null,
            _admin_email: null,
          });
          if (!rpcErr) { lastErr = null; createdTenantId = newId; break; }
          lastErr = rpcErr;
          const dup = rpcErr.code === "23505" || /duplicate|tenants_slug_key/i.test(rpcErr.message || "");
          if (!dup) break;
          finalSlug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        }
        if (lastErr) throw lastErr;
        await syncTenantLimits(createdTenantId);

        const adminEmail = form.admin_email.trim();
        if (createdTenantId && adminEmail) {
          const { data: prov, error: provErr } = await supabase.functions.invoke(
            "platform-provision-admin",
            { body: { tenant_id: createdTenantId, email: adminEmail, role: "admin" } },
          );
          if (provErr || prov?.error) {
            throw new Error(provErr?.message || prov?.error || "Admin yaradıla bilmədi");
          }
          setCredential({ email: prov.email, password: prov.password });
        }
      }
      cancelEdit();
      await refreshTenants();
      await refreshAuth?.();
    } catch (err) {
      setError(err?.message || "Əməliyyat alınmadı.");
    } finally { setBusy(false); }
  }

  async function setStatus(t, status) {
    if (status === "frozen" && !window.confirm(`${t.name} şirkəti dondurulsun?`)) return;
    if (status === "active" && !window.confirm(`${t.name} şirkəti aktivləşdirilsin?`)) return;
    const { error: err } = await supabase.rpc("platform_set_tenant_status", { _tenant: t.id, _status: status });
    if (err) return setError(err.message);
    await refreshTenants();
  }
  async function deleteTenant(t) {
    if (!window.confirm(`${t.name} şirkəti və bütün məlumatları silinsin? Bu əməliyyat geri qaytarılmır.`)) return;
    const { error: err } = await supabase.rpc("platform_delete_tenant", { _tenant: t.id });
    if (err) return setError(err.message);
    await refreshTenants();
    await refreshAuth?.();
  }

  const activeTenantCount = tenants.filter((tenant) => tenant.status === "active").length;
  const frozenTenantCount = tenants.filter((tenant) => tenant.status === "frozen").length;
  const totalPlatformUsers = tenants.reduce((sum, tenant) => sum + Number(tenant.member_count || 0), 0);
  const expiringTenantCount = tenants.filter((tenant) => {
    if (!tenant.expires_at) return false;
    const days = Math.ceil((new Date(tenant.expires_at).getTime() - Date.now()) / dayInMs);
    return days >= 0 && days <= 30;
  }).length;

  if (!checked) return <p className="muted">Yüklənir…</p>;
  if (!isAdmin) {
    return (
      <Panel>
        <PanelHeader title="Platform Super Admin" subtitle="Bu bölmə yalnız platform administratorları üçündür." />
        <p className="muted" style={{ marginBottom: 12 }}>
          Hələ heç bir platform admin təyin edilməyib. İlk admin kimi özünüzü təyin edin.
        </p>
        <button type="button" className="primary-btn" onClick={bootstrap} disabled={busy}>
          {busy ? "Təyin olunur…" : "Məni platform admin təyin et"}
        </button>
        {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
      </Panel>
    );
  }

  return (
    <div className="page-grid">
      <section className="metric-grid four" style={{ gridColumn: "1 / -1" }}>
        <MetricCard label="Aktiv ЕџirkЙ™t" value={activeTenantCount} trend={`${tenants.length} tenant`} icon={Building2} tone="success" />
        <MetricCard label="Platform istifadЙ™Г§isi" value={totalPlatformUsers} trend="BГјtГјn tenant-lЙ™r" icon={Users} tone="primary" />
        <MetricCard label="DondurulmuЕџ" value={frozenTenantCount} trend="GiriЕџ mЙ™hdudiyyЙ™ti" icon={ShieldCheck} tone={frozenTenantCount ? "warning" : "success"} />
        <MetricCard label="30 gГјnЙ™ bitЙ™n" value={expiringTenantCount} trend="Lisenziya nЙ™zarЙ™ti" icon={CalendarClock} tone={expiringTenantCount ? "warning" : "info"} />
      </section>
      <Panel>
        <PanelHeader
          title={editing ? `Şirkəti redaktə et — ${editing.name}` : "Yeni şirkət yarat"}
          subtitle={editing ? "Dəyişiklikləri yadda saxlayın." : "Yeni tenant və (istəyə bağlı) admin — müvəqqəti parol yaradılır."}
          action={editing ? <button type="button" className="secondary-btn" onClick={cancelEdit}>Ləğv et</button> : null}
        />
        <form className="form-grid" onSubmit={submit} style={{ gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="field">
              <span>Şirkət adı *</span>
              <input required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value, slug: editing ? form.slug : (form.slug || slugifyPlatform(e.target.value)) })} />
            </label>
            <label className="field">
              <span>Slug</span>
              <input disabled={!!editing} value={form.slug}
                onChange={(e) => setForm({ ...form, slug: slugifyPlatform(e.target.value) })} placeholder="avto" />
            </label>
            {!editing && (
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Admin e-poçtu (müvəqqəti parol yaradılacaq)</span>
                <input type="email" value={form.admin_email}
                  onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
                  placeholder="admin@sirket.az" />
              </label>
            )}
            <label className="field">
              <span>Maks. istifadəçi</span>
              <input type="number" min="1" value={form.max_users}
                onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
            </label>
            <label className="field">
              <span>Plan</span>
              <select value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })}>
                {PLATFORM_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Bitmə tarixi</span>
              <input type="date" value={form.expires_at || ""}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </label>
            <label className="field">
              <span>Qeyd</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>İcazə verilən modullar ({form.modules.length}/{PLATFORM_MODULE_CHOICES.length})</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="link-btn" onClick={() => setForm({ ...form, modules: PLATFORM_MODULE_CHOICES.map((m) => m.id) })}>Hamısı</button>
                <button type="button" className="link-btn" onClick={() => setForm({ ...form, modules: [] })}>Heç biri</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6, padding: 10, border: "1px solid #e6dfc9", borderRadius: 10, maxHeight: 220, overflowY: "auto", background: "#fafaf5" }}>
              {PLATFORM_MODULE_CHOICES.map((m) => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.modules.includes(m.id)} onChange={() => toggleModule(m.id)} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-btn" disabled={busy || !form.name.trim()}>
              {busy ? "Saxlanılır…" : (editing ? "Yadda saxla" : "Şirkət yarat")}
            </button>
          </div>
        </form>
        {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
        {credential && (
          <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: "#e6f4ef", border: "1px solid #0d7a5f" }}>
            <div style={{ fontWeight: 700, color: "#064e3b", marginBottom: 6 }}>Admin girişi yaradıldı</div>
            <div style={{ fontSize: 13, color: "#0f2a20" }}>Bu məlumatı admin ilə paylaşın — bu pəncərəni bağladıqdan sonra parolu yenidən görə bilməyəcəksiniz.</div>
            <div style={{ marginTop: 8, display: "grid", gap: 4, fontFamily: "monospace", fontSize: 14 }}>
              <div><strong>E-poçt:</strong> {credential.email}</div>
              <div><strong>Müvəqqəti parol:</strong> {credential.password}</div>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button type="button" className="secondary-btn"
                onClick={() => navigator.clipboard?.writeText(`${credential.email} / ${credential.password}`)}>
                Kopyala
              </button>
              <button type="button" className="link-btn" onClick={() => setCredential(null)}>Bağla</button>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Bütün şirkətlər"
          subtitle={`${tenants.length} tenant`}
          action={<button type="button" className="secondary-btn" onClick={refreshTenants}>Yenilə</button>}
        />
        {loading ? <p className="muted">Yüklənir…</p> : (
          <DataTable
            columns={["Şirkət", "Plan", "Status", "İstifadəçi", "Bitmə", "Modullar", "Əməliyyat"]}
            rows={tenants.map((t) => [
              <TwoLine title={t.name} subtitle={t.slug} />,
              t.plan_name,
              <StatusBadge status={t.status === "active" ? "Aktiv" : t.status === "frozen" ? "Dondurulub" : "Silinib"} />,
              `${t.member_count}/${t.max_users}`,
              t.expires_at || "—",
              `${(t.modules || []).length}/${PLATFORM_MODULE_CHOICES.length}`,
              <div className="table-actions" style={{ display: "flex", gap: 4 }}>
                <button type="button" className="icon-btn" title="Redaktə" onClick={() => startEdit(t)}><Pencil size={14} /></button>
                {t.status === "active" ? (
                  <button type="button" className="icon-btn" title="Dondur" onClick={() => setStatus(t, "frozen")}>❄</button>
                ) : (
                  <button type="button" className="icon-btn" title="Aktivləşdir" onClick={() => setStatus(t, "active")}>▶</button>
                )}
                <button type="button" className="icon-btn danger" title="Sil" onClick={() => deleteTenant(t)}><Trash2 size={14} /></button>
              </div>,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}


function LoginScreen({ users = [], roles = [], onLogin, authMode = "local", onPasswordLogin, isLoading = false, authError = "" }) {
  const activeUsers = users.filter((user) => user.status === "Aktiv");
  const [selectedUserId, setSelectedUserId] = useState(activeUsers[0]?.id || "");
  const selectedUser = activeUsers.find((user) => user.id === selectedUserId) || activeUsers[0] || null;
  const selectedRole = roles.find((role) => role.name === selectedUser?.role);

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark login-brand">E</div>
        <div>
          <h1>ERP+CRM AZ</h1>
          <p>İstifadəçi seçin və rol icazələri ilə sistemə daxil olun.</p>
        </div>
        {authMode === "password" ? (
          <PasswordLoginForm onLogin={onPasswordLogin} isLoading={isLoading} error={authError} />
        ) : (
          <>
            <label>
              <span>İstifadəçi</span>
              <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                {activeUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.role}
                  </option>
                ))}
              </select>
            </label>
            {selectedUser && (
              <div className="login-role-preview">
                <TwoLine title={selectedUser.email} subtitle={selectedRole?.scope || selectedUser.role} />
                <StatusBadge status={selectedUser.role} />
              </div>
            )}
            <button className="primary-btn full" onClick={() => onLogin(selectedUserId)} disabled={!selectedUserId}>
              <ShieldCheck size={16} />
              Sistemə daxil ol
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function PasswordLoginForm({ onLogin, isLoading, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(event) {
    event.preventDefault();
    onLogin({ email, password });
  }

  return (
    <form className="login-password-form" onSubmit={submit}>
      <label>
        <span>Email</span>
        <input type="email" autoComplete="username" value={email} required onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        <span>Parol</span>
        <input type="password" autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="primary-btn full" type="submit" disabled={isLoading}>
        <ShieldCheck size={16} />
        {isLoading ? "Yoxlanılır..." : "Sistemə daxil ol"}
      </button>
    </form>
  );
}

// DashboardPage moved to ./pages/DashboardPage.jsx (lazy chunk)

function CrmPage({ customers, credits, orders = [], contracts = [], onOpenSalesOrder, onOpenCredit, onDeleteCustomer }) {
  const [pipelineFilter, setPipelineFilter] = useState("Hamısı");
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [selectedCustomerFin, setSelectedCustomerFin] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSegment, setCustomerSegment] = useState("Hamısı");
  const customerProfiles = useMemo(
    () =>
      customers.map((customer) => ({
        customer,
        profile: buildCustomer360(customer, { credits, orders, contracts }),
      })),
    [customers, credits, orders, contracts],
  );
  const delayed = customerProfiles.filter(({ customer, profile }) => profile.overdueCount > 0 || customer.delay > 0);
  const delayedDebt = delayed.reduce(
    (sum, { customer, profile }) => sum + Number(customer.debt || 0) + Number(profile.totalBalance || 0),
    0,
  );
  const platin = customers.filter((customer) => customer.category === "Platin");
  const creditsByCustomer = useMemo(
    () => new Map(customerProfiles.map(({ customer, profile }) => [customer.fin, profile.credits])),
    [customerProfiles],
  );
  const pipelineRows = useMemo(
    () => buildCrmPipelineRows(customers, credits, orders),
    [customers, credits, orders],
  );
  const pipelineStages = ["Hamısı", "Kredit uyğunluğu", "Təklif", "Upsell", "Təhvil sonrası", "Risk follow-up"];
  const customerSegments = ["Hamısı", "Aktiv kredit", "Gecikmə", "Açıq təhvil", "Borcsuz"];
  const visibleCustomerProfiles = customerProfiles.filter(
    (entry) => matchesCrmCustomerSegment(entry, customerSegment) && matchesCrmCustomerSearch(entry, customerSearch),
  );
  const visiblePipeline = pipelineRows.filter((row) => matchesCrmPipelineFilter(row, pipelineFilter));
  const pipelineValue = pipelineRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const selectedPipeline = pipelineRows.find((row) => row.id === selectedPipelineId) || null;
  const selectedCustomer = customers.find((customer) => customer.fin === selectedCustomerFin) || null;
  const portalReady = pipelineRows.filter((row) => row.activeCreditCount > 0 || row.openOrders > 0);
  const nextBestActions = [...pipelineRows]
    .sort((a, b) => {
      const scoreA = (a.stage === "Risk follow-up" ? 100 : 0) + a.value * (a.probability / 100);
      const scoreB = (b.stage === "Risk follow-up" ? 100 : 0) + b.value * (b.probability / 100);
      return scoreB - scoreA;
    })
    .slice(0, 4);
  const kanbanColumns = pipelineStages
    .filter((stage) => stage !== "Hamısı")
    .map((stage) => ({
      stage,
      rows: pipelineRows.filter((row) => row.stage === stage),
      value: pipelineRows
        .filter((row) => row.stage === stage)
        .reduce((sum, row) => sum + Number(row.value || 0), 0),
    }));

  return (
    <div className="stack">
      <section className="metric-grid three">
        <MetricCard label="Ümumi müştəri" value={customers.length} icon={Users} tone="primary" />
        <MetricCard label="Platin müştərilər" value={platin.length} icon={ShieldCheck} tone="success" />
        <MetricCard
          label="Gecikmiş ödəniş"
          value={`${delayed.length} müştəri`}
          trend={`${money(delayedDebt)} ümumi borc`}
          icon={CircleAlert}
          tone="danger"
        />
      </section>
      <section className="dashboard-grid crm-command-grid">
        <Panel className="span-2 crm-pipeline-panel">
          <PanelHeader
            title="CRM Pipeline"
            subtitle="Lead, təklif, kredit uyğunluğu və təhvil sonrası satış fürsətləri"
            icon={TrendingUp}
          />
          <div className="crm-pipeline-toolbar">
            <div className="tabs">
              {pipelineStages.map((stage) => (
                <button
                  key={stage}
                  className={pipelineFilter === stage ? "active" : ""}
                  onClick={() => setPipelineFilter(stage)}
                >
                  {stage}
                  <span>
                    {stage === "Hamısı"
                      ? pipelineRows.length
                      : pipelineRows.filter((row) => row.stage === stage).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="crm-pipeline-total">
              <span>Pipeline dəyəri</span>
              <strong>{money(pipelineValue)}</strong>
            </div>
          </div>
          <div className="crm-kanban-board">
            {kanbanColumns.map((column) => (
              <div className="crm-kanban-column" key={column.stage}>
                <div className="crm-kanban-head">
                  <strong>{column.stage}</strong>
                  <span>{column.rows.length} · {money(column.value)}</span>
                </div>
                <div className="crm-kanban-cards">
                  {column.rows.slice(0, 3).map((row) => (
                    <button
                      key={`${column.stage}-${row.id}`}
                      className={`crm-kanban-card${selectedPipelineId === row.id ? " is-selected" : ""}`}
                      onClick={() => setSelectedPipelineId(row.id)}
                      aria-pressed={selectedPipelineId === row.id}
                    >
                      <strong>{row.customer.name}</strong>
                      <span>{row.nextAction}</span>
                      <small>{money(row.value)} · {row.probability}%</small>
                    </button>
                  ))}
                  {column.rows.length === 0 && <span className="crm-kanban-empty">Boşdur</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="crm-pipeline-list">
            {visiblePipeline.map((row) => (
              <button
                key={row.id}
                className={`crm-pipeline-row${selectedPipelineId === row.id ? " is-selected" : ""}`}
                onClick={() => setSelectedPipelineId(row.id)}
                aria-pressed={selectedPipelineId === row.id}
              >
                <div>
                  <strong>{row.customer.name}</strong>
                  <span>
                    {row.source} · {row.nextAction}
                  </span>
                </div>
                <TwoLine title={money(row.value)} subtitle={`${row.probability}% ehtimal`} />
                <TwoLine title={row.owner} subtitle={`${money(row.limitLeft)} limit qalığı`} />
                <StatusBadge status={row.stage} />
              </button>
            ))}
          </div>
          {selectedPipeline && (
            <div className="crm-pipeline-selection" aria-live="polite">
              <div>
                <span>Secilmis musteri</span>
                <button
                  type="button"
                  className="crm-customer-link"
                  onClick={() => setSelectedCustomerFin(selectedPipeline.customer.fin)}
                >
                  {selectedPipeline.customer.name}
                </button>
                <small>FIN {selectedPipeline.customer.fin}</small>
              </div>
              <div>
                <span>Novbeti addim</span>
                <strong>{selectedPipeline.nextAction}</strong>
                <small>{selectedPipeline.owner} · {selectedPipeline.stage}</small>
              </div>
              <div>
                <span>Fursat</span>
                <strong>{money(selectedPipeline.value)}</strong>
                <small>{selectedPipeline.probability}% ehtimal</small>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="crm-automation-panel">
          <PanelHeader title="Növbəti addımlar" subtitle="Satış və risk komandası üçün avtomatik iş siyahısı" icon={CalendarClock} />
          <div className="crm-action-list">
            {nextBestActions.map((row) => (
              <div className="crm-action-row" key={`${row.id}-action`}>
                <div>
                  <strong>{row.customer.name}</strong>
                  <span>{row.nextAction}</span>
                </div>
                <StatusBadge status={row.stage} />
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel className="customer-portal-panel">
        <PanelHeader
          title="Müştəri portalı hazırlığı"
          subtitle="Balans, müqavilə, ödəniş tarixi və təhvil statusu müştəri kabinetində görünəcək"
          icon={Users}
        />
        <DataTable
          columns={["Müştəri", "Aktiv kredit", "Qalıq", "Növbəti ödəniş", "Açıq sifariş", "Portal statusu"]}
          rows={portalReady.map((row) => [
            <button
              type="button"
              className="crm-customer-name-btn"
              onClick={() => setSelectedCustomerFin(row.customer.fin)}
            >
              <TwoLine title={row.customer.name} subtitle={`FİN ${row.customer.fin}`} />
            </button>,
            row.activeCreditCount,
            money(row.totalBalance),
            row.nextPayment ? `${money(row.nextPayment.amount)} · ${row.nextPayment.due}` : "Yoxdur",
            row.openOrders,
            <StatusBadge status={row.totalBalance > 0 ? "Aktiv kabinet" : "Məlumat kabineti"} />,
          ])}
        />
      </Panel>
      <Panel>
        <PanelHeader title="Müştəri Reyestri" subtitle="FİN, müqavilə, cihaz, qalıq və gecikmə üzrə 360 nəzarət" />
        <div className="crm-registry-toolbar">
          <label className="crm-search-field">
            <span>Axtarış</span>
            <div>
              <Search size={15} />
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Müştəri, FİN, müqavilə, cihaz..."
              />
            </div>
          </label>
          <label>
            <span>Segment</span>
            <select value={customerSegment} onChange={(event) => setCustomerSegment(event.target.value)}>
              {customerSegments.map((segment) => (
                <option key={segment}>{segment}</option>
              ))}
            </select>
          </label>
          <button
            className="secondary-btn icon-only"
            type="button"
            title="Filterləri sıfırla"
            onClick={() => {
              setCustomerSearch("");
              setCustomerSegment("Hamısı");
            }}
          >
            <RefreshCw size={16} />
          </button>
          <div className="crm-registry-count">
            <span>Görünən müştəri</span>
            <strong>{visibleCustomerProfiles.length}</strong>
          </div>
        </div>
        <DataTable
          columns={["FİN", "Ad Soyad", "Telefon", "Kateqoriya", "Müqavilə", "Qalıq", "Növbəti ödəniş", "Status", "Əməliyyat"]}
          rows={visibleCustomerProfiles.map(({ customer, profile }) => {
            const customerCredits = creditsByCustomer.get(customer.fin) || [];
            const nextPayment = profile.nextPayment;
            const status =
              profile.overdueCount > 0 || customer.delay > 0
                ? `${Math.max(customer.delay || 0, nextPayment?.overdueDays || 0)} gün gecikmə`
                : profile.activeCreditCount > 0
                  ? "Aktiv kredit"
                  : profile.openOrders > 0
                    ? "Təhvil gözləyir"
                    : "Sağlam";

            return [
              <strong>{customer.fin}</strong>,
              <button
                type="button"
                className="crm-customer-name-btn"
                onClick={() => setSelectedCustomerFin(customer.fin)}
              >
                {customer.name}
              </button>,
              customer.phone,
              <StatusBadge status={customer.category} />,
              <CustomerCreditHistory credits={customerCredits} />,
              <strong>{money(profile.totalBalance + Number(customer.debt || 0))}</strong>,
              nextPayment ? `${money(nextPayment.monthly)} · ${nextPayment.nextDue}` : "Yoxdur",
              <StatusBadge status={status} />,
              onDeleteCustomer ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCustomer(customer.fin);
                  }}
                  title="Müştərini sil"
                >
                  Sil
                </button>
              ) : null,
            ];
          })}

        />
      </Panel>
      {selectedCustomer ? (
        <Customer360Modal
          customer={selectedCustomer}
          credits={credits}
          orders={orders}
          contracts={contracts}
          onOpenSalesOrder={onOpenSalesOrder}
          onOpenCredit={onOpenCredit}
          onClose={() => setSelectedCustomerFin("")}
        />
      ) : null}
    </div>
  );
}

function CustomerCreditHistory({ credits }) {
  if (credits.length === 0) return "Yoxdur";

  const latest = credits[0];
  const latestPlan = getCreditDisplayPlan(latest);
  const totalBalance = credits.reduce((sum, credit) => sum + getCreditDisplayPlan(credit).balance, 0);

  return (
    <div className="customer-credit-history">
      <strong>
        {credits.length} kredit · {money(totalBalance)} qalıq
      </strong>
      <span>
        {latest.id} · {latestPlan.months} ay · {money(latestPlan.monthly)}/ay
      </span>
    </div>
  );
}

function Customer360Modal({ customer, credits, orders, contracts, onOpenSalesOrder, onOpenCredit, onClose }) {
  const profile = useMemo(
    () => buildCustomer360(customer, { credits, orders, contracts }),
    [customer, credits, orders, contracts],
  );
  const nextPayment = profile.nextPayment;
  const latestPayments = profile.paymentRows.slice(0, 5);

  return (
    <div className="modal-shell customer-360-modal-shell" role="dialog" aria-modal="true" aria-labelledby="customer-360-title">
      <div className="modal-card customer-360-modal-card">
        <div className="modal-head customer-360-head">
          <div>
            <h2 id="customer-360-title">{customer.name}</h2>
            <p>FİN {customer.fin} üzrə müqavilə, cihaz, ödəniş və təhvil 360 baxışı</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>

        <div className="customer-360-body">
          <section className="customer-360-profile-grid">
            <div className="customer-360-profile-card">
              <span className="customer-360-avatar">{getCreditInitials(customer.name)}</span>
              <div>
                <strong>{customer.name}</strong>
                <span>{customer.category} · FİN {customer.fin}</span>
              </div>
            </div>
            <div className="customer-360-profile-field">
              <span>Telefon</span>
              <strong>{customer.phone || "Qeyd edilməyib"}</strong>
            </div>
            <div className="customer-360-profile-field">
              <span>Kredit limiti</span>
              <strong>{money(customer.limit)}</strong>
            </div>
            <div className="customer-360-profile-field">
              <span>Risk statusu</span>
              <StatusBadge status={profile.overdueCount > 0 || customer.delay > 0 ? "Gecikmə nəzarəti" : "Sağlam"} />
            </div>
          </section>

          <section className="customer-360-summary">
            <div>
              <span>Müqavilə məbləği</span>
              <strong>{money(profile.totalPurchased)}</strong>
            </div>
            <div>
              <span>Ödənilib</span>
              <strong>{money(profile.totalPaid)}</strong>
            </div>
            <div>
              <span>Qalıq</span>
              <strong>{money(profile.totalBalance)}</strong>
            </div>
            <div>
              <span>Aktiv kredit</span>
              <strong>{profile.activeCreditCount}</strong>
            </div>
            <div>
              <span>Gecikmə</span>
              <strong>{profile.overdueCount}</strong>
            </div>
          </section>

          <section className="customer-360-grid">
            <div className="customer-360-main">
              <Panel className="customer-360-section">
                <PanelHeader title="Kredit və satış müqavilələri" subtitle="Hər satış ayrı borc kimi saxlanılır" icon={FileText} />
                <div className="customer-360-contract-list">
                  {profile.agreements.length === 0 ? (
                    <EmptyState title="Müştəri üzrə müqavilə yoxdur" />
                  ) : (
                    profile.agreements.map((agreement) => (
                      <article
                        className={`customer-360-contract-card${agreement.paymentState?.isOverdue ? " is-overdue" : ""}`}
                        key={agreement.key}
                      >
                        <div className="customer-360-contract-head">
                          <div>
                            <span>{agreement.type}</span>
                            <h3>{agreement.contractId}</h3>
                            <p>{agreement.product}</p>
                          </div>
                          <StatusBadge status={agreement.status} />
                        </div>
                        <div className="customer-360-contract-meta">
                          <span>
                            Sifariş
                            {agreement.orderId && agreement.orderId !== "—" ? (
                              <button
                                className="module-link-btn"
                                type="button"
                                onClick={() => onOpenSalesOrder?.(agreement.orderId)}
                                data-testid="crm-360-order-link"
                              >
                                {agreement.orderId}
                              </button>
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <span>
                            Kredit
                            {agreement.creditId && agreement.creditId !== "—" ? (
                              <button
                                className="module-link-btn"
                                type="button"
                                onClick={() => onOpenCredit?.(agreement.creditId)}
                                data-testid="crm-360-credit-link"
                              >
                                {agreement.creditId}
                              </button>
                            ) : (
                              <strong>—</strong>
                            )}
                          </span>
                          <span>Tarix <strong>{agreement.date || "—"}</strong></span>
                          <span>Mənbə <strong>{agreement.source}</strong></span>
                        </div>
                        <div className="customer-360-contract-values">
                          <div>
                            <span>Müqavilə</span>
                            <strong>{money(agreement.amount)}</strong>
                          </div>
                          <div>
                            <span>İlkin / ödənilib</span>
                            <strong>{money(agreement.initialPayment)} / {money(agreement.paid)}</strong>
                          </div>
                          <div>
                            <span>Qalıq</span>
                            <strong>{money(agreement.balance)}</strong>
                          </div>
                          <div>
                            <span>Növbəti</span>
                            <strong>{agreement.monthly > 0 ? `${money(agreement.monthly)} · ${agreement.nextDue}` : "—"}</strong>
                          </div>
                        </div>
                        {agreement.plan ? (
                          <details className="customer-360-schedule-preview">
                            <summary>Ödəniş cədvəli · {agreement.paidMonths}/{agreement.months} ay · {agreement.remainingMonths} qalıb</summary>
                            <div className="customer-360-schedule-scroll">
                              {agreement.plan.installments.map((installment) => (
                                <div className="customer-360-schedule-row" key={`${agreement.id}-${installment.month}`}>
                                  <span>{installment.month}. ay</span>
                                  <strong>{money(installment.amount)}</strong>
                                  <em>{installment.due}</em>
                                  <StatusBadge status={getInstallmentStatus(installment)} />
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <div className="customer-360-direct-note">
                            <span>Satış balansı</span>
                            <strong>{agreement.balance > 0 ? `${money(agreement.balance)} qalıq` : "Tam ödənilib"}</strong>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Alınan cihazlar" subtitle="Hər cihaz üzrə ödənilən və qalan məbləğ" icon={Package} />
                <DataTable
                  columns={["Cihaz", "Müqavilə", "Sifariş", "Məbləğ", "Ödənilib", "Qalıq", "Status"]}
                  rows={profile.devices.map((device) => [
                    <TwoLine title={device.product} subtitle={`${device.qty} ədəd${device.serials.length ? ` · ${device.serials.join(", ")}` : ""}`} />,
                    device.contractId,
                    device.orderId,
                    money(device.amount),
                    money(device.paid),
                    <strong>{money(device.balance)}</strong>,
                    <StatusBadge status={device.status || "Aktiv"} />,
                  ])}
                />
              </Panel>
            </div>

            <aside className="customer-360-side">
              <Panel className="customer-360-section">
                <PanelHeader title="Yığım və risk" subtitle="Növbəti ödəniş, gecikmə və təhvil nəzarəti" icon={CreditCard} />
                <div className="customer-360-risk-list">
                  <div>
                    <span>Növbəti ödəniş</span>
                    <strong>{nextPayment ? `${money(nextPayment.monthly)} · ${nextPayment.nextDue}` : "Yoxdur"}</strong>
                  </div>
                  <div>
                    <span>Gecikən müqavilə</span>
                    <strong>{profile.overdueCount}</strong>
                  </div>
                  <div>
                    <span>Açıq təhvil</span>
                    <strong>{profile.openOrders}</strong>
                  </div>
                  <div>
                    <span>Ümumi qalıq</span>
                    <strong>{money(profile.totalBalance + Number(customer.debt || 0))}</strong>
                  </div>
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Son ödənişlər" subtitle="Əsas məbləğ və gecikmə gəliri ayrı göstərilir" icon={Wallet} />
                <div className="customer-360-payment-feed">
                  {latestPayments.length === 0 ? (
                    <EmptyState title="Ödəniş tarixçəsi yoxdur" />
                  ) : (
                    latestPayments.map((payment, index) => (
                      <div className="customer-360-payment-row" key={`${payment.creditId}-${payment.date}-${index}`}>
                        <div>
                          <strong>{payment.contractId || payment.creditId}</strong>
                          <span>{payment.product}</span>
                        </div>
                        <div>
                          <strong>{money(Number(payment.principal || 0) + Number(payment.penalty || 0))}</strong>
                          <span>Əsas {money(payment.principal)} · Gecikmə {money(payment.penalty)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel className="customer-360-section">
                <PanelHeader title="Müştəri əlaqəsi" subtitle="Satış və yığım komandası üçün sürətli dosye" icon={Users} />
                <div className="customer-360-contact-card">
                  <div>
                    <span>FİN</span>
                    <strong>{customer.fin}</strong>
                  </div>
                  <div>
                    <span>Telefon</span>
                    <strong>{customer.phone || "—"}</strong>
                  </div>
                  <div>
                    <span>Kateqoriya</span>
                    <strong>{customer.category}</strong>
                  </div>
                  <div>
                    <span>Müqavilə sayı</span>
                    <strong>{profile.agreements.length}</strong>
                  </div>
                </div>
              </Panel>
            </aside>
          </section>
        </div>
      </div>
    </div>
  );
}

function SalesPage({
  orders,
  stock,
  employees,
  selectedOrder,
  setSelectedOrder,
  advanceOrder,
  onEditOrder,
  onDeleteOrder,
}) {
  const [salesFilter, setSalesFilter] = useState("Hamısı");
  const [sellerFilter, setSellerFilter] = useState("Bütün satıcılar");
  const [warehouseFilter, setWarehouseFilter] = useState("Bütün anbarlar");
  const [salesSearch, setSalesSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const sellers = employees.filter((employee) => employee.department === "Satış");
  const salesBonusRows = useMemo(() => buildSalesBonusRows(orders), [orders]);
  const sellerOptions = [
    ...new Set([...sellers.map((seller) => seller.name), ...salesBonusRows.map((row) => row.seller)].filter(Boolean)),
  ];
  const warehouseOptions = [
    ...new Set(orders.map((order) => order.warehouseName || "Anbar seçilməyib").filter(Boolean)),
  ];
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const sellerNames = getOrderSellerBonuses(order).map((item) => item.seller);
        const matchesSeller = sellerFilter === "Bütün satıcılar" || sellerNames.includes(sellerFilter);
        const matchesWarehouse = warehouseFilter === "Bütün anbarlar" || (order.warehouseName || "Anbar seçilməyib") === warehouseFilter;
        return (
          matchesSalesOrderFilter(order, salesFilter) &&
          matchesSeller &&
          matchesWarehouse &&
          matchesSalesOrderSearch(order, salesSearch) &&
          matchesSalesDateRange(order, dateFrom, dateTo)
        );
      }),
    [orders, salesFilter, sellerFilter, warehouseFilter, salesSearch, dateFrom, dateTo],
  );
  const selected = orders.find((order) => order.id === selectedOrder) || filteredOrders[0] || orders[0];
  const selectedBonusRows = selected ? buildSalesBonusRows([selected]) : [];
  const selectedCreditPlan =
    selected?.paymentMethod === "Kredit"
      ? buildCreditPlan({
          total: selected.amount,
          initialPayment: selected.initialPayment ?? selected.paid ?? 0,
          months: selected.creditMonths || 12,
        })
      : null;
  const activeOrders = orders.filter((order) => order.status !== "Təhvil verilib");
  const creditOrders = orders.filter((order) => getOrderPaymentMethod(order) === "Kredit");
  const balanceTotal = orders.reduce((sum, order) => sum + getOrderBalance(order), 0);
  const visibleSalesTotal = total(filteredOrders, "amount");
  const visibleCashIn = filteredOrders.reduce((sum, order) => sum + getSalesCashImpact(order), 0);
  const visibleBalance = filteredOrders.reduce((sum, order) => sum + getOrderBalance(order), 0);
  const visibleBonusTotal = filteredOrders.reduce((sum, order) => sum + getOrderBonusAmount(order), 0);
  const visibleDeliveryWaiting = filteredOrders.filter((order) => order.status !== "Təhvil verilib").length;
  const riskOrders = filteredOrders.filter((order) => getSalesOrderRiskStatus(order) !== "Sağlam" && getSalesOrderRiskStatus(order) !== "Tamamlanıb");
  const bonusTotal = total(salesBonusRows, "bonusAmount");
  const averageCheck = orders.length > 0 ? Math.round(total(orders, "amount") / orders.length) : 0;
  const deliveryWaiting = orders.filter((order) => order.status !== "Təhvil verilib").length;
  const salesFilterOptions = ["Hamısı", "Kredit", "Nağd", "Qalıqlı", "Təhvil gözləyən", "Tamamlanan", "Riskli"];
  const maxSellerBonus = Math.max(
    1,
    ...sellerOptions.map((seller) => total(salesBonusRows.filter((row) => row.seller === seller), "bonusAmount")),
  );
  const sellerBonusStats = sellerOptions.map((sellerName) => {
    const sellerProfile = sellers.find((seller) => seller.name === sellerName);
    const rows = salesBonusRows.filter((row) => row.seller === sellerName);
    return {
      name: sellerName,
      initials: sellerProfile?.initials || getCreditInitials(sellerName),
      bonusAmount: total(rows, "bonusAmount"),
      orderCount: new Set(rows.map((row) => row.orderId)).size,
      progress: (total(rows, "bonusAmount") / maxSellerBonus) * 100,
    };
  });
  const actionOrders = (riskOrders.length > 0 ? riskOrders : orders)
    .filter((order) => getOrderBalance(order) > 0 || order.status !== "Təhvil verilib")
    .slice(0, 4);
  const criticalStock = [...stock]
    .sort((a, b) => a.total - a.reserved - (b.total - b.reserved))
    .slice(0, 5);
  const resetSalesFilters = () => {
    setSalesFilter("Hamısı");
    setSellerFilter("Bütün satıcılar");
    setWarehouseFilter("Bütün anbarlar");
    setSalesSearch("");
    setDateFrom("");
    setDateTo("");
  };
  const exportVisibleSales = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Sifariş", "Tarix", "Müştəri", "FIN", "Məhsul", "Ödəniş tipi", "Anbar", "Müqavilə", "Kredit", "Məbləğ", "Daxil olub", "Qalıq", "Bonus", "Status"],
      ...filteredOrders.map((order) => [
        order.id,
        order.date,
        order.customer,
        order.fin,
        summarizeOrderProducts(order),
        getOrderPaymentMethod(order),
        order.warehouseName || "",
        order.contractId || "",
        order.creditId || "",
        order.amount,
        order.paid,
        getOrderBalance(order),
        getOrderBonusAmount(order),
        order.status,
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `satis-reyestri-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktiv sifarişlər" value={activeOrders.length} icon={ShoppingCart} tone="primary" />
        <MetricCard label="Ümumi dövriyyə" value={money(total(orders, "amount"))} icon={Wallet} tone="success" />
        <MetricCard label="Daxil olan" value={money(total(orders, "paid"))} icon={Check} tone="info" />
        <MetricCard
          label="Qalıq"
          value={money(balanceTotal)}
          icon={CircleAlert}
          tone="warning"
        />
      </section>

      <Panel className="sales-control-panel">
        <PanelHeader
          title="Satış nəzarəti"
          subtitle="Ödəniş, təhvil və bonus üzrə operativ göstəricilər"
          icon={Filter}
        />
        <div className="sales-control-grid">
          <div className="sales-control-tile">
            <span>Kredit satışları</span>
            <strong>{creditOrders.length}</strong>
            <small>{money(total(creditOrders, "amount"))} portfel</small>
          </div>
          <div className="sales-control-tile">
            <span>Təhvil gözləyən</span>
            <strong>{deliveryWaiting}</strong>
            <small>Anbar çıxışı izlənir</small>
          </div>
          <div className="sales-control-tile">
            <span>Bonus fondu</span>
            <strong>{money(bonusTotal)}</strong>
            <small>{salesBonusRows.length} bonus sətri</small>
          </div>
          <div className="sales-control-tile">
            <span>Orta çek</span>
            <strong>{money(averageCheck)}</strong>
            <small>{orders.length} sifariş üzrə</small>
          </div>
        </div>
        <div className="sales-alert-list">
          {actionOrders.map((order) => (
            <button key={order.id} className="sales-alert-row" onClick={() => setSelectedOrder(order.id)}>
              <div>
                <strong>
                  {order.id} · {order.customer}
                </strong>
                <span>
                  {getOrderBalance(order) > 0
                    ? `${money(getOrderBalance(order))} qalıq`
                    : getOrderDeliveryStatus(order)}
                </span>
              </div>
              <StatusBadge status={order.status} />
            </button>
          ))}
        </div>
      </Panel>

      <section className="sales-registry-summary" aria-label="Satış filter nəticələri">
        <div>
          <span>Görünən satış</span>
          <strong>{money(visibleSalesTotal)}</strong>
          <small>{filteredOrders.length} sifariş</small>
        </div>
        <div>
          <span>Kassaya daxil olan</span>
          <strong>{money(visibleCashIn)}</strong>
          <small>Nağd/kart/ilkin ödəniş</small>
        </div>
        <div>
          <span>Qalıq borc</span>
          <strong>{money(visibleBalance)}</strong>
          <small>{riskOrders.length} risk siqnalı</small>
        </div>
        <div>
          <span>Bonus</span>
          <strong>{money(visibleBonusTotal)}</strong>
          <small>{salesBonusRows.length} bonus sətri</small>
        </div>
        <div>
          <span>Təhvil gözləyən</span>
          <strong>{visibleDeliveryWaiting}</strong>
          <small>Anbar rezervi izlənir</small>
        </div>
      </section>

      <section className="dashboard-grid">
        <Panel>
          <PanelHeader title="Satıcı bonus performansı" subtitle="Satış sifarişlərindən real bonus hesabı" />
          <div className="seller-bonus-list">
            {sellerBonusStats.length === 0 ? (
              <EmptyState title="Satıcı bonus datası yoxdur" />
            ) : (
              sellerBonusStats.map((seller) => (
                <div className="seller-bonus-row" key={seller.name}>
                  <div className="seller-bonus-main">
                    <AvatarLine initials={seller.initials} title={seller.name} subtitle={`${seller.orderCount} sifariş`} />
                    <strong>{money(seller.bonusAmount)}</strong>
                  </div>
                  <ProgressRow value={seller.progress} compact />
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Stok siqnalları" subtitle="Satış üçün ən həssas qalıqlar" />
          <div className="stock-stack">
            {criticalStock.map((item) => (
              <div className="stock-row stock-signal" key={item.product}>
                <span>{item.product}</span>
                <strong>{item.total - item.reserved}</strong>
                <small>{item.reserved} rezerv</small>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Sifariş Kartı" subtitle={selected?.id || "Sifariş seçilməyib"} />
          {selected ? (
            <div className="detail-card sales-order-card">
              <div className="sales-order-head">
                <div>
                  <span className="sales-order-id">{selected.id}</span>
                  <h3>{selected.customer}</h3>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <p>{selected.products}</p>
              <div className="order-detail-grid">
                <div>
                  <span>Ödəniş</span>
                  <strong>{getOrderPaymentMethod(selected)}</strong>
                  <small>{money(Number(selected.paid || 0))} daxil olub</small>
                </div>
                <div>
                  <span>Qalıq</span>
                  <strong>{money(getOrderBalance(selected))}</strong>
                  <small>{selected.paymentStatus || "Ödəniş izlənir"}</small>
                </div>
                <div>
                  <span>Anbar</span>
                  <strong>{selected.warehouseName || "Anbar qeyd edilməyib"}</strong>
                  <small>{getOrderDeliveryStatus(selected)}</small>
                </div>
                <div>
                  <span>Bonus</span>
                  <strong>{money(total(selectedBonusRows, "bonusAmount"))}</strong>
                  <small>{getOrderBonusText(selected)}</small>
                </div>
              </div>
              <div className="sales-context-grid">
                <div>
                  <span>Müqavilə</span>
                  <strong>{selected.contractId || "Yoxdur"}</strong>
                </div>
                <div>
                  <span>Kredit</span>
                  <strong>{selected.creditId || "Yoxdur"}</strong>
                </div>
                <div>
                  <span>Kassa təsiri</span>
                  <strong>{money(getSalesCashImpact(selected))}</strong>
                </div>
                <div>
                  <span>Risk</span>
                  <StatusBadge status={getSalesOrderRiskStatus(selected)} />
                </div>
              </div>
              {selectedCreditPlan && (
                <div className="selected-credit-summary">
                  <span>İlkin: {money(selectedCreditPlan.initialPayment)}</span>
                  <span>Qalıq: {money(selectedCreditPlan.balance)}</span>
                  <span>{selectedCreditPlan.months} ay · {money(selectedCreditPlan.monthly)}/ay</span>
                </div>
              )}
              {selectedBonusRows.length > 0 && (
                <div className="seller-bonus-chips">
                  {selectedBonusRows.map((row) => (
                    <span key={row.id}>
                      {getShortSellerName(row.seller)} <strong>{money(row.bonusAmount)}</strong>
                    </span>
                  ))}
                </div>
              )}
              <WorkflowSteps activeStage={selected.status} compact />
              <div className="operation-row-actions">
                <button className="secondary-btn" onClick={() => onEditOrder(selected.id)}>
                  <Pencil size={16} />
                  Redaktə
                </button>
                <button className="secondary-btn danger-outline" onClick={() => onDeleteOrder(selected.id)}>
                  <Trash2 size={16} />
                  Sil
                </button>
              </div>
              <button className="secondary-btn full" onClick={() => advanceOrder(selected.id)}>
                <ChevronRight size={16} />
                Növbəti mərhələ
              </button>
            </div>
          ) : (
            <EmptyState title="Sifariş seçilməyib" />
          )}
        </Panel>
      </section>

      <Panel className="sales-registry-panel">
        <PanelHeader title="Satış reyestri" subtitle="Filter edib sifariş, ödəniş, anbar və bonus vəziyyətini izləyin" />
        <div className="sales-filter-toolbar">
          <div className="tabs">
            {salesFilterOptions.map((item) => (
              <button key={item} className={salesFilter === item ? "active" : ""} onClick={() => setSalesFilter(item)}>
                <span>{item}</span>
                <strong>{orders.filter((order) => matchesSalesOrderFilter(order, item)).length}</strong>
              </button>
            ))}
          </div>
          <div className="sales-filter-controls">
            <label className="sales-search-field">
              <span>Axtarış</span>
              <div>
                <Search size={15} />
                <input
                  value={salesSearch}
                  onChange={(event) => setSalesSearch(event.target.value)}
                  placeholder="Sifariş, müştəri, FİN, cihaz..."
                />
              </div>
            </label>
            <label className="sales-seller-filter">
              <span>Satıcı</span>
              <select value={sellerFilter} onChange={(event) => setSellerFilter(event.target.value)}>
                <option>Bütün satıcılar</option>
                {sellerOptions.map((seller) => (
                  <option key={seller}>{seller}</option>
                ))}
              </select>
            </label>
            <label className="sales-seller-filter">
              <span>Anbar</span>
              <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
                <option>Bütün anbarlar</option>
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse}>{warehouse}</option>
                ))}
              </select>
            </label>
            <label className="sales-date-filter">
              <span>Başlanğıc</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="sales-date-filter">
              <span>Son</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <button className="secondary-btn icon-only" type="button" title="Filterləri sıfırla" onClick={resetSalesFilters}>
              <RefreshCw size={16} />
            </button>
            <button className="secondary-btn sales-export-btn" type="button" onClick={exportVisibleSales}>
              <Download size={16} />
              Excel
            </button>
          </div>
        </div>
        <DataTable
          columns={["№", "Müştəri", "Məhsul", "Ödəniş", "Anbar", "Sənədlər", "Bonus", "Qalıq", "Status", "Əməliyyat"]}
          rows={filteredOrders.map((order) => [
            <button
              className={`row-link ${selected?.id === order.id ? "active" : ""}`}
              onClick={() => setSelectedOrder(order.id)}
            >
              {order.id}
            </button>,
            <TwoLine title={order.customer} subtitle={`FİN ${order.fin}`} />,
            <TwoLine title={summarizeOrderProducts(order)} subtitle={order.date} />,
            <TwoLine title={money(Number(order.paid || 0))} subtitle={order.paymentStatus || getOrderPaymentMethod(order)} />,
            <TwoLine title={order.warehouseName || "Anbar seçilməyib"} subtitle={getOrderDeliveryStatus(order)} />,
            <TwoLine title={order.contractId || "Müqavilə yoxdur"} subtitle={order.creditId || getSalesOrderRiskStatus(order)} />,
            <TwoLine title={money(getOrderBonusAmount(order))} subtitle={getOrderBonusText(order)} />,
            getOrderBalance(order) > 0 ? <strong>{money(getOrderBalance(order))}</strong> : <StatusBadge status="Ödənilib" />,
            <StatusBadge status={order.status} />,
            <div className="row-actions operation-table-actions">
              <button className="text-btn" onClick={() => onEditOrder(order.id)}>Redaktə</button>
              <button className="text-btn danger" onClick={() => onDeleteOrder(order.id)}>Sil</button>
            </div>,
          ])}
        />
      </Panel>
    </div>
  );
}

export function buildAggregateWarehouseStock(warehouses, warehouseStock) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map();

  Object.entries(warehouseStock).forEach(([warehouseId, items]) => {
    const warehouse = warehouseById.get(warehouseId);
    items.forEach((item) => {
      const current = byProduct.get(item.product) || {
        product: item.product,
        total: 0,
        reserved: 0,
        price: item.price,
        distribution: [],
      };
      current.total += Number(item.total || 0);
      current.reserved += Number(item.reserved || 0);
      current.price = item.price || current.price;
      current.distribution.push({
        warehouse: warehouse?.name || warehouseId,
        total: Number(item.total || 0),
        available: Number(item.total || 0) - Number(item.reserved || 0),
      });
      byProduct.set(item.product, current);
    });
  });

  return [...byProduct.values()].sort((a, b) => a.product.localeCompare(b.product, "az"));
}

export function getAvailableQuantity(item) {
  return Math.max(0, Number(item.total || 0) - Number(item.reserved || 0));
}

// Satış üçün real sərbəst qalıq — mənfi ola bilər (backorder / sifariş gözləyən miqdar).
export function getFreeQuantity(item) {
  return Number(item?.total || 0) - Number(item?.reserved || 0);
}

export function getShortageQuantity(item) {
  return Math.max(0, -getFreeQuantity(item));
}

export function getWarehouseStockSummary(items, capacity = 0, products = []) {
  const productsByName = buildProductLookup(products);
  const totalQty = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reservedQty = total(items, "reserved");
  const availableQty = Math.max(0, totalQty - reservedQty);
  const value = items.reduce((sum, item) => sum + getAvailableQuantity(item) * Number(item.price || 0), 0);
  return {
    sku: items.length,
    total: totalQty,
    reserved: reservedQty,
    available: availableQty,
    value,
    lowStock: items.filter((item) => isLowStockItem(item, productsByName)).length,
    utilization: capacity > 0 ? Math.min(100, Math.round((totalQty / capacity) * 100)) : 0,
    reservedRate: totalQty > 0 ? (reservedQty / totalQty) * 100 : 0,
  };
}

export function buildWarehouseSummaries(warehouses, warehouseStock, products = []) {
  return warehouses.map((warehouse) => ({
    warehouse,
    ...getWarehouseStockSummary(warehouseStock[warehouse.id] || [], Number(warehouse.capacity || 0), products),
  }));
}

export function buildWarehouseStockAlerts(warehouses, warehouseStock, products = []) {
  const productsByName = buildProductLookup(products);

  return warehouses.flatMap((warehouse) =>
    (warehouseStock[warehouse.id] || [])
      .map((item) => ({
        item,
        reorderPoint: getReorderPoint(item, productsByName),
      }))
      .filter(({ item, reorderPoint }) => reorderPoint > 0 && getAvailableQuantity(item) <= reorderPoint)
      .map(({ item, reorderPoint }) => ({
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          city: warehouse.city,
          product: item.product,
          total: Number(item.total || 0),
          reserved: Number(item.reserved || 0),
          available: getAvailableQuantity(item),
          reorderPoint,
          status: getAvailableQuantity(item) <= Math.max(1, Math.floor(reorderPoint / 2)) ? "Kritik stok" : "Aşağı stok",
        })),
  );
}

export function buildWarehouseTransferSuggestions(warehouses, warehouseStock) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const byProduct = new Map();

  Object.entries(warehouseStock).forEach(([warehouseId, items]) => {
    items.forEach((item) => {
      const rows = byProduct.get(item.product) || [];
      rows.push({
        warehouseId,
        warehouseName: warehouseById.get(warehouseId)?.name || warehouseId,
        city: warehouseById.get(warehouseId)?.city || "",
        product: item.product,
        price: Number(item.price || 0),
        total: Number(item.total || 0),
        reserved: Number(item.reserved || 0),
        available: getAvailableQuantity(item),
      });
      byProduct.set(item.product, rows);
    });
  });

  return [...byProduct.entries()].flatMap(([product, rows]) => {
    const targets = rows.filter((row) => row.available <= 3).sort((a, b) => a.available - b.available);
    const sources = rows.filter((row) => row.available >= 6).sort((a, b) => b.available - a.available);
    return targets.flatMap((target) => {
      const source = sources.find((item) => item.warehouseId !== target.warehouseId);
      if (!source) return [];
      const qty = Math.max(1, Math.min(5 - target.available, source.available - 4));
      if (qty <= 0) return [];
      return {
        id: `${product}-${source.warehouseId}-${target.warehouseId}`,
        product,
        fromWarehouseId: source.warehouseId,
        fromWarehouse: source.warehouseName,
        toWarehouseId: target.warehouseId,
        toWarehouse: target.warehouseName,
        qty,
        reason: `${target.warehouseName} üzrə satış üçün ${target.available} qalıb`,
      };
    });
  });
}

export function filterWarehouseItems(items, filter) {
  if (filter === "Satış üçün var") {
    return items.filter((item) => item.total - item.reserved > 0);
  }
  if (filter === "Rezervdə") {
    return items.filter((item) => item.reserved > 0);
  }
  if (filter === "Aşağı stok") {
    return items.filter((item) => item.total - item.reserved <= 3);
  }
  return items;
}

export function WarehouseStockToolbar({ filter, setFilter }) {
  const filters = ["Hamısı", "Satış üçün var", "Rezervdə", "Aşağı stok"];
  return (
    <div className="warehouse-stock-toolbar">
      <div>
        <h2>Anbar üzrə mallar</h2>
        <p>Filter seçib ümumi və ya seçilmiş anbar üzrə qalıqlara baxın</p>
      </div>
      <div className="tabs">
        {filters.map((item) => (
          <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WarehouseDistribution({ distribution }) {
  return (
    <div className="warehouse-distribution">
      {distribution
        .filter((item) => item.total > 0)
        .map((item) => (
          <span key={item.warehouse}>
            {item.warehouse}: <strong>{item.available}</strong>
          </span>
        ))}
    </div>
  );
}

export function DeliveryOrdersPanel({ orders, isAllWarehouses, warehouseStock = {}, onCompleteDelivery }) {
  return (
    <div className="delivery-orders-panel">
      <PanelHeader
        title="Təhvil verilməli məhsullar"
        subtitle={
          isAllWarehouses
            ? "Bütün anbarlar üzrə rezervdə olan və təhvil gözləyən sifarişlər"
            : "Seçilmiş anbardan çıxarılmalı rezerv məhsullar"
        }
      />
      <DataTable
        columns={["Sifariş", "Müştəri", "Məhsullar", "Anbar", "Ödəniş", "Rezerv", "Əməliyyat"]}
        rows={orders.map((order) => {
          const stockCheck = getDeliveryStockCheck(order, warehouseStock);
          return [
            <strong>{order.id}</strong>,
            <TwoLine title={order.customer} subtitle={order.fin} />,
            <OrderProductLines lines={order.productLines} />,
            order.warehouseName || "Baş Anbar",
            <StatusBadge status={order.paymentStatus || order.paymentMethod || "Nağd"} />,
            <TwoLine
              title={<StatusBadge status={stockCheck.status} />}
              subtitle={
                stockCheck.partial
                  ? `${stockCheck.plan.deliverableTotal} ədəd indi · ${stockCheck.plan.shortageTotal} backorder`
                  : stockCheck.ok
                    ? `${stockCheck.plan?.remainingTotal ?? getDeliveryTotalQuantity(order)} ədəd rezervdə`
                    : stockCheck.reason
              }
            />,
            <button
              className="text-btn"
              disabled={!stockCheck.ok}
              title={stockCheck.reason}
              onClick={() => onCompleteDelivery(order.id)}
            >
              {stockCheck.partial ? "Qismən təhvil ver" : "Təhvil verildi"}
            </button>,

          ];
        })}
      />
    </div>
  );
}

function OrderProductLines({ lines }) {
  return (
    <div className="order-product-lines">
      {lines.map((line) => (
        <span key={`${line.product}-${line.qty}`}>
          {line.product} <strong>x{line.qty}</strong>
          {Array.isArray(line.serials) && line.serials.length > 0 && (
            <small>{line.serials.join(", ")}</small>
          )}
        </span>
      ))}
    </div>
  );
}

export function WarehouseControlPanel({ summary, deliveryCount, alerts, isAllWarehouses, onSelect }) {
  return (
    <Panel className="warehouse-control-panel">
      <PanelHeader
        title="Anbar nəzarəti"
        subtitle={isAllWarehouses ? "Bütün anbarlar üzrə canlı əməliyyat xülasəsi" : "Seçilmiş anbar üzrə əməliyyat xülasəsi"}
        icon={SlidersHorizontal}
      />
      <div className="warehouse-control-grid">
        <div className="warehouse-control-tile">
          <span>Satış üçün</span>
          <strong>{summary.available} ədəd</strong>
          <small>{money(summary.value)} dəyər</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Rezerv yükü</span>
          <strong>{summary.reserved} ədəd</strong>
          <small>{percent(summary.reservedRate)} stok rezervdə</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Təhvil növbəsi</span>
          <strong>{deliveryCount}</strong>
          <small>Anbardan çıxmalı sifariş</small>
        </div>
        <div className="warehouse-control-tile">
          <span>Doluluq</span>
          <strong>{summary.utilization}%</strong>
          <small>{summary.sku} məhsul çeşidi</small>
        </div>
      </div>
      <div className="warehouse-signal-list">
        {alerts.slice(0, 4).map((alert) => (
          <button key={`${alert.warehouseId}-${alert.product}`} className="warehouse-signal-row" onClick={() => onSelect(alert.warehouseId)}>
            <div>
              <strong>{alert.product}</strong>
              <span>
                {alert.warehouseName} · satış üçün {alert.available} ədəd
              </span>
            </div>
            <StatusBadge status={alert.status} />
          </button>
        ))}
        {alerts.length === 0 && (
          <div className="warehouse-signal-empty">
            <Check size={16} />
            Kritik stok siqnalı yoxdur
          </div>
        )}
      </div>
    </Panel>
  );
}

export function WarehouseTransferPanel({ suggestions, onTransferStock }) {
  return (
    <div className="warehouse-transfer-panel">
      <PanelHeader
        title="Transfer tövsiyələri"
        subtitle="Aşağı qalıqlı anbarlara artıq stok olan anbardan daxili transfer"
        icon={Truck}
      />
      <DataTable
        columns={["Məhsul", "Haradan", "Haraya", "Miqdar", "Səbəb", "Əməliyyat"]}
        rows={suggestions.map((suggestion) => [
          <strong>{suggestion.product}</strong>,
          suggestion.fromWarehouse,
          suggestion.toWarehouse,
          `${suggestion.qty} ədəd`,
          suggestion.reason,
          <button className="text-btn" onClick={() => onTransferStock(suggestion)}>
            Transfer et
          </button>,
        ])}
      />
    </div>
  );
}

export function BarcodeBadge({ barcode, qrPayload }) {
  const widths = String(barcode)
    .slice(0, 12)
    .split("")
    .map((digit) => 1 + (Number(digit) % 3));
  const widthWithGaps = widths.reduce((sum, width) => sum + width + 2, 0);

  return (
    <div className="barcode-badge" title={qrPayload}>
      <svg className="barcode-lines" viewBox={`0 0 ${widthWithGaps} 18`} preserveAspectRatio="none" aria-hidden="true">
        {widths.map((width, index) => {
          const x = widths.slice(0, index).reduce((sum, item) => sum + item + 2, 0);
          return <rect key={`${barcode}-${index}`} x={x} y="0" width={width} height="18" />;
        })}
      </svg>
      <small>{barcode}</small>
    </div>
  );
}

const warehouseBalanceFilterDefaults = {
  productQuery: "",
  warehouseId: "all",
  category: "all",
  stockStatus: "all",
  reserveStatus: "all",
  serialStatus: "all",
  belowMinimum: false,
};

function getWarehouseBalanceStatus(available, reorderPoint) {
  if (available <= 0) return "Stok tükənib";
  if (reorderPoint > 0 && available <= Math.max(1, Math.floor(reorderPoint / 2))) return "Kritik stok";
  if (reorderPoint > 0 && available <= reorderPoint) return "Aşağı stok";
  return "Normal";
}

function buildWarehouseBalanceRows({ warehouses = [], warehouseStock = {}, products = [], purchaseOrders = [], view = "products", warehouseId = "all" }) {
  const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const createRow = (productName, catalogProduct = null) => ({
    key: catalogProduct?.id || normalize(productName),
    product: productName,
    productId: catalogProduct?.id || "",
    category: catalogProduct?.category || "Kataloqu olmayan",
    sku: catalogProduct?.sku || "—",
    unit: catalogProduct?.unit || "ədəd",
    serialTracked: Boolean(catalogProduct?.serialTracked),
    costPrice: Number(catalogProduct?.costPrice || 0),
    salePrice: Number(catalogProduct?.salePrice || 0),
    reorderLevel: Number(catalogProduct?.reorderLevel || 0),
    total: 0,
    reserved: 0,
    orderedQty: 0,
    openPoCount: 0,
    latestPoId: "",
    warehouseDistribution: [],
  });

  if (view === "products") {
    const rowsByProduct = new Map();
    products.filter((product) => product.status !== "Passiv").forEach((product) => {
      rowsByProduct.set(normalize(product.name), createRow(product.name, product));
    });

    Object.entries(warehouseStock).forEach(([sourceWarehouseId, items]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return;
      (items || []).forEach((item) => {
        const key = normalize(item.product);
        const catalogProduct = productsByName.get(key);
        const row = rowsByProduct.get(key) || createRow(item.product, catalogProduct);
        row.total += Number(item.total || 0);
        row.reserved += Number(item.reserved || 0);
        row.salePrice = row.salePrice || Number(item.price || 0);
        row.serialTracked = catalogProduct?.serialTracked ?? isSerialTrackedProduct(item);
        row.reorderLevel = getReorderPoint(item, productsByName);
        row.warehouseDistribution.push({
          warehouse: warehouseById.get(sourceWarehouseId)?.name || sourceWarehouseId,
          warehouseId: sourceWarehouseId,
          total: Number(item.total || 0),
          available: getAvailableQuantity(item),
        });
        rowsByProduct.set(key, row);
      });
    });

    return [...rowsByProduct.values()]
      .map((row) => {
        const free = row.total - row.reserved;
        const available = Math.max(0, free);
        const shortage = Math.max(0, -free);
        const coverage = orderCoverage.get(normalize(row.product)) || { orderedQty: 0, count: 0, latest: null };
        return {
          ...row,
          warehouseName: row.warehouseDistribution.length === 0 ? "—" : `${row.warehouseDistribution.length} anbar`,
          warehouseCount: row.warehouseDistribution.length,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, row.reorderLevel),
          stockValue: row.total * row.costPrice,
          salesValue: row.total * row.salePrice,
        };
      })
      .sort((a, b) => a.product.localeCompare(b.product, "az"));
  }

  return Object.entries(warehouseStock)
    .flatMap(([sourceWarehouseId, items]) => {
      if (warehouseId !== "all" && sourceWarehouseId !== warehouseId) return [];
      const warehouse = warehouseById.get(sourceWarehouseId);
      return (items || []).map((item) => {
        const catalogProduct = productsByName.get(normalize(item.product));
        const totalQty = Number(item.total || 0);
        const reserved = Number(item.reserved || 0);
        const available = getAvailableQuantity(item);
        const free = getFreeQuantity(item);
        const shortage = getShortageQuantity(item);
        const reorderLevel = getReorderPoint(item, productsByName);
        const coverage = orderCoverage.get(normalize(item.product)) || { orderedQty: 0, count: 0, latest: null };
        const costPrice = Number(catalogProduct?.costPrice || 0);
        const salePrice = Number(catalogProduct?.salePrice || item.price || 0);
        return {
          key: `${sourceWarehouseId}-${catalogProduct?.id || item.product}`,
          warehouseId: sourceWarehouseId,
          warehouseName: warehouse?.name || sourceWarehouseId,
          product: item.product,
          productId: catalogProduct?.id || "",
          category: catalogProduct?.category || "Kataloqu olmayan",
          sku: catalogProduct?.sku || "—",
          unit: catalogProduct?.unit || "ədəd",
          serialTracked: catalogProduct?.serialTracked ?? isSerialTrackedProduct(item),
          costPrice,
          salePrice,
          reorderLevel,
          total: totalQty,
          reserved,
          available,
          free,
          shortage,
          orderedQty: Number(coverage.orderedQty || 0),
          openPoCount: Number(coverage.count || 0),
          latestPoId: coverage.latest?.id || "",
          warehouseDistribution: [],
          status: shortage > 0 ? "Çatışmazlıq" : getWarehouseBalanceStatus(available, reorderLevel),
          stockValue: totalQty * costPrice,
          salesValue: totalQty * salePrice,
        };
      });
    })
    .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "az") || a.product.localeCompare(b.product, "az"));
}

function filterWarehouseBalanceRows(rows, filters, globalQuery = "") {
  const search = normalize([filters.productQuery, globalQuery].filter(Boolean).join(" "));
  return rows.filter((row) => {
    const matchesSearch = !search || normalize(`${row.product} ${row.sku} ${row.category} ${row.warehouseName}`).includes(search);
    const matchesCategory = filters.category === "all" || row.category === filters.category;
    const matchesStock =
      filters.stockStatus === "all" ||
      (filters.stockStatus === "below" && (row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq")) ||
      (filters.stockStatus === "available" && row.available > 0) ||
      (filters.stockStatus === "empty" && row.available <= 0) ||
      (filters.stockStatus === "shortage" && row.shortage > 0);
    const matchesReserve =
      filters.reserveStatus === "all" ||
      (filters.reserveStatus === "reserved" && row.reserved > 0) ||
      (filters.reserveStatus === "free" && row.reserved === 0);
    const matchesSerial =
      filters.serialStatus === "all" ||
      (filters.serialStatus === "serial" && row.serialTracked) ||
      (filters.serialStatus === "batch" && !row.serialTracked);
    const matchesMinimum = !filters.belowMinimum || row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq";
    return matchesSearch && matchesCategory && matchesStock && matchesReserve && matchesSerial && matchesMinimum;
  });
}

function exportWarehouseBalanceCsv(rows, view) {
  const headers = ["Kateqoriya", "Məhsul", "SKU", "Anbar", "Qalıq", "Minimum", "Rezerv", "Mövcud", "Sifarişdə", "Vahid", "Maya", "Stok dəyəri", "Satış qiyməti", "Status"];
  const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csvRows = rows.map((row) => [
    row.category,
    row.product,
    row.sku,
    view === "products" ? row.warehouseName : row.warehouseName,
    row.total,
    row.reorderLevel,
    row.reserved,
    row.available,
    row.orderedQty,
    row.unit,
    row.costPrice,
    row.stockValue,
    row.salePrice,
    row.status,
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `anbar-qaliqlari-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportDeliveryQueueCsv(rows) {
  const headers = ["Sifariş", "Müqavilə", "Kredit", "Müştəri", "FIN", "Məhsul", "Miqdar", "Anbar", "Ödəniş", "Qalıq", "Stok statusu", "Qeyd"];
  const escapeValue = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csvRows = rows.map((order) => [
    order.id,
    order.contractId || "",
    order.creditId || "",
    order.customer,
    order.fin || "",
    summarizeOrderProducts(order),
    order.deliveryQty || getDeliveryTotalQuantity(order),
    order.warehouseName || "",
    order.paymentStatus || getOrderPaymentMethod(order),
    getOrderBalance(order),
    order.stockCheck?.status || getDeliveryStockCheck(order).status,
    order.stockCheck?.reason || "",
  ].map(escapeValue).join(","));
  const blob = new Blob([`\uFEFF${headers.map(escapeValue).join(",")}\n${csvRows.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tehvil-reyestri-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const warehouseImportHeaderAliases = {
  product: ["məhsul", "məhsul adı", "product", "name"],
  sku: ["sku", "kod", "code"],
  warehouse: ["anbar", "warehouse"],
  qty: ["miqdar", "qalıq", "qty", "quantity"],
  salePrice: ["satış qiyməti", "satış", "sale price", "sale_price", "price"],
  costPrice: ["alış qiyməti", "maya", "cost price", "cost_price"],
  category: ["kateqoriya", "category"],
  reorderLevel: ["minimum stok", "minimum", "reorder level", "reorder_level"],
  unit: ["ölçü vahidi", "vahid", "unit"],
  serialTracked: ["serial izləmə", "serial", "imei", "serial tracked"],
};

function parseDelimitedCsv(text) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = cleanText.split("\n").find((line) => line.trim()) || "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];
    if (character === '"') {
      if (quoted && cleanText[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && character === "\n") {
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function parseWarehouseImportNumber(value) {
  const raw = String(value ?? "").trim().replace(/[₼\s]/g, "");
  if (!raw) return null;
  const commaIndex = raw.lastIndexOf(",");
  const dotIndex = raw.lastIndexOf(".");
  const normalizedValue = commaIndex > dotIndex
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const number = Number(normalizedValue);
  return Number.isFinite(number) ? number : null;
}

function parseWarehouseImportBoolean(value) {
  const normalizedValue = normalize(value)
    .replaceAll("ə", "e")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]/g, "");
  if (["beli", "yes", "true", "1"].includes(normalizedValue)) return true;
  if (["xeyr", "no", "false", "0"].includes(normalizedValue)) return false;
  return null;
}

function getWarehouseImportCell(record, aliases) {
  for (const alias of aliases) {
    const value = record[normalize(alias)];
    if (value !== undefined) return value;
  }
  return "";
}

function parseWarehouseImportCsv(text, warehouses = []) {
  const csvRows = parseDelimitedCsv(text);
  if (csvRows.length === 0) return { rows: [], errors: ["CSV faylı boşdur."] };

  const header = csvRows[0].map((value) => normalize(value));
  const hasProduct = warehouseImportHeaderAliases.product.some((alias) => header.includes(normalize(alias)));
  const hasWarehouse = warehouseImportHeaderAliases.warehouse.some((alias) => header.includes(normalize(alias)));
  const hasQuantity = warehouseImportHeaderAliases.qty.some((alias) => header.includes(normalize(alias)));
  if (!hasProduct || !hasWarehouse || !hasQuantity) {
    return { rows: [], errors: ["CSV başlığında Məhsul, Anbar və Miqdar sütunları olmalıdır."] };
  }

  const warehouseByName = new Map(warehouses.flatMap((warehouse) => [
    [normalize(warehouse.name), warehouse],
    [normalize(warehouse.code), warehouse],
  ]));
  const rows = [];
  const errors = [];

  csvRows.slice(1).forEach((cells, index) => {
    const record = Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex] || ""]));
    const product = String(getWarehouseImportCell(record, warehouseImportHeaderAliases.product)).trim();
    const warehouseInput = String(getWarehouseImportCell(record, warehouseImportHeaderAliases.warehouse)).trim();
    const quantity = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.qty));
    const salePrice = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.salePrice));
    const costPrice = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.costPrice));
    const reorderLevel = parseWarehouseImportNumber(getWarehouseImportCell(record, warehouseImportHeaderAliases.reorderLevel));
    const warehouse = warehouseByName.get(normalize(warehouseInput));
    const lineNumber = index + 2;

    if (!product) {
      errors.push(`Sətir ${lineNumber}: məhsul adı boşdur.`);
      return;
    }
    if (!warehouse) {
      errors.push(`Sətir ${lineNumber}: anbar tapılmadı (${warehouseInput || "boş"}).`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push(`Sətir ${lineNumber}: miqdar müsbət tam ədəd olmalıdır.`);
      return;
    }
    if ([salePrice, costPrice, reorderLevel].some((value) => value !== null && value < 0)) {
      errors.push(`Sətir ${lineNumber}: qiymət və minimum stok mənfi ola bilməz.`);
      return;
    }

    rows.push({
      product,
      sku: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.sku)).trim().toUpperCase(),
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      qty: quantity,
      salePrice,
      costPrice,
      category: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.category)).trim(),
      reorderLevel: reorderLevel === null ? null : Math.max(0, Math.round(reorderLevel)),
      unit: String(getWarehouseImportCell(record, warehouseImportHeaderAliases.unit)).trim(),
      serialTracked: parseWarehouseImportBoolean(getWarehouseImportCell(record, warehouseImportHeaderAliases.serialTracked)),
      lineNumber,
    });
  });

  return { rows, errors };
}

function downloadWarehouseImportTemplate() {
  const headers = ["Məhsul", "SKU", "Anbar", "Miqdar", "Satış qiyməti", "Alış qiyməti", "Kateqoriya", "Minimum stok", "Ölçü vahidi", "Serial izləmə"];
  const blob = new Blob([`\uFEFF${headers.join(";")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anbar-toplu-import-sablonu.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function WarehouseBalanceFilters({ filters, warehouses, categories, open, onChange, onApply, onClear }) {
  if (!open) return null;

  return (
    <section className="warehouse-balance-filters">
      <label>
        <span>Məhsul / qrup</span>
        <div className="warehouse-filter-search">
          <Search size={16} />
          <input value={filters.productQuery} placeholder="Məhsul adı, SKU və ya qrup" onChange={(event) => onChange("productQuery", event.target.value)} />
        </div>
      </label>
      <label>
        <span>Anbar</span>
        <select value={filters.warehouseId} onChange={(event) => onChange("warehouseId", event.target.value)}>
          <option value="all">Bütün anbarlar</option>
          {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </select>
      </label>
      <label>
        <span>Kateqoriya</span>
        <select value={filters.category} onChange={(event) => onChange("category", event.target.value)}>
          <option value="all">Bütün kateqoriyalar</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>
        <span>Qalıq statusu</span>
        <select value={filters.stockStatus} onChange={(event) => onChange("stockStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="below">Minimumdan aşağı</option>
          <option value="available">Stokda var</option>
          <option value="empty">Stok tükənib</option>
          <option value="shortage">Çatışmazlıq (backorder)</option>
        </select>
      </label>
      <label>
        <span>Rezerv statusu</span>
        <select value={filters.reserveStatus} onChange={(event) => onChange("reserveStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="reserved">Yalnız rezervli</option>
          <option value="free">Rezervsiz</option>
        </select>
      </label>
      <label>
        <span>Serial izləmə</span>
        <select value={filters.serialStatus} onChange={(event) => onChange("serialStatus", event.target.value)}>
          <option value="all">Hamısı</option>
          <option value="serial">IMEI / serial</option>
          <option value="batch">Batch</option>
        </select>
      </label>
      <label className="warehouse-minimum-toggle">
        <input type="checkbox" checked={filters.belowMinimum} onChange={(event) => onChange("belowMinimum", event.target.checked)} />
        <span>Minimumdan aşağı olanlar</span>
      </label>
      <div className="warehouse-filter-actions">
        <button type="button" className="secondary-btn" onClick={onClear}>Təmizlə</button>
        <button type="button" className="primary-btn" onClick={onApply}>Tətbiq et</button>
      </div>
    </section>
  );
}

function WarehouseBalanceTable({ rows, view, onEditProduct, onCreateProduct, onSelectWarehouse }) {
  const totals = rows.reduce((summary, row) => ({
    total: summary.total + Number(row.total || 0),
    reserved: summary.reserved + Number(row.reserved || 0),
    available: summary.available + Number(row.available || 0),
    orderedQty: summary.orderedQty + Number(row.orderedQty || 0),
    stockValue: summary.stockValue + Number(row.stockValue || 0),
    salesValue: summary.salesValue + Number(row.salesValue || 0),
  }), { total: 0, reserved: 0, available: 0, orderedQty: 0, stockValue: 0, salesValue: 0 });
  const locationHeading = view === "products" ? "Anbarlar" : "Anbar";

  return (
    <div className="warehouse-balance-table-wrap">
      <table className="warehouse-balance-table">
        <thead>
          <tr>
            <th>Kateqoriya</th><th>Məhsul</th><th>SKU</th><th>{locationHeading}</th><th>Qalıq</th><th>Minimum</th><th>Rezerv</th><th>Mövcud</th><th>Sifarişdə</th><th>Vahid</th><th>Maya</th><th>Stok dəyəri</th><th>Satış</th><th>Status</th><th>Əməliyyat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.category}</td>
              <td><strong>{row.product}</strong></td>
              <td className="warehouse-sku">{row.sku}</td>
              <td>{view === "products" ? <WarehouseDistribution distribution={row.warehouseDistribution} /> : row.warehouseName}</td>
              <td>{row.total}</td>
              <td>{row.reorderLevel || "—"}</td>
              <td>{row.reserved}</td>
              <td className={row.shortage > 0 || row.status !== "Normal" ? "balance-qty risk" : "balance-qty good"}>
                {row.shortage > 0 ? `-${row.shortage}` : row.available}
                {row.shortage > 0 && <small style={{ display: "block", opacity: 0.75 }}>sifariş gözləyir</small>}
              </td>
              <td>{row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "—"}</td>
              <td>{row.unit}</td>
              <td>{money(row.costPrice)}</td>
              <td>{money(row.stockValue)}</td>
              <td>{money(row.salePrice)}</td>
              <td><StatusBadge status={row.status} /></td>
              <td>
                {view === "warehouses" ? (
                  <button className="text-btn" onClick={() => onSelectWarehouse(row.warehouseId)}>Anbara keç</button>
                ) : row.productId ? (
                  <button className="text-btn" onClick={() => onEditProduct(row.productId)}>Redaktə</button>
                ) : (
                  <button className="text-btn" onClick={onCreateProduct}>Kataloqa əlavə et</button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="15" className="warehouse-balance-empty">Seçilmiş filtrə uyğun qalıq tapılmadı.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan="4">Cəmi</td><td>{totals.total}</td><td>—</td><td>{totals.reserved}</td><td className="balance-qty good">{totals.available}</td><td>{totals.orderedQty || "—"}</td><td>—</td><td>—</td><td>{money(totals.stockValue)}</td><td>{money(totals.salesValue)}</td><td>—</td><td>—</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function WarehouseBalancesWorkspace({
  warehouses,
  warehouseStock,
  products,
  purchaseOrders = [],
  query,
  onReceiveStock,
  onOpenImport,
  onCreateProduct,
  onEditProduct,
  onSelectWarehouse,
  onOpenOperations,
  onTrackAction,
}) {
  const [view, setView] = useState("products");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [draftFilters, setDraftFilters] = useState(() => ({ ...warehouseBalanceFilterDefaults }));
  const [activeFilters, setActiveFilters] = useState(() => ({ ...warehouseBalanceFilterDefaults }));
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "az")),
    [products],
  );
  const balanceRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view, warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, view, activeFilters.warehouseId],
  );
  const visibleRows = useMemo(
    () => filterWarehouseBalanceRows(balanceRows, activeFilters, query),
    [balanceRows, activeFilters, query],
  );
  const productRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view: "products", warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, activeFilters.warehouseId],
  );
  const warehouseRows = useMemo(
    () => buildWarehouseBalanceRows({ warehouses, warehouseStock, products, purchaseOrders, view: "warehouses", warehouseId: activeFilters.warehouseId }),
    [warehouses, warehouseStock, products, purchaseOrders, activeFilters.warehouseId],
  );

  function changeDraftFilter(key, value) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setActiveFilters({ ...draftFilters });
  }

  function clearFilters() {
    const next = { ...warehouseBalanceFilterDefaults };
    setDraftFilters(next);
    setActiveFilters(next);
  }

  function showReplenishmentRows() {
    const next = { ...activeFilters, stockStatus: "below", belowMinimum: true };
    const replenishmentCount = balanceRows.filter((row) => row.status === "Aşağı stok" || row.status === "Kritik stok" || row.status === "Stok tükənib" || row.status === "Çatışmazlıq").length;
    setDraftFilters(next);
    setActiveFilters(next);
    setFiltersOpen(true);
    onTrackAction?.("Ehtiyat tamamlama siyahısı açıldı", `${replenishmentCount} məhsul/anbar sətrinə minimum stok filtri tətbiq edildi`);
  }

  function handleExport() {
    exportWarehouseBalanceCsv(visibleRows, view);
    onTrackAction?.("Anbar qalıqları CSV ixrac edildi", `${visibleRows.length} sətir · ${view === "products" ? "məhsullar üzrə" : "anbarlar üzrə"}`);
  }

  function handlePrint() {
    onTrackAction?.("Anbar qalıqları çap üçün açıldı", `${visibleRows.length} sətir · ${view === "products" ? "məhsullar üzrə" : "anbarlar üzrə"}`);
    document.body.classList.add("warehouse-print-mode");
    const clearPrintMode = () => document.body.classList.remove("warehouse-print-mode");
    window.addEventListener("afterprint", clearPrintMode, { once: true });
    window.print();
    window.setTimeout(clearPrintMode, 1000);
  }

  function selectWarehouse(warehouseId) {
    const next = { ...activeFilters, warehouseId };
    setDraftFilters(next);
    setActiveFilters(next);
    onSelectWarehouse(warehouseId);
  }

  return (
    <section className="warehouse-balance-workspace">
      <div className="warehouse-balance-toolbar">
        <div className="warehouse-balance-tabs" role="tablist" aria-label="Qalıq görünüşü">
          <button type="button" role="tab" aria-selected={view === "products"} className={view === "products" ? "active" : ""} onClick={() => setView("products")}>
            Məhsullar üzrə <strong>{productRows.length}</strong>
          </button>
          <button type="button" role="tab" aria-selected={view === "warehouses"} className={view === "warehouses" ? "active" : ""} onClick={() => setView("warehouses")}>
            Anbarlar üzrə <strong>{warehouseRows.length}</strong>
          </button>
        </div>
        <div className="warehouse-balance-actions">
          <button type="button" className="secondary-btn" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
            <Filter size={16} /> Filter
          </button>
          <button type="button" className="secondary-btn" onClick={handlePrint}>
            <FileText size={16} /> Çap
          </button>
          <button type="button" className="secondary-btn" onClick={handleExport}>
            <Download size={16} /> İxrac CSV
          </button>
          <button type="button" className="secondary-btn" onClick={showReplenishmentRows}>
            <RefreshCw size={16} /> Ehtiyatı tamamla
          </button>
          <div className="warehouse-action-menu">
            <button type="button" className="primary-btn" aria-expanded={actionMenuOpen} onClick={() => setActionMenuOpen((open) => !open)}>
              <ShoppingCart size={16} /> Əməliyyatlar <ChevronRight size={15} />
            </button>
            {actionMenuOpen && (
              <div className="warehouse-action-menu-popover">
                <button type="button" onClick={() => { setActionMenuOpen(false); onReceiveStock(); }}><Plus size={15} /> Mədaxil et</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenImport(); }}><Upload size={15} /> Toplu import</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onCreateProduct(); }}><Package size={15} /> Məhsul yarat</button>
                <button type="button" onClick={() => { setActionMenuOpen(false); onOpenOperations(); }}><Warehouse size={15} /> Anbar idarəetməsi</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <WarehouseBalanceFilters
        filters={draftFilters}
        warehouses={warehouses}
        categories={categories}
        open={filtersOpen}
        onChange={changeDraftFilter}
        onApply={applyFilters}
        onClear={clearFilters}
      />
      <div className="warehouse-balance-table-meta">
        <span>{visibleRows.length} qalıq sətri</span>
        <strong>{view === "products" ? "Məhsullar üzrə cari qalıq" : "Anbarlar üzrə cari qalıq"}</strong>
      </div>
      <WarehouseBalanceTable
        rows={visibleRows}
        view={view}
        onEditProduct={onEditProduct}
        onCreateProduct={onCreateProduct}
        onSelectWarehouse={selectWarehouse}
      />
    </section>
  );
}

// WarehousePage moved to ./pages/WarehousePage.jsx (lazy chunk)

function DeliveriesPage({ orders, warehouseStock = {}, warehouses = [], onCompleteDelivery }) {
  const [deliveryFilter, setDeliveryFilter] = useState("Hamısı");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const warehouseById = useMemo(() => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])), [warehouses]);

  function decorateDeliveryOrder(order) {
    const warehouseId = order.warehouseId || warehouses[0]?.id || "";
    const warehouse = warehouseById.get(warehouseId);
    const orderWithWarehouse = { ...order, warehouseId };
    const enriched = enrichDeliveryOrder(orderWithWarehouse);
    const stockCheck = getDeliveryStockCheck(orderWithWarehouse, warehouseStock);

    return {
      ...enriched,
      warehouseId,
      warehouseName: order.warehouseName || warehouse?.name || warehouseId,
      stockCheck,
      displayStage: getDeliveryDisplayStage(order),
      deliveryQty: getDeliveryTotalQuantity(order),
    };
  }

  const deliveryOrders = useMemo(
    () =>
      orders
        .filter(isDeliveryQueueOrder)
        .map(decorateDeliveryOrder),
    [orders, warehouseStock, warehouses, warehouseById],
  );

  const completedOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status === "Təhvil verilib")
        .map(decorateDeliveryOrder)
        .sort((a, b) => (parsePaymentDate(b.deliveredAt)?.getTime() || 0) - (parsePaymentDate(a.deliveredAt)?.getTime() || 0))
        .slice(0, 6),
    [orders, warehouseStock, warehouses, warehouseById],
  );

  const readyOrders = deliveryOrders.filter((order) => order.stockCheck.ok);
  const blockedOrders = deliveryOrders.filter((order) => !order.stockCheck.ok);
  const creditOrders = deliveryOrders.filter((order) => getOrderPaymentMethod(order) === "Kredit");
  const totalQty = deliveryOrders.reduce((sum, order) => sum + Number(order.deliveryQty || 0), 0);
  const averageAge =
    deliveryOrders.length > 0
      ? Math.round(deliveryOrders.reduce((sum, order) => sum + order.ageDays, 0) / deliveryOrders.length)
      : 0;

  const filterItems = [
    { label: "Hamısı", count: deliveryOrders.length },
    { label: "Təhvilə hazır", count: readyOrders.length },
    { label: "Stok problemi", count: blockedOrders.length },
    { label: "Kredit", count: creditOrders.length },
    { label: "Nağd", count: deliveryOrders.filter((order) => getOrderPaymentMethod(order) !== "Kredit").length },
  ];

  const visibleOrders = deliveryOrders.filter((order) => {
    const searchText = normalize(
      [
        order.id,
        order.contractId,
        order.customer,
        order.fin,
        order.warehouseName,
        summarizeOrderProducts(order),
        getOrderPaymentMethod(order),
      ].join(" "),
    );
    const matchesSearch = !deliverySearch.trim() || searchText.includes(normalize(deliverySearch));
    const matchesWarehouse = warehouseFilter === "all" || order.warehouseId === warehouseFilter;
    const matchesFilter =
      deliveryFilter === "Hamısı" ||
      (deliveryFilter === "Təhvilə hazır" && order.stockCheck.ok) ||
      (deliveryFilter === "Stok problemi" && !order.stockCheck.ok) ||
      (deliveryFilter === "Kredit" && getOrderPaymentMethod(order) === "Kredit") ||
      (deliveryFilter === "Nağd" && getOrderPaymentMethod(order) !== "Kredit");
    return matchesSearch && matchesWarehouse && matchesFilter;
  });

  const selectedOrder =
    visibleOrders.find((order) => order.id === selectedDeliveryId) ||
    deliveryOrders.find((order) => order.id === selectedDeliveryId) ||
    visibleOrders[0] ||
    deliveryOrders[0];

  function completeSelected(order) {
    if (!order || !order.stockCheck.ok) return;
    onCompleteDelivery(order.id);
    setSelectedDeliveryId("");
  }

  function exportVisibleDeliveries() {
    exportDeliveryQueueCsv(visibleOrders);
  }

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Təhvil növbəsi" value={deliveryOrders.length} trend={`${totalQty} ədəd cihaz`} icon={Truck} tone="primary" />
        <MetricCard label="Təhvilə hazır" value={readyOrders.length} trend="Rezerv və stok uyğundur" icon={Check} tone="success" />
        <MetricCard label="Stok problemi" value={blockedOrders.length} trend="Bloklanmış təhvil" icon={CircleAlert} tone={blockedOrders.length ? "danger" : "success"} />
        <MetricCard label="Orta gözləmə" value={`${averageAge} gün`} trend={formatPaymentDate(parsePaymentDate(currentBusinessDate))} icon={CalendarClock} tone="info" />
      </section>

      <Panel className="delivery-control-panel">
        <PanelHeader
          title="Təhvil verilməli məhsullar"
          subtitle="Yalnız satışdan rezervə düşmüş və anbardan çıxarılmalı sifarişlər görünür"
          icon={Truck}
        />
        <div className="delivery-filter-toolbar delivery-command-bar">
          <div className="tabs delivery-filter-tabs">
            {filterItems.map((item) => (
              <button
                key={item.label}
                className={deliveryFilter === item.label ? "active" : ""}
                onClick={() => setDeliveryFilter(item.label)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          <label className="delivery-driver-filter">
            <span>Anbar</span>
            <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)}>
              <option value="all">Bütün anbarlar</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <label className="delivery-search">
            <Search size={16} />
            <input
              value={deliverySearch}
              placeholder="Müştəri, müqavilə, cihaz..."
              onChange={(event) => setDeliverySearch(event.target.value)}
            />
          </label>
          <button className="secondary-btn delivery-export-btn" type="button" onClick={exportVisibleDeliveries}>
            <Download size={16} />
            CSV
          </button>
        </div>
        <div className="delivery-control-grid">
          <div className="delivery-control-tile">
            <span>Mərhələ</span>
            <strong>Anbarda</strong>
            <small>Son əməliyyat: Təhvil verildi</small>
          </div>
          <div className="delivery-control-tile">
            <span>Kreditli sifariş</span>
            <strong>{creditOrders.length}</strong>
            <small>Hər satış ayrıca borc kimi qalır</small>
          </div>
          <div className="delivery-control-tile">
            <span>Rezervdə məhsul</span>
            <strong>{readyOrders.reduce((sum, order) => sum + Number(order.deliveryQty || 0), 0)}</strong>
            <small>Təhvilə hazır ədəd</small>
          </div>
          <div className="delivery-control-tile">
            <span>Filter nəticəsi</span>
            <strong>{visibleOrders.length}</strong>
            <small>{deliveryFilter} · {warehouseFilter === "all" ? "Bütün anbarlar" : "Seçilmiş anbar"}</small>
          </div>
        </div>
      </Panel>

      <section className="delivery-queue-layout">
        <Panel className="delivery-registry-panel delivery-registry-main">
          <PanelHeader title="Təhvil reyestri" subtitle="Sifarişə daxil olun, cihazları yoxlayın və anbardan çıxarın" />
          <DataTable
            columns={["Sifariş / müqavilə", "Müştəri", "Cihazlar", "Anbar", "Ödəniş", "Stok", "Əməliyyat"]}
            rows={visibleOrders.map((order) => [
              <button
                className={`row-link ${selectedOrder?.id === order.id ? "active" : ""}`}
                onClick={() => setSelectedDeliveryId(order.id)}
              >
                <TwoLine title={order.id} subtitle={order.contractId || "Müqavilə yoxdur"} />
              </button>,
              <TwoLine title={order.customer} subtitle={order.fin || order.phone || "Müştəri məlumatı"} />,
              <OrderProductLines lines={order.productLines} />,
              <TwoLine title={order.warehouseName || "Anbar qeyd edilməyib"} subtitle={order.displayStage} />,
              <TwoLine
                title={order.paymentStatus || getOrderPaymentMethod(order)}
                subtitle={order.balance > 0 ? `${money(order.balance)} qalıq` : "Qalıq yoxdur"}
              />,
              <TwoLine
                title={<StatusBadge status={order.stockCheck.status} />}
                subtitle={
                  order.stockCheck.partial
                    ? `${order.stockCheck.plan.deliverableTotal} ədəd indi · ${order.stockCheck.plan.shortageTotal} backorder`
                    : order.stockCheck.ok
                      ? `${order.stockCheck.plan?.remainingTotal ?? order.deliveryQty} ədəd rezervdə`
                      : order.stockCheck.reason
                }
              />,
              <button
                className="text-btn"
                disabled={!order.stockCheck.ok}
                title={order.stockCheck.reason}
                onClick={() => completeSelected(order)}
              >
                {order.stockCheck.partial ? "Qismən təhvil ver" : "Təhvil verildi"}
              </button>,

            ])}
          />
        </Panel>

        <Panel className="delivery-detail-panel">
          <PanelHeader title="Təhvil kartı" subtitle={selectedOrder?.id || "Sifariş seçilməyib"} />
          {selectedOrder ? (
            <div className="delivery-detail-card">
              <div className="delivery-detail-head">
                <div>
                  <h3>{selectedOrder.customer}</h3>
                  <span>{selectedOrder.address || "Ünvan qeyd edilməyib"}</span>
                </div>
                <StatusBadge status={selectedOrder.stockCheck.status} />
              </div>
              <div className="delivery-detail-grid">
                <div>
                  <span>Müqavilə</span>
                  <strong>{selectedOrder.contractId || "—"}</strong>
                  <small>{selectedOrder.id}</small>
                </div>
                <div>
                  <span>Anbar</span>
                  <strong>{selectedOrder.warehouseName || "Anbar yoxdur"}</strong>
                  <small>{selectedOrder.displayStage}</small>
                </div>
                <div>
                  <span>Ödəniş</span>
                  <strong>{selectedOrder.paymentStatus || getOrderPaymentMethod(selectedOrder)}</strong>
                  <small>{selectedOrder.balance > 0 ? `${money(selectedOrder.balance)} qalıq` : "Qalıq yoxdur"}</small>
                </div>
                <div>
                  <span>Gözləmə</span>
                  <strong>{selectedOrder.ageDays} gün</strong>
                  <small>{selectedOrder.date || currentBusinessDate}</small>
                </div>
              </div>
              <OrderProductLines lines={selectedOrder.productLines} />
              {selectedOrder.stockCheck.plan?.lines?.length ? (
                <div className="delivery-plan-lines">
                  {selectedOrder.stockCheck.plan.lines.map((line) => (
                    <div className="delivery-plan-line" key={line.product}>
                      <span>{line.product}</span>
                      <small>
                        Sifariş {line.ordered} · Təhvil verilib {line.delivered} · İndi {line.deliverable}
                        {line.shortage > 0 ? ` · Backorder ${line.shortage}` : ""}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className={`delivery-stock-check ${selectedOrder.stockCheck.ok ? "ok" : "danger"}`}>
                <div>
                  <strong>{selectedOrder.stockCheck.status}</strong>
                  <span>{selectedOrder.stockCheck.reason}</span>
                </div>
                <b>{selectedOrder.stockCheck.plan?.remainingTotal ?? selectedOrder.deliveryQty} ədəd</b>
              </div>
              <button
                className="primary-btn full"
                disabled={!selectedOrder.stockCheck.ok}
                title={selectedOrder.stockCheck.reason}
                onClick={() => completeSelected(selectedOrder)}
              >
                <Check size={16} />
                {selectedOrder.stockCheck.partial
                  ? `Qismən təhvil ver (${selectedOrder.stockCheck.plan.deliverableTotal})`
                  : "Təhvil verildi"}
              </button>

            </div>
          ) : (
            <EmptyState title="Təhvil gözləyən sifariş yoxdur" />
          )}
        </Panel>
      </section>

      <Panel className="delivery-history-panel">
        <PanelHeader title="Son təhvil tarixçəsi" subtitle="Tamamlanan sifarişlər yalnız izləmə üçün göstərilir" />
        <DataTable
          columns={["Sifariş", "Müştəri", "Cihaz", "Anbar", "Təhvil tarixi"]}
          rows={completedOrders.map((order) => [
            <strong>{order.id}</strong>,
            <TwoLine title={order.customer} subtitle={order.fin} />,
            summarizeOrderProducts(order),
            order.warehouseName || "—",
            order.deliveredAt || "—",
          ])}
        />
      </Panel>
    </div>
  );
}

// FinancePage moved to ./pages/FinancePage.jsx (lazy chunk)

function InvoicesPage({ invoices, summary, invoiceSettings = {}, onExport, onOpenSalesOrder }) {
  const [invoiceFilter, setInvoiceFilter] = useState("Hamısı");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const invoiceControl = useMemo(() => buildInvoiceControlSummary(invoices), [invoices]);
  const agingRows = useMemo(() => buildInvoiceAgingRows(invoices), [invoices]);
  const maxAgingBalance = Math.max(1, ...agingRows.map((row) => row.balance));
  const exportInvoices = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Faktura", "Sifaris", "Musteri", "FIN", "Mehsullar", "Net", "EDV", "Cemi", "Qaliq", "E-qaimə"],
      ...visibleInvoices.map((invoice) => [
        invoice.id,
        invoice.orderId,
        invoice.customer,
        invoice.fin,
        invoice.products,
        invoice.netAmount,
        invoice.vatAmount,
        invoice.totalAmount,
        invoice.balance,
        invoice.eTaxStatus,
      ]),
    ];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `fakturalar-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
    onExport?.(`Faktura PDF/Excel (${visibleInvoices.length} faktura)`);
  };
  const filterItems = [
    { label: "Hamısı", count: invoices.length },
    { label: "Ödənilib", count: invoices.filter((invoice) => invoice.status === "Ödənilib").length },
    {
      label: "Qismən ödənilib",
      count: invoices.filter((invoice) => invoice.status === "Qismən ödənilib").length,
    },
    {
      label: "Ödəniş gözləyir",
      count: invoices.filter((invoice) => invoice.status === "Ödəniş gözləyir").length,
    },
    {
      label: "Göndərişə hazır",
      count: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
    },
  ];
  const visibleInvoices = invoices.filter((invoice) => {
    if (invoiceFilter === "Hamısı") return true;
    if (invoiceFilter === "Göndərişə hazır") return invoice.eTaxStatus === invoiceFilter;
    return invoice.status === invoiceFilter;
  });

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Faktura sayı" value={summary.count} icon={FileText} tone="primary" />
        <MetricCard label="Ümumi məbləğ" value={money(summary.total)} icon={Wallet} tone="success" />
        <MetricCard label="ƏDV" value={money(summary.vat)} icon={BarChart3} tone="info" />
        <MetricCard label="Açıq qalıq" value={money(summary.balance)} icon={CircleAlert} tone="warning" />
      </section>

      <Panel className="invoice-control-panel">
        <PanelHeader
          title="E-qaimə idarə paneli"
          subtitle="Satış sifarişlərindən avtomatik formalaşan faktura və ƏDV bölgüsü"
          icon={FileText}
        />
        <div className="finance-control-grid">
          <div className="finance-control-tile">
            <span>Prefiks</span>
            <strong>{invoiceSettings.prefix || "EQ"}</strong>
            <small>{invoiceSettings.eTaxMode || "E-qaimə inteqrasiya rejimi"}</small>
          </div>
          <div className="finance-control-tile">
            <span>ƏDV dərəcəsi</span>
            <strong>{invoiceSettings.vatRate || 18}%</strong>
            <small>Satış məbləğindən ayrılır</small>
          </div>
          <div className="finance-control-tile">
            <span>Göndərişə hazır</span>
            <strong>{summary.ready}</strong>
            <small>E-tax növbəsi</small>
          </div>
          <div className="finance-control-tile">
            <span>Ödənilib</span>
            <strong>{money(summary.paid)}</strong>
            <small>Kassaya düşən fakturalar</small>
          </div>
        </div>
      </Panel>

      <Panel className="invoice-operations-panel">
        <PanelHeader
          title="Faktura əməliyyat nəzarəti"
          subtitle="Ödəniş vaxtı, gecikmə və e-qaimə göndəriş statusu bir yerdə izlənir"
          icon={CalendarClock}
        />
        <div className="invoice-control-grid">
          <div>
            <span>Açıq qalıq</span>
            <strong>{money(invoiceControl.openBalance)}</strong>
            <small>{invoices.filter((invoice) => Number(invoice.balance || 0) > 0).length} aktiv faktura</small>
          </div>
          <div>
            <span>7 günə qədər</span>
            <strong>{money(invoiceControl.dueSoonBalance)}</strong>
            <small>{invoiceControl.dueSoonCount} yaxın ödəniş</small>
          </div>
          <div>
            <span>Gecikən</span>
            <strong>{money(invoiceControl.overdueBalance)}</strong>
            <small>{invoiceControl.overdueCount} faktura gecikir</small>
          </div>
          <div>
            <span>E-qaimə</span>
            <strong>{invoiceControl.sent}/{invoices.length}</strong>
            <small>{invoiceControl.ready} göndərişə hazır</small>
          </div>
        </div>
        <DataTable
          columns={["Yaşlanma", "Faktura", "Qalıq", "Ümumi", "Pay"]}
          rows={agingRows.map((row) => [
            <StatusBadge status={row.bucket} />,
            row.count,
            money(row.balance),
            money(row.total),
            <ProgressRow label={percent((row.balance / maxAgingBalance) * 100)} value={(row.balance / maxAgingBalance) * 100} compact />,
          ])}
        />
      </Panel>

      <Panel className="invoice-registry-panel">
        <div className="finance-filter-toolbar">
          <div className="tabs finance-filter-tabs">
            {filterItems.map((item) => (
              <button
                key={item.label}
                className={invoiceFilter === item.label ? "active" : ""}
                onClick={() => setInvoiceFilter(item.label)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>
          <button className="secondary-btn" onClick={exportInvoices}>
            <Download size={16} />
            PDF/Excel
          </button>
        </div>
        <DataTable
          columns={["Faktura", "Sifariş", "Müştəri", "Məhsul", "Net", "ƏDV", "Cəmi", "Qalıq", "E-qaimə", "Əməliyyat"]}
          rows={visibleInvoices.map((invoice) => [
            <TwoLine title={invoice.id} subtitle={invoice.date} />,
            <div className="finance-source-cell">
              <button
                className="module-link-btn"
                type="button"
                onClick={() => onOpenSalesOrder?.(invoice.orderId)}
                data-testid="invoice-order-link"
              >
                {invoice.orderId}
              </button>
              <small>{invoice.contractId}</small>
            </div>,
            <TwoLine title={invoice.customer} subtitle={`FİN ${invoice.fin}`} />,
            invoice.products,
            money(invoice.netAmount),
            money(invoice.vatAmount),
            <strong>{money(invoice.totalAmount)}</strong>,
            invoice.balance > 0 ? money(invoice.balance) : "Yoxdur",
            <StatusBadge status={invoice.eTaxStatus} />,
            <button className="text-btn" onClick={() => setSelectedInvoice(invoice)}>
              Çap/PDF
            </button>,
          ])}
        />
      </Panel>
      {selectedInvoice && (
        <InvoicePrintModal
          invoice={selectedInvoice}
          invoiceSettings={invoiceSettings}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}

function InvoicePrintModal({ invoice, invoiceSettings = {}, onClose }) {
  function downloadHtml() {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${invoice.id}</title></head><body><h1>${invoice.id}</h1><p>${invoice.customer}</p><p>${invoice.products}</p><p>Cəmi: ${money(invoice.totalAmount)}</p><p>ƏDV: ${money(invoice.vatAmount)}</p></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${invoice.id}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card invoice-print-card">
        <div className="modal-head">
          <div>
            <h2>{invoice.id}</h2>
            <p>Faktura/e-qaimə çap görünüşü və HTML/PDF export hazırlığı.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <section className="invoice-paper">
          <div className="invoice-paper-head">
            <div>
              <span>Satıcı</span>
              <strong>{invoice.seller}</strong>
              <small>VÖEN {invoice.voen}</small>
            </div>
            <div>
              <span>Faktura</span>
              <strong>{invoice.id}</strong>
              <small>{invoice.date} · {invoice.currency}</small>
            </div>
          </div>
          <div className="invoice-paper-grid">
            <TwoLine title="Alıcı" subtitle={`${invoice.customer} · FİN ${invoice.fin}`} />
            <TwoLine title="Sifariş/Müqavilə" subtitle={`${invoice.orderId} · ${invoice.contractId}`} />
            <TwoLine title="Ödəniş tipi" subtitle={invoice.paymentMethod} />
            <TwoLine title="Son tarix" subtitle={invoice.dueDate} />
          </div>
          <div className="invoice-product-box">
            <span>Məhsul/Xidmət</span>
            <strong>{invoice.products}</strong>
          </div>
          <div className="invoice-total-grid">
            <TwoLine title="Net məbləğ" subtitle={money(invoice.netAmount)} />
            <TwoLine title={`ƏDV ${invoiceSettings.vatRate || 18}%`} subtitle={money(invoice.vatAmount)} />
            <TwoLine title="Cəmi" subtitle={money(invoice.totalAmount)} />
            <TwoLine title="Qalıq" subtitle={invoice.balance > 0 ? money(invoice.balance) : "Yoxdur"} />
          </div>
          <StatusBadge status={invoice.eTaxStatus} />
        </section>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={downloadHtml}>
            <Download size={16} />
            HTML export
          </button>
          <button type="button" className="primary-btn" onClick={() => window.print()}>
            <FileText size={16} />
            Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function ContractPrintModal({ contract, settings = {}, onClose }) {
  function downloadDocument() {
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>${contract.id}</title></head><body><h1>${settings.company || "ERP+CRM AZ"}</h1><h2>Satış müqaviləsi ${contract.id}</h2><p><strong>Müştəri:</strong> ${contract.customer}</p><p><strong>FİN:</strong> ${contract.fin || "—"}</p><p><strong>Məhsul:</strong> ${contract.product}</p><p><strong>Məbləğ:</strong> ${money(contract.amount)}</p><p><strong>Status:</strong> ${contract.status}</p><p>Bu sənəd ERP+CRM AZ sistemində formalaşdırılmışdır.</p></body></html>`;
    const blob = new Blob([content], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${contract.id}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-shell print-modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card invoice-print-card">
        <div className="modal-head no-print">
          <div>
            <h2>Müqavilə sənədi</h2>
            <p>PDF üçün çap dialoqundan “Save as PDF” seçin və ya Word sənədini endirin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <article className="invoice-paper">
          <div className="invoice-paper-head">
            <div>
              <strong>{settings.company || "ERP+CRM AZ"}</strong>
              <span>{settings.voen ? `VÖEN: ${settings.voen}` : ""}</span>
            </div>
            <div><strong>MÜQAVİLƏ</strong><span>{contract.id}</span></div>
          </div>
          <div className="invoice-meta-grid">
            <TwoLine title="Müştəri" subtitle={contract.customer} />
            <TwoLine title="FİN" subtitle={contract.fin || "—"} />
            <TwoLine title="Məhsul" subtitle={contract.product} />
            <TwoLine title="Məbləğ" subtitle={money(contract.amount)} />
          </div>
          <p className="contract-body-copy">Tərəflər məhsulun təhvil verilməsi, ödəniş və zəmanət şərtlərinin bu müqavilə üzrə tətbiq olunduğunu təsdiq edir.</p>
          <div className="contract-signatures"><span>Satıcı imzası</span><span>Müştəri imzası</span></div>
        </article>
        <div className="modal-actions no-print">
          <button className="secondary-btn" onClick={downloadDocument}><Download size={16} /> Word sənədi</button>
          <button className="primary-btn" onClick={() => window.print()}><FileText size={16} /> Print / PDF</button>
        </div>
      </div>
    </div>
  );
}

function AccountingPage({ accounting, closeRun }) {
  const { balance, pl, cashFlow, journalRows, chartRows } = accounting;
  const closeControl = useMemo(() => buildAccountingCloseChecklist(accounting, closeRun), [accounting, closeRun]);

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktivlər" value={money(balance.assets)} icon={Wallet} tone="primary" />
        <MetricCard label="Öhdəliklər" value={money(balance.liabilities)} icon={CircleAlert} tone="warning" />
        <MetricCard label="Kapital" value={money(balance.equity)} icon={ShieldCheck} tone="success" />
        <MetricCard label="Net mənfəət" value={money(pl.netProfit)} trend={percent(pl.margin)} icon={TrendingUp} tone="info" />
      </section>

      <Panel className="accounting-close-panel" data-testid="accounting-close-readiness">
        <PanelHeader
          title="Ay bağlanışı nəzarəti"
          subtitle="Balans, kassa, jurnal və ƏDV sətirləri real əməliyyat datasından yoxlanır"
          icon={ShieldCheck}
        />
        <div className="accounting-close-summary">
          <div>
            <span>Hazır maddələr</span>
            <strong>{closeControl.readyCount}/{closeControl.checks.length}</strong>
            <small>{closeControl.warningCount} yoxlama gözləyir</small>
          </div>
          <div>
            <span>Balans fərqi</span>
            <strong>{money(closeControl.equationDiff)}</strong>
            <small>Aktiv - öhdəlik - kapital</small>
          </div>
          <div>
            <span>Kassa fərqi</span>
            <strong>{money(closeControl.cashDiff)}</strong>
            <small>1010 hesabı və cash-flow</small>
          </div>
          <div>
            <span>Bölüşdürülməmiş mənfəət</span>
            <strong>{money(closeControl.retainedEarnings)}</strong>
            <small>Net nəticə</small>
          </div>
        </div>
        <DataTable
          columns={["Yoxlama", "Detallar", "Status"]}
          rows={closeControl.checks.map((check) => [
            <strong>{check.label}</strong>,
            check.detail,
            <StatusBadge status={check.status} />,
          ])}
        />
      </Panel>

      {closeRun && (
        <Panel className="module-action-panel">
          <PanelHeader title="Son jurnal exportu" subtitle="Mühasibat bağlanışı üçün hazırlanan son əməliyyat" icon={FileText} />
          <div className="db-status-grid">
            <div>
              <span>Dövr</span>
              <strong>{closeRun.period}</strong>
            </div>
            <div>
              <span>Export vaxtı</span>
              <strong>{closeRun.exportedAt}</strong>
            </div>
            <div>
              <span>Jurnal sətri</span>
              <strong>{closeRun.journalCount}</strong>
            </div>
            <div>
              <span>Net mənfəət</span>
              <strong>{money(closeRun.netProfit)}</strong>
            </div>
          </div>
        </Panel>
      )}

      <section className="accounting-statement-grid">
        <Panel>
          <PanelHeader title="Balans" subtitle="Aktiv, öhdəlik və kapitalın qısa görünüşü" icon={BarChart3} />
          <div className="statement-list">
            <TwoLine title="Aktivlər" subtitle={money(balance.assets)} />
            <TwoLine title="Öhdəliklər" subtitle={money(balance.liabilities)} />
            <TwoLine title="Kapital" subtitle={money(balance.equity)} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="P&L" subtitle="Satış, maya, xərc və mənfəət" icon={TrendingUp} />
          <div className="statement-list">
            <TwoLine title="Satış gəliri" subtitle={money(pl.revenue)} />
            <TwoLine title="Maya dəyəri" subtitle={money(pl.costOfGoods)} />
            <TwoLine title="Əməliyyat xərci" subtitle={money(pl.operatingExpenses)} />
            <TwoLine title="Net mənfəət" subtitle={money(pl.netProfit)} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Cash flow" subtitle="Açılış, daxilolma, çıxış və bağlanış" icon={Wallet} />
          <div className="statement-list">
            <TwoLine title="Açılış" subtitle={money(cashFlow.opening)} />
            <TwoLine title="Daxilolma" subtitle={money(cashFlow.inflow)} />
            <TwoLine title="Çıxış" subtitle={money(cashFlow.outflow)} />
            <TwoLine title="Bağlanış" subtitle={money(cashFlow.closing)} />
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelHeader title="Hesablar planı" subtitle="IFRS məntiqinə yaxınlaşdırılmış əməliyyat hesab qalıqları" />
        <DataTable
          columns={["Kod", "Hesab", "Tip", "Debet", "Kredit", "Qalıq"]}
          rows={chartRows.map((row) => [
            <strong>{row.code}</strong>,
            row.account,
            <StatusBadge status={row.type} />,
            row.debit > 0 ? money(row.debit) : "—",
            row.credit > 0 ? money(row.credit) : "—",
            <strong>{money(row.balance)}</strong>,
          ])}
        />
      </Panel>

      <Panel>
        <PanelHeader title="Jurnal yazılışları" subtitle="Satış, kredit kassası və xərc əməliyyatlarının ikili yazılışı" />
        <DataTable
          columns={["Tarix", "Mənbə", "Debet", "Kredit", "Məbləğ", "Status"]}
          rows={journalRows.map((row) => [
            row.date,
            <strong>{row.source}</strong>,
            row.debit,
            row.credit,
            money(row.amount),
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}

function TaxPage({ taxRows, payrollTaxRows, invoiceSummary, accounting }) {
  const overdue = taxRows.filter((row) => row.status === "Gecikib");
  const soon = taxRows.filter((row) => row.status === "Bu gün" || row.status === "Yaxınlaşır");
  const paidTasks = taxRows.filter((row) => row.paymentTaskId || row.paymentStatus === "Ödəniş tapşırığı");
  const autoRows = taxRows.filter((row) => row.autoGenerated);
  const totalTaxAmount = taxRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const soonAmount = soon.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const overdueAmount = overdue.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const payrollLiability = payrollTaxRows.reduce(
    (sum, row) =>
      sum +
      Number(row.incomeTax || 0) +
      Number(row.employeeSocial || 0) +
      Number(row.employeeUnemployment || 0) +
      Number(row.employerSocial || 0) +
      Number(row.employerUnemployment || 0),
    0,
  );
  const employerCost = total(payrollTaxRows, "employerCost");

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Yaxın öhdəlik" value={soon.length} icon={CalendarClock} tone="warning" />
        <MetricCard label="Gecikən" value={overdue.length} icon={CircleAlert} tone={overdue.length ? "danger" : "success"} />
        <MetricCard label="ƏDV bazası" value={money(invoiceSummary.vat)} icon={FileText} tone="info" />
        <MetricCard label="Payroll vergi/DSMF" value={money(payrollLiability)} icon={UserCog} tone="primary" />
      </section>

      <Panel className="tax-control-panel" data-testid="tax-control-panel">
        <PanelHeader
          title="Vergi öhdəlik nəzarəti"
          subtitle="ƏDV, mənfəət və payroll öhdəlikləri maliyyə və faktura datalarından avtomatik hesablanır"
          icon={CalendarClock}
        />
        <div className="tax-control-grid">
          <div>
            <span>Toplam öhdəlik</span>
            <strong>{money(totalTaxAmount)}</strong>
            <small>{taxRows.length} nəzarət sətri</small>
          </div>
          <div>
            <span>Yaxın ödəniş</span>
            <strong>{money(soonAmount)}</strong>
            <small>{soon.length} sətir prioritetdir</small>
          </div>
          <div>
            <span>Gecikmiş risk</span>
            <strong>{money(overdueAmount)}</strong>
            <small>{overdue.length} gecikən öhdəlik</small>
          </div>
          <div>
            <span>Ödəniş tapşırığı</span>
            <strong>{paidTasks.length}</strong>
            <small>{autoRows.length} avtomatik hesablanıb</small>
          </div>
        </div>
      </Panel>

      <Panel className="tax-calendar-panel">
        <PanelHeader title={`${currentBusinessYear} vergi təqvimi`} subtitle={`Bugünkü nəzarət tarixi: ${formatPaymentDate(parsePaymentDate(currentBusinessDate))}`} icon={CalendarClock} />
        <DataTable
          columns={["Öhdəlik", "Dövr", "Son tarix", "Qalan gün", "Təxmini məbləğ", "Məsul", "Mənbə", "Status"]}
          rows={taxRows.map((row) => [
            <TwoLine title={row.title} subtitle={row.type} />,
            row.period,
            row.dueDate,
            row.daysLeft >= 0 ? `${row.daysLeft} gün` : `${Math.abs(row.daysLeft)} gün gecikib`,
            money(row.amount),
            row.owner,
            row.paymentTaskId ? <TwoLine title="Tapşırıq yaradılıb" subtitle={row.paymentTaskId} /> : row.source || "Manual",
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <section className="accounting-statement-grid">
        <Panel>
          <PanelHeader title="ƏDV icmalı" subtitle="Faktura modulundan gələn ƏDV hesabı" />
          <div className="statement-list">
            <TwoLine title="Satış ƏDV" subtitle={money(invoiceSummary.vat)} />
            <TwoLine title="ƏDV öhdəliyi" subtitle={money(accounting.vatPayable)} />
            <TwoLine title="E-qaimə sayı" subtitle={`${invoiceSummary.count} faktura`} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Əmək haqqı kalkulyatoru" subtitle={`${currentBusinessYear} vergi, DSMF və işəgötürən xərci`} />
          <div className="statement-list">
            <TwoLine title="İşəgötürən xərci" subtitle={money(employerCost)} />
            <TwoLine title="Tutulmalar" subtitle={money(payrollLiability)} />
            <TwoLine title="Əməkdaş sayı" subtitle={payrollTaxRows.length} />
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelHeader title="Payroll vergi hesabı" subtitle="Gross, gəlir vergisi, sosial ödəniş və net əmək haqqı" />
        <DataTable
          columns={["Əməkdaş", "Şöbə", "Gross", "Gəlir vergisi", "İşçi DSMF/işsizlik", "Net", "İşəgötürən xərci"]}
          rows={payrollTaxRows.map((row) => [
            <strong>{row.employee}</strong>,
            row.department,
            money(row.gross),
            money(row.incomeTax),
            money(row.employeeSocial + row.employeeUnemployment),
            <strong>{money(row.net)}</strong>,
            money(row.employerCost),
          ])}
        />
      </Panel>
    </div>
  );
}

function ApiPage({
  webhooks,
  secrets = [],
  logs = [],
  snapshot = null,
  dbMeta = {},
  auditLog = [],
  onRunTest,
  onRotateSecret,
  canManage = true,
}) {
  const activeHooks = webhooks.filter((webhook) => webhook.status === "Aktiv");
  const queueTotal = total(webhooks, "queueCount");
  const retryTotal = total(webhooks, "retryQueue");
  const lastLog = logs[0];
  const failedLogs = logs.filter((log) => log.result !== "Uğurlu");

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Endpoint" value={webhooks.length} icon={ShieldCheck} tone="primary" />
        <MetricCard label="Aktiv webhook" value={activeHooks.length} icon={Check} tone="success" />
        <MetricCard label="Göndəriş növbəsi" value={queueTotal} icon={Bell} tone="warning" />
        <MetricCard label="Retry növbəsi" value={retryTotal} trend={lastLog ? `${lastLog.responseCode} · ${lastLog.result}` : "Test gözləyir"} icon={RefreshCw} tone={retryTotal ? "warning" : "info"} />
      </section>

      <Panel className="api-console-panel" data-testid="api-console-panel">
        <PanelHeader
          title="API konsolu"
          subtitle="Endpoint health, test nəticələri, retry və secret idarəetməsi"
          icon={ShieldCheck}
        />
        <div className="db-status-grid">
          <div>
            <span>DB provider</span>
            <strong>{dbMeta.provider || "Local persistent DB"}</strong>
          </div>
          <div>
            <span>Son əməliyyat</span>
            <strong>{dbMeta.lastAction || "—"}</strong>
          </div>
          <div>
            <span>Versiya</span>
            <strong>{dbMeta.version || 1}</strong>
          </div>
          <div>
            <span>Queue</span>
            <strong>{queueTotal}</strong>
          </div>
          <div>
            <span>Son API test</span>
            <strong>{snapshot?.result || lastLog?.result || "Yoxdur"}</strong>
          </div>
          <div>
            <span>Audit yazısı</span>
            <strong>{auditLog.length}</strong>
          </div>
        </div>
        <div className="api-action-row">
          <button className="primary-btn" data-testid="api-run-webhook-test" onClick={() => onRunTest?.("auto")} disabled={!canManage}>
            <Send size={16} />
            Webhook test
          </button>
          <button className="secondary-btn" data-testid="api-run-retry-test" onClick={() => onRunTest?.("retry")} disabled={!canManage || retryTotal === 0}>
            <RefreshCw size={16} />
            Retry işlə
          </button>
          <span>{lastLog ? `${lastLog.webhookId} · ${lastLog.at}` : "Hələ test nəticəsi yoxdur"}</span>
        </div>
      </Panel>

      <Panel className="api-endpoint-panel" data-testid="api-endpoint-panel">
        <PanelHeader title="Endpoint xəritəsi" subtitle="Modul hadisələrinin göndərildiyi real inteqrasiya endpoint-ləri" />
        <DataTable
          columns={["Endpoint", "Event", "URL", "Auth", "SLA", "Növbə", "Retry", "Status"]}
          rows={webhooks.map((webhook) => [
            <TwoLine title={webhook.name} subtitle={`${webhook.method || "POST"} · ${webhook.id}`} />,
            <StatusBadge status={webhook.event} />,
            <TwoLine title={webhook.target} subtitle={webhook.owner} />,
            <TwoLine title={webhook.authLabel} subtitle={webhook.secretStatus} />,
            `${webhook.slaSeconds || 30}s`,
            <strong>{webhook.queueCount}</strong>,
            <TwoLine title={`${webhook.retryQueue}/${webhook.retryMax}`} subtitle={webhook.nextRetryAt || webhook.retryState} />,
            <StatusBadge status={webhook.health} />,
          ])}
        />
      </Panel>

      <section className="api-ops-grid">
        <Panel className="api-secret-panel" data-testid="api-secret-panel">
          <PanelHeader title="Token / Secret vault" subtitle="Maskalanmış tokenlər, istifadə və rotasiya nəzarəti" icon={Database} />
          <DataTable
            columns={["Secret", "Maska", "Bağlı endpoint", "Rotasiya", "Status", "Əməliyyat"]}
            rows={secrets.map((secret) => [
              <TwoLine title={secret.label} subtitle={`${secret.key} · v${secret.version || 1}`} />,
              secret.maskedValue,
              <TwoLine title={`${secret.linkedCount} endpoint`} subtitle={secret.linkedEvents} />,
              <TwoLine title={`${secret.daysLeft} gün`} subtitle={secret.lastRotatedAt || "Tarix yoxdur"} />,
              <StatusBadge status={secret.health} />,
              <button
                className="text-btn"
                data-testid="api-secret-rotate"
                disabled={!canManage}
                onClick={() => onRotateSecret?.(secret.id)}
              >
                Yenilə
              </button>,
            ])}
          />
        </Panel>

        <Panel className="api-testlog-panel" data-testid="api-testlog-panel">
          <PanelHeader title="Test nəticələri və retry logu" subtitle={`${logs.length} log · ${failedLogs.length} uğursuz cəhd`} icon={FileText} />
          <DataTable
            columns={["Webhook", "Rejim", "Cavab", "Latency", "Retry", "Tarix"]}
            rows={logs.slice(0, 8).map((log) => [
              <TwoLine title={log.webhookName || log.webhookId} subtitle={log.event} />,
              log.mode,
              <TwoLine title={`${log.responseCode} · ${log.result}`} subtitle={log.error || log.target} />,
              `${log.latencyMs} ms`,
              <TwoLine title={String(log.retryQueue || 0)} subtitle={log.nextRetryAt || "—"} />,
              log.at,
            ])}
          />
        </Panel>
      </section>

      <Panel className="api-webhook-rule-panel">
        <PanelHeader title="Webhook qaydaları" subtitle="Hadisə, son payload və son test nəticəsi" />
        <DataTable
          columns={["Qayda", "Son payload", "Son test", "Cavab", "Məsul", "Retry vəziyyəti"]}
          rows={webhooks.map((webhook) => [
            <TwoLine title={webhook.name} subtitle={webhook.id} />,
            webhook.lastPayload,
            webhook.lastTestAt || "—",
            <TwoLine title={webhook.lastResponseCode} subtitle={webhook.lastLatencyMs ? `${webhook.lastLatencyMs} ms` : "—"} />,
            webhook.owner,
            <StatusBadge status={webhook.retryState} />,
          ])}
        />
      </Panel>
    </div>
  );
}

// CreditsPage extracted to src/pages/CreditsPage.jsx

function CreditListRow({ item, active, onSelect }) {
  const { credit, plan, paymentState } = item;
  const statusText = paymentState.isOverdue
    ? `${paymentState.daysOverdue} gün gecikib`
    : paymentState.isDueToday
      ? "Bu gün"
      : credit.status;
  const sourceLabel = getCreditSourceLabel(credit);

  return (
    <button
      className={`credit-list-row ${active ? "active" : ""} ${paymentState.isOverdue ? "overdue" : ""}`}
      onClick={onSelect}
    >
      <div className="credit-list-main">
        <strong>{credit.customer}</strong>
        <span>
          {credit.id} · {credit.contractId || "Müqaviləsiz"}
        </span>
      </div>
      <div className="credit-list-meta">
        <span>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</span>
        <strong>{money(paymentState.nextInstallment?.amount || plan.monthly)}</strong>
      </div>
      <div className="credit-list-extra">
        <span>{sourceLabel}</span>
        <strong>{money(plan.balance)} qalıq</strong>
      </div>
      <StatusBadge status={statusText} />
    </button>
  );
}

export function CreditDetailModal({ item, sendCreditSms, onUpdatePaymentDate, onReceivePayment, onOpenSalesOrder, onClose }) {
  const { credit } = item;

  return (
    <div className="modal-shell credit-detail-modal-shell" role="dialog" aria-modal="true" aria-labelledby="credit-detail-modal-title">
      <div className="modal-card credit-detail-modal-card">
        <div className="modal-head credit-detail-modal-head">
          <div>
            <h2 id="credit-detail-modal-title">Kredit müqaviləsi</h2>
            <p>{credit.customer} üzrə fərdi müqavilə, cihaz, ödəniş və tarixçə məlumatları</p>
            <div className="credit-detail-title-meta">
              <span>{credit.id}</span>
              <span>{credit.contractId || "Müqaviləsiz"}</span>
              <span>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <div className="credit-detail-modal-body">
          <CreditDetail
            item={item}
            sendCreditSms={sendCreditSms}
            onUpdatePaymentDate={onUpdatePaymentDate}
            onReceivePayment={onReceivePayment}
            onOpenSalesOrder={onOpenSalesOrder}
          />
        </div>
      </div>
    </div>
  );
}

function CreditDetail({ item, sendCreditSms, onUpdatePaymentDate, onReceivePayment, onOpenSalesOrder }) {
  const { credit, plan, paymentState, progress } = item;
  const debt = getCreditDebtFormula(item);

  return (
    <div className="credit-detail">
      <div className="credit-detail-layout">
        <section className="credit-detail-primary">
          <div className="credit-detail-head">
            <div>
              <span>{credit.id}</span>
              <h2>{credit.customer}</h2>
            </div>
            <StatusBadge status={paymentState.isOverdue ? `${paymentState.daysOverdue} gün gecikib` : credit.status} />
          </div>
          <CreditContext credit={credit} onOpenSalesOrder={onOpenSalesOrder} />
          <CreditContractSnapshot item={item} />
          <CreditDebtFormula item={item} />
          <div className="credit-detail-values">
            <TwoLine title="İlkin müqavilə" subtitle={money(debt.total)} />
            <TwoLine title="İlkin ödəniş" subtitle={money(plan.initialPayment)} />
            <TwoLine title="Qalan ay" subtitle={`${debt.remainingMonths} ay`} />
            <TwoLine title="Müddət" subtitle={`${plan.months} ay`} />
          </div>
          <div className="credit-plan-card">
            <div className="credit-plan-note">
              <span>
                {plan.months > 1 ? `${plan.months - 1} ay` : "Aylıq"} <strong>{money(plan.monthly)}</strong>
              </span>
              <span>
                Son ay <strong>{money(plan.lastPayment)}</strong>
              </span>
            </div>
            <ProgressRow label={`${credit.paidMonths}/${plan.months} ay`} value={progress} />
          </div>
          <div className="credit-detail-records">
            <CreditPaymentHistory payments={credit.payments || []} />
            <div className="credit-schedule-edit-block">
              <div className="credit-schedule-head">
                <div>
                  <h3>Ödəniş tarixləri</h3>
                  <p>Hələlik tarix redaktəsi bütün istifadəçilər üçün açıqdır.</p>
                </div>
              </div>
              <CreditSchedule
                installments={plan.installments}
                onUpdatePaymentDate={(month, due) => onUpdatePaymentDate(credit.id, month, due)}
              />
            </div>
          </div>
        </section>

        <aside className="credit-detail-aside">
          <CreditPaymentAlert paymentState={paymentState} />
          <CreditPaymentForm
            key={credit.id}
            credit={credit}
            paymentState={paymentState}
            onReceivePayment={onReceivePayment}
          />
          <CreditHealthSummary item={item} />
          <div className="credit-detail-actions">
            <span>Növbəti: {paymentState.nextInstallment?.due || credit.next}</span>
            <button className="secondary-btn" onClick={() => sendCreditSms(credit.id)}>
              SMS xatırlatma
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CreditDebtFormula({ item }) {
  const debt = getCreditDebtFormula(item);
  const formulaIsBalanced = debt.total - debt.paid === debt.balance;

  return (
    <div className="credit-debt-formula" data-testid="credit-debt-formula">
      <div>
        <span>Müqavilə məbləği</span>
        <strong>{money(debt.total)}</strong>
      </div>
      <b>-</b>
      <div>
        <span>Ödənilib</span>
        <strong>{money(debt.paid)}</strong>
      </div>
      <b>=</b>
      <div className="balance">
        <span>Qalıq borc</span>
        <strong>{money(debt.balance)}</strong>
      </div>
      <small className={formulaIsBalanced ? "ok" : "warning"}>
        {formulaIsBalanced ? "Borcla ödəniş balansı uyğundur" : "Balans yenidən yoxlanmalıdır"}
      </small>
    </div>
  );
}

function CreditContractSnapshot({ item }) {
  const { credit, plan, paymentState } = item;
  const debt = getCreditDebtFormula(item);

  return (
    <div className="credit-contract-snapshot">
      <div className="credit-contract-tile total" data-testid="credit-total-tile">
        <span>Müqavilə məbləği</span>
        <strong>{money(debt.total)}</strong>
        <small>{credit.contractId || credit.id}</small>
      </div>
      <div className="credit-contract-tile paid" data-testid="credit-paid-tile">
        <span>Ödənilib</span>
        <strong>{money(debt.paid)}</strong>
        <small>İlkin + əsas ödənişlər</small>
      </div>
      <div className="credit-contract-tile balance" data-testid="credit-balance-tile">
        <span>Qalıq borc</span>
        <strong>{money(debt.balance)}</strong>
        <small>{debt.remainingMonths} ay qalıb</small>
      </div>
      <div className={`credit-contract-tile next ${paymentState.isOverdue ? "danger" : paymentState.isDueToday ? "today" : ""}`}>
        <span>Növbəti yığım</span>
        <strong>{money(debt.nextAmount)}</strong>
        <small>{paymentState.nextInstallment?.due || credit.next || "Tarix yoxdur"}</small>
      </div>
    </div>
  );
}

function CreditHealthSummary({ item }) {
  const { credit, plan, paymentState, progress } = item;
  const paidTotal = getCreditPaidTotal(plan);

  return (
    <div className="credit-health-grid">
      <div>
        <span>Ödənilib</span>
        <strong>{money(paidTotal)}</strong>
        <small>{Math.round(progress)}% tamamlanıb</small>
      </div>
      <div>
        <span>Qalıq borc</span>
        <strong>{money(plan.balance)}</strong>
        <small>{plan.months} aylıq plan</small>
      </div>
      <div className={paymentState.isOverdue ? "danger" : paymentState.isDueToday ? "info" : ""}>
        <span>Yığım statusu</span>
        <strong>{getCreditRiskLabel(item)}</strong>
        <small>{paymentState.nextInstallment?.due || credit.next || "Tarix yoxdur"}</small>
      </div>
      <div>
        <span>Mənbə</span>
        <strong>{getCreditSourceLabel(credit)}</strong>
        <small>{credit.orderId ? `${credit.orderId} sifarişi` : "Manual qeyd"}</small>
      </div>
    </div>
  );
}

function CreditContext({ credit, onOpenSalesOrder }) {
  return (
    <div className="credit-context-grid">
      <div>
        <span>Müqavilə</span>
        <strong>{credit.contractId || "Müqavilə qeyd edilməyib"}</strong>
      </div>
      <div>
        <span>Cihaz</span>
        <strong>{credit.device || credit.product || "Cihaz qeyd edilməyib"}</strong>
      </div>
      {credit.orderId && (
        <div>
          <span>Sifariş</span>
          <button
            className="module-link-btn"
            type="button"
            onClick={() => onOpenSalesOrder?.(credit.orderId)}
            data-testid="credit-order-link"
            title="Bağlı sifariş detalına keç"
          >
            {credit.orderId}
          </button>
        </div>
      )}
      <div>
        <span>Mənbə</span>
        <strong>{getCreditSourceLabel(credit)}</strong>
      </div>
      {credit.warehouseName && (
        <div>
          <span>Anbar</span>
          <strong>{credit.warehouseName}</strong>
        </div>
      )}
    </div>
  );
}

function CreditPaymentAlert({ paymentState }) {
  const amount = paymentState.nextInstallment?.amount || 0;
  const due = paymentState.nextInstallment?.due || "—";
  const label = paymentState.isOverdue
    ? `${paymentState.daysOverdue} gün gecikib`
    : paymentState.isDueToday
      ? "Bu gün ödənilməlidir"
      : "Növbəti ödəniş";

  return (
    <div className={`credit-payment-alert ${paymentState.isOverdue ? "overdue" : ""} ${paymentState.isDueToday ? "today" : ""}`}>
      <CalendarClock size={16} />
      <div>
        <strong>{money(amount)}</strong>
        <span>
          {label} · {due}
        </span>
      </div>
    </div>
  );
}

function CreditPaymentForm({ credit, paymentState, onReceivePayment }) {
  const currentPrincipal = Number(paymentState.nextInstallment?.amount || 0);
  const [principalAmount, setPrincipalAmount] = useState(currentPrincipal);
  const [penaltyAmount, setPenaltyAmount] = useState(0);
  const principal = Math.max(0, Math.round(Number(principalAmount || 0)));
  const penalty = Math.max(0, Math.round(Number(penaltyAmount || 0)));
  const extraPrincipal = Math.max(0, principal - currentPrincipal);
  const cashIn = principal + penalty;

  function submit(event) {
    event.preventDefault();
    onReceivePayment(credit.id, {
      principalAmount: principal,
      penaltyAmount: penalty,
    });
    setPrincipalAmount("");
    setPenaltyAmount(0);
  }

  return (
    <form className="credit-payment-form" onSubmit={submit}>
      <div className="credit-payment-form-head">
        <div>
          <h3>Ödəniş qəbul et</h3>
          <p>Əsas məbləğ borcdan silinir, gecikmə faizi yalnız kassaya daxil olur.</p>
        </div>
      </div>
      <div className="credit-payment-inputs">
        <label>
          <span>Əsas məbləğ</span>
          <input
            aria-label="Əsas məbləğ"
            type="number"
            min="0"
            value={principalAmount}
            onChange={(event) => setPrincipalAmount(event.target.value)}
          />
        </label>
        <label>
          <span>Gecikmə faizi</span>
          <input
            aria-label="Gecikmə faizi"
            type="number"
            min="0"
            value={penaltyAmount}
            onChange={(event) => setPenaltyAmount(event.target.value)}
          />
        </label>
      </div>
      <div className="credit-payment-preview">
        <span>
          Borcdan silinir <strong>{money(principal)}</strong>
        </span>
        <span>
          Gecikmə gəliri <strong>{money(penalty)}</strong>
        </span>
        <span>
          Kassaya daxil olur <strong>{money(cashIn)}</strong>
        </span>
        {extraPrincipal > 0 && (
          <span className="success">
            Növbəti aydan azalır <strong>{money(extraPrincipal)}</strong>
          </span>
        )}
      </div>
      <button type="submit" className="primary-btn">
        Ödənişi qəbul et
      </button>
    </form>
  );
}

function CreditPaymentHistory({ payments }) {
  const rows = payments || [];

  return (
    <div className="credit-payment-history">
      <div className="credit-history-head">
        <div>
          <h3>Ödəniş tarixçəsi</h3>
          <p>Əsas məbləğ borcdan silinir, gecikmə faizi yalnız kassaya gəlir.</p>
        </div>
        <span>{rows.length} əməliyyat</span>
      </div>
      {rows.length === 0 ? (
        <div className="credit-history-empty">Bu kredit üzrə hələ ödəniş qəbul edilməyib.</div>
      ) : (
        <div className="credit-history-list">
          {rows.slice(0, 6).map((payment, index) => {
            const principal = Number(payment.principal || 0);
            const penalty = Number(payment.penalty || 0);
            const cashIn = Number(payment.cashIn ?? principal + penalty);
            const extraApplied = Number(payment.extraApplied || 0);

            return (
              <div className="credit-payment-row" key={`${payment.date}-${index}`}>
                <div>
                  <strong>{payment.date || baseCreditDate}</strong>
                  <span>
                    Əsas {money(principal)} · Gecikmə {money(penalty)}
                  </span>
                  {extraApplied > 0 && <em>Növbəti aylardan azaldıldı: {money(extraApplied)}</em>}
                </div>
                <b>{money(cashIn)}</b>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreditSchedule({ installments, onUpdatePaymentDate }) {
  const firstOpenMonth = installments.find((installment) => Number(installment.amount || 0) > 0)?.month;

  return (
    <div className="credit-schedule" aria-label="Kredit ödəniş tarixləri">
      {installments.map((installment) => {
        const amount = Number(installment.amount || 0);
        const status = amount <= 0 ? "Bağlanıb" : installment.month === firstOpenMonth ? "Cari ay" : "Gözləyir";

        return (
          <label key={installment.month} className={amount <= 0 ? "closed" : installment.month === firstOpenMonth ? "current" : ""}>
            <em>{installment.month}. ay</em>
            <strong>{money(amount)}</strong>
            <small>{status}</small>
            <input
              aria-label={`${installment.month}. ay ödəniş tarixi`}
              type="date"
              value={toDateInputValue(installment.due)}
              onChange={(event) => onUpdatePaymentDate(installment.month, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
}

function ReceivablesPage({ rows, syncMeta, closures = [], onCloseDebt }) {
  const [typeFilter, setTypeFilter] = useState("Hamısı");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("Hamısı");
  const [riskFilter, setRiskFilter] = useState("Hamısı");
  const [collectionFilter, setCollectionFilter] = useState("Hamısı");
  const [agingFilter, setAgingFilter] = useState("Hamısı");
  const debtorRows = rows.filter((row) => row.type === "Debitor");
  const creditorRows = rows.filter((row) => row.type === "Kreditor");
  const overdueRows = rows.filter((row) => Number(row.overdueDays || 0) > 0);
  const highRiskRows = rows.filter((row) => ["Kritik", "Yüksək"].includes(row.riskCategory));
  const totalDebitor = total(debtorRows, "amount");
  const totalCreditor = total(creditorRows, "amount");
  const netPosition = totalDebitor - totalCreditor;
  const agingSummary = buildReceivableAgingSummary(rows);
  const sourceTypeOptions = ["Hamısı", ...new Set(rows.map((row) => row.sourceTypeLabel || row.sourceType).filter(Boolean))];
  const riskOptions = ["Hamısı", ...new Set(rows.map((row) => row.riskCategory).filter(Boolean))];
  const collectionOptions = ["Hamısı", ...new Set(rows.map((row) => row.collectionStatus).filter(Boolean))];
  const agingOptions = ["Hamısı", ...agingSummary.map((row) => row.bucket)];
  const visibleRows = rows.filter((row) => {
    const matchesType = typeFilter === "Hamısı" || row.type === typeFilter;
    const rowSourceType = row.sourceTypeLabel || row.sourceType;
    const matchesSourceType = sourceTypeFilter === "Hamısı" || rowSourceType === sourceTypeFilter;
    const matchesRisk = riskFilter === "Hamısı" || row.riskCategory === riskFilter;
    const matchesCollection = collectionFilter === "Hamısı" || row.collectionStatus === collectionFilter;
    const matchesAging = agingFilter === "Hamısı" || row.agingBucket === agingFilter;
    return matchesType && matchesSourceType && matchesRisk && matchesCollection && matchesAging;
  });

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Debitor borcu" value={money(totalDebitor)} trend={`${debtorRows.length} borc sətri`} icon={Wallet} tone="primary" />
        <MetricCard label="Kreditor borcu" value={money(totalCreditor)} trend={`${creditorRows.length} borc sətri`} icon={Building2} tone="warning" />
        <MetricCard label="Net mövqe" value={money(netPosition)} icon={TrendingUp} tone={netPosition >= 0 ? "success" : "danger"} />
        <MetricCard label="Risk portfeli" value={highRiskRows.length} trend={money(total(highRiskRows, "amount"))} icon={CircleAlert} tone={highRiskRows.length ? "danger" : "success"} />
      </section>
      <section className="receivable-aging-grid" data-testid="receivable-aging-panel">
        {agingSummary.map((bucket) => (
          <div key={bucket.bucket} className={`aging-bucket ${bucket.count > 0 ? "active" : ""}`}>
            <span>{bucket.bucket}</span>
            <strong>{money(bucket.amount)}</strong>
            <small>{bucket.count} borc sətri</small>
          </div>
        ))}
      </section>
      {syncMeta && (
        <Panel className="module-action-panel">
          <PanelHeader title="Son balans yenilənməsi" subtitle="Satış, kredit və vendor məlumatlarından son sinxron nəticə" icon={RefreshCw} />
          <div className="db-status-grid">
            <div>
              <span>Vaxt</span>
              <strong>{syncMeta.at}</strong>
            </div>
            <div>
              <span>Debitor</span>
              <strong>{money(syncMeta.debtorTotal)}</strong>
            </div>
            <div>
              <span>Kreditor</span>
              <strong>{money(syncMeta.creditorTotal)}</strong>
            </div>
            <div>
              <span>Gecikmə</span>
              <strong>{syncMeta.overdueCount}</strong>
            </div>
          </div>
        </Panel>
      )}
      <Panel className="receivable-control-panel" data-testid="receivable-control-panel">
        <PanelHeader
          title="Debitor/Kreditor reyestri"
          subtitle="Aging, kolleksiya statusu, risk kateqoriyası və bağlanış workflow-u"
          icon={Wallet}
        />
        <div className="receivable-filter-bar">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            {["Hamısı", "Debitor", "Kreditor"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
            {sourceTypeOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            {riskOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}>
            {collectionOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={agingFilter} onChange={(event) => setAgingFilter(event.target.value)}>
            {agingOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span>{visibleRows.length}/{rows.length} sətir</span>
        </div>
        <DataTable
          columns={["Tip", "Tərəf", "Mənbə", "Məbləğ", "Aging", "Risk", "Kolleksiya", "Növbəti addım", "Məsul", "Bağlanış"]}
          rows={visibleRows.map((row) => [
            <StatusBadge status={row.type} />,
            <TwoLine title={row.party} subtitle={row.detail} />,
            <TwoLine title={row.source} subtitle={row.sourceTypeLabel || row.sourceType || "Mənbə"} />,
            <strong>{money(row.amount)}</strong>,
            <TwoLine title={row.agingBucket} subtitle={Number(row.overdueDays || 0) > 0 ? `${row.overdueDays} gün` : "Gecikmə yoxdur"} />,
            <StatusBadge status={row.riskCategory} />,
            <StatusBadge status={row.collectionStatus} />,
            row.nextAction,
            row.owner,
            Number(row.amount || 0) > 0 ? (
              <button className="text-btn receivable-close-button" data-testid="receivable-close-button" onClick={() => onCloseDebt?.(row.id)}>
                Bağla
              </button>
            ) : (
              <StatusBadge status="Bağlandı" />
            ),
          ])}
        />
      </Panel>
      <Panel className="receivable-closure-panel">
        <PanelHeader title="Bağlanış tarixçəsi" subtitle="Debitor kassa mədaxili və kreditor ödəniş çıxışları audit izi ilə saxlanılır" icon={Check} />
        {closures.length === 0 ? (
          <EmptyState title="Borc bağlanışı hələ yoxdur" />
        ) : (
          <DataTable
            columns={["ID", "Tip", "Tərəf", "Məbləğ", "Aging", "Risk", "Tarix", "Status"]}
            rows={closures.slice(0, 8).map((row) => [
              <strong>{row.id}</strong>,
              row.type,
              row.party,
              money(row.amount),
              row.agingBucket,
              <StatusBadge status={row.riskCategory} />,
              row.at,
              <StatusBadge status={row.collectionStatus || "Bağlandı"} />,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}



function VendorsPage({
  vendors,
  warehouseStock = {},
  products = [],
  warehouses = [],
  orders = [],
  purchaseOrders = [],
  onCreatePurchaseOrder,
  onOpenPurchaseOrderModal,
  onApprovePurchaseOrder,
  canManagePo = false,
}) {
  const procurementRows = useMemo(
    () => buildProcurementRows(vendors, warehouseStock, orders, products, purchaseOrders),
    [vendors, warehouseStock, orders, products, purchaseOrders],
  );
  const purchaseNeed = procurementRows.filter((row) => row.recommendedQty > 0);
  const procurementBudget = purchaseNeed.reduce((sum, row) => sum + Number(row.estimatedCost || 0), 0);
  const openPoQty = purchaseOrders.filter(isPurchaseOrderOpen).reduce((sum, po) => sum + Number(po.qty || 0), 0);
  const vendorRiskCount = vendors.filter(
    (vendor) => normalize(vendor.status).includes("risk") || normalize(vendor.status).includes("aşağı"),
  ).length;
  const pendingPoCount = purchaseOrders.filter((po) => po.status === "Təsdiq gözləyir").length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktiv vendorlar" value={vendors.length} icon={Building2} tone="primary" />
        <MetricCard label="Ümumi SKU" value={total(vendors, "sku")} trend="+24 bu ay" icon={Boxes} tone="info" />
        <MetricCard
          label="Kvota icrası"
          value={percent((total(vendors, "sold") / total(vendors, "quota")) * 100)}
          trend={`Q${currentBusinessQuarter} ${currentBusinessYear}`}
          icon={TrendingUp}
          tone="success"
        />
        <MetricCard
          label="PO tövsiyəsi"
          value={pendingPoCount || purchaseNeed.length}
          trend={pendingPoCount > 0 ? `${pendingPoCount} təsdiq gözləyir` : money(procurementBudget)}
          icon={Package}
          tone={purchaseNeed.length > 0 ? "warning" : "success"}
        />
      </section>
      <Panel className="procurement-panel">
        <PanelHeader
          title="Procurement planı"
          subtitle="Anbar qalığı və satış tempinə görə vendor üzrə sifariş tövsiyələri"
          icon={Package}
        />
        <div className="procurement-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={!canManagePo || products.length === 0 || warehouses.length === 0}
            title={products.length === 0 || warehouses.length === 0 ? "Əvvəl məhsul və anbar yaradın" : "Zavoddan məhsul sifarişi yaradın"}
            onClick={onOpenPurchaseOrderModal}
          >
            <Plus size={16} />
            PO yarat
          </button>
        </div>
        <div className="procurement-summary-grid">
          <div>
            <span>Satınalma büdcəsi</span>
            <strong>{money(procurementBudget)}</strong>
            <small>{purchaseNeed.length} məhsul üçün PO açıla bilər</small>
          </div>
          <div>
            <span>Vendor riski</span>
            <strong>{vendorRiskCount}</strong>
            <small>Kvota və icra nəzarəti</small>
          </div>
          <div>
            <span>Sifarişdə</span>
            <strong>{openPoQty}</strong>
            <small>Açıq PO üzrə yolda olan məhsul</small>
          </div>
        </div>
        <DataTable
          columns={["Məhsul", "Vendor", "Satış", "Satış üçün", "Minimum", "Tövsiyə", "Sifarişdə", "Büdcə", "Status", "PO"]}
          rows={procurementRows.slice(0, 8).map((row) => [
            <strong>{row.product}</strong>,
            row.vendor,
            `${row.sold} ədəd`,
            `${row.available} ədəd`,
            row.reorderPoint > 0 ? `${row.reorderPoint} ədəd` : "—",
            row.recommendedQty > 0 ? `${row.recommendedQty} ədəd` : "Yoxdur",
            row.orderedQty > 0 ? <TwoLine title={`${row.orderedQty} ədəd`} subtitle={row.latestPoId || `${row.openPoCount} PO`} /> : "Yoxdur",
            row.estimatedCost > 0 ? money(row.estimatedCost) : "—",
            <StatusBadge status={row.status} />,
            <button
              className="text-btn"
              disabled={!canManagePo || row.orderGap <= 0}
              onClick={() => onCreatePurchaseOrder(row)}
            >
              {row.orderGap > 0 ? "PO yarat" : "Bağlıdır"}
            </button>,
          ])}
        />
      </Panel>
      <Panel className="po-action-panel">
        <PanelHeader
          title="Purchase Order axını"
          subtitle="PO təsdiqlənəndə məhsul avtomatik anbara mədaxil edilir və alış xərci maliyyəyə düşür"
          icon={FileText}
        />
        <DataTable
          columns={["PO", "Mənbə", "Məhsul", "Anbar", "Say", "Alış", "Məbləğ", "Gözlənən", "Status", "Əməliyyat"]}
          rows={purchaseOrders.map((po) => [
            <strong>{po.id}</strong>,
            <TwoLine title={po.vendor} subtitle={po.supplierSource || po.procurementType || "Vendor PO"} />,
            po.product,
            po.warehouseName,
            `${po.qty} ədəd`,
            money(Number(po.unitCost || (Number(po.amount || 0) / Math.max(1, Number(po.qty || 1))) || 0)),
            money(po.amount),
            po.expectedAt || "—",
            <StatusBadge status={po.status} />,
            po.status === "Təsdiq gözləyir" ? (
              <button className="text-btn" disabled={!canManagePo} onClick={() => onApprovePurchaseOrder(po.id)}>
                Təsdiq et
              </button>
            ) : (
              <TwoLine title="Mədaxil edilib" subtitle={po.receivedAt || po.approvedAt} />
            ),
          ])}
        />
      </Panel>
      <Panel>
        <PanelHeader title={`Vendor Kvota Cədvəli — ${currentBusinessYear} Q${currentBusinessQuarter}`} subtitle="Satış hədəfi və risk statusu" />
        <DataTable
          columns={["Vendor", "Ölkə", "SKU", "Satılıb", "Kvota", "İcra", "Status"]}
          rows={vendors.map((vendor) => [
            <strong>{vendor.name}</strong>,
            vendor.country,
            vendor.sku,
            vendor.sold,
            vendor.quota,
            <ProgressRow label="" value={(vendor.sold / vendor.quota) * 100} compact />,
            <StatusBadge status={vendor.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}

// VendorManagementPage extracted to src/pages/VendorManagementPage.jsx

const hrLevelOptions = ["Rəhbərlik", "Şöbə rəhbəri", "Komanda lideri", "Komanda üzvü", "Təcrübəçi"];
const hrPlatformTabs = ["Komanda", "İş vaxtı", "Məzuniyyət", "Payroll", "Recruitment"];

function getEmployeeKey(employee = {}) {
  return employee.id || `EMP-${normalize(employee.name)}`;
}

function getEmployeeLevel(employee) {
  if (employee.level) return employee.level;

  const position = normalize(employee.position);
  if (position.includes("direktor")) return "Rəhbərlik";
  if (position.includes("baş") || position.includes("rəhbər")) return "Şöbə rəhbəri";
  return "Komanda üzvü";
}

function isHrLeadershipLevel(level) {
  const text = normalize(level);
  return text.includes("rəhb") || text.includes("lider") || text.includes("direktor");
}

function getEmployeeManager(employee, employees = []) {
  const employeeKey = getEmployeeKey(employee);
  const byId = employee.managerId
    ? employees.find((item) => getEmployeeKey(item) === employee.managerId)
    : null;
  if (byId && getEmployeeKey(byId) !== employeeKey) return byId;

  const byName = employee.managerName
    ? employees.find((item) => item.name === employee.managerName && getEmployeeKey(item) !== employeeKey)
    : null;
  return byName || null;
}

function getEmployeeManagerName(employee, employees) {
  const savedManager = getEmployeeManager(employee, employees);
  if (savedManager) return savedManager.name;
  if (employee.managerName !== undefined) return employee.managerName;

  const position = normalize(employee.position);
  if (position.includes("direktor") || position.includes("baş") || position.includes("rəhbər")) return "";

  const departmentLead = employees.find((item) => {
    if (item.name === employee.name || item.department !== employee.department) return false;
    const leadPosition = normalize(item.position);
    return leadPosition.includes("baş") || leadPosition.includes("rəhbər");
  });

  return departmentLead?.name || "";
}

function getDepartmentParentName(employee = {}) {
  if (employee.departmentParent) return employee.departmentParent;
  const parts = String(employee.department || "")
    .split(/\s*(?:\/|>|›)\s*/)
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
}

function getHrDraft(employee, employees) {
  return {
    department: employee?.department || "",
    departmentParent: employee ? getDepartmentParentName(employee) : "",
    position: employee?.position || "",
    managerName: employee ? getEmployeeManagerName(employee, employees) : "",
    level: employee ? getEmployeeLevel(employee) : "Komanda üzvü",
  };
}

function buildHrStructure(employees, departmentRecords = []) {
  const normalizedEmployees = employees.map((employee) => ({
    ...employee,
    managerName: getEmployeeManagerName(employee, employees),
    level: getEmployeeLevel(employee),
  }));
  const departmentNames = [...new Set(normalizedEmployees.map((employee) => employee.department || "Şöbəsiz"))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );

  const structures = departmentNames.map((department) => {
    const departmentRows = normalizedEmployees.filter((employee) => (employee.department || "Şöbəsiz") === department);
    const departmentNames = new Set(departmentRows.map((employee) => employee.name));
    const byManager = new Map();

    departmentRows.forEach((employee) => {
      const manager = departmentNames.has(employee.managerName) ? employee.managerName : "";
      const children = byManager.get(manager) || [];
      children.push(employee);
      byManager.set(manager, children);
    });

    const buildNode = (employee, visited = new Set()) => {
      if (visited.has(employee.name)) {
        return { ...employee, children: [] };
      }
      const nextVisited = new Set(visited);
      nextVisited.add(employee.name);
      const children = (byManager.get(employee.name) || [])
        .filter((child) => child.name !== employee.name)
        .sort((a, b) => a.name.localeCompare(b.name, "az"))
        .map((child) => buildNode(child, nextVisited));

      return { ...employee, children };
    };

    return {
      department,
      parentDepartment: departmentRows.map((employee) => getDepartmentParentName(employee)).find(Boolean) || "",
      leadCount: departmentRows.filter((employee) => isHrLeadershipLevel(employee.level)).length,
      salary: total(departmentRows, "salary"),
      avgKpi: departmentRows.length ? Math.round(total(departmentRows, "kpi") / departmentRows.length) : 0,
      roots: (byManager.get("") || []).sort((a, b) => a.name.localeCompare(b.name, "az")).map((employee) => buildNode(employee)),
      count: departmentRows.length,
    };
  });

  const structuresByDepartment = new Map(structures.map((department) => [department.department, department]));
  departmentRecords.forEach((record) => {
    const department = String(record.name || "").trim();
    if (!department) return;

    const existing = structuresByDepartment.get(department);
    if (existing) {
      existing.parentDepartment = String(record.parentDepartment || existing.parentDepartment || "").trim();
      return;
    }

    structuresByDepartment.set(department, {
      department,
      parentDepartment: String(record.parentDepartment || "").trim(),
      leadCount: 0,
      salary: 0,
      avgKpi: 0,
      roots: [],
      count: 0,
    });
  });

  return [...structuresByDepartment.values()].sort((left, right) => left.department.localeCompare(right.department, "az"));
}

function buildHrDepartmentTree(structure = []) {
  const nodes = new Map();
  const ensureNode = (department, parentDepartment = "", source = null) => {
    if (!department) return null;
    const current = nodes.get(department) || {
      id: department,
      department,
      parentDepartment,
      children: [],
      isVirtual: !source,
      count: 0,
      leadCount: 0,
      salary: 0,
      avgKpi: 0,
    };
    if (source) {
      Object.assign(current, {
        ...source,
        id: department,
        parentDepartment: source.parentDepartment || parentDepartment,
        children: current.children || [],
        isVirtual: false,
      });
    }
    nodes.set(department, current);
    return current;
  };

  structure.forEach((department) => {
    const parentDepartment = department.parentDepartment || "";
    ensureNode(department.department, parentDepartment, department);
    if (parentDepartment) ensureNode(parentDepartment);
  });

  const roots = [];
  nodes.forEach((node) => {
    node.children = [];
  });
  nodes.forEach((node) => {
    const parent = node.parentDepartment && nodes.get(node.parentDepartment);
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (items) => items
    .sort((a, b) => a.department.localeCompare(b.department, "az"))
    .map((node) => ({ ...node, children: sortNodes(node.children) }));
  return sortNodes(roots);
}

function getHrDepartmentIds(nodes = [], ids = []) {
  nodes.forEach((node) => {
    ids.push(node.id);
    getHrDepartmentIds(node.children, ids);
  });
  return ids;
}

function getHrDepartmentLead(department) {
  const roots = department.roots || [];
  return roots.find((employee) => isHrLeadershipLevel(employee.level)) || roots[0] || null;
}

function getHrDepartmentScope(departmentTree, selectedDepartment) {
  if (!selectedDepartment || selectedDepartment === "all") return null;
  const collect = (nodes) => {
    for (const node of nodes) {
      if (node.id === selectedDepartment) {
        const names = new Set();
        const visit = (current) => {
          names.add(current.department);
          current.children.forEach(visit);
        };
        visit(node);
        return names;
      }
      const nested = collect(node.children);
      if (nested) return nested;
    }
    return null;
  };
  return collect(departmentTree) || new Set([selectedDepartment]);
}

function buildHrReportingForest(employees = [], departmentScope = null) {
  const normalizedEmployees = employees.map((employee) => ({
    ...employee,
    employeeKey: getEmployeeKey(employee),
    manager: getEmployeeManager(employee, employees),
    managerName: getEmployeeManagerName(employee, employees),
    level: getEmployeeLevel(employee),
  }));
  const rowsByKey = new Map(normalizedEmployees.map((employee) => [employee.employeeKey, employee]));
  const childrenByManager = new Map();
  normalizedEmployees.forEach((employee) => {
    const managerKey = employee.manager ? getEmployeeKey(employee.manager) : "";
    const children = childrenByManager.get(managerKey) || [];
    children.push(employee);
    childrenByManager.set(managerKey, children);
  });

  const buildNode = (employee, visited = new Set()) => {
    if (visited.has(employee.employeeKey)) return { ...employee, children: [] };
    const nextVisited = new Set(visited);
    nextVisited.add(employee.employeeKey);
    const children = (childrenByManager.get(employee.employeeKey) || [])
      .filter((child) => child.employeeKey !== employee.employeeKey)
      .sort((a, b) => a.name.localeCompare(b.name, "az"))
      .map((child) => buildNode(child, nextVisited));
    const isInScope = !departmentScope || departmentScope.has(employee.department);
    if (!isInScope && children.length === 0) return null;
    return { ...employee, children: children.filter(Boolean), isInScope };
  };

  const roots = normalizedEmployees
    .filter((employee) => !employee.manager || !rowsByKey.has(getEmployeeKey(employee.manager)))
    .sort((a, b) => a.name.localeCompare(b.name, "az"))
    .map((employee) => buildNode(employee))
    .filter(Boolean);

  const nestedKeys = new Set();
  const collectKeys = (node) => {
    nestedKeys.add(node.employeeKey);
    node.children.forEach(collectKeys);
  };
  roots.forEach(collectKeys);
  normalizedEmployees.forEach((employee) => {
    if (!nestedKeys.has(employee.employeeKey)) {
      const node = buildNode(employee);
      if (node) roots.push(node);
    }
  });
  return roots;
}

function buildHrPlanningRows(structure) {
  return structure.map((department, index) => {
    const vacancyNeed = department.count < 2 ? 1 : department.avgKpi < 90 ? 1 : 0;
    const trainingNeed = department.avgKpi < 95 ? "Təlim planı" : "Standart izləmə";
    const payrollForecast = Math.round(Number(department.salary || 0) * 1.08);

    return {
      department: department.department,
      headcount: department.count,
      leaders: department.leadCount,
      avgKpi: department.avgKpi,
      vacancyNeed,
      trainingNeed,
      payrollForecast,
      onboarding: vacancyNeed > 0 ? (index % 2 ? "Satış təcrübəçisi" : "Əməliyyat assistenti") : "Yeni qəbul yoxdur",
      status: vacancyNeed > 0 ? "Vakansiya aç" : department.avgKpi < 95 ? "Təlim lazımdır" : "Stabil",
    };
  });
}

function getHrDocumentRows(employee = {}) {
  const score = Math.max(0, Math.min(100, Number(employee.documentsComplete || 0)));
  const rows = [
    { key: "identity", title: "Şəxsiyyət/FİN", threshold: 25 },
    { key: "contract", title: "Əmək müqaviləsi", threshold: 60 },
    { key: "job", title: "Vəzifə təlimatı", threshold: 80 },
    { key: "policy", title: "NDA / daxili qaydalar", threshold: 100 },
  ];

  return rows.map((row) => {
    const complete = score >= row.threshold;
    const critical = !complete && row.threshold <= 60;
    return {
      ...row,
      complete,
      status: complete ? "Tamam" : critical ? "Yenilənməlidir" : "Təsdiq gözləyir",
      progress: Math.min(100, Math.round((score / row.threshold) * 100)),
    };
  });
}

function getHrDocumentHealth(record = {}) {
  const documents = getHrDocumentRows(record);
  const missing = documents.filter((document) => !document.complete);
  return {
    documents,
    missingCount: missing.length,
    status:
      missing.length === 0
        ? "Tamam"
        : missing.some((document) => document.status === "Yenilənməlidir")
          ? "Yenilənməlidir"
          : "Təsdiq gözləyir",
  };
}

function buildHrLeaveUsageMap(leaveRequests = []) {
  return leaveRequests.reduce((map, request) => {
    const key = request.employeeId || request.employeeName;
    if (!key) return map;
    const current = map.get(key) || { approved: 0, pending: 0 };
    if (request.status === "Təsdiq edildi") current.approved += Number(request.days || 0);
    if (request.status === "Təsdiq gözləyir") current.pending += Number(request.days || 0);
    map.set(key, current);
    if (request.employeeName && request.employeeName !== key) {
      const byName = map.get(request.employeeName) || { approved: 0, pending: 0 };
      if (request.status === "Təsdiq edildi") byName.approved += Number(request.days || 0);
      if (request.status === "Təsdiq gözləyir") byName.pending += Number(request.days || 0);
      map.set(request.employeeName, byName);
    }
    return map;
  }, new Map());
}

function buildHrEmployeeRecords(employees, leaveRequests = []) {
  const leaveUsage = buildHrLeaveUsageMap(leaveRequests);
  return employees.map((employee) => {
    const salary = Number(employee.salary || 0);
    const kpi = Number(employee.kpi || 0);
    const bonus = kpi >= 105 ? Math.round(salary * 0.14) : kpi >= 95 ? Math.round(salary * 0.07) : 0;
    const payrollTax = calculatePayrollTax2026(salary + bonus);
    const tax = payrollTax.incomeTax;
    const social = payrollTax.employeeSocial + payrollTax.employeeUnemployment;
    const netSalary = payrollTax.net;
    const documentReviewRequired = Boolean(employee.documentReviewRequired || employee.hrStatus === "Məlumat gözləyir");
    const documentsComplete = documentReviewRequired ? Number(employee.documentsComplete || 0) : 100;
    const attendanceRate = Number(employee.attendanceRate || 0);
    const lateDays = Number(employee.lateDays || 0);
    const employeeKey = getEmployeeKey(employee);
    const leave = leaveUsage.get(employeeKey) || leaveUsage.get(employee.name) || { approved: 0, pending: 0 };
    const baseLeaveBalance = Number(employee.leaveBalance || 0);
    const usedLeave = Number(employee.usedLeave || 0) + Number(leave.approved || 0);
    const leaveBalance = Math.max(0, baseLeaveBalance - Number(leave.approved || 0));
    const documentHealth = getHrDocumentHealth({ ...employee, documentsComplete });
    const payrollStatus =
      employee.payrollPaidAt
        ? "Ödənildi"
        : documentHealth.missingCount > 0
          ? "Sənəd gözləyir"
          : employee.payrollStatus || "Hesablama hazırdır";

    return {
      ...employee,
      employeeKey,
      level: getEmployeeLevel(employee),
      managerName: getEmployeeManagerName(employee, employees),
      hireDate: employee.hireDate || "",
      workMode: employee.workMode || "Təyin edilməyib",
      shift: employee.shift || "Təyin edilməyib",
      employmentType: employee.employmentType || "Təyin edilməyib",
      leaveBalance,
      leaveBaseBalance: baseLeaveBalance,
      usedLeave,
      pendingLeaveDays: Number(leave.pending || 0),
      attendanceRate,
      lateDays,
      documentsComplete,
      documentRows: documentHealth.documents,
      documentStatus: documentHealth.status,
      missingDocumentCount: documentHealth.missingCount,
      skills: Array.isArray(employee.skills) ? employee.skills : [],
      nextReview: employee.nextReview || "",
      bonus,
      tax,
      social,
      employerSocial: payrollTax.employerSocial,
      employerUnemployment: payrollTax.employerUnemployment,
      employerCost: payrollTax.employerCost,
      netSalary,
      payrollStatus,
      payrollPeriod: employee.payrollPeriod || baseFinanceDate.slice(0, 7),
      payrollPaidAt: employee.payrollPaidAt || "",
      hrStatus: employee.hrStatus || "Stabil",
    };
  });
}

function buildHrAttendanceRows(records) {
  return records.filter((record) => record.checkIn || record.checkOut).map((record) => ({
    id: `${record.name}-attendance`,
    employee: record.name,
    department: record.department,
    shift: record.shift,
    checkIn: record.checkIn || "—",
    checkOut: record.checkOut || "—",
    lateDays: record.lateDays,
    attendanceRate: record.attendanceRate,
    status: record.attendanceRate < 90 ? "Nəzarət" : record.lateDays > 2 ? "Gecikmə var" : "Normal",
  }));
}

function buildHrLeaveRows(records, leaveRequests = []) {
  const recordByKey = new Map(records.map((record) => [getEmployeeKey(record), record]));
  return leaveRequests.map((request) => {
    const employee = recordByKey.get(request.employeeId) || records.find((record) => record.name === request.employeeName);
    return {
      id: request.id,
      employee: employee?.name || request.employeeName || "Əməkdaş silinib",
      department: employee?.department || request.department || "—",
      type: request.type,
      from: request.from,
      to: request.to,
      days: Number(request.days || 0),
      balance: Math.max(0, Number(employee?.leaveBalance || 0)),
      pendingDays: Number(employee?.pendingLeaveDays || 0),
      approver: request.approver || employee?.managerName || "HR",
      status: request.status || "Təsdiq gözləyir",
      decidedAt: request.decidedAt || "",
    };
  });
}

function buildHrPayrollRows(records) {
  return records.map((record) => ({
    employeeKey: record.employeeKey,
    employee: record.name,
    department: record.department,
    salary: Number(record.salary || 0),
    bonus: record.bonus,
    deductions: record.tax + record.social,
    netSalary: record.netSalary,
    employerCost: record.employerCost,
    period: record.payrollPeriod,
    paidAt: record.payrollPaidAt,
    documentStatus: record.documentStatus,
    status: record.payrollStatus,
  }));
}

function buildHrRecruitmentRows(planningRows, vacancies = []) {
  const activeVacancies = vacancies.map((vacancy) => ({
    ...vacancy,
    candidates: Number(vacancy.candidates || 0),
    stage: vacancy.stage || "Namizəd gözlənilir",
    status: vacancy.status || "Aktiv vakansiya",
  }));
  const knownDepartments = new Set(activeVacancies.map((vacancy) => vacancy.department));
  const plannedVacancies = planningRows
    .filter((row) => Number(row.vacancyNeed || 0) > 0 && !knownDepartments.has(row.department))
    .map((row) => ({
      id: `PLAN-${row.department}`,
      role: `${row.department} üzrə mütəxəssis`,
      department: row.department,
      candidates: 0,
      stage: "Planlanır",
      owner: "HR",
      targetDate: "Təyin edilməyib",
      status: "Planlanır",
    }));
  return [...activeVacancies, ...plannedVacancies];
}

function HrPage({
  employees,
  allEmployees = employees,
  departments = [],
  leaveRequests = [],
  vacancies = [],
  onUpdateEmployeeStructure,
  onEditEmployee,
  onDeleteEmployee,
  onCreateDepartment,
  onCreateLeaveRequest,
  onCreateVacancy,
  onUpdateLeaveStatus,
  onMarkPayrollPaid,
  onUpdateEmployeeDocuments,
}) {
  const structure = useMemo(() => buildHrStructure(allEmployees, departments), [allEmployees, departments]);
  const [hrView, setHrView] = useState("Komanda");
  const [selectedEmployeeName, setSelectedEmployeeName] = useState(allEmployees[0]?.name || "");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamDepartment, setTeamDepartment] = useState("Hamısı");
  const [teamStatus, setTeamStatus] = useState("Hamısı");
  const selectedEmployee =
    allEmployees.find((employee) => employee.name === selectedEmployeeName) || allEmployees[0] || null;
  const departmentCount = structure.length;
  const leaders = allEmployees.filter((employee) => isHrLeadershipLevel(getEmployeeLevel(employee)));
  const averageKpi = employees.length ? total(employees, "kpi") / employees.length : 0;
  const hrPlanningRows = useMemo(() => buildHrPlanningRows(structure), [structure]);
  const vacancyCount = hrPlanningRows.reduce((sum, row) => sum + Number(row.vacancyNeed || 0), 0);
  const hrEmployeeRecords = useMemo(() => buildHrEmployeeRecords(allEmployees, leaveRequests), [allEmployees, leaveRequests]);
  const teamDepartments = useMemo(
    () => [...new Set(hrEmployeeRecords.map((record) => record.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "az")),
    [hrEmployeeRecords],
  );
  const visibleHrEmployeeRecords = useMemo(() => {
    const query = normalize(teamQuery);
    return hrEmployeeRecords.filter((record) => {
      const matchesQuery = !query || [record.name, record.position, record.department, record.managerName]
        .some((value) => normalize(value).includes(query));
      const matchesDepartment = teamDepartment === "Hamısı" || record.department === teamDepartment;
      const matchesStatus = teamStatus === "Hamısı" || record.hrStatus === teamStatus;
      return matchesQuery && matchesDepartment && matchesStatus;
    });
  }, [hrEmployeeRecords, teamDepartment, teamQuery, teamStatus]);
  const visibleEmployeeNames = useMemo(
    () => new Set(visibleHrEmployeeRecords.map((record) => record.name)),
    [visibleHrEmployeeRecords],
  );
  const visibleRegistryEmployees = employees.filter((employee) => visibleEmployeeNames.has(employee.name));
  const selectedHrRecord =
    visibleHrEmployeeRecords.find((record) => record.name === selectedEmployeeName) || visibleHrEmployeeRecords[0] || null;
  const attendanceRows = useMemo(() => buildHrAttendanceRows(hrEmployeeRecords), [hrEmployeeRecords]);
  const leaveRows = useMemo(() => buildHrLeaveRows(hrEmployeeRecords, leaveRequests), [hrEmployeeRecords, leaveRequests]);
  const payrollRows = useMemo(() => buildHrPayrollRows(hrEmployeeRecords), [hrEmployeeRecords]);
  const recruitmentRows = useMemo(() => buildHrRecruitmentRows(hrPlanningRows, vacancies), [hrPlanningRows, vacancies]);
  const payrollTotal = payrollRows.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
  const pendingLeaveCount = leaveRows.filter((row) => row.status === "Təsdiq gözləyir").length;
  const paidPayrollCount = payrollRows.filter((row) => row.status === "Ödənildi").length;
  const documentRiskCount = hrEmployeeRecords.filter((row) => row.missingDocumentCount > 0).length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Ümumi əməkdaş" value={employees.length} icon={Users} tone="primary" />
        <MetricCard label="Aylıq maaş fondu" value={money(total(employees, "salary"))} icon={Wallet} tone="success" />
        <MetricCard
          label="Orta KPI"
          value={percent(averageKpi)}
          icon={TrendingUp}
          tone="info"
        />
        <MetricCard label="Struktur şöbələri" value={departmentCount} trend={`${leaders.length} rəhbər rol`} icon={Building2} tone="warning" />
      </section>

      <Panel className="hr-platform-panel">
        <PanelHeader
          title="HR Platform"
          subtitle="Əməkdaş 360, iş vaxtı, məzuniyyət, payroll və recruitment axınları"
          icon={UserCog}
        />
        <div className="hr-platform-toolbar">
          <div className="tabs">
            {hrPlatformTabs.map((tab) => (
              <button key={tab} className={hrView === tab ? "active" : ""} onClick={() => setHrView(tab)}>
                {tab}
              </button>
            ))}
          </div>
          <div className="hr-platform-kpis">
            <span>{pendingLeaveCount} məzuniyyət təsdiqdə</span>
            <span>{paidPayrollCount}/{payrollRows.length} payroll ödənildi</span>
            <span>{documentRiskCount} sənəd açığı</span>
            <span>{vacancyCount} vakansiya</span>
          </div>
        </div>
        {hrView === "Komanda" && (
          <div className="hr-team-workspace">
            <div className="hr-team-controls">
              <label className="hr-team-search">
                <Search size={16} />
                <input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="Əməkdaş, vəzifə və ya rəhbər axtar..." />
              </label>
              <select value={teamDepartment} onChange={(event) => setTeamDepartment(event.target.value)}>
                <option>Hamısı</option>
                {teamDepartments.map((department) => <option key={department}>{department}</option>)}
              </select>
              <select value={teamStatus} onChange={(event) => setTeamStatus(event.target.value)}>
                <option>Hamısı</option>
                <option>Stabil</option>
                <option>Məlumat gözləyir</option>
              </select>
              <strong>{visibleHrEmployeeRecords.length} əməkdaş</strong>
            </div>
            <HrEmployeePlatform
              records={visibleHrEmployeeRecords}
              selectedRecord={selectedHrRecord}
              onSelect={setSelectedEmployeeName}
              onEdit={onEditEmployee}
              onDelete={onDeleteEmployee}
              onUpdateDocuments={onUpdateEmployeeDocuments}
            />
          </div>
        )}
        {hrView === "İş vaxtı" && <HrAttendancePlatform rows={attendanceRows} />}
        {hrView === "Məzuniyyət" && <HrLeavePlatform rows={leaveRows} onCreate={onCreateLeaveRequest} onUpdateStatus={onUpdateLeaveStatus} />}
        {hrView === "Payroll" && <HrPayrollPlatform rows={payrollRows} totalNet={payrollTotal} onMarkPaid={onMarkPayrollPaid} />}
        {hrView === "Recruitment" && <HrRecruitmentPlatform rows={recruitmentRows} onCreate={onCreateVacancy} />}
      </Panel>

      <Panel className="hr-planning-panel">
        <PanelHeader
          title="HR planlama"
          subtitle="Vakansiya, onboarding, təlim və maaş forecast göstəriciləri"
          icon={UserCog}
        />
        <div className="hr-planning-summary">
          <div>
            <span>Açılacaq vakansiya</span>
            <strong>{vacancyCount}</strong>
            <small>Şöbə yükünə görə</small>
          </div>
          <div>
            <span>Növbəti maaş forecast</span>
            <strong>{money(hrPlanningRows.reduce((sum, row) => sum + row.payrollForecast, 0))}</strong>
            <small>8% artım modeli</small>
          </div>
          <div>
            <span>Təlim ehtiyacı</span>
            <strong>{hrPlanningRows.filter((row) => row.status === "Təlim lazımdır").length}</strong>
            <small>KPI 95%-dən aşağı</small>
          </div>
        </div>
        <DataTable
          columns={["Şöbə", "Headcount", "Rəhbər", "Orta KPI", "Onboarding", "Maaş forecast", "Status"]}
          rows={hrPlanningRows.map((row) => [
            <strong>{row.department}</strong>,
            row.headcount,
            row.leaders,
            `${row.avgKpi}%`,
            row.onboarding,
            money(row.payrollForecast),
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>

      <section className="hr-structure-layout">
        <Panel className="hr-builder-panel">
          <PanelHeader title="Struktur qurucusu" subtitle="Əməkdaşı seçin, rəhbər və şöbə əlaqəsini təyin edin" icon={UserCog} />
          {selectedEmployee ? (
            <HrStructureBuilder
              key={selectedEmployee.name}
              employees={allEmployees}
              departments={departments}
              selectedEmployee={selectedEmployee}
              onSelectEmployee={setSelectedEmployeeName}
              onUpdate={onUpdateEmployeeStructure}
            />
          ) : (
            <EmptyState title="Struktur üçün əməkdaş yoxdur" />
          )}
        </Panel>

        <Panel className="hr-tree-panel">
          <PanelHeader title="Struktur ağacı" subtitle="Şöbə, rəhbər və komanda xətti" icon={Building2} />
          <div className="hr-structure-actions">
            <button className="secondary-btn" onClick={onCreateDepartment}><Plus size={16} /> Şöbə əlavə et</button>
          </div>
          <HrStructureTree structure={structure} employees={allEmployees} onSelectEmployee={setSelectedEmployeeName} />
        </Panel>
      </section>

      <Panel className="hr-employee-registry-panel">
        <PanelHeader title={`Əməkdaşlar (${visibleRegistryEmployees.length})`} subtitle="Vəzifə, şöbə, maaş və KPI" />
        <DataTable
          columns={["Əməkdaş", "Vəzifə", "Şöbə", "Rəhbər", "Səviyyə", "Maaş", "KPI", ""]}
          rows={visibleRegistryEmployees.map((employee) => [
            <AvatarLine initials={employee.initials} title={employee.name} />,
            employee.position,
            employee.department,
            getEmployeeManagerName(employee, allEmployees) || "Birbaşa",
            <StatusBadge status={getEmployeeLevel(employee)} />,
            money(employee.salary),
            <ProgressRow label={`${employee.kpi}%`} value={employee.kpi} compact />,
            <div className="hr-row-actions">
              <button className="icon-btn hr-row-edit" title="Əməkdaşı redaktə et" aria-label={`${employee.name} əməkdaşını redaktə et`} onClick={() => onEditEmployee(employee)}><Pencil size={16} /></button>
              <button className="icon-btn hr-row-delete" title="Əməkdaşı sil" aria-label={`${employee.name} əməkdaşını sil`} onClick={() => onDeleteEmployee(employee)}><Trash2 size={16} /></button>
            </div>,
          ])}
        />
        <div className="hr-mobile-employee-list">
          {visibleRegistryEmployees.map((employee) => (
            <div className="hr-mobile-employee-card" key={employee.name}>
              <div className="hr-mobile-employee-head">
                <AvatarLine initials={employee.initials} title={employee.name} subtitle={employee.position} />
                <div className="hr-row-actions">
                  <button className="icon-btn hr-row-edit" title="Əməkdaşı redaktə et" aria-label={`${employee.name} əməkdaşını redaktə et`} onClick={() => onEditEmployee(employee)}><Pencil size={16} /></button>
                  <button className="icon-btn hr-row-delete" title="Əməkdaşı sil" aria-label={`${employee.name} əməkdaşını sil`} onClick={() => onDeleteEmployee(employee)}><Trash2 size={16} /></button>
                </div>
              </div>
              <div className="hr-mobile-employee-meta">
                <span>{employee.department}</span>
                <span>{getEmployeeManagerName(employee, allEmployees) || "Birbaşa"}</span>
                <span>{money(employee.salary)}</span>
              </div>
              <ProgressRow label={`${employee.kpi}% KPI`} value={employee.kpi} compact />
              <StatusBadge status={getEmployeeLevel(employee)} />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function HrEmployeePlatform({ records, selectedRecord, onSelect, onEdit, onDelete, onUpdateDocuments }) {
  if (!selectedRecord) return <EmptyState title={records.length ? "Əməkdaş seçilməyib" : "Filterə uyğun əməkdaş tapılmadı"} />;

  const documentRows = selectedRecord.documentRows || getHrDocumentRows(selectedRecord);

  return (
    <section className="hr-employee-platform">
      <div className="hr-people-list">
        {records.map((record) => (
          <button
            key={record.name}
            className={`hr-person-row ${selectedRecord.name === record.name ? "active" : ""}`}
            onClick={() => onSelect(record.name)}
          >
            <AvatarLine initials={record.initials} title={record.name} subtitle={`${record.department} · ${record.position}`} />
            <div className="hr-person-status-stack">
              <StatusBadge status={record.hrStatus} />
              <StatusBadge status={record.documentStatus} />
            </div>
          </button>
        ))}
      </div>

      <div className="hr-profile-360" data-testid="hr-employee-360">
        <div className="hr-profile-head">
          <div className="avatar large">{selectedRecord.initials}</div>
          <div>
            <span>{selectedRecord.level}</span>
            <h3>{selectedRecord.name}</h3>
            <p>{selectedRecord.position} · {selectedRecord.department}</p>
          </div>
          <div className="hr-profile-actions">
            <StatusBadge status={selectedRecord.hrStatus} />
            <button className="icon-btn hr-profile-edit" title="Əməkdaşı redaktə et" aria-label={`${selectedRecord.name} əməkdaşını redaktə et`} onClick={() => onEdit(selectedRecord)}><Pencil size={16} /></button>
            <button className="icon-btn hr-row-delete hr-profile-delete" title="Əməkdaşı sil" aria-label={`${selectedRecord.name} əməkdaşını sil`} onClick={() => onDelete(selectedRecord)}><Trash2 size={16} /></button>
          </div>
        </div>
        <div className="hr-profile-grid">
          <TwoLine title="Rəhbər" subtitle={selectedRecord.managerName || "Birbaşa rəhbərlik"} />
          <TwoLine title="İş rejimi" subtitle={`${selectedRecord.workMode} · ${selectedRecord.shift}`} />
          <TwoLine title="İşə qəbul" subtitle={selectedRecord.hireDate} />
          <TwoLine title="Növbəti review" subtitle={selectedRecord.nextReview} />
          <TwoLine title="Attendance" subtitle={percent(selectedRecord.attendanceRate)} />
          <TwoLine title="Məzuniyyət balansı" subtitle={`${selectedRecord.leaveBalance} gün`} />
          <TwoLine title="Sənəd uyğunluğu" subtitle={percent(selectedRecord.documentsComplete)} />
          <TwoLine title="Net payroll" subtitle={money(selectedRecord.netSalary)} />
          <TwoLine title="Payroll statusu" subtitle={selectedRecord.payrollStatus} />
          <TwoLine title="Payroll periodu" subtitle={selectedRecord.payrollPeriod} />
          <TwoLine title="Ödənilmə tarixi" subtitle={selectedRecord.payrollPaidAt || "Hələ bağlanmayıb"} />
          <TwoLine title="Sənəd statusu" subtitle={selectedRecord.documentStatus} />
        </div>
        <div className="hr-profile-snapshot">
          <div>
            <span>Məzuniyyət</span>
            <strong>{selectedRecord.leaveBalance} gün qalıq</strong>
            <small>{selectedRecord.usedLeave} gün istifadə · {selectedRecord.pendingLeaveDays} gün təsdiqdə</small>
          </div>
          <div>
            <span>Payroll</span>
            <strong>{selectedRecord.payrollStatus}</strong>
            <small>{money(selectedRecord.netSalary)} net · {money(selectedRecord.employerCost)} işəgötürən xərci</small>
          </div>
          <div>
            <span>Sənədlər</span>
            <strong>{selectedRecord.documentStatus}</strong>
            <small>{selectedRecord.missingDocumentCount} açıq sənəd · {percent(selectedRecord.documentsComplete)}</small>
          </div>
        </div>
        <div className="hr-skill-strip">
          {(selectedRecord.skills.length ? selectedRecord.skills : ["Profil bacarıqları əlavə edilməyib"]).map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
        <div className="hr-document-grid">
          {documentRows.map((document) => (
            <div key={document.key} className={document.complete ? "complete" : "attention"}>
              <span>
                {document.title}
                <small>{document.progress}%</small>
              </span>
              <StatusBadge status={document.status} />
            </div>
          ))}
        </div>
        {selectedRecord.missingDocumentCount > 0 && onUpdateDocuments && (
          <button className="secondary-btn hr-document-complete" data-testid="hr-document-complete" onClick={() => onUpdateDocuments(selectedRecord.employeeKey, 100)}>
            <Check size={16} />
            Sənədləri tamamla
          </button>
        )}
      </div>
    </section>
  );
}

function HrAttendancePlatform({ rows }) {
  const averageAttendance = rows.length
    ? rows.reduce((sum, row) => sum + Number(row.attendanceRate || 0), 0) / rows.length
    : 0;
  const lateTotal = rows.reduce((sum, row) => sum + Number(row.lateDays || 0), 0);

  return (
    <div className="hr-platform-section">
      <div className="hr-platform-summary">
        <div>
          <span>Orta davamiyyət</span>
          <strong>{percent(averageAttendance)}</strong>
          <small>Bu ay üzrə</small>
        </div>
        <div>
          <span>Gecikmə</span>
          <strong>{lateTotal}</strong>
          <small>Toplam gecikmə günü</small>
        </div>
        <div>
          <span>Nəzarət</span>
          <strong>{rows.filter((row) => row.status !== "Normal").length}</strong>
          <small>HR follow-up</small>
        </div>
      </div>
      <DataTable
        columns={["Əməkdaş", "Şöbə", "Növbə", "Giriş", "Çıxış", "Gecikmə", "Davamiyyət", "Status"]}
        rows={rows.map((row) => [
          <strong>{row.employee}</strong>,
          row.department,
          row.shift,
          row.checkIn,
          row.checkOut,
          `${row.lateDays} gün`,
          <ProgressRow value={row.attendanceRate} label={percent(row.attendanceRate)} compact />,
          <StatusBadge status={row.status} />,
        ])}
      />
    </div>
  );
}

function HrLeavePlatform({ rows, onCreate, onUpdateStatus }) {
  const pending = rows.filter((row) => row.status === "Təsdiq gözləyir");
  const plannedDays = rows.reduce((sum, row) => sum + Number(row.days || 0), 0);
  const approvedDays = rows
    .filter((row) => row.status === "Təsdiq edildi")
    .reduce((sum, row) => sum + Number(row.days || 0), 0);

  return (
    <div className="hr-platform-section">
      <div className="hr-operation-toolbar">
        <span>Məzuniyyət tələbləri və balans nəzarəti</span>
        <button className="secondary-btn" onClick={onCreate}><Plus size={16} /> Məzuniyyət qeydi</button>
      </div>
      <div className="hr-platform-summary">
        <div>
          <span>Təsdiq gözləyir</span>
          <strong>{pending.length}</strong>
          <small>Rəhbər baxışı</small>
        </div>
        <div>
          <span>Təsdiqlənən gün</span>
          <strong>{approvedDays}</strong>
          <small>Balansdan silinir</small>
        </div>
        <div>
          <span>Planlanan gün</span>
          <strong>{plannedDays}</strong>
          <small>Məzuniyyət yükü</small>
        </div>
        <div>
          <span>Orta balans</span>
          <strong>{rows.length ? Math.round(rows.reduce((sum, row) => sum + row.balance, 0) / rows.length) : 0}</strong>
          <small>Qalıq gün</small>
        </div>
      </div>
      <DataTable
        columns={["Əməkdaş", "Tip", "Tarix", "Gün", "Balans", "Təsdiqləyən", "Status", ""]}
        rows={rows.map((row) => [
          <TwoLine title={row.employee} subtitle={row.department} />,
          row.type,
          `${row.from} → ${row.to}`,
          row.days,
          `${row.balance} gün`,
          row.approver,
          <StatusBadge status={row.status} />,
          row.status === "Təsdiq gözləyir" && onUpdateStatus ? (
            <div className="hr-leave-actions">
              <button className="text-btn" onClick={() => onUpdateStatus(row.id, "Təsdiq edildi")}>Təsdiq</button>
              <button className="text-btn danger" onClick={() => onUpdateStatus(row.id, "İmtina edildi")}>İmtina</button>
            </div>
          ) : (
            <small>{row.decidedAt || "—"}</small>
          ),
        ])}
      />
    </div>
  );
}

function HrPayrollPlatform({ rows, totalNet, onMarkPaid }) {
  const gross = rows.reduce((sum, row) => sum + Number(row.salary || 0) + Number(row.bonus || 0), 0);
  const deductions = rows.reduce((sum, row) => sum + Number(row.deductions || 0), 0);
  const net = typeof totalNet === "number" ? totalNet : rows.reduce((sum, row) => sum + Number(row.netSalary || 0), 0);
  const employerCost = rows.reduce((sum, row) => sum + Number(row.employerCost || 0), 0);
  const paidRows = rows.filter((row) => row.status === "Ödənildi");
  const readyRows = rows.filter((row) => row.status === "Hesablama hazırdır");
  const blockedRows = rows.filter((row) => row.status === "Sənəd gözləyir");

  return (
    <div className="hr-platform-section">
      <div className="hr-platform-summary">
        <div>
          <span>Gross payroll</span>
          <strong>{money(gross)}</strong>
          <small>Maaş + bonus</small>
        </div>
        <div>
          <span>Tutulmalar</span>
          <strong>{money(deductions)}</strong>
          <small>Vergi və sosial</small>
        </div>
        <div>
          <span>Net ödəniş</span>
          <strong>{money(net)}</strong>
          <small>Payroll uçotu</small>
        </div>
        <div>
          <span>İşəgötürən xərci</span>
          <strong>{money(employerCost)}</strong>
          <small>Gross + işəgötürən ödənişləri</small>
        </div>
        <div>
          <span>Status</span>
          <strong>{paidRows.length}/{rows.length}</strong>
          <small>{readyRows.length} hazır · {blockedRows.length} sənəd gözləyir</small>
        </div>
      </div>
      <DataTable
        columns={["Əməkdaş", "Şöbə", "Period", "Maaş", "Bonus", "Tutulma", "Net", "İşəgötürən xərci", "Status", ""]}
        rows={rows.map((row) => [
          <strong>{row.employee}</strong>,
          row.department,
          <TwoLine title={row.period} subtitle={row.paidAt || "Ödənilməyib"} />,
          money(row.salary),
          money(row.bonus),
          money(row.deductions),
          <strong>{money(row.netSalary)}</strong>,
          money(row.employerCost),
          <StatusBadge status={row.status} />,
          row.status === "Ödənildi" ? (
            <small>{row.paidAt}</small>
          ) : (
            <div className="hr-payroll-actions">
              <button
                className="text-btn"
                disabled={row.status === "Sənəd gözləyir" || !onMarkPaid}
                onClick={() => onMarkPaid(row.employeeKey)}
              >
                Ödənişi bağla
              </button>
            </div>
          ),
        ])}
      />
    </div>
  );
}

function HrRecruitmentPlatform({ rows, onCreate }) {
  const activeRows = rows.filter((row) => row.status === "Aktiv vakansiya");

  return (
    <div className="hr-platform-section">
      <div className="hr-operation-toolbar">
        <span>Vakansiya pipeline və namizəd mərhələləri</span>
        <button className="secondary-btn" onClick={onCreate}><Plus size={16} /> Vakansiya əlavə et</button>
      </div>
      <div className="hr-recruitment-pipeline">
        {rows.map((row) => (
          <div className="hr-recruitment-card" key={`${row.department}-${row.role}`}>
            <div>
              <strong>{row.role}</strong>
              <span>{row.department} · {row.owner}</span>
            </div>
            <div className="hr-recruitment-meta">
              <b>{row.candidates}</b>
              <small>namizəd</small>
            </div>
            <StatusBadge status={row.stage} />
          </div>
        ))}
      </div>
      <DataTable
        columns={["Rol", "Şöbə", "Namizəd", "Mərhələ", "Owner", "Hədəf tarix", "Status"]}
        rows={rows.map((row) => [
          <strong>{row.role}</strong>,
          row.department,
          row.candidates,
          row.stage,
          row.owner,
          row.targetDate,
          <StatusBadge status={activeRows.includes(row) ? "Aktiv vakansiya" : row.status} />,
        ])}
      />
    </div>
  );
}

function HrStructureBuilder({ employees, departments: departmentRecords = [], selectedEmployee, onSelectEmployee, onUpdate }) {
  const [draft, setDraft] = useState(() => getHrDraft(selectedEmployee, employees));
  const departments = [...new Set([
    ...employees.map((employee) => employee.department),
    ...departmentRecords.map((department) => department.name),
  ].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const parentDepartments = [...new Set([
    ...departments,
    ...employees.map((employee) => getDepartmentParentName(employee)),
    ...departmentRecords.map((department) => department.parentDepartment),
  ].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const managerOptions = employees.filter((employee) => employee.name !== selectedEmployee.name);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onUpdate(selectedEmployee.name, draft);
  }

  return (
    <form className="hr-builder-form" onSubmit={submit}>
      <label>
        <span>Əməkdaş</span>
        <select value={selectedEmployee.name} onChange={(event) => onSelectEmployee(event.target.value)}>
          {employees.map((employee) => (
            <option key={employee.name} value={employee.name}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Şöbə</span>
        <input
          value={draft.department}
          list="hr-departments"
          onChange={(event) => updateDraft("department", event.target.value)}
        />
        <datalist id="hr-departments">
          {departments.map((department) => (
            <option key={department} value={department} />
          ))}
        </datalist>
      </label>
      <label>
        <span>Vəzifə</span>
        <input value={draft.position} onChange={(event) => updateDraft("position", event.target.value)} />
      </label>
      <label>
        <span>Üst şöbə</span>
        <input
          value={draft.departmentParent}
          list="hr-parent-departments"
          onChange={(event) => updateDraft("departmentParent", event.target.value)}
        />
        <datalist id="hr-parent-departments">
          <option value="" />
          {parentDepartments.map((department) => (
            <option key={department} value={department} />
          ))}
        </datalist>
      </label>
      <label>
        <span>Kimə tabedir</span>
        <select value={draft.managerName} onChange={(event) => updateDraft("managerName", event.target.value)}>
          <option value="">Birbaşa rəhbərlik</option>
          {managerOptions.map((employee) => (
            <option key={employee.name} value={employee.name}>
              {employee.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Səviyyə</span>
        <select value={draft.level} onChange={(event) => updateDraft("level", event.target.value)}>
          {hrLevelOptions.map((level) => (
            <option key={level}>{level}</option>
          ))}
        </select>
      </label>
      <div className="hr-builder-preview">
        <TwoLine title={selectedEmployee.name} subtitle={`${draft.position} · ${draft.department}`} />
        <StatusBadge status={draft.level} />
        <small>{draft.managerName ? `${draft.managerName} rəhbərliyində` : "Birbaşa rəhbərlik xətti"} · {draft.departmentParent || "Əsas şöbə"}</small>
      </div>
      <button className="primary-btn" type="submit">
        Strukturda yadda saxla
      </button>
    </form>
  );
}

function HrStructureTree({ structure, employees, onSelectEmployee }) {
  const departmentTree = useMemo(() => buildHrDepartmentTree(structure), [structure]);
  const departmentIds = useMemo(() => getHrDepartmentIds(departmentTree), [departmentTree]);
  const departmentTreeKey = departmentIds.join("|");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [expandedDepartments, setExpandedDepartments] = useState(() => new Set(departmentIds));
  useEffect(() => {
    setExpandedDepartments(new Set(departmentIds));
  }, [departmentTreeKey]);
  const departmentScope = useMemo(
    () => getHrDepartmentScope(departmentTree, selectedDepartment),
    [departmentTree, selectedDepartment],
  );
  const reportingRoots = useMemo(
    () => buildHrReportingForest(employees, departmentScope),
    [employees, departmentScope],
  );
  const selectedTitle = selectedDepartment === "all" ? "Bütün şirkət" : selectedDepartment;

  function toggleDepartment(departmentId) {
    setExpandedDepartments((current) => {
      const next = new Set(current);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  }

  function activateDepartment(department) {
    setSelectedDepartment(department.id);
    if (department.children.length > 0) toggleDepartment(department.id);
  }

  if (structure.length === 0) {
    return <EmptyState title="Struktur ağacı boşdur" />;
  }

  return (
    <div className="hr-tree">
      <div className="hr-org-chart-scroll">
        <div className="hr-org-chart-canvas">
          <button className={`hr-org-company-card ${selectedDepartment === "all" ? "active" : ""}`} onClick={() => setSelectedDepartment("all")}>
            <span className="hr-org-company-icon"><Building2 size={20} /></span>
            <span>
              <strong>ERP+CRM AZ</strong>
              <small>Şirkət strukturu</small>
            </span>
          </button>
          <div className={`hr-org-children hr-org-root-children ${departmentTree.length > 1 ? "multiple" : ""}`}>
            {departmentTree.map((department, index) => (
              <HrOrganizationNode
                key={department.id}
                department={department}
                depth={0}
                index={index}
                selectedDepartment={selectedDepartment}
                expandedDepartments={expandedDepartments}
                onActivate={activateDepartment}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="hr-reporting-panel">
        <div className="hr-reporting-head">
          <div>
            <strong>{selectedTitle} üzrə tabeçilik xətti</strong>
            <span>{departmentScope ? `${departmentScope.size} şöbə` : `${employees.length} əməkdaş`}</span>
          </div>
          <StatusBadge status={`${reportingRoots.length} rəhbərlik xətti`} />
        </div>
        <div className="hr-employee-branch">
          {reportingRoots.map((employee) => (
            <HrEmployeeTreeNode key={employee.employeeKey} employee={employee} onSelectEmployee={onSelectEmployee} />
          ))}
          {reportingRoots.length === 0 && <EmptyState title="Bu şöbə üzrə tabeçilik xətti yoxdur" />}
        </div>
      </div>
    </div>
  );
}

function HrOrganizationNode({ department, depth, index, selectedDepartment, expandedDepartments, onActivate }) {
  const hasChildren = department.children.length > 0;
  const expanded = expandedDepartments.has(department.id);
  const lead = getHrDepartmentLead(department);
  const cardNumber = String(index + 1).padStart(2, "0");

  return (
    <div className={`hr-org-branch ${hasChildren ? "has-children" : ""}`}>
      <button
        className={`hr-org-card tone-${(depth + index) % 4} ${selectedDepartment === department.id ? "active" : ""}`}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => onActivate(department)}
      >
        <span className="hr-org-card-number">{cardNumber}</span>
        <span className="hr-org-card-label">{department.isVirtual ? "Şöbə qrupu" : "Şöbə"}</span>
        <strong>{department.department}</strong>
        <span className="hr-org-card-count"><Users size={13} />{department.count} əməkdaş</span>
        <span className="hr-org-card-lead">
          <span className="small-avatar">{lead?.initials || "HR"}</span>
          <span>
            <b>{lead?.name || "Rəhbər təyin edilməyib"}</b>
            <small>{lead?.position || "Alt şöbələr"}</small>
          </span>
        </span>
        {hasChildren && <ChevronRight size={16} className={`hr-org-card-chevron ${expanded ? "expanded" : ""}`} />}
      </button>
      {hasChildren && expanded && (
        <div className={`hr-org-children ${department.children.length > 1 ? "multiple" : ""}`}>
          {department.children.map((child, childIndex) => (
            <HrOrganizationNode
              key={child.id}
              department={child}
              depth={depth + 1}
              index={childIndex}
              selectedDepartment={selectedDepartment}
              expandedDepartments={expandedDepartments}
              onActivate={onActivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HrEmployeeTreeNode({ employee, onSelectEmployee }) {
  return (
    <div className="hr-tree-item">
      <button className={`hr-employee-node ${employee.isInScope ? "in-scope" : ""}`} onClick={() => onSelectEmployee(employee.name)}>
        <span className="small-avatar">{employee.initials}</span>
        <div>
          <strong>{employee.name}</strong>
          <span>{employee.position} · {employee.department}</span>
          <small>{employee.managerName ? `${employee.managerName}-a tabedir` : "Birbaşa rəhbərlik"}</small>
        </div>
        <StatusBadge status={employee.level} />
      </button>
      {employee.children.length > 0 && (
        <div className="hr-tree-children">
          {employee.children.map((child) => (
            <HrEmployeeTreeNode key={child.employeeKey} employee={child} onSelectEmployee={onSelectEmployee} />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiPage({
  employees,
  salesBonuses = [],
  targetRows = [],
  employeeRows = [],
  activePeriod = {},
  periods = [],
  payouts = [],
  onRunPeriodAction,
}) {
  const [bonusFilter, setBonusFilter] = useState("Hamısı");
  const rankingSource = employeeRows.length > 0 ? employeeRows : buildKpiEmployeeScoreRows(employees, salesBonuses);
  const ranking = [...rankingSource].sort((a, b) => Number(b.kpi || 0) - Number(a.kpi || 0));
  const companyKpi = targetRows.find((row) => row.metricKey === "companyKpi")?.actual || 0;
  const topPerformer = ranking[0];
  const bonusSellers = [...new Set(salesBonuses.map((row) => row.seller).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const visibleBonuses = salesBonuses.filter((row) => bonusFilter === "Hamısı" || row.seller === bonusFilter);
  const bonusTotal = total(salesBonuses, "bonusAmount");
  const visibleBonusTotal = total(visibleBonuses, "bonusAmount");
  const payoutRows = rankingSource.filter((row) => Number(row.payoutAmount || 0) > 0);
  const periodHistory = [...periods].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const lastPayout = payouts[0];
  const canClose = activePeriod.status !== "Period bağlandı";
  const canApprove = activePeriod.status === "Period bağlandı" && activePeriod.approvalStatus !== "Təsdiq edildi";
  const canPayout = activePeriod.approvalStatus === "Təsdiq edildi" && activePeriod.payoutStatus !== "Ödənildi";

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Şirkət ümumi KPI" value={percent(companyKpi)} trend={`${ranking.length} əməkdaş üzrə`} icon={TrendingUp} tone="success" />
        <MetricCard label="Period score" value={percent(activePeriod.companyScore || 0)} trend={activePeriod.period || getKpiPeriodKey()} icon={CalendarClock} tone="primary" />
        <MetricCard label="Payout fondu" value={money(activePeriod.payoutAmount || 0)} trend={`${payoutRows.length} əməkdaş`} icon={Wallet} tone="warning" />
        <MetricCard label="Top performer" value={topPerformer?.name || "Məlumat yoxdur"} trend={topPerformer ? `${topPerformer.kpi}% KPI` : "Əməkdaş əlavə edilməyib"} icon={ShieldCheck} tone="primary" />
      </section>

      <section className="kpi-control-grid">
        <Panel className="kpi-target-plan-panel" data-testid="kpi-target-plan-panel">
          <PanelHeader title="KPI hədəf planı" subtitle="Çəkili hədəflər və cari faktiki nəticələr" icon={SlidersHorizontal} />
          <DataTable
            columns={["Hədəf", "Məsul", "Çəki", "Faktiki / Hədəf", "Progress", "Status"]}
            rows={targetRows.map((row) => [
              <TwoLine title={row.name} subtitle={row.metricKey} />,
              row.owner,
              `${row.weight}%`,
              <strong>{`${new Intl.NumberFormat("az-AZ").format(row.actual)}${row.unit} / ${new Intl.NumberFormat("az-AZ").format(row.target)}${row.unit}`}</strong>,
              <ProgressRow value={row.progress} caption={percent(row.progress)} compact />,
              <StatusBadge status={row.status} />,
            ])}
          />
        </Panel>

        <Panel className="kpi-period-panel" data-testid="kpi-period-panel">
          <PanelHeader title="Period bağlanışı" subtitle="Bağla, təsdiq et və payout-u maliyyəyə yaz" icon={CalendarClock} />
          <div className="kpi-period-grid">
            <div className="kpi-period-card">
              <span>Period</span>
              <strong>{activePeriod.period || getKpiPeriodKey()}</strong>
              <small>{activePeriod.closedAt || "Açıq hesablama"}</small>
            </div>
            <div className="kpi-period-card">
              <span>Status</span>
              <StatusBadge status={activePeriod.status || "Açıq period"} />
              <small>{percent(activePeriod.companyScore || 0)} score</small>
            </div>
            <div className="kpi-period-card">
              <span>Təsdiq</span>
              <StatusBadge status={activePeriod.approvalStatus || "Hazırlanır"} />
              <small>{activePeriod.approvedBy || "Təsdiq edən yoxdur"}</small>
            </div>
            <div className="kpi-period-card">
              <span>Payout</span>
              <StatusBadge status={activePeriod.payoutStatus || "Gözləyir"} />
              <small>{money(activePeriod.payoutAmount || 0)}</small>
            </div>
          </div>
          <div className="kpi-period-actions">
            <button
              className="secondary-btn"
              data-testid="kpi-close-period"
              disabled={!canClose}
              onClick={() => onRunPeriodAction?.("close")}
            >
              Periodu bağla
            </button>
            <button
              className="secondary-btn"
              data-testid="kpi-approve-period"
              disabled={!canApprove}
              onClick={() => onRunPeriodAction?.("approve")}
            >
              Təsdiq et
            </button>
            <button
              className="primary-btn"
              data-testid="kpi-payout-period"
              disabled={!canPayout}
              onClick={() => onRunPeriodAction?.("payout")}
            >
              Payout et
            </button>
          </div>
          {lastPayout && (
            <div className="kpi-last-payout">
              <span>Son payout</span>
              <strong>{money(lastPayout.amount)}</strong>
              <small>{lastPayout.period} · {lastPayout.at}</small>
            </div>
          )}
        </Panel>
      </section>

      <Panel className="kpi-payout-plan-panel" data-testid="kpi-payout-plan-panel">
        <PanelHeader title="Əməkdaş payout planı" subtitle="HR performans bonusu və satış bonuslarının yekun ödəniş siyahısı" icon={Wallet} />
        <DataTable
          columns={["Əməkdaş", "KPI", "Satış", "Performans bonusu", "Satış bonusu", "Payout", "Status"]}
          rows={rankingSource.map((row) => [
            <AvatarLine initials={row.initials} title={row.name} subtitle={`${row.department} · ${row.position}`} />,
            <strong>{percent(row.kpi || 0)}</strong>,
            <TwoLine title={`${row.salesOrders || 0} sifariş`} subtitle={money(row.salesPaid || 0)} />,
            money(row.performanceBonus || 0),
            money(row.salesBonus || 0),
            <strong>{money(row.payoutAmount || 0)}</strong>,
            <StatusBadge status={row.payoutStatus} />,
          ])}
        />
      </Panel>

      <section className="dashboard-grid">
        <Panel>
          <PanelHeader title="Əməkdaş reytinqi" subtitle="KPI nəticələrinə görə" />
          <div className="rank-list">
            {ranking.map((employee, index) => (
              <div className="rank-row" key={employee.employeeKey || employee.name}>
                <span>{index + 1}</span>
                <AvatarLine initials={employee.initials} title={employee.name} subtitle={employee.position} />
                <strong>{employee.kpi}%</strong>
              </div>
            ))}
            {ranking.length === 0 && <EmptyState title="Əməkdaş məlumatı yoxdur" />}
          </div>
        </Panel>
        <Panel className="kpi-period-history-panel">
          <PanelHeader title="Period tarixçəsi" subtitle="Bağlanmış KPI periodları və payout statusu" icon={CalendarClock} />
          <DataTable
            columns={["Period", "Score", "Payout", "Təsdiq", "Ödəniş"]}
            rows={periodHistory.map((period) => [
              <TwoLine title={period.period} subtitle={period.closedAt || "Açıq"} />,
              percent(period.companyScore || 0),
              money(period.payoutAmount || 0),
              <StatusBadge status={period.approvalStatus} />,
              <StatusBadge status={period.payoutStatus} />,
            ])}
          />
        </Panel>
      </section>

      <Panel className="kpi-bonus-panel">
        <PanelHeader
          title="Satışdan gələn bonuslar"
          subtitle="Satış sifarişində qeyd olunan satıcı bonus faizlərinə görə hesablanır"
          icon={Wallet}
        />
        <div className="kpi-bonus-toolbar">
          <div className="tabs" aria-label="Satış bonusu filtri">
            {["Hamısı", ...bonusSellers].map((filter) => (
              <button
                key={filter}
                className={bonusFilter === filter ? "active" : ""}
                onClick={() => setBonusFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="kpi-bonus-total">
            <span>Seçilmiş bonus</span>
            <strong>{money(visibleBonusTotal)}</strong>
          </div>
        </div>
        <DataTable
          columns={["Sifariş", "Satıcı", "Müştəri", "Məhsul", "Ödəniş", "% bonus", "Bonus", "Status"]}
          rows={visibleBonuses.map((row) => [
            <TwoLine title={row.orderId} subtitle={row.date} />,
            row.seller,
            row.customer,
            row.product,
            <TwoLine title={money(row.paid)} subtitle={row.paymentMethod} />,
            `${row.rate}%`,
            <strong>{money(row.bonusAmount)}</strong>,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}


function SupportPage({
  tickets,
  orders = [],
  credits = [],
  customers = [],
  conversations = [],
  selectedTicketId,
  onSelectTicket,
  onAddComment,
  onUpdateStatus,
  onOpenConversation,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenCustomer,
}) {
  const [commentDraft, setCommentDraft] = useState("");
  const enrichedTickets = useMemo(
    () => tickets.map((ticket) => buildSupportTicketContext(ticket, { orders, credits, customers, conversations })),
    [tickets, orders, credits, customers, conversations],
  );
  const selected = enrichedTickets.find((ticket) => ticket.id === selectedTicketId) || enrichedTickets[0];
  const openTickets = enrichedTickets.filter((ticket) => ticket.status !== "Bağlandı");
  const highPriority = enrichedTickets.filter((ticket) => ticket.priority === "Yüksək");
  const linkedTickets = enrichedTickets.filter((ticket) => ticket.linkedId || ticket.orderId || ticket.creditId || ticket.fin);
  const avgSla = enrichedTickets.length
    ? Math.round(enrichedTickets.reduce((sum, ticket) => sum + Number(ticket.slaHours || 0), 0) / enrichedTickets.length)
    : 0;

  function submitComment() {
    if (!selected || !commentDraft.trim()) return;
    onAddComment(selected.id, commentDraft);
    setCommentDraft("");
  }

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Açıq sorğu" value={openTickets.length} icon={MessageSquare} tone="primary" />
        <MetricCard label="Yüksək prioritet" value={highPriority.length} icon={CircleAlert} tone={highPriority.length ? "warning" : "success"} />
        <MetricCard label="Orta SLA" value={`${avgSla} saat`} icon={CalendarClock} tone="info" />
        <MetricCard label="Bağlı task" value={linkedTickets.length} trend={`${new Set(enrichedTickets.map((ticket) => ticket.module)).size} modul`} icon={ShieldCheck} tone="success" />
      </section>
      <section className="support-workspace">
        <Panel className="support-panel support-queue-panel" data-testid="support-task-panel">
          <PanelHeader title="Support və task növbəsi" subtitle="Sifariş, kredit və müştəriyə bağlı operativ tapşırıqlar" icon={MessageSquare} />
          <DataTable
            columns={["Sorğu", "Bağlantı", "Prioritet", "Comment", "Məsul", "SLA", "Status", "Aç"]}
            rows={enrichedTickets.map((ticket) => [
              <TwoLine title={ticket.title} subtitle={`${ticket.id} · ${ticket.createdAt}`} />,
              <TwoLine title={ticket.linkedLabel} subtitle={ticket.customer || ticket.fin || ticket.module} />,
              <StatusBadge status={ticket.priority} />,
              ticket.commentCount,
              ticket.owner,
              `${ticket.slaHours} saat`,
              <StatusBadge status={ticket.status} />,
              <button className="text-btn" onClick={() => onSelectTicket(ticket.id)}>
                Bax
              </button>,
            ])}
          />
        </Panel>
        <Panel className="support-detail-panel">
          {selected ? (
            <>
              <div className="support-detail-head">
                <div>
                  <StatusBadge status={selected.priority} />
                  <h3>{selected.title}</h3>
                  <p>{selected.id} · {selected.requester} · {selected.createdAt}</p>
                </div>
                <select value={selected.status} onChange={(event) => onUpdateStatus(selected.id, event.target.value)}>
                  <option>Açıq</option>
                  <option>İcrada</option>
                  <option>Gözləyir</option>
                  <option>Bağlandı</option>
                </select>
              </div>
              <div className="support-link-grid">
                <div>
                  <span>Müştəri</span>
                  <strong>{selected.customer || selected.customerRecord?.name || "—"}</strong>
                  <button className="text-btn" disabled={!(selected.fin || selected.customerRecord?.fin)} onClick={() => onOpenCustomer(selected.fin || selected.customerRecord?.fin)}>
                    CRM
                  </button>
                </div>
                <div>
                  <span>Sifariş</span>
                  <strong>{selected.orderId || selected.order?.id || "—"}</strong>
                  <button className="text-btn" disabled={!(selected.orderId || selected.order?.id)} onClick={() => onOpenSalesOrder(selected.orderId || selected.order?.id)}>
                    Satış
                  </button>
                </div>
                <div>
                  <span>Kredit</span>
                  <strong>{selected.creditId || selected.credit?.id || "—"}</strong>
                  <button className="text-btn" disabled={!(selected.creditId || selected.credit?.id)} onClick={() => onOpenCredit(selected.creditId || selected.credit?.id)}>
                    Kredit
                  </button>
                </div>
                <div>
                  <span>Thread</span>
                  <strong>{selected.thread?.messages?.length || 0} mesaj</strong>
                  <button className="text-btn" onClick={() => onOpenConversation(selected.id)}>
                    Mesajlar
                  </button>
                </div>
              </div>
              <div className="support-task-list">
                {(selected.tasks || []).map((task) => (
                  <div key={task.id}>
                    <TwoLine title={task.title} subtitle={`${task.id} · ${task.owner} · ${task.dueAt}`} />
                    <StatusBadge status={task.status} />
                  </div>
                ))}
              </div>
              <div className="support-comment-list" data-testid="support-comment-list">
                {selected.comments.map((comment) => (
                  <div key={comment.id} className="support-comment">
                    <div>
                      <strong>{comment.author}</strong>
                      <span>{comment.at}</span>
                    </div>
                    <p>{comment.text}</p>
                  </div>
                ))}
                {selected.comments.length === 0 && <EmptyState title="Comment yoxdur" />}
              </div>
              <div className="support-comment-composer">
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Task üzrə comment yazın..."
                  data-testid="support-comment-input"
                />
                <button className="primary-btn" onClick={submitComment} data-testid="support-comment-submit">
                  <Send size={16} />
                  Comment
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Support task yoxdur" />
          )}
        </Panel>
      </section>
    </div>
  );
}

function MessagesPage({
  conversations,
  conversationId,
  setConversationId,
  draftMessage,
  setDraftMessage,
  sendMessage,
  canSend = true,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenSupportTicket,
}) {
  const selected = conversations.find((item) => item.id === conversationId) || conversations[0];
  return (
    <section className="messages-layout">
      <Panel className="message-list-panel">
        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation-row ${conversation.id === selected?.id ? "active" : ""}`}
              onClick={() => setConversationId(conversation.id)}
            >
              <AvatarLine
                initials={conversation.initials}
                title={conversation.person}
                subtitle={conversation.preview}
              />
              <div className="conversation-meta">
                <span>{conversation.time}</span>
                {conversation.unread > 0 && <strong>{conversation.unread}</strong>}
              </div>
            </button>
          ))}
        </div>
      </Panel>
      <Panel className="chat-panel">
        {selected ? (
          <>
            <div className="chat-head">
              <AvatarLine initials={selected.initials} title={selected.person} subtitle={`${selected.team} şöbəsi · onlayn`} />
              {(selected.ticketId || selected.orderId || selected.creditId || selected.customerFin) && (
                <div className="message-context-strip">
                  {selected.ticketId && (
                    <button className="secondary-btn compact" onClick={() => onOpenSupportTicket(selected.ticketId)}>
                      Task {selected.ticketId}
                    </button>
                  )}
                  {selected.orderId && (
                    <button className="secondary-btn compact" onClick={() => onOpenSalesOrder(selected.orderId)}>
                      Sifariş {selected.orderId}
                    </button>
                  )}
                  {selected.creditId && (
                    <button className="secondary-btn compact" onClick={() => onOpenCredit(selected.creditId)}>
                      Kredit {selected.creditId}
                    </button>
                  )}
                  {selected.customerFin && <StatusBadge status={`Müştəri ${selected.customerFin}`} />}
                </div>
              )}
            </div>
            <div className="chat-body">
              {selected.messages.map((message, index) => (
                <div key={`${message.time}-${index}`} className={`bubble ${message.from === "Admin" || message.mine ? "mine" : ""}`}>
                  <p>{message.text}</p>
                  <span>{message.time}</span>
                </div>
              ))}
            </div>
            <div className="composer">
              <input
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSend) sendMessage();
                }}
                placeholder="Mesaj yazın..."
                disabled={!canSend}
                title={!canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
              />
              <button
                className="primary-btn icon-only"
                onClick={sendMessage}
                aria-label="Mesaj göndər"
                disabled={!canSend}
                title={!canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
              >
                <Send size={17} />
              </button>
            </div>
          </>
        ) : (
          <EmptyState title="Mesaj tapılmadı" />
        )}
      </Panel>
    </section>
  );
}

function MessagesPageV2({
  conversations,
  conversationId,
  setConversationId,
  draftMessage,
  setDraftMessage,
  sendMessage,
  canSend = true,
  canManage = true,
  currentUser,
  participants = [],
  contextOptions = [],
  onCreateConversation,
  onArchiveConversation,
  onDeleteConversation,
  onOpenSalesOrder,
  onOpenCredit,
  onOpenSupportTicket,
  onOpenCustomer,
}) {
  const [filter, setFilter] = useState("active");
  const [composerOpen, setComposerOpen] = useState(false);
  const [newThread, setNewThread] = useState({
    type: "direct",
    title: "",
    team: "",
    participantIds: [],
    contextKey: "",
    firstMessage: "",
  });
  const normalizedConversations = (conversations || []).map(normalizeMessageThread);
  const counts = {
    all: normalizedConversations.length,
    active: normalizedConversations.filter((item) => !item.archived).length,
    unread: normalizedConversations.filter((item) => Number(item.unread || 0) > 0).length,
    groups: normalizedConversations.filter((item) => item.type === "group").length,
    linked: normalizedConversations.filter((item) => item.ticketId || item.orderId || item.creditId || item.customerFin).length,
    archived: normalizedConversations.filter((item) => item.archived).length,
  };
  const filters = [
    { id: "active", label: "Aktiv", count: counts.active },
    { id: "unread", label: "Oxunmamış", count: counts.unread },
    { id: "groups", label: "Qruplar", count: counts.groups },
    { id: "linked", label: "Bağlı", count: counts.linked },
    { id: "archived", label: "Arxiv", count: counts.archived },
    { id: "all", label: "Hamısı", count: counts.all },
  ];
  const visibleConversations = normalizedConversations.filter((conversation) => {
    if (filter === "all") return true;
    if (filter === "active") return !conversation.archived;
    if (filter === "unread") return Number(conversation.unread || 0) > 0;
    if (filter === "groups") return conversation.type === "group";
    if (filter === "linked") return conversation.ticketId || conversation.orderId || conversation.creditId || conversation.customerFin;
    if (filter === "archived") return conversation.archived;
    return true;
  });
  const selected =
    normalizedConversations.find((item) => item.id === conversationId) ||
    visibleConversations[0] ||
    normalizedConversations[0];
  const selectedMessages = selected?.messages || [];
  const selectedContext = contextOptions.find((item) => item.type && `${item.type}::${item.id}` === newThread.contextKey);
  const selectedParticipantNames = participants
    .filter((participant) => newThread.participantIds.includes(participant.id))
    .map((participant) => participant.name);
  const canSubmitNewThread =
    canManage &&
    (newThread.type === "group" ? newThread.title.trim() && newThread.participantIds.length > 0 : newThread.participantIds.length > 0 || newThread.contextKey);

  function toggleParticipant(id) {
    setNewThread((current) => ({
      ...current,
      participantIds: current.participantIds.includes(id)
        ? current.participantIds.filter((item) => item !== id)
        : [...current.participantIds, id],
    }));
  }

  function createThread() {
    if (!canSubmitNewThread) return;
    onCreateConversation?.({
      type: newThread.type,
      title: newThread.title,
      team: newThread.team,
      participantIds: newThread.participantIds,
      linkedType: selectedContext?.type || "",
      linkedId: selectedContext?.id || "",
      firstMessage: newThread.firstMessage,
    });
    setNewThread({
      type: "direct",
      title: "",
      team: "",
      participantIds: [],
      contextKey: "",
      firstMessage: "",
    });
    setComposerOpen(false);
  }

  return (
    <section className="messages-workspace">
      <div className="messages-summary-grid">
        <MetricCard label="Aktiv söhbət" value={counts.active} trend={`${counts.unread} oxunmamış`} icon={MessageSquare} tone="primary" />
        <MetricCard label="Qrup" value={counts.groups} trend="Daxili komanda kanalları" icon={Users} tone="success" />
        <MetricCard label="Bağlı thread" value={counts.linked} trend="Sifariş/kredit/task" icon={GitBranch} tone="info" />
        <MetricCard label="Arxiv" value={counts.archived} trend="Bağlanmış yazışmalar" icon={FileText} tone="warning" />
      </div>

      <section className="messages-layout">
        <Panel className="message-list-panel">
          <div className="message-list-head">
            <div>
              <h3>Inbox</h3>
              <p>{currentUser?.name || "İstifadəçi"} üçün daxili yazışmalar</p>
            </div>
            <button className="primary-btn compact" onClick={() => setComposerOpen((value) => !value)} disabled={!canManage}>
              <Plus size={16} />
              Yeni
            </button>
          </div>

          <div className="message-filter-tabs">
            {filters.map((item) => (
              <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>

          {composerOpen && (
            <div className="message-thread-form">
              <div className="segmented-control">
                {[
                  ["direct", "Şəxsi"],
                  ["group", "Qrup"],
                ].map(([id, label]) => (
                  <button key={id} className={newThread.type === id ? "active" : ""} onClick={() => setNewThread((current) => ({ ...current, type: id }))}>
                    {label}
                  </button>
                ))}
              </div>

              <label className="message-field">
                <span>{newThread.type === "group" ? "Qrup adı" : "Başlıq"}</span>
                <input
                  value={newThread.title}
                  onChange={(event) => setNewThread((current) => ({ ...current, title: event.target.value }))}
                  placeholder={newThread.type === "group" ? "Məs: Satış komandası" : "Boş qala bilər"}
                />
              </label>

              <label className="message-field">
                <span>Şöbə / kanal</span>
                <input
                  value={newThread.team}
                  onChange={(event) => setNewThread((current) => ({ ...current, team: event.target.value }))}
                  placeholder="Satış, Anbar, Maliyyə..."
                />
              </label>

              <label className="message-field">
                <span>Bağlantı</span>
                <select
                  value={newThread.contextKey}
                  onChange={(event) => setNewThread((current) => ({ ...current, contextKey: event.target.value }))}
                >
                  {contextOptions.map((item) => (
                    <option key={`${item.type}::${item.id}`} value={item.type ? `${item.type}::${item.id}` : ""}>
                      {item.type ? `${item.label} - ${item.detail}` : item.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="message-participant-picker">
                <span>İştirakçılar</span>
                <div>
                  {participants.slice(0, 12).map((participant) => (
                    <button
                      key={participant.id}
                      type="button"
                      className={newThread.participantIds.includes(participant.id) ? "selected" : ""}
                      onClick={() => toggleParticipant(participant.id)}
                    >
                      {participant.name}
                      <small>{participant.team}</small>
                    </button>
                  ))}
                </div>
                {selectedParticipantNames.length === 0 && <small>Ən azı bir iştirakçı seçin.</small>}
              </div>

              <label className="message-field">
                <span>İlk mesaj</span>
                <textarea
                  value={newThread.firstMessage}
                  onChange={(event) => setNewThread((current) => ({ ...current, firstMessage: event.target.value }))}
                  placeholder="İstəyə bağlı başlanğıc mesajı..."
                />
              </label>

              <div className="message-form-actions">
                <button className="secondary-btn compact" onClick={() => setComposerOpen(false)}>
                  <X size={15} />
                  Bağla
                </button>
                <button className="primary-btn compact" onClick={createThread} disabled={!canSubmitNewThread}>
                  <Plus size={15} />
                  Yarat
                </button>
              </div>
            </div>
          )}

          <div className="conversation-list">
            {visibleConversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-row ${conversation.id === selected?.id ? "active" : ""}`}
                onClick={() => setConversationId(conversation.id)}
              >
                <AvatarLine
                  initials={conversation.initials}
                  title={conversation.title || conversation.person}
                  subtitle={conversation.preview}
                />
                <div className="conversation-meta">
                  <span>{conversation.time}</span>
                  <small>{conversation.type === "group" ? "Qrup" : conversation.ticketId ? "Task" : "Şəxsi"}</small>
                  {conversation.unread > 0 && <strong>{conversation.unread}</strong>}
                </div>
              </button>
            ))}
            {visibleConversations.length === 0 && <EmptyState title="Bu filter üzrə söhbət yoxdur" />}
          </div>
        </Panel>

        <Panel className="chat-panel">
          {selected ? (
            <>
              <div className="chat-head">
                <div className="chat-head-main">
                  <AvatarLine
                    initials={selected.initials}
                    title={selected.title || selected.person}
                    subtitle={`${selected.team} · ${selected.participants.length || 1} iştirakçı`}
                  />
                  <div className="chat-head-actions">
                    <StatusBadge status={selected.archived ? "Arxiv" : selected.type === "group" ? "Qrup" : "Aktiv"} />
                    <button className="secondary-btn compact" onClick={() => onArchiveConversation?.(selected.id)} disabled={!canManage}>
                      {selected.archived ? "Aktiv et" : "Arxivlə"}
                    </button>
                    <button
                      className="secondary-btn compact danger-soft"
                      onClick={() => {
                        if (window.confirm("Bu söhbət silinsin?")) onDeleteConversation?.(selected.id);
                      }}
                      disabled={!canManage}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                {(selected.ticketId || selected.orderId || selected.creditId || selected.customerFin) && (
                  <div className="message-context-strip">
                    {selected.ticketId && (
                      <button className="secondary-btn compact" onClick={() => onOpenSupportTicket(selected.ticketId)}>
                        Task {selected.ticketId}
                      </button>
                    )}
                    {selected.orderId && (
                      <button className="secondary-btn compact" onClick={() => onOpenSalesOrder(selected.orderId)}>
                        Sifariş {selected.orderId}
                      </button>
                    )}
                    {selected.creditId && (
                      <button className="secondary-btn compact" onClick={() => onOpenCredit(selected.creditId)}>
                        Kredit {selected.creditId}
                      </button>
                    )}
                    {selected.customerFin && (
                      <button className="secondary-btn compact" onClick={() => onOpenCustomer?.(selected.customerFin)}>
                        Müştəri {selected.customerFin}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="chat-body">
                {selectedMessages.map((message, index) => (
                  <div key={message.id || `${message.time}-${index}`} className={`bubble ${message.mine ? "mine" : ""}`}>
                    <div className="bubble-author">{message.from || "İstifadəçi"}</div>
                    <p>{message.text}</p>
                    <span>{message.time} · {message.status || (message.readAt ? "Oxundu" : "Göndərildi")}</span>
                  </div>
                ))}
                {selectedMessages.length === 0 && <EmptyState title="Bu söhbətdə hələ mesaj yoxdur" />}
              </div>

              <div className="composer">
                <textarea
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && canSend) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Mesaj yazın..."
                  disabled={!canSend || selected.archived}
                  title={!canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
                />
                <button
                  className="primary-btn icon-only"
                  onClick={sendMessage}
                  aria-label="Mesaj göndər"
                  disabled={!canSend || selected.archived}
                  title={selected.archived ? "Arxiv söhbətə mesaj yazmaq üçün əvvəl aktiv edin" : !canSend ? "Daxili mesaj göndərmək üçün icazə yoxdur" : ""}
                >
                  <Send size={17} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState title="Mesaj tapılmadı" />
          )}
        </Panel>
      </section>
    </section>
  );
}

function NotificationsPage({
  notifications,
  automationRows = [],
  providerRows = [],
  sendLog = [],
  dispatchSnapshot = null,
  filter,
  setFilter,
  markAll,
  runDispatch,
  lastSweepAt,
  canManage = true,
}) {
  const filters = ["Cəmi", "Kredit", "Push", "SMS", "Email", "Oxunmamış"];
  const list = notifications.filter((item) => {
    if (filter === "Cəmi") return true;
    if (filter === "Oxunmamış") return item.unread;
    if (filter === "Kredit") return item.module === "credits" || normalize(`${item.title} ${item.body}`).includes("kredit");
    return item.type === filter;
  });
  const queueTotal = automationRows.reduce((sum, row) => sum + Number(row.queueCount || 0), 0);
  const eventTotal = automationRows.reduce((sum, row) => sum + Number(row.totalEventCount || 0), 0);
  const cooldownTotal = automationRows.reduce((sum, row) => sum + Number(row.cooldownCount || 0), 0);
  const activeProviders = providerRows.filter((provider) => provider.status === "Aktiv" && provider.enabled);
  const sentCount = sendLog.filter((row) => row.status === "Göndərildi").length;
  const blockedCount = sendLog.filter((row) => row.status !== "Göndərildi").length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Hazır növbə" value={queueTotal} trend={`${eventTotal} hadisə · ${cooldownTotal} cooldown`} icon={Bell} tone={queueTotal ? "warning" : "success"} />
        <MetricCard label="Aktiv provider" value={activeProviders.length} trend={`${providerRows.length} kanal`} icon={ShieldCheck} tone="primary" />
        <MetricCard label="Göndərildi" value={sentCount} trend={dispatchSnapshot ? `Son: ${dispatchSnapshot.sent}` : "Log üzrə"} icon={Send} tone="success" />
        <MetricCard label="Bloklandı" value={blockedCount} trend={dispatchSnapshot ? `${dispatchSnapshot.source || "Son"}: ${dispatchSnapshot.blocked}` : "Provider/kanal"} icon={CircleAlert} tone={blockedCount ? "danger" : "info"} />
      </section>
      <Panel>
        <div className="filter-bar">
          <div className="tabs">
            {filters.map((item) => (
              <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="notification-toolbar-actions">
            <button
              className="primary-btn"
              onClick={runDispatch}
              disabled={!canManage || queueTotal === 0}
              title={!canManage ? "Bildirişləri idarə etmək üçün icazə yoxdur" : queueTotal === 0 ? "Göndəriş növbəsi boşdur" : ""}
              data-testid="notification-run-dispatch"
            >
              <Send size={16} />
              Növbəni işlə
            </button>
            <button
              className="secondary-btn"
              onClick={markAll}
              disabled={!canManage}
              title={!canManage ? "Bildirişləri idarə etmək üçün icazə yoxdur" : ""}
            >
              <Check size={16} />
              Oxunmuş et
            </button>
          </div>
        </div>
        {(lastSweepAt || dispatchSnapshot) && (
          <div className="module-action-note">
            <Check size={16} />
            <span>
              {dispatchSnapshot
                ? `Son göndəriş: ${dispatchSnapshot.at} · ${dispatchSnapshot.source || "Növbə"} · ${dispatchSnapshot.sent} göndərildi · ${dispatchSnapshot.blocked} bloklandı`
                : `Son oxunma yoxlaması: ${lastSweepAt}`}
            </span>
          </div>
        )}
      </Panel>
      <Panel className="notification-provider-panel" data-testid="notification-provider-panel">
        <PanelHeader
          title="Provider bağlantıları"
          subtitle="SMS, email və push kanalları üçün endpoint, secret statusu və göndəriş sağlamlığı"
          icon={ShieldCheck}
        />
        <DataTable
          columns={["Kanal", "Provider", "Endpoint", "Sender", "Rejim", "Secret", "Göndərilib", "Status"]}
          rows={providerRows.map((provider) => [
            <StatusBadge status={provider.channel} />,
            <TwoLine title={provider.name} subtitle={provider.provider} />,
            provider.endpoint,
            provider.sender,
            provider.mode,
            provider.secretStatus,
            <TwoLine title={provider.sentCount || 0} subtitle={provider.lastSentAt || "Hələ yoxdur"} />,
            <StatusBadge status={provider.health} />,
          ])}
        />
      </Panel>
      <Panel className="notification-automation-panel">
        <PanelHeader
          title="Avtomatik xatırlatma qaydaları"
          subtitle="Kredit, anbar, PO, payroll və təhvil SLA siqnalları üçün göndəriş növbəsi"
          icon={Bell}
        />
        <DataTable
          columns={["Qayda", "Kanal", "Provider", "Trigger", "Hazır/Cooldown", "Son hadisə", "Prioritet", "Son run", "Status"]}
          rows={automationRows.map((rule) => [
            <TwoLine title={rule.name} subtitle={rule.id} />,
            <StatusBadge status={rule.channel} />,
            rule.providerName,
            rule.trigger,
            <TwoLine title={`${rule.queueCount} hazır`} subtitle={`${rule.cooldownCount || 0} cooldown / ${rule.totalEventCount || 0} hadisə`} />,
            rule.lastEvent,
            rule.events?.[0]?.priority || rule.cooldownEvents?.[0]?.priority || "—",
            rule.lastRunAt || "—",
            <StatusBadge status={rule.health} />,
          ])}
        />
      </Panel>
      <Panel className="notification-sendlog-panel" data-testid="notification-sendlog-panel">
        <PanelHeader title="Göndəriş logu" subtitle="Provider cavabı, kanal, alıcı və bağlı modul üzrə son göndərişlər" icon={Send} />
        <DataTable
          columns={["Tarix", "Kanal", "Provider", "Alıcı", "Mənbə", "Son tarix", "Mətn", "Status"]}
          rows={sendLog.slice(0, 12).map((row) => [
            row.sentAt,
            <StatusBadge status={row.channel} />,
            row.providerName,
            <TwoLine title={row.recipient} subtitle={row.target} />,
            <TwoLine title={row.ruleName} subtitle={row.context || row.entityId || row.source} />,
            row.dueDate || "—",
            row.body,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
      <Panel>
        <PanelHeader title="Sistem içi xəbərdarlıqlar" subtitle="Göndərişlər və modul hadisələri üzrə daxili bildiriş axını" icon={Bell} />
        <div className="notification-list">
          {list.map((item) => (
            <article className={`notification-row ${item.unread ? "unread" : ""}`} key={item.id}>
              <span className={`dot ${item.unread ? "danger" : ""}`} />
              <div>
                <div className="notification-title">
                  <strong>{item.title}</strong>
                  <StatusBadge status={item.type} />
                </div>
                <p>{item.body}</p>
                <small>{item.time}</small>
              </div>
            </article>
          ))}
          {list.length === 0 && <EmptyState title="Bu filtrdə bildiriş yoxdur" />}
        </div>
      </Panel>
    </div>
  );
}

// SettingsPage extracted to src/pages/SettingsPage.jsx

export function WorkflowSteps({ activeStage, compact = false }) {
  const activeIndex = stages.indexOf(activeStage);
  return (
    <div className={`workflow-steps ${compact ? "compact" : ""}`}>
      {stages.map((stage, index) => (
        <div
          key={stage}
          className={`workflow-step ${index <= activeIndex ? "done" : ""} ${index === activeIndex ? "current" : ""}`}
        >
          <span>{index + 1}</span>
          <small>{stage}</small>
        </div>
      ))}
    </div>
  );
}

function TaskItem({ tone, title, value, label }) {
  return (
    <div className={`task-item ${tone}`}>
      <div>
        <strong>{title}</strong>
        <span>{label}</span>
      </div>
      <b>{value}</b>
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled = false }) {
  return (
    <button className="toggle-row" onClick={onChange} disabled={disabled} title={disabled ? "Bu ayarı dəyişmək üçün icazə yoxdur" : ""}>
      <span>{label}</span>
      <span className={`switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}

function WarehouseFormModal({ mode, warehouse, onClose, onSubmit }) {
  const [values, setValues] = useState({
    code: warehouse?.code || "",
    name: warehouse?.name || "",
    city: warehouse?.city || "",
    address: warehouse?.address || "",
    manager: warehouse?.manager || "",
    type: warehouse?.type || "Regional",
    capacity: warehouse?.capacity || 100,
    status: warehouse?.status || "Aktiv",
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{mode === "edit" ? "Anbarı redaktə et" : "Yeni anbar yarat"}</h2>
            <p>Anbar adı, kodu, ünvanı, məsul şəxsi və tutum məlumatlarını daxil edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>Anbar kodu</span>
            <input
              value={values.code}
              required
              onChange={(event) => updateValue("code", event.target.value)}
            />
          </label>
          <label>
            <span>Anbar adı</span>
            <input
              value={values.name}
              required
              onChange={(event) => updateValue("name", event.target.value)}
            />
          </label>
          <label>
            <span>Şəhər</span>
            <input
              value={values.city}
              required
              onChange={(event) => updateValue("city", event.target.value)}
            />
          </label>
          <label>
            <span>Məsul şəxs</span>
            <input
              value={values.manager}
              required
              onChange={(event) => updateValue("manager", event.target.value)}
            />
          </label>
          <label>
            <span>Növ</span>
            <select value={values.type} onChange={(event) => updateValue("type", event.target.value)}>
              <option>Mərkəzi</option>
              <option>Regional</option>
              <option>Təhvil</option>
              <option>Servis</option>
            </select>
          </label>
          <label>
            <span>Tutum</span>
            <input
              type="number"
              min="0"
              value={values.capacity}
              required
              onChange={(event) => updateValue("capacity", event.target.value)}
            />
          </label>
          <label>
            <span>Status</span>
            <select value={values.status} onChange={(event) => updateValue("status", event.target.value)}>
              <option>Aktiv</option>
              <option>Passiv</option>
              <option>Təmir</option>
            </select>
          </label>
          <label className="full">
            <span>Ünvan</span>
            <input
              value={values.address}
              required
              onChange={(event) => updateValue("address", event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn">
              {mode === "edit" ? "Yadda saxla" : "Anbar yarat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductFormModal({ product, onClose, onSubmit, onDelete }) {
  const [values, setValues] = useState({
    name: product?.name || "",
    sku: product?.sku || "",
    category: product?.category || "Elektronika",
    unit: product?.unit || "ədəd",
    costPrice: product?.costPrice || 0,
    salePrice: product?.salePrice || 0,
    reorderLevel: product?.reorderLevel || 0,
    serialTracked: product?.serialTracked ? "Bəli" : "Xeyr",
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{product ? "Məhsulu redaktə et" : "Yeni məhsul"}</h2>
            <p>SKU, qiymət, minimum stok və serial izləmə qaydasını təyin edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>Məhsul adı</span>
            <input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} />
          </label>
          <label>
            <span>SKU</span>
            <input value={values.sku} required onChange={(event) => updateValue("sku", event.target.value)} />
          </label>
          <label>
            <span>Kateqoriya</span>
            <select value={values.category} onChange={(event) => updateValue("category", event.target.value)}>
              <option>Elektronika</option>
              <option>Məişət texnikası</option>
              <option>Aksesuar</option>
              <option>Xidmət</option>
              <option>Digər</option>
            </select>
          </label>
          <label>
            <span>Ölçü vahidi</span>
            <select value={values.unit} onChange={(event) => updateValue("unit", event.target.value)}>
              <option>ədəd</option>
              <option>qutu</option>
              <option>kg</option>
              <option>metr</option>
              <option>litr</option>
            </select>
          </label>
          <label>
            <span>Minimum stok</span>
            <input type="number" min="0" value={values.reorderLevel} onChange={(event) => updateValue("reorderLevel", event.target.value)} />
          </label>
          <label>
            <span>Alış qiyməti</span>
            <input type="number" min="0" step="0.01" value={values.costPrice} onChange={(event) => updateValue("costPrice", event.target.value)} />
          </label>
          <label>
            <span>Satış qiyməti</span>
            <input type="number" min="0" step="0.01" value={values.salePrice} onChange={(event) => updateValue("salePrice", event.target.value)} />
          </label>
          <label className="full">
            <span>IMEI / serial izləmə</span>
            <select value={values.serialTracked} onChange={(event) => updateValue("serialTracked", event.target.value)}>
              <option>Bəli</option>
              <option>Xeyr</option>
            </select>
          </label>
          <div className="modal-actions">
            {onDelete && (
              <button type="button" className="secondary-btn danger-outline" onClick={onDelete}>
                <Trash2 size={16} /> Sil
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn">
              <Check size={16} />
              {product ? "Yadda saxla" : "Məhsul yarat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HrEmployeeModal({ employee = null, employees = [], departments: departmentRecords = [], onClose, onSubmit }) {
  const existingManager = employee ? getEmployeeManager(employee, employees) : null;
  const savedDocumentsComplete =
    employee?.documentReviewRequired || employee?.hrStatus === "Məlumat gözləyir"
      ? Number(employee.documentsComplete || 0)
      : 100;
  const departments = [...new Set([
    ...employees.map((employee) => employee.department),
    ...departmentRecords.map((department) => department.name),
  ].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const parentDepartments = [...new Set([
    ...departments,
    ...employees.map((employee) => getDepartmentParentName(employee)),
    ...departmentRecords.map((department) => department.parentDepartment),
  ].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const [values, setValues] = useState({
    name: employee?.name || "",
    position: employee?.position || "",
    department: employee?.department || "",
    departmentParent: employee ? getDepartmentParentName(employee) : "",
    managerId: existingManager ? getEmployeeKey(existingManager) : "",
    level: employee ? getEmployeeLevel(employee) : "Komanda üzvü",
    salary: employee?.salary ?? "",
    kpi: employee?.kpi ?? "85",
    hireDate: employee?.hireDate || currentBusinessDate,
    workMode: employee?.workMode || "Ofis",
    shift: employee?.shift || "09:00-18:00",
    employmentType: employee?.employmentType || "Tam ştat",
    leaveBalance: employee?.leaveBalance ?? "0",
    documentsComplete: String(savedDocumentsComplete),
    hrStatus: employee?.hrStatus === "Məlumat gözləyir" ? "Məlumat gözləyir" : "Stabil",
    skills: Array.isArray(employee?.skills) ? employee.skills.join(", ") : "",
  });
  const managerOptions = employees.filter((item) => getEmployeeKey(item) !== getEmployeeKey(employee || {}));

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit({ ...values, documentsComplete: Number(values.documentsComplete || 0) });
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-employee-modal">
        <div className="modal-head">
          <div>
            <h2>{employee ? "Əməkdaşı redaktə et" : "Yeni əməkdaş"}</h2>
            <p>{employee ? "Əməkdaşın şəxsi, iş və tabeçilik məlumatlarını yeniləyin." : "Şöbə və tabeçilik məlumatını daxil edin."}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <label><span>Ad Soyad</span><input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} /></label>
          <label><span>Vəzifə</span><input value={values.position} required onChange={(event) => updateValue("position", event.target.value)} /></label>
          <label>
            <span>Şöbə</span>
            <input value={values.department} list="employee-departments" required onChange={(event) => updateValue("department", event.target.value)} />
            <datalist id="employee-departments">{departments.map((department) => <option key={department} value={department} />)}</datalist>
          </label>
          <label>
            <span>Üst şöbə</span>
            <input value={values.departmentParent} list="employee-parent-departments" onChange={(event) => updateValue("departmentParent", event.target.value)} />
            <datalist id="employee-parent-departments"><option value="" />{parentDepartments.map((department) => <option key={department} value={department} />)}</datalist>
          </label>
          <label>
            <span>Kimə tabedir</span>
            <select value={values.managerId} onChange={(event) => updateValue("managerId", event.target.value)}>
              <option value="">Birbaşa rəhbərlik</option>
              {managerOptions.map((manager) => <option key={getEmployeeKey(manager)} value={getEmployeeKey(manager)}>{manager.name} · {manager.position}</option>)}
            </select>
          </label>
          <label>
            <span>Səviyyə</span>
            <select value={values.level} onChange={(event) => updateValue("level", event.target.value)}>{hrLevelOptions.map((level) => <option key={level}>{level}</option>)}</select>
          </label>
          <label><span>Maaş</span><input type="number" min="0" value={values.salary} required onChange={(event) => updateValue("salary", event.target.value)} /></label>
          <label><span>KPI</span><input type="number" min="0" value={values.kpi} onChange={(event) => updateValue("kpi", event.target.value)} /></label>
          <label><span>Sənəd uyğunluğu, %</span><input type="number" min="0" max="100" value={values.documentsComplete} onChange={(event) => updateValue("documentsComplete", event.target.value)} /></label>
          <label><span>HR statusu</span><select value={values.hrStatus} onChange={(event) => updateValue("hrStatus", event.target.value)}><option>Stabil</option><option>Məlumat gözləyir</option></select></label>
          <label><span>İşə qəbul tarixi</span><input type="date" value={values.hireDate} onChange={(event) => updateValue("hireDate", event.target.value)} /></label>
          <label><span>İş rejimi</span><select value={values.workMode} onChange={(event) => updateValue("workMode", event.target.value)}><option>Ofis</option><option>Hybrid</option><option>Sahə</option><option>Uzaqdan</option></select></label>
          <label><span>Növbə</span><input value={values.shift} onChange={(event) => updateValue("shift", event.target.value)} /></label>
          <label><span>Məşğulluq tipi</span><select value={values.employmentType} onChange={(event) => updateValue("employmentType", event.target.value)}><option>Tam ştat</option><option>Yarım ştat</option><option>Müqaviləli</option><option>Sınaq müddəti</option></select></label>
          <label><span>Məzuniyyət balansı</span><input type="number" min="0" value={values.leaveBalance} onChange={(event) => updateValue("leaveBalance", event.target.value)} /></label>
          <label className="full"><span>Bacarıqlar</span><input value={values.skills} onChange={(event) => updateValue("skills", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn">{employee ? <Check size={16} /> : <Plus size={16} />}{employee ? "Yadda saxla" : "Əməkdaş yarat"}</button></div>
        </form>
      </div>
    </div>
  );
}

function HrDepartmentModal({ employees = [], departments = [], onClose, onSubmit }) {
  const parentDepartments = [...new Set([
    ...employees.map((employee) => employee.department),
    ...employees.map((employee) => getDepartmentParentName(employee)),
    ...departments.map((department) => department.name),
    ...departments.map((department) => department.parentDepartment),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "az"));
  const [values, setValues] = useState({ name: "", parentDepartment: "", description: "", status: "Aktiv" });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-department-modal">
        <div className="modal-head">
          <div>
            <h2>Yeni şöbə</h2>
            <p>Şöbəni struktur ağacına əlavə edin və istəsəniz onu üst şöbəyə bağlayın.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <form className="modal-form" onSubmit={submit}>
          <label><span>Şöbə adı</span><input value={values.name} required autoFocus onChange={(event) => updateValue("name", event.target.value)} /></label>
          <label>
            <span>Üst şöbə</span>
            <input value={values.parentDepartment} list="new-department-parents" onChange={(event) => updateValue("parentDepartment", event.target.value)} />
            <datalist id="new-department-parents"><option value="" />{parentDepartments.map((department) => <option key={department} value={department} />)}</datalist>
          </label>
          <label className="full"><span>Qısa izah</span><textarea value={values.description} onChange={(event) => updateValue("description", event.target.value)} /></label>
          <label><span>Status</span><select value={values.status} onChange={(event) => updateValue("status", event.target.value)}><option>Aktiv</option><option>Planlanır</option><option>Passiv</option></select></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Plus size={16} /> Şöbə əlavə et</button></div>
        </form>
      </div>
    </div>
  );
}

function HrEmployeeDeleteModal({ employee, employees = [], onClose, onConfirm }) {
  const employeeId = getEmployeeKey(employee);
  const directReports = employees.filter(
    (item) => item.managerId === employeeId || (!item.managerId && item.managerName === employee.name),
  );
  const directReportIds = new Set(directReports.map((item) => getEmployeeKey(item)));
  const replacementOptions = employees.filter(
    (item) => getEmployeeKey(item) !== employeeId && !directReportIds.has(getEmployeeKey(item)),
  );
  const currentManager = getEmployeeManager(employee, employees);
  const [replacementManagerId, setReplacementManagerId] = useState(
    currentManager ? getEmployeeKey(currentManager) : "",
  );

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-delete-modal">
        <div className="modal-head">
          <div>
            <h2>Əməkdaşı sil</h2>
            <p>Bu əməliyyat əməkdaşı HR reyestrindən silir və audit izini saxlayır.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <div className="hr-delete-summary">
          <AvatarLine initials={employee.initials} title={employee.name} subtitle={`${employee.position} · ${employee.department}`} />
          <span>{directReports.length ? `${directReports.length} əməkdaş bu şəxsə tabedir` : "Birbaşa tabe əməkdaş yoxdur"}</span>
        </div>
        {directReports.length > 0 && (
          <label className="hr-delete-reassignment">
            <span>Tabe əməkdaşların yeni rəhbəri</span>
            <select value={replacementManagerId} onChange={(event) => setReplacementManagerId(event.target.value)}>
              <option value="">Birbaşa rəhbərlik</option>
              {replacementOptions.map((manager) => <option key={getEmployeeKey(manager)} value={getEmployeeKey(manager)}>{manager.name} · {manager.position}</option>)}
            </select>
            <small>{directReports.map((report) => report.name).join(", ")}</small>
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
          <button type="button" className="secondary-btn danger-outline" onClick={() => onConfirm(replacementManagerId)}><Trash2 size={16} /> Sil</button>
        </div>
      </div>
    </div>
  );
}

function HrLeaveRequestModal({ employees = [], onClose, onSubmit }) {
  const [values, setValues] = useState({
    employeeId: employees[0] ? getEmployeeKey(employees[0]) : "",
    type: "İllik məzuniyyət",
    from: currentBusinessDate,
    to: currentBusinessDate,
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-operation-modal">
        <div className="modal-head">
          <div>
            <h2>Məzuniyyət qeydi</h2>
            <p>Əməkdaş, məzuniyyət növü və tarix aralığını qeyd edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <label><span>Əməkdaş</span><select value={values.employeeId} required onChange={(event) => updateValue("employeeId", event.target.value)}><option value="">Əməkdaş seçin</option>{employees.map((employee) => <option key={getEmployeeKey(employee)} value={getEmployeeKey(employee)}>{employee.name} · {employee.department}</option>)}</select></label>
          <label><span>Məzuniyyət növü</span><select value={values.type} onChange={(event) => updateValue("type", event.target.value)}><option>İllik məzuniyyət</option><option>Ödənişsiz məzuniyyət</option><option>Xəstəlik vərəqəsi</option><option>Ezamiyyət</option></select></label>
          <label><span>Başlanğıc tarixi</span><input type="date" value={values.from} required onChange={(event) => updateValue("from", event.target.value)} /></label>
          <label><span>Bitmə tarixi</span><input type="date" value={values.to} required onChange={(event) => updateValue("to", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><CalendarClock size={16} /> Qeyd yarat</button></div>
        </form>
      </div>
    </div>
  );
}

function HrVacancyModal({ employees = [], departments = [], onClose, onSubmit }) {
  const departmentOptions = [...new Set([
    ...employees.map((employee) => employee.department),
    ...departments.map((department) => department.name),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "az"));
  const [values, setValues] = useState({
    role: "",
    department: departmentOptions[0] || "",
    owner: "HR",
    targetDate: currentBusinessDate,
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card hr-operation-modal">
        <div className="modal-head">
          <div>
            <h2>Yeni vakansiya</h2>
            <p>Rol, şöbə və hədəf tarixi qeyd etməklə recruitment pipeline başlayın.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}>
          <label><span>Rol</span><input value={values.role} required autoFocus onChange={(event) => updateValue("role", event.target.value)} /></label>
          <label><span>Şöbə</span><input value={values.department} list="vacancy-departments" required onChange={(event) => updateValue("department", event.target.value)} /><datalist id="vacancy-departments">{departmentOptions.map((department) => <option key={department} value={department} />)}</datalist></label>
          <label><span>Owner</span><input value={values.owner} required onChange={(event) => updateValue("owner", event.target.value)} /></label>
          <label><span>Hədəf tarixi</span><input type="date" value={values.targetDate} onChange={(event) => updateValue("targetDate", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Plus size={16} /> Vakansiya yarat</button></div>
        </form>
      </div>
    </div>
  );
}

function FinanceAccountModal({ account, onClose, onSubmit }) {
  const [values, setValues] = useState({
    name: account?.name || "",
    code: account?.code || "",
    type: account?.type || "Kassa",
    currency: account?.currency || "AZN",
    openingBalance: account?.openingBalance || 0,
    status: account?.status || "Aktiv",
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{account ? "Hesabı redaktə et" : "Yeni maliyyə hesabı"}</h2>
            <p>Kassa və bank açılış balansını düzgün qeyd edin; bu dəyər maliyyə hesabatlarına daxil olur.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>Hesab adı</span>
            <input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} />
          </label>
          <label>
            <span>Hesab kodu</span>
            <input value={values.code} required onChange={(event) => updateValue("code", event.target.value)} />
          </label>
          <label>
            <span>Tip</span>
            <select value={values.type} onChange={(event) => updateValue("type", event.target.value)}>
              <option>Kassa</option>
              <option>Bank</option>
              <option>POS</option>
            </select>
          </label>
          <label>
            <span>Valyuta</span>
            <select value={values.currency} onChange={(event) => updateValue("currency", event.target.value)}>
              <option>AZN</option>
              <option>USD</option>
              <option>EUR</option>
            </select>
          </label>
          <label>
            <span>Açılış balansı</span>
            <input type="number" min="0" step="0.01" value={values.openingBalance} onChange={(event) => updateValue("openingBalance", event.target.value)} />
          </label>
          <label>
            <span>Status</span>
            <select value={values.status} onChange={(event) => updateValue("status", event.target.value)}>
              <option>Aktiv</option>
              <option>Passiv</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn"><Check size={16} /> Yadda saxla</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockIntakeModal({ warehouses, products = [], onClose, onSubmit }) {
  const [values, setValues] = useState({
    warehouseId: warehouses[0]?.id || "",
    product: "",
    qty: 1,
    price: 0,
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>İlkin mədaxil</h2>
            <p>İlk məhsulu seçilmiş anbara daxil edin. Məhsul avtomatik ümumi stokda da görünəcək.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label className="full">
            <span>Anbar</span>
            <select
              value={values.warehouseId}
              required
              onChange={(event) => updateValue("warehouseId", event.target.value)}
            >
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} · {warehouse.city}
                </option>
              ))}
            </select>
          </label>
          <label className="full">
            <span>Məhsul adı</span>
            {products.length > 0 ? (
              <select
                value={values.product}
                required
                onChange={(event) => {
                  const selected = products.find((product) => product.name === event.target.value);
                  setValues((current) => ({
                    ...current,
                    product: event.target.value,
                    price: selected?.salePrice ?? current.price,
                  }));
                }}
              >
                <option value="">Məhsul seçin</option>
                {products.filter((product) => product.status !== "Passiv").map((product) => (
                  <option key={product.id} value={product.name}>{product.sku} · {product.name}</option>
                ))}
              </select>
            ) : (
              <input
                value={values.product}
                required
                onChange={(event) => updateValue("product", event.target.value)}
              />
            )}
          </label>
          <label>
            <span>Miqdar</span>
            <input
              type="number"
              min="1"
              value={values.qty}
              required
              onChange={(event) => updateValue("qty", event.target.value)}
            />
          </label>
          <label>
            <span>Satış qiyməti</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.price}
              required
              onChange={(event) => updateValue("price", event.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn">
              <Plus size={16} />
              Mədaxil et
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VendorFormModal({ vendor, onClose, onSubmit, onDelete }) {
  const normalizedVendor = normalizeVendor(vendor || {});
  const [values, setValues] = useState({
    name: vendor?.name || "",
    country: vendor?.country || "",
    sku: vendor?.sku ?? 0,
    quota: vendor?.quota ?? 0,
    sold: vendor?.sold ?? 0,
    status: vendor?.status || "Aktiv",
    contact: vendor?.contact || "",
    phone: vendor?.phone || "",
    email: vendor?.email || "",
    leadTimeDays: vendor?.leadTimeDays ?? 14,
    paymentTerms: vendor?.paymentTerms || "30 gün",
    note: vendor?.note || "",
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card vendor-form-modal">
        <div className="modal-head">
          <div>
            <h2>{vendor ? "Vendoru redaktə et" : "Yeni vendor"}</h2>
            <p>Vendor məlumatları, kontakt, kvota və təchizat şərtlərini bir yerdə idarə edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        {vendor && (
          <div className="vendor-form-summary">
            <TwoLine title={normalizedVendor.name} subtitle={`${normalizedVendor.country} · ${normalizedVendor.sku} SKU`} />
            <ProgressRow value={normalizedVendor.quota > 0 ? (normalizedVendor.sold / normalizedVendor.quota) * 100 : 0} caption={`${normalizedVendor.sold}/${normalizedVendor.quota} kvota`} compact />
          </div>
        )}
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>Vendor adı</span>
            <input value={values.name} required autoFocus onChange={(event) => updateValue("name", event.target.value)} />
          </label>
          <label>
            <span>Ölkə</span>
            <input value={values.country} required onChange={(event) => updateValue("country", event.target.value)} />
          </label>
          <label>
            <span>SKU sayı</span>
            <input type="number" min="0" value={values.sku} required onChange={(event) => updateValue("sku", event.target.value)} />
          </label>
          <label>
            <span>Kvota</span>
            <input type="number" min="0" value={values.quota} required onChange={(event) => updateValue("quota", event.target.value)} />
          </label>
          <label>
            <span>Satılıb</span>
            <input type="number" min="0" value={values.sold} onChange={(event) => updateValue("sold", event.target.value)} />
          </label>
          <label>
            <span>Status</span>
            <select value={values.status} onChange={(event) => updateValue("status", event.target.value)}>
              <option>Aktiv</option>
              <option>Nəzarət</option>
              <option>Risk</option>
              <option>Passiv</option>
            </select>
          </label>
          <label>
            <span>Kontakt şəxs</span>
            <input value={values.contact} onChange={(event) => updateValue("contact", event.target.value)} />
          </label>
          <label>
            <span>Telefon</span>
            <input value={values.phone} onChange={(event) => updateValue("phone", event.target.value)} />
          </label>
          <label>
            <span>Email</span>
            <input type="email" value={values.email} onChange={(event) => updateValue("email", event.target.value)} />
          </label>
          <label>
            <span>Lead time, gün</span>
            <input type="number" min="0" value={values.leadTimeDays} onChange={(event) => updateValue("leadTimeDays", event.target.value)} />
          </label>
          <label className="full">
            <span>Ödəniş şərti</span>
            <input value={values.paymentTerms} onChange={(event) => updateValue("paymentTerms", event.target.value)} />
          </label>
          <label className="full">
            <span>Qeyd</span>
            <input value={values.note} placeholder="Müqavilə, servis, çatdırılma və ya keyfiyyət qeydi" onChange={(event) => updateValue("note", event.target.value)} />
          </label>
          <div className="modal-actions vendor-modal-actions">
            {onDelete && (
              <button type="button" className="secondary-btn danger-outline" onClick={onDelete}>
                <Trash2 size={16} />
                Sil
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn"><Check size={16} /> Yadda saxla</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getProductProcurementSnapshot(productName, warehouseStock = {}, products = [], purchaseOrders = []) {
  const product = (products || []).find((item) => item.name === productName);
  const productsByName = buildProductLookup(products);
  const orderCoverage = buildPurchaseOrderCoverage(purchaseOrders);
  const stockRows = Object.values(warehouseStock).flatMap((items) => items || []).filter((item) => item.product === productName);
  const total = stockRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reserved = stockRows.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const available = Math.max(0, total - reserved);
  const reorderPoint = getReorderPoint(
    {
      product: productName,
      total,
      reserved,
      price: Number(product?.salePrice || stockRows[0]?.price || 0),
      reorderLevel: product?.reorderLevel,
    },
    productsByName,
  );
  const targetQty = Math.max(reorderPoint > 0 ? reorderPoint * 2 : 0, 4);
  const suggestedQty = Math.max(0, targetQty - available);
  const coverage = orderCoverage.get(normalize(productName)) || { orderedQty: 0, count: 0, latest: null };
  return {
    product,
    total,
    reserved,
    available,
    reorderPoint,
    targetQty,
    suggestedQty,
    orderedQty: Number(coverage.orderedQty || 0),
    openPoCount: Number(coverage.count || 0),
    latestPoId: coverage.latest?.id || "",
    orderGap: Math.max(0, suggestedQty - Number(coverage.orderedQty || 0)),
  };
}

function FactoryPurchaseOrderModal({
  vendors = [],
  warehouses = [],
  products = [],
  warehouseStock = {},
  purchaseOrders = [],
  onClose,
  onSubmit,
}) {
  const productOptions = products.filter((product) => product.status !== "Passiv");
  const firstProduct = productOptions[0] || null;
  const initialSnapshot = getProductProcurementSnapshot(firstProduct?.name || "", warehouseStock, products, purchaseOrders);
  const [values, setValues] = useState({
    product: firstProduct?.name || "",
    vendor: vendors[0]?.name || "",
    supplierSource: vendors[0]?.name || "",
    warehouseId: warehouses[0]?.id || "",
    qty: Math.max(1, initialSnapshot.orderGap || initialSnapshot.suggestedQty || 1),
    unitCost: Number(firstProduct?.costPrice || 0),
    salePrice: Number(firstProduct?.salePrice || firstProduct?.costPrice || 0),
    expectedAt: formatDateInput(addDays(currentBusinessDate, 14)),
    note: "",
  });
  const snapshot = getProductProcurementSnapshot(values.product, warehouseStock, products, purchaseOrders);
  const amount = Math.max(0, Math.round(Number(values.qty || 0) * Number(values.unitCost || 0)));

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function selectProduct(productName) {
    const nextProduct = products.find((product) => product.name === productName);
    const nextSnapshot = getProductProcurementSnapshot(productName, warehouseStock, products, purchaseOrders);
    setValues((current) => ({
      ...current,
      product: productName,
      qty: Math.max(1, nextSnapshot.orderGap || nextSnapshot.suggestedQty || current.qty || 1),
      unitCost: Number(nextProduct?.costPrice || current.unitCost || 0),
      salePrice: Number(nextProduct?.salePrice || current.salePrice || nextProduct?.costPrice || 0),
    }));
  }

  function submit(event) {
    event.preventDefault();
    const saved = onSubmit({
      ...values,
      qty: Number(values.qty || 0),
      unitCost: Number(values.unitCost || 0),
      salePrice: Number(values.salePrice || 0),
      amount,
      available: snapshot.available,
      reorderPoint: snapshot.reorderPoint,
      orderGap: snapshot.orderGap || Number(values.qty || 0),
      procurementType: "Zavod sifarişi",
    });
    if (saved !== false) onClose();
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card factory-order-modal">
        <div className="modal-head">
          <div>
            <h2>Zavod sifarişi yarat</h2>
            <p>Məhsulun hardan alındığını, sayını, alış qiymətini və gözlənən mədaxil tarixini qeyd edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label className="full">
            <span>Məhsul</span>
            <select value={values.product} required onChange={(event) => selectProduct(event.target.value)}>
              <option value="">Məhsul seçin</option>
              {productOptions.map((product) => (
                <option key={product.id} value={product.name}>{product.sku} · {product.name}</option>
              ))}
            </select>
          </label>
          <div className="factory-order-snapshot full">
            <div><span>Satış üçün</span><strong>{snapshot.available}</strong></div>
            <div><span>Minimum</span><strong>{snapshot.reorderPoint || "—"}</strong></div>
            <div><span>Açıq sifariş</span><strong>{snapshot.orderedQty}</strong></div>
            <div><span>Təklif</span><strong>{snapshot.orderGap || snapshot.suggestedQty || 1}</strong></div>
          </div>
          <label>
            <span>Haradan alınır</span>
            <input
              list="factory-vendors"
              value={values.supplierSource}
              required
              onChange={(event) => {
                updateValue("supplierSource", event.target.value);
                updateValue("vendor", event.target.value);
              }}
            />
            <datalist id="factory-vendors">
              {vendors.map((vendor) => <option key={vendor.name} value={vendor.name} />)}
            </datalist>
          </label>
          <label>
            <span>Anbar</span>
            <select value={values.warehouseId} required onChange={(event) => updateValue("warehouseId", event.target.value)}>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.city}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Miqdar</span>
            <input type="number" min="1" value={values.qty} required onChange={(event) => updateValue("qty", event.target.value)} />
          </label>
          <label>
            <span>Alış qiyməti</span>
            <input type="number" min="0" step="0.01" value={values.unitCost} required onChange={(event) => updateValue("unitCost", event.target.value)} />
          </label>
          <label>
            <span>Stok/satış qiyməti</span>
            <input type="number" min="0" step="0.01" value={values.salePrice} required onChange={(event) => updateValue("salePrice", event.target.value)} />
          </label>
          <label>
            <span>Gözlənən tarix</span>
            <input type="date" value={values.expectedAt} onChange={(event) => updateValue("expectedAt", event.target.value)} />
          </label>
          <label className="full">
            <span>Qeyd</span>
            <input value={values.note} placeholder="Zavod partiyası, invoice və ya çatdırılma qeydi" onChange={(event) => updateValue("note", event.target.value)} />
          </label>
          <div className="factory-order-total full">
            <span>Toplam alış məbləği</span>
            <strong>{money(amount)}</strong>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn"><Plus size={16} /> PO yarat</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WarehouseImportModal({ warehouses, onClose, onImport }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState({ rows: [], errors: [] });
  const [isReading, setIsReading] = useState(false);

  async function readFile(file) {
    if (!file) return;
    setIsReading(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      setAnalysis(parseWarehouseImportCsv(text, warehouses));
    } catch {
      setAnalysis({ rows: [], errors: ["CSV faylı oxunmadı."] });
    } finally {
      setIsReading(false);
    }
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card warehouse-import-card">
        <div className="modal-head">
          <div>
            <h2>Toplu stok importu</h2>
            <p>CSV faylından anbar qalıqlarını əlavə edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button>
        </div>

        <div className="warehouse-import-actions">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV faylı seçin"
            onChange={(event) => readFile(event.target.files?.[0])}
          />
          <button type="button" className="primary-btn" disabled={isReading} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} /> {isReading ? "Oxunur..." : "CSV seçin"}
          </button>
          <button type="button" className="secondary-btn" onClick={downloadWarehouseImportTemplate}>
            <Download size={16} /> Şablon CSV
          </button>
          {fileName && <span>{fileName}</span>}
        </div>

        {(analysis.rows.length > 0 || analysis.errors.length > 0) && (
          <>
            <div className="warehouse-import-summary">
              <strong>{analysis.rows.length} etibarlı sətir</strong>
              <span>{analysis.errors.length} xəta</span>
            </div>
            {analysis.rows.length > 0 && (
              <DataTable
                columns={["Məhsul", "SKU", "Anbar", "Miqdar", "Satış", "Maya", "Minimum"]}
                rows={analysis.rows.slice(0, 8).map((row) => [
                  <strong>{row.product}</strong>,
                  row.sku || "Avtomatik",
                  row.warehouseName,
                  row.qty,
                  row.salePrice === null ? "—" : money(row.salePrice),
                  row.costPrice === null ? "—" : money(row.costPrice),
                  row.reorderLevel === null ? "—" : row.reorderLevel,
                ])}
              />
            )}
            {analysis.errors.length > 0 && (
              <div className="warehouse-import-errors">
                {analysis.errors.slice(0, 5).map((error) => <span key={error}>{error}</span>)}
                {analysis.errors.length > 5 && <span>və daha {analysis.errors.length - 5} xəta</span>}
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
          <button type="button" className="primary-btn" disabled={analysis.rows.length === 0 || isReading} onClick={() => onImport(analysis.rows)}>
            <Upload size={16} /> İmport et
          </button>
        </div>
      </div>
    </div>
  );
}

function SalesOperationModal({ order, orderOptions, onClose, onSubmit }) {
  const customers = orderOptions.customers || [];
  const stock = orderOptions.stock || [];
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const sellers = orderOptions.sellers || [];
  const delivered = order.status === "Təhvil verilib";
  const firstWarehouseId = order.warehouseId || warehouses[0]?.id || "";
  const firstSeller = sellers[0] || { name: "" };

  const getStockOptions = (targetWarehouseId) => {
    const rows = warehouseStock[targetWarehouseId]?.length ? warehouseStock[targetWarehouseId] : stock;
    const byProduct = new Map(rows.map((item) => [item.product, item]));
    (order.productLines || []).forEach((line) => {
      if (!byProduct.has(line.product)) {
        byProduct.set(line.product, {
          product: line.product,
          total: Number(line.qty || 0),
          reserved: Number(line.qty || 0),
          price: Number(line.price || 0),
        });
      }
    });
    return [...byProduct.values()];
  };

  const [warehouseId, setWarehouseId] = useState(firstWarehouseId);
  const availableStock = getStockOptions(warehouseId);
  const firstProduct = availableStock[0] || { product: "", price: 0 };
  const [customerFin, setCustomerFin] = useState(order.fin || customers[0]?.fin || "");
  const [customerName, setCustomerName] = useState(order.customer || customers.find((customer) => customer.fin === order.fin)?.name || "");
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod || "Nağd");
  const [creditMonths, setCreditMonths] = useState(order.creditMonths || 12);
  const [initialPayment, setInitialPayment] = useState(order.initialPayment ?? order.paid ?? 0);
  const [paid, setPaid] = useState(order.paid ?? order.amount ?? 0);
  const [amount, setAmount] = useState(order.amount ?? calculateOrderLineTotal(order.productLines || []));
  const [date, setDate] = useState(order.date || currentBusinessDate);
  const [status, setStatus] = useState(order.status || stages[0]);
  const [address, setAddress] = useState(order.address || "");
  const [note, setNote] = useState(order.note || "");
  const [productRows, setProductRows] = useState(() => {
    const rows = normalizeOrderProductLines(order.productLines || []);
    return (rows.length > 0 ? rows : [{ product: firstProduct.product, qty: 1, price: firstProduct.price }]).map((row) => ({
      id: crypto.randomUUID(),
      ...row,
    }));
  });
  const [sellerRows, setSellerRows] = useState(() => {
    const rows = getOrderSellerBonuses(order);
    return (rows.length > 0 ? rows : [{ seller: firstSeller.name, bonus: 0 }]).map((row) => ({
      id: crypto.randomUUID(),
      ...row,
    }));
  });

  const selectedCustomer = customers.find((customer) => customer.fin === customerFin);
  const lineTotal = calculateOrderLineTotal(productRows);
  const paymentPreview = paymentMethod === "Kredit" ? Number(initialPayment || 0) : Number(paid || 0);
  const bonusRate = sellerRows.reduce((sum, row) => sum + Number(row.bonus || 0), 0);
  const canSubmit = Boolean(customerName && warehouseId && productRows.some((row) => row.product) && Number(amount || 0) > 0);

  function changeCustomer(fin) {
    const customer = customers.find((item) => item.fin === fin);
    setCustomerFin(fin);
    if (customer) setCustomerName(customer.name);
  }

  function changeWarehouse(nextWarehouseId) {
    const nextStock = getStockOptions(nextWarehouseId);
    const nextFirst = nextStock[0] || { product: "", price: 0 };
    setWarehouseId(nextWarehouseId);
    setProductRows((rows) =>
      rows.map((row) => {
        const match = nextStock.find((item) => item.product === row.product) || nextFirst;
        return {
          ...row,
          product: match.product,
          price: match.price ?? row.price,
          serials: [],
        };
      }),
    );
  }

  function changeProduct(rowId, field, value) {
    setProductRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "product") {
          const match = availableStock.find((item) => item.product === value);
          return { ...row, product: value, price: match?.price ?? row.price, serials: [] };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function addProductRow() {
    setProductRows((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        product: firstProduct.product,
        qty: 1,
        price: firstProduct.price,
        serials: [],
      },
    ]);
  }

  function removeProductRow(rowId) {
    setProductRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function changeSeller(rowId, field, value) {
    setSellerRows((rows) => rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  }

  function addSellerRow() {
    if (sellerRows.length >= 3) return;
    const used = new Set(sellerRows.map((row) => row.seller));
    const nextSeller = sellers.find((seller) => !used.has(seller.name)) || firstSeller;
    setSellerRows((rows) => [...rows, { id: crypto.randomUUID(), seller: nextSeller.name, bonus: 0 }]);
  }

  function removeSellerRow(rowId) {
    setSellerRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function submit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      customer: customerName,
      fin: customerFin,
      warehouseId,
      productLines: productRows,
      sellers: sellerRows,
      amount: Number(amount || lineTotal),
      paid,
      paymentMethod,
      creditMonths,
      initialPayment,
      date,
      status,
      address,
      note,
      bonusTotal: (paymentPreview * bonusRate) / 100,
    });
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card order-modal-card">
        <div className="modal-head order-modal-head">
          <div>
            <h2>Satış əməliyyatını redaktə et</h2>
            <p>{order.id} üzrə müştəri, ödəniş, bonus və rezerv məlumatlarını yeniləyin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="order-modal-form">
          <section className="order-section">
            <label className="order-label">MÜŞTƏRİ VƏ ÖDƏNİŞ</label>
            <div className="order-two-col">
              <select value={customerFin} onChange={(event) => changeCustomer(event.target.value)}>
                {customers.map((customer) => (
                  <option key={customer.fin} value={customer.fin}>
                    {customer.name} — {customer.fin}
                  </option>
                ))}
                {!customers.some((customer) => customer.fin === customerFin) && <option value={customerFin}>{customerName}</option>}
              </select>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option>Nağd</option>
                <option>Kart</option>
                <option>Köçürmə</option>
                <option>Kredit</option>
              </select>
            </div>
            <div className="order-two-col">
              <label className="order-sub-field">
                <span>Müştəri adı</span>
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </label>
              <label className="order-sub-field">
                <span>Tarix</span>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </label>
            </div>
            <label className="order-sub-field">
              <span>ANBAR</span>
              <select value={warehouseId} onChange={(event) => changeWarehouse(event.target.value)} disabled={delivered}>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} — {warehouse.city}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label">MƏHSULLAR</span>
              <button type="button" className="secondary-btn" onClick={addProductRow} disabled={delivered}>
                <Plus size={16} />
                Sətr əlavə et
              </button>
            </div>
            <div className="order-lines">
              {productRows.map((row) => (
                <div className="order-line-grid" key={row.id}>
                  <select value={row.product} onChange={(event) => changeProduct(row.id, "product", event.target.value)} disabled={delivered}>
                    {availableStock.map((item) => (
                      <option key={item.product} value={item.product}>
                        {item.product} — {getAvailableQuantity(item)} satış üçün
                      </option>
                    ))}
                  </select>
                  <input type="number" min="1" value={row.qty} onChange={(event) => changeProduct(row.id, "qty", event.target.value)} disabled={delivered} />
                  <input type="number" min="0" value={row.price} onChange={(event) => changeProduct(row.id, "price", event.target.value)} disabled={delivered} />
                  <button type="button" className="line-delete" onClick={() => removeProductRow(row.id)} disabled={delivered} aria-label="Məhsul sətrini sil">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <div className="order-total edit-order-total">
              <span>Sətir cəmi: {money(lineTotal)}</span>
              <label>
                <span>Yekun məbləğ</span>
                <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
            </div>
          </section>

          {paymentMethod === "Kredit" ? (
            <section className="order-section credit-order-section">
              <span className="order-label">
                <CreditCard size={16} />
                KREDİT ŞƏRTLƏRİ
              </span>
              <div className="credit-order-grid">
                <label className="order-sub-field">
                  <span>Müddət</span>
                  <select value={creditMonths} onChange={(event) => setCreditMonths(Number(event.target.value))}>
                    {creditTermOptions.map((month) => (
                      <option key={month} value={month}>{month} ay</option>
                    ))}
                  </select>
                </label>
                <label className="order-sub-field">
                  <span>İlkin ödəniş</span>
                  <input type="number" min="0" max={amount} value={initialPayment} onChange={(event) => setInitialPayment(event.target.value)} />
                </label>
              </div>
            </section>
          ) : (
            <section className="order-section">
              <label className="order-sub-field">
                <span>Daxil olan</span>
                <input type="number" min="0" max={amount} value={paid} onChange={(event) => setPaid(event.target.value)} />
              </label>
            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICI BONUSLARI
              </span>
              <button type="button" className="secondary-btn" disabled={sellerRows.length >= 3} onClick={addSellerRow}>
                <Plus size={16} />
                Satıcı əlavə et
              </button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <select value={row.seller} onChange={(event) => changeSeller(row.id, "seller", event.target.value)}>
                    {sellers.map((seller) => (
                      <option key={seller.name} value={seller.name}>{seller.name}</option>
                    ))}
                    {row.seller && !sellers.some((seller) => seller.name === row.seller) && <option value={row.seller}>{row.seller}</option>}
                  </select>
                  <label className="bonus-input">
                    <input type="number" min="0" max="100" value={row.bonus} onChange={(event) => changeSeller(row.id, "bonus", event.target.value)} />
                    <span>% bonus</span>
                  </label>
                  <button type="button" className="line-delete" onClick={() => removeSellerRow(row.id)} aria-label="Satıcı sətrini sil">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="order-section">
            <div className="order-two-col">
              <label className="order-sub-field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  {stages
                    .filter((stage) => delivered || stage !== "Təhvil verilib")
                    .map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                </select>
              </label>
              <label className="order-sub-field">
                <span>Ünvan</span>
                <input value={address} onChange={(event) => setAddress(event.target.value)} />
              </label>
            </div>
            <label className="order-sub-field">
              <span>Qeyd</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </section>

          <div className="modal-actions order-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn" disabled={!canSubmit}>Yadda saxla</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExpenseOperationModal({ expense, onClose, onSubmit }) {
  const [values, setValues] = useState({
    description: expense.description || "",
    category: expense.category || "",
    date: expense.date || currentBusinessDate,
    amount: expense.amount || 0,
    status: expense.status || "Təsdiq gözləyir",
    note: expense.note || "",
  });

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>Xərc əməliyyatını redaktə et</h2>
            <p>{expense.id} üzrə məbləğ, kateqoriya və statusu yeniləyin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label className="full">
            <span>Təsvir</span>
            <input value={values.description} onChange={(event) => updateValue("description", event.target.value)} required />
          </label>
          <label>
            <span>Kateqoriya</span>
            <input value={values.category} onChange={(event) => updateValue("category", event.target.value)} required />
          </label>
          <label>
            <span>Tarix</span>
            <input type="date" value={values.date} onChange={(event) => updateValue("date", event.target.value)} />
          </label>
          <label>
            <span>Məbləğ</span>
            <input type="number" min="0" value={values.amount} onChange={(event) => updateValue("amount", event.target.value)} required />
          </label>
          <label>
            <span>Status</span>
            <select value={values.status} onChange={(event) => updateValue("status", event.target.value)}>
              <option>Təsdiq gözləyir</option>
              <option>Təsdiq edildi</option>
              <option>İmtina edildi</option>
            </select>
          </label>
          <label className="full">
            <span>Qeyd</span>
            <textarea value={values.note} onChange={(event) => updateValue("note", event.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn">Yadda saxla</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OperationDeleteModal({ title, description, warning, confirmDisabled = false, confirmLabel = "Sil", onClose, onConfirm }) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card operation-delete-modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <div className="operation-delete-warning">
          <CircleAlert size={18} />
          <span>{warning}</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
          <button type="button" className="secondary-btn danger-outline" disabled={confirmDisabled} onClick={onConfirm}>
            <Trash2 size={16} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function SalesOrderModal({ type, onClose, onCreate, orderOptions, defaults = {} }) {
  const customers = orderOptions.customers;
  const stock = orderOptions.stock;
  const sellers = orderOptions.sellers;
  const warehouses = orderOptions.warehouses || [];
  const warehouseStock = orderOptions.warehouseStock || {};
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || "");
  const availableStock = warehouseStock[warehouseId]?.length ? warehouseStock[warehouseId] : stock;
  const firstProduct = availableStock[0] || stock[0] || { product: "", price: 0 };
  const firstSeller = sellers[0] || { name: "" };
  const [customerFin, setCustomerFin] = useState(customers[0]?.fin || "");
  const [paymentMethod, setPaymentMethod] = useState(defaults.paymentMethod || "Nağd");
  const [creditMonths, setCreditMonths] = useState(12);
  const [initialPayment, setInitialPayment] = useState(0);
  const [productRows, setProductRows] = useState([
    {
      id: crypto.randomUUID(),
      product: firstProduct.product,
      qty: 1,
      price: firstProduct.price,
      serials: getAvailableSerialsForProduct(warehouseStock, warehouseId, firstProduct.product).slice(0, 1),
    },
  ]);
  const [sellerRows, setSellerRows] = useState([
    { id: crypto.randomUUID(), seller: firstSeller.name, bonus: 3 },
  ]);
  const [note, setNote] = useState("");

  const selectedCustomer = customers.find((customer) => customer.fin === customerFin) || customers[0];
  const orderTotal = productRows.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0),
    0,
  );
  const creditPlan = buildCreditPlan({
    total: orderTotal,
    initialPayment,
    months: creditMonths,
  });
  const paidAmount = paymentMethod === "Kredit" ? creditPlan.initialPayment : orderTotal;
  const bonusRate = sellerRows.reduce((sum, item) => sum + Number(item.bonus || 0), 0);
  const bonusTotal = (paidAmount * bonusRate) / 100;
  const selectedSerials = productRows.flatMap((row) => row.serials || []);
  const stockIssues = productRows
    .filter((row) => row.product)
    .map((row) => {
      const item = availableStock.find((stockItem) => stockItem.product === row.product);
      const available = item ? getAvailableQuantity(item) : 0;
      const requested = Math.max(1, Number(row.qty || 1));
      return available < requested ? `${row.product}: ${available}/${requested} ədəd satış qalığı` : "";
    })
    .filter(Boolean);
  const canCreateOrder = Boolean(
    selectedCustomer &&
      warehouseId &&
      availableStock.length > 0 &&
      orderTotal > 0 &&
      productRows.some((row) => row.product) &&
      stockIssues.length === 0,
  );

  function getRowSerialOptions(row) {
    const allSerials = getAvailableSerialsForProduct(warehouseStock, warehouseId, row.product);
    const rowSerials = new Set(row.serials || []);
    const usedOutsideRow = new Set(selectedSerials.filter((serial) => !rowSerials.has(serial)));
    return allSerials.filter((serial) => !usedOutsideRow.has(serial) || rowSerials.has(serial));
  }

  function normalizeRowSerials(product, qty, currentSerials = []) {
    const amount = Math.max(1, Math.round(Number(qty || 1)));
    const options = getAvailableSerialsForProduct(warehouseStock, warehouseId, product);
    if (options.length === 0) return [];
    const next = [...currentSerials.filter((serial) => options.includes(serial))];

    for (const serial of options) {
      if (next.length >= amount) break;
      if (!selectedSerials.includes(serial) && !next.includes(serial)) next.push(serial);
    }

    return next.slice(0, amount);
  }

  function changeWarehouse(nextWarehouseId) {
    const nextStock = warehouseStock[nextWarehouseId]?.length
      ? warehouseStock[nextWarehouseId]
      : stock;
    const nextFirstProduct = nextStock[0] || { product: "", price: 0 };
    setWarehouseId(nextWarehouseId);
    setProductRows((rows) =>
      rows.map((row) => {
        const match = nextStock.find((item) => item.product === row.product) || nextFirstProduct;
        return {
          ...row,
          product: match.product,
          price: match.price,
          serials: getAvailableSerialsForProduct(warehouseStock, nextWarehouseId, match.product).slice(0, Math.max(1, Number(row.qty || 1))),
        };
      }),
    );
  }

  function changeProduct(rowId, field, value) {
    setProductRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        if (field === "product") {
          const match = availableStock.find((item) => item.product === value);
          return {
            ...row,
            product: value,
            price: match?.price || row.price,
            serials: normalizeRowSerials(value, row.qty, []),
          };
        }
        if (field === "qty") {
          return {
            ...row,
            qty: value,
            serials: normalizeRowSerials(row.product, value, row.serials),
          };
        }
        return { ...row, [field]: value };
      }),
    );
  }

  function changeRowSerial(rowId, index, value) {
    setProductRows((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;
        const serials = [...(row.serials || [])];
        serials[index] = value;
        return { ...row, serials };
      }),
    );
  }

  function addProductRow() {
    setProductRows((rows) => [
      ...rows,
      {
        id: crypto.randomUUID(),
        product: firstProduct.product,
        qty: 1,
        price: firstProduct.price,
        serials: getAvailableSerialsForProduct(warehouseStock, warehouseId, firstProduct.product).slice(0, 1),
      },
    ]);
  }

  function removeProductRow(rowId) {
    setProductRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function changeSeller(rowId, field, value) {
    setSellerRows((rows) =>
      rows.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)),
    );
  }

  function addSellerRow() {
    if (sellerRows.length >= 3) return;
    const used = new Set(sellerRows.map((row) => row.seller));
    const nextSeller = sellers.find((seller) => !used.has(seller.name)) || firstSeller;
    setSellerRows((rows) => [
      ...rows,
      { id: crypto.randomUUID(), seller: nextSeller.name, bonus: 1 },
    ]);
  }

  function removeSellerRow(rowId) {
    setSellerRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== rowId)));
  }

  function submit(event) {
    event.preventDefault();
    if (!canCreateOrder) return;
    onCreate(type, {
      customer: selectedCustomer?.name || "",
      fin: selectedCustomer?.fin || "",
      paymentMethod,
      warehouseId,
      creditMonths,
      initialPayment,
      products: productRows.map((row) => ({
        ...row,
        serials: normalizeRowSerials(row.product, row.qty, row.serials),
      })),
      sellers: sellerRows,
      orderTotal,
      bonusTotal,
      note,
    });
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card order-modal-card">
        <div className="modal-head order-modal-head">
          <div>
            <h2>Yeni Satış Sifarişi</h2>
            <p>Müştəri, məhsul və satıcı bonus faizlərini daxil edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="order-modal-form">
          <section className="order-section">
            <label className="order-label" htmlFor="order-customer">
              MÜŞTƏRİ
            </label>
            <div className="order-two-col">
              <select
                id="order-customer"
                value={customerFin}
                onChange={(event) => setCustomerFin(event.target.value)}
              >
                {customers.map((customer) => (
                  <option key={customer.fin} value={customer.fin}>
                    {customer.name} — {customer.fin}
                  </option>
                ))}
              </select>
              <select
                aria-label="Ödəniş tipi"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              >
                <option>Nağd</option>
                <option>Kredit</option>
              </select>
            </div>
            <label className="order-sub-field">
              <span>ANBAR</span>
              <select
                aria-label="Rezerv anbarı"
                value={warehouseId}
                onChange={(event) => changeWarehouse(event.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} — {warehouse.city}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label">MƏHSULLAR</span>
              <button type="button" className="secondary-btn" onClick={addProductRow}>
                <Plus size={16} />
                Sətr əlavə et
              </button>
            </div>
            <div className="order-lines">
              {productRows.map((row) => (
                <div className="order-line-grid" key={row.id}>
                  <select
                    aria-label="Məhsul seç"
                    value={row.product}
                    onChange={(event) => changeProduct(row.id, "product", event.target.value)}
                  >
                    {availableStock.map((item) => (
                      <option key={item.product} value={item.product}>
                        {item.product} — {item.total - item.reserved} satış üçün
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Miqdar"
                    type="number"
                    min="1"
                    value={row.qty}
                    onChange={(event) => changeProduct(row.id, "qty", event.target.value)}
                  />
                  <input
                    aria-label="Qiymət"
                    type="number"
                    min="0"
                    value={row.price}
                    onChange={(event) => changeProduct(row.id, "price", event.target.value)}
                  />
                  <button
                    type="button"
                    className="line-delete"
                    onClick={() => removeProductRow(row.id)}
                    aria-label="Məhsul sətrini sil"
                  >
                    <Trash2 size={17} />
                  </button>
                  {getRowSerialOptions(row).length > 0 && (
                    <div className="serial-pick-list">
                      {Array.from({ length: Math.max(1, Number(row.qty || 1)) }).map((_, index) => (
                        <label key={`${row.id}-serial-${index}`}>
                          <span>IMEI #{index + 1}</span>
                          <select
                            value={row.serials?.[index] || ""}
                            onChange={(event) => changeRowSerial(row.id, index, event.target.value)}
                          >
                            <option value="">Serial seç</option>
                            {getRowSerialOptions(row).map((serial) => (
                              <option key={serial} value={serial}>
                                {serial}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="order-total">
              <span>Ümumi:</span>
              <strong>{money(orderTotal)}</strong>
            </div>
            {stockIssues.length > 0 && (
              <div className="order-stock-warning">
                <CircleAlert size={16} />
                <span>{stockIssues[0]}</span>
              </div>
            )}
          </section>

          {paymentMethod === "Kredit" && (
            <section className="order-section credit-order-section">
              <div className="section-title-row">
                <span className="order-label">
                  <CreditCard size={16} />
                  KREDİT ŞƏRTLƏRİ
                </span>
              </div>
              <div className="credit-order-grid">
                <label className="order-sub-field">
                  <span>MÜDDƏT</span>
                  <select
                    aria-label="Kredit müddəti"
                    value={creditMonths}
                    onChange={(event) => setCreditMonths(Number(event.target.value))}
                  >
                    {creditTermOptions.map((month) => (
                      <option key={month} value={month}>
                        {month} ay
                      </option>
                    ))}
                  </select>
                </label>
                <label className="order-sub-field">
                  <span>İLKİN ÖDƏNİŞ</span>
                  <input
                    aria-label="İlkin ödəniş"
                    type="number"
                    min="0"
                    max={orderTotal}
                    value={initialPayment}
                    onChange={(event) => setInitialPayment(event.target.value)}
                  />
                </label>
              </div>
              <div className="credit-plan-summary">
                <div>
                  <span>Kredit məbləği</span>
                  <strong>{money(creditPlan.total)}</strong>
                </div>
                <div>
                  <span>Qalıq</span>
                  <strong>{money(creditPlan.balance)}</strong>
                </div>
                <div>
                  <span>{creditPlan.months > 1 ? `${creditPlan.months - 1} ay` : "Aylıq"}</span>
                  <strong>{money(creditPlan.monthly)}</strong>
                </div>
                <div>
                  <span>Son ay</span>
                  <strong>{money(creditPlan.lastPayment)}</strong>
                </div>
              </div>
              <p className="credit-plan-example">
                Bölgü: {creditPlan.months > 1 ? `${creditPlan.months - 1} ay ${money(creditPlan.monthly)}, ` : ""}
                sonuncu ay {money(creditPlan.lastPayment)}.
              </p>
            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICILAR (MAX. 3) — HƏR BİRİ ÖZ BONUS %
              </span>
              <button
                type="button"
                className="secondary-btn"
                disabled={sellerRows.length >= 3}
                onClick={addSellerRow}
              >
                <Plus size={16} />
                Satıcı əlavə et
              </button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <select
                    aria-label="Satıcı seç"
                    value={row.seller}
                    onChange={(event) => changeSeller(row.id, "seller", event.target.value)}
                  >
                    {sellers.length === 0 && <option value="">Satıcı seçilməyib</option>}
                    {sellers.map((seller) => (
                      <option key={seller.name} value={seller.name}>
                        {seller.name}
                      </option>
                    ))}
                  </select>
                  <label className="bonus-input">
                    <input
                      aria-label="Bonus faizi"
                      type="number"
                      min="0"
                      max="100"
                      value={row.bonus}
                      onChange={(event) => changeSeller(row.id, "bonus", event.target.value)}
                    />
                    <span>% bonus</span>
                  </label>
                  <button
                    type="button"
                    className="line-delete"
                    onClick={() => removeSellerRow(row.id)}
                    aria-label="Satıcı sətrini sil"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <p className="bonus-note">
              Nümunə: müştəri {money(paidAmount || 100)} ödəyərsə, bu sifariş üzrə cəmi{" "}
              <strong>{bonusRate}%</strong> = <strong>{money(bonusTotal || bonusRate)}</strong> bonus paylanacaq.
            </p>
          </section>

          <section className="order-section">
            <label className="order-label" htmlFor="order-note">
              QEYD
            </label>
            <textarea
              id="order-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Çatdırılma şərtləri, xüsusi istəklər..."
            />
          </section>

          <div className="modal-actions order-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn" disabled={!canCreateOrder}>
              Sifarişi yarat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateModal({
  type,
  mode,
  config,
  warehouse,
  product,
  employee,
  vendor,
  financeAccount,
  salesOrder,
  expense,
  contract,
  companySettings,
  orderOptions,
  salesDefaults,
  onClose,
  onCreate,
  onUpdateWarehouse,
  onReceiveStock,
  onCreatePurchaseOrder,
  onImportWarehouseStock,
  onUpdateProduct,
  onDeleteProduct,
  onSaveFinanceAccount,
  onUpdateSalesOrder,
  onDeleteSalesOrder,
  onUpdateExpense,
  onDeleteExpense,
  onSaveVendor,
  onRequestVendorDelete,
  onDeleteVendor,
  onSaveEmployee,
  onCreateDepartment,
  onDeleteEmployee,
  onCreateLeaveRequest,
  onCreateVacancy,
}) {
  if (type === "warehouse") {
    return (
      <WarehouseFormModal
        mode={mode}
        warehouse={warehouse}
        onClose={onClose}
        onSubmit={(values) => {
          if (mode === "edit" && warehouse) {
            onUpdateWarehouse(warehouse.id, values);
            return;
          }
          onCreate("warehouse", values);
        }}
      />
    );
  }

  if (type === "stockIntake") {
    return (
      <StockIntakeModal
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        onClose={onClose}
        onSubmit={onReceiveStock}
      />
    );
  }

  if (type === "warehouseImport") {
    return <WarehouseImportModal warehouses={orderOptions.warehouses} onClose={onClose} onImport={onImportWarehouseStock} />;
  }

  if (type === "purchaseOrder") {
    return (
      <FactoryPurchaseOrderModal
        vendors={orderOptions.vendors}
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        warehouseStock={orderOptions.warehouseStock}
        purchaseOrders={orderOptions.purchaseOrders}
        onClose={onClose}
        onSubmit={onCreatePurchaseOrder}
      />
    );
  }

  if (type === "vendors") {
    return (
      <VendorFormModal
        vendor={vendor}
        onClose={onClose}
        onSubmit={(values) => {
          if (mode === "edit" && vendor) {
            onSaveVendor(getVendorKey(vendor), values);
            return;
          }
          onCreate("vendors", values);
        }}
        onDelete={vendor ? () => onRequestVendorDelete(getVendorKey(vendor)) : null}
      />
    );
  }

  if (type === "vendorDelete" && vendor) {
    const openPoCount = (orderOptions.purchaseOrders || []).filter(
      (po) =>
        isPurchaseOrderOpen(po) &&
        (normalize(po.vendor) === normalize(vendor.name) || normalize(po.supplierSource) === normalize(vendor.name)),
    ).length;

    return (
      <OperationDeleteModal
        title="Vendoru sil"
        description={`${vendor.name} · ${vendor.country || "Ölkə qeyd edilməyib"}`}
        warning={
          openPoCount > 0
            ? `${openPoCount} açıq PO var. Əvvəl PO-ları təsdiqləyin, sonra vendor silinə bilər.`
            : "Vendor reyestrdən silinəcək. Bağlı təsdiqlənmiş PO tarixçəsi qalacaq."
        }
        confirmDisabled={openPoCount > 0}
        confirmLabel={openPoCount > 0 ? "PO açıqdır" : "Sil"}
        onClose={onClose}
        onConfirm={() => onDeleteVendor(getVendorKey(vendor))}
      />
    );
  }

  if (type === "hr") {
    return (
      <HrEmployeeModal
        employee={employee}
        employees={orderOptions.employees}
        departments={orderOptions.departments}
        onClose={onClose}
        onSubmit={(values) => {
          if (employee) {
            onSaveEmployee(getEmployeeKey(employee), values);
            return;
          }
          onCreate("hr", values);
        }}
      />
    );
  }

  if (type === "department") {
    return <HrDepartmentModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateDepartment} />;
  }

  if (type === "leaveRequest") {
    return <HrLeaveRequestModal employees={orderOptions.employees} onClose={onClose} onSubmit={onCreateLeaveRequest} />;
  }

  if (type === "vacancy") {
    return <HrVacancyModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateVacancy} />;
  }

  if (type === "employeeDelete" && employee) {
    return <HrEmployeeDeleteModal employee={employee} employees={orderOptions.employees} onClose={onClose} onConfirm={(replacementManagerId) => onDeleteEmployee(getEmployeeKey(employee), replacementManagerId)} />;
  }

  if (type === "product") {
    return (
      <ProductFormModal
        product={product}
        onClose={onClose}
        onDelete={mode === "edit" && product ? () => onDeleteProduct(product.id) : null}
        onSubmit={(values) => {
          if (mode === "edit" && product) {
            onUpdateProduct(product.id, values);
            return;
          }
          onCreate("product", values);
        }}
      />
    );
  }

  if (type === "financeAccount") {
    return (
      <FinanceAccountModal
        account={financeAccount}
        onClose={onClose}
        onSubmit={(values) => onSaveFinanceAccount(financeAccount?.id, values)}
      />
    );
  }

  if (type === "contractPrint" && contract) {
    return <ContractPrintModal contract={contract} settings={companySettings} onClose={onClose} />;
  }

  if (type === "salesOperation" && salesOrder) {
    return (
      <SalesOperationModal
        order={salesOrder}
        orderOptions={orderOptions}
        onClose={onClose}
        onSubmit={(values) => onUpdateSalesOrder(salesOrder.id, values)}
      />
    );
  }

  if (type === "salesOperationDelete" && salesOrder) {
    return (
      <OperationDeleteModal
        title="Satış əməliyyatını sil"
        description={`${salesOrder.id} · ${salesOrder.customer} · ${money(salesOrder.amount)}`}
        warning="Təhvil verilməyibsə rezerv açılacaq. Kreditli satışdırsa bağlı kredit, müqavilə və kassa daxilolmaları da təmizlənəcək."
        onClose={onClose}
        onConfirm={() => onDeleteSalesOrder(salesOrder.id)}
      />
    );
  }

  if (type === "expenseOperation" && expense) {
    return (
      <ExpenseOperationModal
        expense={expense}
        onClose={onClose}
        onSubmit={(values) => onUpdateExpense(expense.id, values)}
      />
    );
  }

  if (type === "expenseOperationDelete" && expense) {
    return (
      <OperationDeleteModal
        title="Xərc əməliyyatını sil"
        description={`${expense.id} · ${expense.description} · ${money(expense.amount)}`}
        warning="Bu xərc ledger, P&L və cash balans hesablamalarından çıxarılacaq."
        onClose={onClose}
        onConfirm={() => onDeleteExpense(expense.id)}
      />
    );
  }

  if (type === "sales" || type === "dashboard") {
    return (
      <SalesOrderModal
        type={type}
        orderOptions={orderOptions}
        defaults={salesDefaults}
        onClose={onClose}
        onCreate={onCreate}
      />
    );
  }

  return (
    <GenericCreateModal
      type={type}
      config={config}
      onClose={onClose}
      onCreate={onCreate}
    />
  );
}

function GenericCreateModal({ type, config, onClose, onCreate }) {
  const [values, setValues] = useState(
    Object.fromEntries(config.fields.map((field) => [field.name, field.value || ""])),
  );

  function submit(event) {
    event.preventDefault();
    onCreate(type, values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{config.title}</h2>
            <p>{config.subtitle}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          {config.fields.map((field) => (
            <label key={field.name} className={field.full ? "full" : ""}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={values[field.name]}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                >
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type || "text"}
                  value={values[field.name]}
                  required={field.required}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              )}
            </label>
          ))}
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Ləğv et
            </button>
            <button type="submit" className="primary-btn">
              <Plus size={16} />
              Əlavə et
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.variant}`}>
          <Check size={16} />
          {toast.message}
        </div>
      ))}
    </div>
  );
}

const createConfig = {
  dashboard: {
    title: "Yeni sifariş",
    subtitle: "Sifariş satış, anbar və təhvil moduluna düşəcək.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "products", label: "Məhsul", required: true, full: true },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: stages,
      },
    ],
  },
  crm: {
    title: "Yeni müştəri",
    subtitle: "FİN kodu və kredit limiti ilə müştəri açılışı.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "fin", label: "FİN", required: true },
      { name: "phone", label: "Telefon", required: true },
      {
        name: "category",
        label: "Kateqoriya",
        type: "select",
        options: ["Gümüş", "Qızıl", "Platin"],
      },
      { name: "limit", label: "Kredit limiti", type: "number" },
      { name: "debt", label: "Cari borc", type: "number", value: "0" },
    ],
  },
  sales: {
    title: "Yeni sifariş",
    subtitle: "Satıcı bölgüsü və ödəniş məlumatı ilə sifariş yaradın.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "products", label: "Məhsul", required: true, full: true },
      { name: "seller", label: "Satıcı bölgüsü" },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
    ],
  },
  finance: {
    title: "Yeni xərc",
    subtitle: "Xərc avtomatik təsdiq gözləyir statusu ilə açılır.",
    fields: [
      { name: "description", label: "Təsvir", required: true },
      { name: "category", label: "Kateqoriya", required: true },
      { name: "date", label: "Tarix", type: "date", value: currentBusinessDate },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
    ],
  },
  credits: {
    title: "Yeni kredit",
    subtitle: "Aylıq ödəniş cədvəli avtomatik hesablanır.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "contractId", label: "Müqavilə №", value: `MQ-${currentBusinessDate.slice(0, 4)}-` },
      { name: "product", label: "Cihaz", required: true },
      { name: "total", label: "Ümumi məbləğ", type: "number", required: true },
      { name: "initialPayment", label: "İlkin ödəniş", type: "number", value: "0" },
      {
        name: "months",
        label: "Müddət",
        type: "select",
        value: "12",
        options: creditTermOptions.map((month) => `${month}`),
      },
      { name: "next", label: "Növbəti tarix", value: formatPaymentDate(addDays(parsePaymentDate(currentBusinessDate), 30)) },
    ],
  },
  vendors: {
    title: "Yeni vendor",
    subtitle: "Vendor kvota cədvəlinə əlavə olunacaq.",
    fields: [
      { name: "name", label: "Vendor adı", required: true },
      { name: "country", label: "Ölkə", required: true },
      { name: "sku", label: "SKU sayı", type: "number", required: true },
      { name: "quota", label: "Kvota", type: "number", required: true },
    ],
  },
  hr: {
    title: "Yeni əməkdaş",
    subtitle: "HR reyestrinə əməkdaş əlavə edin.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "position", label: "Vəzifə", required: true },
      { name: "department", label: "Şöbə", required: true },
      { name: "departmentParent", label: "Üst şöbə" },
      { name: "managerName", label: "Rəhbər adı" },
      {
        name: "level",
        label: "Səviyyə",
        type: "select",
        value: "Komanda üzvü",
        options: hrLevelOptions,
      },
      { name: "salary", label: "Maaş", type: "number", required: true },
      { name: "kpi", label: "KPI", type: "number", value: "85" },
      { name: "hireDate", label: "İşə qəbul tarixi", type: "date", value: currentBusinessDate },
      {
        name: "workMode",
        label: "İş rejimi",
        type: "select",
        value: "Ofis",
        options: ["Ofis", "Hybrid", "Sahə", "Uzaqdan"],
      },
      { name: "shift", label: "Növbə", value: "09:00-18:00" },
      {
        name: "employmentType",
        label: "Məşğulluq tipi",
        type: "select",
        value: "Tam ştat",
        options: ["Tam ştat", "Yarım ştat", "Müqaviləli", "Sınaq müddəti"],
      },
      { name: "leaveBalance", label: "Məzuniyyət balansı", type: "number", value: "0" },
      { name: "documentsComplete", label: "Sənədlər, %", type: "number", value: "100" },
      { name: "skills", label: "Bacarıqlar (vergüllə)", full: true },
    ],
  },
  contracts: {
    title: "Yeni müqavilə",
    subtitle: "Şablon əsasında müqavilə hazırlanacaq.",
    fields: [
      { name: "customer", label: "Müştəri", required: true },
      { name: "fin", label: "FİN" },
      { name: "product", label: "Məhsul", required: true },
      { name: "amount", label: "Məbləğ", type: "number", required: true },
    ],
  },
};

export default App;
