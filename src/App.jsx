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
import { OrderProductLines, baseDeliveryDate, baseFinanceDate, buildHrEmployeeRecords, buildInvoiceControlSummary, buildKpiEmployeeScoreRows, buildReceivableAgingSummary, calculatePayrollTax2026, currentBusinessDate, currentBusinessYear, enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryPlan, getDeliveryRisk, getDeliveryStockCheck, getDeliveryTotalQuantity, getEmployeeKey, getEmployeeLevel, getEmployeeManager, getEmployeeManagerName, getHrDocumentHealth, getHrDocumentRows, getInvoiceAgingBucket, getKpiPeriodKey, getOrderBalance, getOrderDeliveryStatus, getOrderPaymentMethod, getSupportThreadId, isDeliveryQueueOrder, normalizeOrderProductLines, summarizeOrderProducts } from "./shared/lib/appDomain.jsx";
export { OrderProductLines, baseDeliveryDate, baseFinanceDate, buildHrEmployeeRecords, buildInvoiceControlSummary, buildKpiEmployeeScoreRows, buildReceivableAgingSummary, calculatePayrollTax2026, currentBusinessDate, currentBusinessYear, enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryPlan, getDeliveryRisk, getDeliveryStockCheck, getDeliveryTotalQuantity, getEmployeeKey, getEmployeeLevel, getEmployeeManager, getEmployeeManagerName, getHrDocumentHealth, getHrDocumentRows, getInvoiceAgingBucket, getKpiPeriodKey, getOrderBalance, getOrderDeliveryStatus, getOrderPaymentMethod, getSupportThreadId, isDeliveryQueueOrder, normalizeOrderProductLines, summarizeOrderProducts } from "./shared/lib/appDomain.jsx";
const DeliveriesPage = lazy(() => import("./pages/DeliveriesPage.jsx"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage.jsx"));
const TaxPage = lazy(() => import("./pages/TaxPage.jsx"));
const ReceivablesPage = lazy(() => import("./pages/ReceivablesPage.jsx"));
const KpiPage = lazy(() => import("./pages/KpiPage.jsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.jsx"));
const AccountingPage = lazy(() => import("./pages/AccountingPage.jsx"));
import { baseCreditDate, buildProductLookup, buildPurchaseOrderCoverage, buildSalesBonusRows, currentBusinessQuarter, dayInMs, getCreditOrder, getCustomerContracts, getCustomerOrders, getCustomerRelatedCredits, getDepartmentParentName, getOrderSellerBonuses, getReorderPoint, hrLevelOptions, isPurchaseOrderOpen } from "./shared/lib/appDomain.jsx";
export { WorkflowSteps, baseCreditDate, buildProcurementRows, buildProductLookup, buildPurchaseOrderCoverage, buildSalesBonusRows, currentBusinessQuarter, dayInMs, getCreditOrder, getCustomerContracts, getCustomerOrders, getCustomerRelatedCredits, getDepartmentParentName, getOrderSellerBonuses, getReorderPoint, hrLevelOptions, isPurchaseOrderOpen } from "./shared/lib/appDomain.jsx";
const CrmPage = lazy(() => import("./pages/CrmPage.jsx"));
const SalesPage = lazy(() => import("./pages/SalesPage.jsx"));
const VendorsPage = lazy(() => import("./pages/VendorsPage.jsx"));
const HrPage = lazy(() => import("./pages/HrPage.jsx"));
const MessagesPage = lazy(() => import("./pages/MessagesPage.jsx"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage.jsx"));
const ApiPage = lazy(() => import("./pages/ApiPage.jsx"));
const PlatformAdminPage = lazy(() => import("./pages/PlatformAdminPage.jsx"));
import { Toggle, ensureSettings, filterRows, getActiveRole, getAvailableQuantity, getDefaultModuleAccessForRole, getFreeQuantity, getModuleForPermission, getVendorKey, hasExpenseCashImpact, isLowStockItem, isSerialTrackedProduct, modulePermissionCatalog, navIcons, normalizeUserModuleAccess, normalizeVendor, targetDbProvider } from "./shared/lib/appDomain.jsx";
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const WarehousePage = lazy(() => import("./pages/WarehousePage.jsx"));
const FinancePage = lazy(() => import("./pages/FinancePage.jsx"));
const StockPage = lazy(() => import("./modules/warehouse/StockPage.jsx"));
const CashbookPage = lazy(() => import("./modules/finance/CashbookPage.jsx"));
const SalesInvoicesPage = lazy(() => import("./modules/finance/SalesInvoicesPage.jsx"));
const VendorManagementPage = lazy(() => import("./pages/VendorManagementPage.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));
const CreditsPage = lazy(() => import("./pages/CreditsPage.jsx"));


const baseCashBalance = 0;
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

function ensureKpiTargets(targets = []) {
  return Array.isArray(targets) && targets.length > 0 ? targets : initialState.kpiTargets || [];
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

function getDeliveryActionLabel(order) {
  if (order.status === "Təhvil verilib") return "Tamamlanıb";
  if (order.status === "Təhvilə çıxıb") return "Təhvili tamamla";
  return "Növbəti mərhələ";
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

function buildQuantityMap(items) {
  return items.reduce((map, item) => {
    if (!item.product) return map;
    map.set(item.product, (map.get(item.product) || 0) + Number(item.qty || 0));
    return map;
  }, new Map());
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
