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

};

export const modulePermissionCatalog = buildModulePermissionCatalog(navItems);
const creditTermOptions = [2, 3, 4, 5, 6, 12, 18, 24, 36, 48];
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

function shiftPaymentDate(value, months) {
  const date = parsePaymentDate(value);
  if (!date) return baseCreditDate;
  date.setMonth(date.getMonth() + months);
  return formatDateInput(date);
}

function getCreditPlanStartDate(credit) {
  const nextDate = parsePaymentDate(credit.next);
  if (!nextDate) return baseCreditDate;
  const nextInstallmentNumber = Math.max(1, Number(credit.paidMonths || 0) + 1);
  return shiftPaymentDate(formatDateInput(nextDate), -nextInstallmentNumber);
}

export function buildCreditPlan({ total, initialPayment = 0, months = 12, startDate = baseCreditDate }) {
  const term = creditTermOptions.includes(Number(months)) ? Number(months) : 12;
  const totalAmount = Math.max(0, Math.round(Number(total || 0)));
  const upfront = Math.min(totalAmount, Math.max(0, Math.round(Number(initialPayment || 0))));
  const balance = Math.max(0, totalAmount - upfront);
  let regularPayment = balance > 0 ? Math.round(balance / term) : 0;

  if (term > 1 && regularPayment * (term - 1) >= balance) {
    regularPayment = Math.floor(balance / term);
  }

  const installments = [];
  let accumulated = 0;

  for (let month = 1; month <= term; month += 1) {
    const isLast = month === term;
    const amount = isLast ? Math.max(0, balance - accumulated) : regularPayment;
    accumulated += amount;
    installments.push({
      month,
      amount,
      due: formatPaymentDate(addMonths(startDate, month)),
    });
  }

  return {
    total: totalAmount,
    initialPayment: upfront,
    balance,
    months: term,
    monthly: installments[0]?.amount || 0,
    lastPayment: installments[installments.length - 1]?.amount || 0,
    installments,
  };
}

export function getCreditDisplayPlan(credit) {
  const paidMonths = Number(credit.paidMonths || 0);
  const plan =
    Array.isArray(credit.installments) && credit.installments.length > 0
      ? {
          total: Number(credit.total || 0),
          initialPayment: Number(credit.initialPayment || 0),
          balance: Number(credit.balance ?? Math.max(0, credit.total - Number(credit.initialPayment || 0))),
          months: Number(credit.months || credit.installments.length),
          monthly: Number(credit.monthly ?? credit.installments[0]?.amount ?? 0),
          lastPayment: Number(
            credit.lastPayment ?? credit.installments[credit.installments.length - 1]?.amount ?? credit.monthly ?? 0,
          ),
          installments: credit.installments,
        }
      : (() => {
          const generatedPlan = buildCreditPlan({
          total: credit.total,
          initialPayment: credit.initialPayment || 0,
          months: credit.months,
          startDate: getCreditPlanStartDate(credit),
          });
          const installments = generatedPlan.installments.map((installment, index) =>
            index < paidMonths ? { ...installment, amount: 0 } : installment,
          );
          const paidPrincipal = generatedPlan.installments
            .slice(0, paidMonths)
            .reduce((sum, installment) => sum + Number(installment.amount || 0), 0);

          return {
            ...generatedPlan,
            balance:
              credit.balance === undefined
                ? Math.max(0, generatedPlan.balance - paidPrincipal)
                : Number(credit.balance || 0),
            installments,
          };
        })();

  return plan;
}

function daysBetween(from, to) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / dayInMs);
}

function addDays(dateValue, days) {
  const parsed = parsePaymentDate(dateValue);
  const date = parsed ? new Date(parsed.getTime()) : new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return parsePaymentDate(currentBusinessDate) || new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

function roundMoney(value) {
  return Math.round(Number(value || 0));
}

export function isCreditClosed(credit, plan = getCreditDisplayPlan(credit)) {
  const status = normalize(credit?.status);
  const balance = Number(plan?.balance ?? credit?.balance ?? 0);
  const months = Number(plan?.months || credit?.months || 0);
  const paidMonths = Number(credit?.paidMonths || 0);

  return (
    status.includes("tamam") ||
    status.includes("baДџlan") ||
    status.includes("baglan") ||
    status.includes("closed") ||
    balance <= 0 ||
    (months > 0 && paidMonths >= months)
  );
}

export function getCreditPaymentState(credit, plan = getCreditDisplayPlan(credit)) {
  if (isCreditClosed(credit, plan)) {
    return {
      nextInstallment: null,
      dueDate: null,
      daysOverdue: 0,
      isDueToday: false,
      isOverdue: false,
    };
  }

  const nextIndex = Math.min(Number(credit.paidMonths || 0), Math.max(0, plan.installments.length - 1));
  const scheduled = plan.installments[nextIndex] || plan.installments[0] || null;
  const due = credit.next && credit.next !== "вЂ”" ? credit.next : scheduled?.due;
  const nextInstallment = scheduled ? { ...scheduled, due } : null;
  const dueDate = parsePaymentDate(due);
  const today = parsePaymentDate(baseCreditDate);
  const dayDelta = dueDate && today ? daysBetween(dueDate, today) : 0;
  const statusOverdue = normalize(credit.status).includes("gecik");

  return {
    nextInstallment,
    dueDate,
    daysOverdue: Math.max(0, dayDelta),
    isDueToday: Boolean(dueDate && today && dayDelta === 0),
    isOverdue: Boolean((dueDate && today && dayDelta > 0) || statusOverdue),
  };
}

export function getCreditSourceLabel(credit) {
  return credit.salesSource || credit.orderId ? "SatД±Еџdan gЙ™lЙ™n" : "Manual kredit";
}

export function getCreditPaidTotal(plan) {
  return Math.max(0, Number(plan.total || 0) - Number(plan.balance || 0));
}

function getCreditRemainingMonths(plan) {
  return (plan.installments || []).filter((installment) => Number(installment.amount || 0) > 0).length;
}

export function getCreditDebtFormula(item) {
  const paidTotal = getCreditPaidTotal(item.plan);
  return {
    total: Number(item.plan.total || 0),
    paid: paidTotal,
    balance: Number(item.plan.balance || 0),
    remainingMonths: getCreditRemainingMonths(item.plan),
    nextAmount: Number(item.paymentState.nextInstallment?.amount || 0),
  };
}

function getCreditRiskLabel(item) {
  if (item.paymentState.isOverdue) return `${item.paymentState.daysOverdue} gГјn gecikib`;
  if (item.paymentState.isDueToday) return "Bu gГјn yД±ДџД±m";
  if (isCreditClosed(item.credit, item.plan)) return "TamamlanД±b";
  return "Aktiv izlЙ™mЙ™";
}

function matchesCreditDashboardFilter(item, filter) {
  if (filter === "Bu gГјnЙ™ olan Г¶dЙ™niЕџlЙ™r") return item.paymentState.isDueToday;
  if (filter === "GecikЙ™n Г¶dЙ™niЕџlЙ™r") return item.paymentState.isOverdue;
  if (filter === "Aktiv") return normalize(item.credit.status).includes("aktiv") && !isCreditClosed(item.credit, item.plan);
  if (filter === "Tamamlanan") return isCreditClosed(item.credit, item.plan);
  if (filter === "SatД±Еџdan gЙ™lЙ™n") return getCreditSourceLabel(item.credit) === "SatД±Еџdan gЙ™lЙ™n";
  if (filter === "YГјksЙ™k qalД±q") return Number(item.plan.balance || 0) >= 3000;
  return true;
}

export function matchesCreditSourceFilter(item, sourceFilter) {
  return sourceFilter === "BГјtГјn mЙ™nbЙ™lЙ™r" || getCreditSourceLabel(item.credit) === sourceFilter;
}

export const monthNamesAz = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Д°yun",
  "Д°yul",
  "Avqust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

export function getCreditRowDate(item) {
  return parsePaymentDate(item.paymentState.nextInstallment?.due || item.credit.next || item.credit.date);
}

export function matchesCreditManagementFilter(item, filter) {
  if (filter === "Aktiv") return normalize(item.credit.status).includes("aktiv") && !isCreditClosed(item.credit, item.plan);
  if (filter === "GГ¶zlЙ™yЙ™n") {
    return (
      !item.paymentState.isOverdue &&
      !item.paymentState.isDueToday &&
      !isCreditClosed(item.credit, item.plan)
    );
  }
  if (filter === "GecikmiЕџ") return item.paymentState.isOverdue;
  if (filter === "BaДџlanmД±Еџ") return isCreditClosed(item.credit, item.plan);
  if (filter === "BugГјnkГј") return item.paymentState.isDueToday;
  if (filter === "Cari ay") {
    const date = getCreditRowDate(item);
    const today = parsePaymentDate(baseCreditDate);
    return Boolean(date && today && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth());
  }
  return true;
}

export function matchesCreditSearch(item, query) {
  if (!query.trim()) return true;
  const q = normalize(query);
  const credit = item.credit;
  return normalize([
    credit.id,
    credit.customer,
    credit.fin,
    credit.contractId,
    credit.product,
    credit.device,
    credit.orderId,
    credit.warehouseName,
  ].join(" ")).includes(q);
}

export function getCreditInitials(name = "") {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("az-AZ");
}

export function getCreditManagementStatus(item) {
  if (isCreditClosed(item.credit, item.plan)) return "BaДџlanmД±Еџ";
  if (item.paymentState.isOverdue) return `${item.paymentState.daysOverdue} gГјn gecikib`;
  if (item.paymentState.isDueToday) return "BugГјnkГј Г¶dЙ™niЕџ";
  return item.credit.status || "Aktiv";
}

export function applyCreditPrincipalPayment(credit, principalAmount) {
  const plan = getCreditDisplayPlan(credit);
  const requestedPrincipal = Math.max(0, Math.round(Number(principalAmount || 0)));
  const appliedPrincipal = Math.min(requestedPrincipal, plan.balance);
  let remainingPrincipal = appliedPrincipal;
  const startIndex = Math.min(Number(credit.paidMonths || 0), Math.max(0, plan.installments.length - 1));
  const currentDueBefore = Number(plan.installments[startIndex]?.amount || 0);
  const installments = plan.installments.map((installment, index) => ({
    ...installment,
    amount: index < startIndex ? 0 : Number(installment.amount || 0),
  }));

  for (let index = startIndex; index < installments.length && remainingPrincipal > 0; index += 1) {
    const dueAmount = Number(installments[index].amount || 0);
    const appliedToMonth = Math.min(dueAmount, remainingPrincipal);
    installments[index] = {
      ...installments[index],
      amount: Math.max(0, dueAmount - appliedToMonth),
    };
    remainingPrincipal -= appliedToMonth;
  }

  const nextIndex = installments.findIndex((installment) => Number(installment.amount || 0) > 0);
  const nextInstallment = nextIndex >= 0 ? installments[nextIndex] : null;
  const nextBalance = Math.max(0, plan.balance - appliedPrincipal);
  const extraPrincipal = Math.max(0, appliedPrincipal - currentDueBefore);

  return {
    appliedPrincipal,
    currentDueBefore,
    extraPrincipal,
    installments,
    nextBalance,
    nextPaidMonths: nextIndex >= 0 ? nextIndex : plan.months,
    nextDue: nextInstallment?.due || "вЂ”",
    nextMonthly: nextInstallment?.amount || 0,
    status: nextBalance <= 0 ? "TamamlandД±" : "Aktiv",
  };
}

export function getReceivableClosureAmount(row) {
  return Math.max(0, Number(row?.amount || 0));
}

function summarizeOrderProducts(order) {
  if (Array.isArray(order.productLines) && order.productLines.length > 0) {
    return order.productLines
      .map((line) => `${line.product}${Number(line.qty || 1) > 1 ? ` x${Number(line.qty)}` : ""}`)
      .join(", ");
  }
  return order.products || "Cihaz qeyd edilmЙ™yib";
}

function getCreditIdForOrder(order) {
  return order.creditId || `KR-${String(order.id || "").replace(/\D/g, "")}`;
}

function buildSalesCreditRecord(order, storedCredit) {
  const totalAmount = Number(order.amount || storedCredit?.total || 0);
  const initialPayment = Number(order.initialPayment ?? order.paid ?? store…208292 tokens truncated…      <strong>{money(creditPlan.balance)}</strong>
                </div>
                <div>
                  <span>{creditPlan.months > 1 ? `${creditPlan.months - 1} ay` : "AylД±q"}</span>
                  <strong>{money(creditPlan.monthly)}</strong>
                </div>
                <div>
                  <span>Son ay</span>
                  <strong>{money(creditPlan.lastPayment)}</strong>
                </div>
              </div>
              <p className="credit-plan-example">
                BГ¶lgГј: {creditPlan.months > 1 ? `${creditPlan.months - 1} ay ${money(creditPlan.monthly)}, ` : ""}
                sonuncu ay {money(creditPlan.lastPayment)}.
              </p>
            </section>
          )}

          <section className="order-section">
            <div className="section-title-row">
              <span className="order-label seller-title">
                <Users size={16} />
                SATICILAR (MAX. 3) вЂ” HЖЏR BД°RД° Г–Z BONUS %
              </span>
              <button
                type="button"
                className="secondary-btn"
                disabled={sellerRows.length >= 3}
                onClick={addSellerRow}
              >
                <Plus size={16} />
                SatД±cД± Й™lavЙ™ et
              </button>
            </div>
            <div className="order-lines">
              {sellerRows.map((row) => (
                <div className="seller-line-grid" key={row.id}>
                  <select
                    aria-label="SatД±cД± seГ§"
                    value={row.seller}
                    onChange={(event) => changeSeller(row.id, "seller", event.target.value)}
                  >
                    {sellers.length === 0 && <option value="">SatД±cД± seГ§ilmЙ™yib</option>}
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
                    aria-label="SatД±cД± sЙ™trini sil"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
            <p className="bonus-note">
              NГјmunЙ™: mГјЕџtЙ™ri {money(paidAmount || 100)} Г¶dЙ™yЙ™rsЙ™, bu sifariЕџ ГјzrЙ™ cЙ™mi{" "}
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
              placeholder="Г‡atdД±rД±lma ЕџЙ™rtlЙ™ri, xГјsusi istЙ™klЙ™r..."
            />
          </section>

          <div className="modal-actions order-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              LЙ™Дџv et
            </button>
            <button type="submit" className="primary-btn" disabled={!canCreateOrder}>
              SifariЕџi yarat
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
        description={`${vendor.name} В· ${vendor.country || "Г–lkЙ™ qeyd edilmЙ™yib"}`}
        warning={
          openPoCount > 0
            ? `${openPoCount} aГ§Д±q PO var. ЖЏvvЙ™l PO-larД± tЙ™sdiqlЙ™yin, sonra vendor silinЙ™ bilЙ™r.`
            : "Vendor reyestrdЙ™n silinЙ™cЙ™k. BaДџlД± tЙ™sdiqlЙ™nmiЕџ PO tarixГ§Й™si qalacaq."
        }
        confirmDisabled={openPoCount > 0}
        confirmLabel={openPoCount > 0 ? "PO aГ§Д±qdД±r" : "Sil"}
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
        title="SatД±Еџ Й™mЙ™liyyatД±nД± sil"
        description={`${salesOrder.id} В· ${salesOrder.customer} В· ${money(salesOrder.amount)}`}
        warning="TЙ™hvil verilmЙ™yibsЙ™ rezerv aГ§Д±lacaq. Kreditli satД±ЕџdД±rsa baДџlД± kredit, mГјqavilЙ™ vЙ™ kassa daxilolmalarД± da tЙ™mizlЙ™nЙ™cЙ™k."
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
        title="XЙ™rc Й™mЙ™liyyatД±nД± sil"
        description={`${expense.id} В· ${expense.description} В· ${money(expense.amount)}`}
        warning="Bu xЙ™rc ledger, P&L vЙ™ cash balans hesablamalarД±ndan Г§Д±xarД±lacaq."
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
          <button className="icon-btn" onClick={onClose} aria-label="PЙ™ncЙ™rЙ™ni baДџla">
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
              LЙ™Дџv et
            </button>
            <button type="submit" className="primary-btn">
              <Plus size={16} />
              ЖЏlavЙ™ et
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
    title: "Yeni sifariЕџ",
    subtitle: "SifariЕџ satД±Еџ, anbar vЙ™ tЙ™hvil moduluna dГјЕџЙ™cЙ™k.",
    fields: [
      { name: "customer", label: "MГјЕџtЙ™ri", required: true },
      { name: "fin", label: "FД°N" },
      { name: "products", label: "MЙ™hsul", required: true, full: true },
      { name: "amount", label: "MЙ™blЙ™Дџ", type: "number", required: true },
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
    title: "Yeni mГјЕџtЙ™ri",
    subtitle: "FД°N kodu vЙ™ kredit limiti ilЙ™ mГјЕџtЙ™ri aГ§Д±lД±ЕџД±.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "fin", label: "FД°N", required: true },
      { name: "phone", label: "Telefon", required: true },
      {
        name: "category",
        label: "Kateqoriya",
        type: "select",
        options: ["GГјmГјЕџ", "QД±zД±l", "Platin"],
      },
      { name: "limit", label: "Kredit limiti", type: "number" },
      { name: "debt", label: "Cari borc", type: "number", value: "0" },
    ],
  },
  sales: {
    title: "Yeni sifariЕџ",
    subtitle: "SatД±cД± bГ¶lgГјsГј vЙ™ Г¶dЙ™niЕџ mЙ™lumatД± ilЙ™ sifariЕџ yaradД±n.",
    fields: [
      { name: "customer", label: "MГјЕџtЙ™ri", required: true },
      { name: "fin", label: "FД°N" },
      { name: "products", label: "MЙ™hsul", required: true, full: true },
      { name: "seller", label: "SatД±cД± bГ¶lgГјsГј" },
      { name: "amount", label: "MЙ™blЙ™Дџ", type: "number", required: true },
      { name: "paid", label: "Daxil olan", type: "number", value: "0" },
    ],
  },
  finance: {
    title: "Yeni xЙ™rc",
    subtitle: "XЙ™rc avtomatik tЙ™sdiq gГ¶zlЙ™yir statusu ilЙ™ aГ§Д±lД±r.",
    fields: [
      { name: "description", label: "TЙ™svir", required: true },
      { name: "category", label: "Kateqoriya", required: true },
      { name: "date", label: "Tarix", type: "date", value: currentBusinessDate },
      { name: "amount", label: "MЙ™blЙ™Дџ", type: "number", required: true },
    ],
  },
  credits: {
    title: "Yeni kredit",
    subtitle: "AylД±q Г¶dЙ™niЕџ cЙ™dvЙ™li avtomatik hesablanД±r.",
    fields: [
      { name: "customer", label: "MГјЕџtЙ™ri", required: true },
      { name: "contractId", label: "MГјqavilЙ™ в„–", value: `MQ-${currentBusinessDate.slice(0, 4)}-` },
      { name: "product", label: "Cihaz", required: true },
      { name: "total", label: "Гњmumi mЙ™blЙ™Дџ", type: "number", required: true },
      { name: "initialPayment", label: "Д°lkin Г¶dЙ™niЕџ", type: "number", value: "0" },
      {
        name: "months",
        label: "MГјddЙ™t",
        type: "select",
        value: "12",
        options: creditTermOptions.map((month) => `${month}`),
      },
      { name: "next", label: "NГ¶vbЙ™ti tarix", value: formatPaymentDate(addDays(parsePaymentDate(currentBusinessDate), 30)) },
    ],
  },
  vendors: {
    title: "Yeni vendor",
    subtitle: "Vendor kvota cЙ™dvЙ™linЙ™ Й™lavЙ™ olunacaq.",
    fields: [
      { name: "name", label: "Vendor adД±", required: true },
      { name: "country", label: "Г–lkЙ™", required: true },
      { name: "sku", label: "SKU sayД±", type: "number", required: true },
      { name: "quota", label: "Kvota", type: "number", required: true },
    ],
  },
  hr: {
    title: "Yeni Й™mЙ™kdaЕџ",
    subtitle: "HR reyestrinЙ™ Й™mЙ™kdaЕџ Й™lavЙ™ edin.",
    fields: [
      { name: "name", label: "Ad Soyad", required: true },
      { name: "position", label: "VЙ™zifЙ™", required: true },
      { name: "department", label: "ЕћГ¶bЙ™", required: true },
      { name: "departmentParent", label: "Гњst ЕџГ¶bЙ™" },
      { name: "managerName", label: "RЙ™hbЙ™r adД±" },
      {
        name: "level",
        label: "SЙ™viyyЙ™",
        type: "select",
        value: "Komanda ГјzvГј",
        options: hrLevelOptions,
      },
      { name: "salary", label: "MaaЕџ", type: "number", required: true },
      { name: "kpi", label: "KPI", type: "number", value: "85" },
      { name: "hireDate", label: "Д°ЕџЙ™ qЙ™bul tarixi", type: "date", value: currentBusinessDate },
      {
        name: "workMode",
        label: "Д°Еџ rejimi",
        type: "select",
        value: "Ofis",
        options: ["Ofis", "Hybrid", "SahЙ™", "Uzaqdan"],
      },
      { name: "shift", label: "NГ¶vbЙ™", value: "09:00-18:00" },
      {
        name: "employmentType",
        label: "MЙ™ЕџДџulluq tipi",
        type: "select",
        value: "Tam Еџtat",
        options: ["Tam Еџtat", "YarД±m Еџtat", "MГјqavilЙ™li", "SД±naq mГјddЙ™ti"],
      },
      { name: "leaveBalance", label: "MЙ™zuniyyЙ™t balansД±", type: "number", value: "0" },
      { name: "documentsComplete", label: "SЙ™nЙ™dlЙ™r, %", type: "number", value: "100" },
      { name: "skills", label: "BacarД±qlar (vergГјllЙ™)", full: true },
    ],
  },
  contracts: {
    title: "Yeni mГјqavilЙ™",
    subtitle: "Ећablon Й™sasД±nda mГјqavilЙ™ hazД±rlanacaq.",
    fields: [
      { name: "customer", label: "MГјЕџtЙ™ri", required: true },
      { name: "fin", label: "FД°N" },
      { name: "product", label: "MЙ™hsul", required: true },
      { name: "amount", label: "MЙ™blЙ™Дџ", type: "number", required: true },
    ],
  },
};

export default App;

