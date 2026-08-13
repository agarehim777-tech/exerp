import { useEffect, useMemo, useRef, useState, useCallback, Suspense, lazy } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { moduleFromPath, pathForModule, canonicalPath } from "./config/routes.js";
import { resolveModalKind } from "./config/modal-registry.js";
import { useAuth } from "./auth/AuthProvider.jsx";
import { supabase } from "./integrations/supabase/client";
import { useCustomers } from "./shared/hooks/useCustomers.js";
import { useProducts } from "./shared/hooks/useProducts.js";
import { useOrders } from "./shared/hooks/useOrders.js";
import { useStock } from "./shared/hooks/useStock.js";
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
  LogOut,
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
import { PageHeader, Sidebar, Topbar } from "./components/AppShell.jsx";
import { CompanyModulePicker, LoginScreen, PasswordChangeScreen } from "./components/AuthScreens.jsx";
const ExpenseOperationModal = lazy(() => import("./components/modals/OperationModals.jsx").then((module) => ({ default: module.ExpenseOperationModal })));
const OperationDeleteModal = lazy(() => import("./components/modals/OperationModals.jsx").then((module) => ({ default: module.OperationDeleteModal })));
const ProductFormModal = lazy(() => import("./modules/warehouse/components/WarehouseProductModals.jsx").then((module) => ({ default: module.ProductFormModal })));
const WarehouseFormModal = lazy(() => import("./modules/warehouse/components/WarehouseProductModals.jsx").then((module) => ({ default: module.WarehouseFormModal })));
const HrDepartmentModal = lazy(() => import("./modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrDepartmentModal })));
const HrEmployeeDeleteModal = lazy(() => import("./modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrEmployeeDeleteModal })));
const HrEmployeeModal = lazy(() => import("./modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrEmployeeModal })));
const HrLeaveRequestModal = lazy(() => import("./modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrLeaveRequestModal })));
const HrVacancyModal = lazy(() => import("./modules/hr/components/HrModals.jsx").then((module) => ({ default: module.HrVacancyModal })));
const FinanceAccountModal = lazy(() => import("./modules/finance/components/FinanceAccountModal.jsx").then((module) => ({ default: module.FinanceAccountModal })));
const StockIntakeModal = lazy(() => import("./modules/warehouse/components/StockIntakeModal.jsx").then((module) => ({ default: module.StockIntakeModal })));
const FactoryPurchaseOrderModal = lazy(() => import("./modules/procurement/components/ProcurementModals.jsx").then((module) => ({ default: module.FactoryPurchaseOrderModal })));
const VendorFormModal = lazy(() => import("./modules/procurement/components/ProcurementModals.jsx").then((module) => ({ default: module.VendorFormModal })));
const SalesOperationModal = lazy(() => import("./modules/sales/components/SalesOrderModals.jsx").then((module) => ({ default: module.SalesOperationModal })));
const SalesOrderModal = lazy(() => import("./modules/sales/components/SalesOrderModals.jsx").then((module) => ({ default: module.SalesOrderModal })));
const HelpCenterPage = lazy(() => import("./modules/help/HelpCenterPage.jsx").then(m => ({ default: m.HelpCenterPage })));
const OnboardingPage = lazy(() => import("./modules/onboarding/OnboardingPage.jsx").then(m => ({ default: m.OnboardingPage })));
const ReportsPage = lazy(() => import("./modules/reports/ReportsPage.jsx").then(m => ({ default: m.ReportsPage })));
const FinancialStatementsPage = lazy(() => import("./modules/reports/FinancialStatementsPage.jsx"));
const DataReconciliationPage = lazy(() => import("./modules/admin/DataReconciliationPage.jsx"));
import {
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
import { createIdempotencyKey } from "./services/coreOperations.js";
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
import { createClientId } from "./shared/utils/id.js";
import { serializeOrderNotes } from "./shared/utils/orderNotes.js";
import { buildProjectRoiSummary } from "./shared/analytics/projects.js";
const ContractsPage = lazy(() => import("./modules/contracts/ContractsPage.jsx").then(m => ({ default: m.ContractsPage })));
const RolesPermissionsPage = lazy(() => import("./modules/settings/RolesPermissionsPage.jsx"));
const AccessCheckPage = lazy(() => import("./modules/settings/AccessCheckPage.jsx"));
const AccountingPageV2 = lazy(() => import("./modules/accounting/AccountingPage.jsx"));
const CrmCustomersPageV2 = lazy(() => import("./modules/crm/CrmCustomersPage.jsx"));
const AuditLogPage = lazy(() => import("./modules/settings/AuditLogPage.jsx"));
const CrmDealsPage = lazy(() => import("./modules/crm/CrmDealsPage.jsx"));

const CrmActivitiesPage = lazy(() => import("./modules/crm/CrmActivitiesPage.jsx"));
const CrmTasksPage = lazy(() => import("./modules/crm/CrmTasksPage.jsx"));
const SalesDashboardPage = lazy(() => import("./modules/sales/SalesDashboardPage.jsx"));
const SalesOrdersPage = lazy(() => import("./modules/sales/SalesOrdersPage.jsx"));
const AssistantPage = lazy(() => import("./modules/assistant/AssistantPage.jsx"));
import FloatingAssistant from "./modules/assistant/FloatingAssistant.jsx";
const ProcurementPage = lazy(() => import("./modules/procurement/ProcurementPage.jsx"));
import { OrderProductLines, baseDeliveryDate, baseFinanceDate, buildHrEmployeeRecords, buildInvoiceControlSummary, buildKpiEmployeeScoreRows, buildReceivableAgingSummary, calculatePayrollTax2026, currentBusinessDate, currentBusinessYear, enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryPlan, getDeliveryRisk, getDeliveryStockCheck, getDeliveryTotalQuantity, getEmployeeKey, getEmployeeLevel, getEmployeeManager, getEmployeeManagerName, getHrDocumentHealth, getHrDocumentRows, getInvoiceAgingBucket, getKpiPeriodKey, getOrderBalance, getOrderDeliveryStatus, getOrderPaymentMethod, getSupportThreadId, isDeliveryQueueOrder, normalizeOrderProductLines, summarizeOrderProducts } from "./shared/lib/appDomain.jsx";
const DeliveriesPage = lazy(() => import("./pages/DeliveriesPage.jsx"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage.jsx"));
const ReceivablesPage = lazy(() => import("./pages/ReceivablesPage.jsx"));
const KpiPage = lazy(() => import("./pages/KpiPage.jsx"));
const SupportPage = lazy(() => import("./pages/SupportPage.jsx"));
const AccountingPage = lazy(() => import("./pages/AccountingPage.jsx"));
import { baseCreditDate, buildProductLookup, getBackorderPlan, buildPurchaseOrderCoverage, buildSalesBonusRows, currentBusinessQuarter, dayInMs, getCreditOrder, getCustomerContracts, getCustomerOrders, getCustomerRelatedCredits, getDepartmentParentName, getOrderSellerBonuses, getReorderPoint, hrLevelOptions, isPurchaseOrderOpen } from "./shared/lib/appDomain.jsx";
const CrmPage = lazy(() => import("./pages/CrmPage.jsx"));
const SalesPage = lazy(() => import("./pages/SalesPage.jsx"));
const VendorsPage = lazy(() => import("./pages/VendorsPage.jsx"));
const HrPage = lazy(() => import("./pages/HrPage.jsx"));
const MessagesPage = lazy(() => import("./pages/MessagesPage.jsx"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage.jsx"));
const ApiPage = lazy(() => import("./pages/ApiPage.jsx"));
const PlatformAdminPage = lazy(() => import("./pages/PlatformAdminPage.jsx"));
import { Toggle, ensureSettings, filterRows, getActiveRole, getAvailableQuantity, getDefaultModuleAccessForRole, getFreeQuantity, getModuleForPermission, getVendorKey, hasExpenseCashImpact, isLowStockItem, isSerialTrackedProduct, modulePermissionCatalog, normalizeUserModuleAccess, normalizeVendor, targetDbProvider } from "./shared/lib/appDomain.jsx";
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const WarehousePage = lazy(() => import("./pages/WarehousePage.jsx"));
const FinancePage = lazy(() => import("./pages/FinancePage.jsx"));
const StockPage = lazy(() => import("./modules/warehouse/StockPage.jsx"));
const ProductsPage = lazy(() => import("./modules/warehouse/ProductBalancesPage.jsx"));
const CashbookPage = lazy(() => import("./modules/finance/CashbookPage.jsx"));
const VendorManagementPage = lazy(() => import("./pages/VendorManagementPage.jsx"));
const SettingsPage = lazy(() => import("./pages/SettingsPage.jsx"));
const CreditsPage = lazy(() => import("./pages/CreditsPage.jsx"));

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

const baseCashBalance = 0;

import {
  deploymentToolkitReady,
  getCreditIdForOrder,
  buildSalesCreditRecord,
  buildSalesCreditRecords,
  buildAllCreditRecords,
  ensureKpiTargets,
  getKpiActualValue,
  buildKpiTargetRows,
  buildKpiPeriodSnapshot,
  buildCreditRiskRows,
  buildCreditAgingBuckets,
  getInvoiceVatRate,
  buildInvoiceRows,
  buildInvoiceSummary,
  buildCurrencyExposureRows,
  buildAccountingData,
  buildPayrollTaxCalculatorRows,
  getTaxAmountByType,
  buildTaxDueDate,
  buildDefaultTaxCalendarItems,
  buildTaxCalendarRows,
  ensureApiWebhooks,
  ensureApiSecrets,
  getApiSecretHealth,
  buildApiSecretRows,
  buildApiWebhookRows,
  buildTodayActionRows,
  buildExecutiveInsights,
  flattenWarehouseStock,
  buildReportModuleRows,
  buildReportRiskRows,
  buildReportPackage,
  getInitials,
  buildSupportMessageFromComment,
  buildSupportConversation,
  normalizeMessageThread,
  buildMessageParticipantOptions,
  buildMessageContextOptions,
  getMessageContextPayload,
  upsertSupportConversation,
  getReceivableAgingBucket,
  getReceivableRiskCategory,
  getReceivableCollectionStatus,
  getReceivableNextAction,
  enrichReceivableRow,
  buildReceivableRows,
  buildProjectPortfolioSource,
  isDateWithinProject,
  getProjectOrderCost,
  buildProjectRoiRows,
  ensureNotificationProviders,
  ensureNotificationRules,
  getNotificationChannelEnabled,
  renderNotificationTemplate,
  getNotificationEventKey,
  getNotificationLogTime,
  splitNotificationEventsByCooldown,
  getCreditPaymentLeadDays,
  buildNotificationProviderRows,
  buildNotificationEvent,
  buildNotificationRuleEvents,
  buildNotificationAutomationRows,
  createNotificationSendLogEntry,
  buildNotificationDeliveriesForRules,
  buildProductionPlanRows,
  buildOnboardingRows,
  buildHelpModuleGuides,
  buildHelpArticles,
  buildSellerBonusRows,
  summarizeSellerBonusRows,
  calculateOrderLineTotal,
  productLineSignature,
  buildSalesCreditForOrder,
  getDeliveryActionLabel,
  matchesDeliveryFilter,
  buildDriverDeliveryStats,
  matchesFinanceFilter,
  matchesFinanceDateRange,
  matchesFinanceSearch,
  buildQuantityMap,
  buildSerialPrefix,
  ensureStockItemSerials,
  ensureWarehouseSerials,
  getAvailableSerialsForProduct,
  updateSerialStatuses,
  releaseOrderSerialReservations,
  adjustStockRows,
  normalizeOperationalLabels,
  normalizeContractNumbers,
  nextContractNumber,
  nextSalesOrderNumber,
  hydrateState,
  loadPersistentState,
  getCurrentUser,
  hasRolePermission,
  hasUserModuleAccess,
  getDuplicateValues,
  buildStateIntegrityReport,
  buildGoLiveReadiness,
  buildProductionHardeningReport,
  buildModuleReadiness,
  addStockToRows,
  buildPayrollExpense,
  hasEffectivePermission,
  canAccessNavItem,
  getPageActionPermission,
  hasPageAction,
  dbBackedCollections,
} from "./shared/lib/appHelpers.jsx";


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
  const { activeTenantId, isPlatformAdmin, user: authUser, signOut } = useAuth();
  const { customers: dbCustomers, create: createDbCustomer, remove: deleteDbCustomer } = useCustomers(activeTenantId);
  const { products: dbProducts, create: createDbProduct, update: updateDbProduct, remove: deleteDbProduct } = useProducts(activeTenantId);
  const { orders: dbOrders, create: createDbOrder, updateHeader: updateDbOrder, remove: deleteDbOrder } = useOrders(activeTenantId);
  const dbInventory = useStock(activeTenantId);

  useEffect(() => {
    if (!activeTenantId || !dbOrders.length) return;
    const used = dbOrders.map(order => String(order.order_no || "").match(/^SF-(\d+)$/u)).filter(Boolean).map(match => Number(match[1]));
    let next = Math.max(1000, ...used) + 1;
    dbOrders.filter(order => !/^SF-\d+$/u.test(String(order.order_no || "")))
      .sort((a, b) => String(a.created_at || a.order_date).localeCompare(String(b.created_at || b.order_date)))
      .forEach(order => {
        const orderNo = `SF-${next++}`;
        updateDbOrder(order.id, { order_no: orderNo }).catch(error => console.error("Sifariş nömrəsi yenilənmədi:", error));
      });
  }, [activeTenantId, dbOrders, updateDbOrder]);

  useEffect(() => {
    if (!activeTenantId || !dbOrders.length || !(state.cashEntries || []).length) return;
    const paidByOrder = new Map();
    (state.cashEntries || []).filter(entry => Number(entry.principal ?? entry.amount ?? 0) > 0).forEach(entry => {
      let target = dbOrders.find(order => normalize(order.id) === normalize(entry.orderId) || normalize(order.order_no) === normalize(entry.orderId));
      if (!target && entry.customer) {
        const matches = dbOrders.filter(order => normalize(order.customer?.name) === normalize(entry.customer));
        if (matches.length === 1) target = matches[0];
      }
      if (target) paidByOrder.set(target.id, Number(paidByOrder.get(target.id) || 0) + Number(entry.principal ?? entry.amount));
    });
    paidByOrder.forEach((legacyPaid, orderId) => {
      const order = dbOrders.find(item => item.id === orderId);
      const currentPaid = Number(order?.paid_amount || 0);
      const nextPaid = Math.min(Number(order?.total || 0), Math.max(currentPaid, legacyPaid));
      if (nextPaid > currentPaid) updateDbOrder(orderId, { paid_amount: nextPaid, payment_status: nextPaid >= Number(order.total || 0) ? "paid" : "partial" }).catch(error => console.error("Sifariş ödənişi sinxronlaşdırılmadı:", error));
    });
  }, [activeTenantId, dbOrders, state.cashEntries, updateDbOrder]);

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
    if (
      dbCustomers.length === 0 &&
      dbProducts.length === 0 &&
      dbOrders.length === 0 &&
      dbInventory.warehouses.length === 0 &&
      dbInventory.balances.length === 0
    ) return;

    const warehouseStock = dbInventory.balances.reduce((byWarehouse, balance) => {
      const warehouseId = balance.warehouse_id || balance.warehouse?.id;
      if (!warehouseId) return byWarehouse;
      const rows = byWarehouse[warehouseId] || [];
      rows.push({
        id: balance.id || `${warehouseId}-${balance.product_id}`,
        productId: balance.product_id,
        product: balance.product?.name || balance.product?.sku || "Məhsul",
        sku: balance.product?.sku || "",
        total: Number(balance.qty ?? balance.on_hand ?? 0),
        reserved: Number(balance.reserved || 0),
        reorderLevel: Number(balance.reorder_point ?? balance.minimum_level ?? 0),
        price: Number(balance.product?.price ?? balance.avg_cost ?? 0),
      });
      byWarehouse[warehouseId] = rows;
      return byWarehouse;
    }, {});

    const aggregateStock = Object.values(warehouseStock)
      .flat()
      .reduce((byProduct, row) => {
        const key = row.productId || row.sku || row.product;
        const current = byProduct.get(key) || { ...row, total: 0, reserved: 0 };
        current.total += row.total;
        current.reserved += row.reserved;
        byProduct.set(key, current);
        return byProduct;
      }, new Map());

    setState((prev) => ({
      ...prev,
      ...(dbCustomers.length ? { customers: dbCustomers.map(dbCustomerToLegacy) } : {}),
      ...(dbProducts.length ? { products: dbProducts.map(dbProductToLegacy) } : {}),
      ...(dbOrders.length ? { orders: dbOrders.map(dbOrderToLegacy) } : {}),
      ...(dbInventory.warehouses.length ? {
        warehouses: dbInventory.warehouses.map((warehouse) => ({
          id: warehouse.id,
          code: warehouse.code,
          name: warehouse.name,
          address: warehouse.address || "—",
          city: warehouse.address?.split(",")[0]?.trim() || "—",
          manager: "Təyin edilməyib",
          type: "Mərkəzi",
          capacity: Math.max(
            100,
            (warehouseStock[warehouse.id] || []).reduce((sum, row) => sum + Number(row.total || 0), 0),
          ),
          status: warehouse.is_active === false ? "Passiv" : "Aktiv",
        })),
        warehouseStock,
        stock: [...aggregateStock.values()],
      } : {}),
    }));
  }, [
    activeTenantId,
    tenantStateReady,
    dbCustomers,
    dbProducts,
    dbOrders,
    dbInventory.warehouses,
    dbInventory.balances,
  ]);

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
      const dbModule = item.id === "products" ? "warehouse" : item.id;
      const dbOk = dbRole ? dbCan(dbModule, "view") : true;
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

  async function logoutUser() {
    const userName = currentUser?.name || "İstifadəçi";
    try {
      if (remoteApiEnabled) {
        await logoutRemote().catch(() => undefined);
        setRemoteToken("");
        setRemoteUser(null);
        setRemoteAuthStatus("signedOut");
      }
      await signOut();
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
      navigate("/login", { replace: true });
    } catch (error) {
      notify(error instanceof Error ? `Çıxış alınmadı: ${error.message}` : "Çıxış alınmadı. Yenidən cəhd edin.");
    }
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
      const canOverrideRole = ["Super Admin", "Platform Super Admin"].includes(currentUser?.role);
      if (module?.permission && !(role?.permissions || []).includes(module.permission) && !canOverrideRole) {
        return appendAudit(current, {
          module: "Ayarlar/Auth",
          action: "Modul icazəsi bloklandı",
          detail: `${targetUser.name}: ${module.label}`,
          status: "İcazə yoxdur",
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        });
      }

      const currentAccess = Array.isArray(targetUser.moduleAccess)
        ? [...new Set(targetUser.moduleAccess)]
        : normalizeUserModuleAccess(targetUser, current.settings.roles || defaultRoles);
      const willEnable = !currentAccess.includes(moduleId);
      const nextAccess = currentAccess.includes(moduleId)
        ? currentAccess.filter((id) => id !== moduleId)
        : [...currentAccess, moduleId];
      const safeAccess = nextAccess.length > 0 ? nextAccess : ["dashboard"];
      const permissionOverrides = module?.permission && canOverrideRole
        ? { ...(targetUser.permissionOverrides || {}), [module.permission]: willEnable }
        : targetUser.permissionOverrides;

      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: users.map((user) =>
              user.id === userId ? { ...user, moduleAccess: safeAccess, permissionOverrides } : user,
            ),
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "Modul icazəsi dəyişdi",
          detail: `${targetUser.name}: ${moduleId} ${willEnable ? "verildi" : "ləğv edildi"}`,
        },
      );
    });
  }

  function updateUserRole(userId, roleName) {
    if (!requirePermission("settings.manage", "istifadəçi rolunu dəyişmək")) return;
    setState((current) => {
      const roles = current.settings.roles || defaultRoles;
      const targetRole = roles.find((role) => role.name === roleName);
      if (!targetRole) return current;
      const targetUser = (current.settings.users || []).find((user) => user.id === userId);
      if (!targetUser) return current;
      return auditCurrentState(
        {
          ...current,
          settings: {
            ...current.settings,
            users: (current.settings.users || []).map((user) =>
              user.id === userId
                ? {
                    ...user,
                    role: roleName,
                    moduleAccess: getDefaultModuleAccessForRole(roleName, roles),
                    permissionOverrides: {},
                  }
                : user,
            ),
          },
        },
        {
          module: "Ayarlar/Auth",
          action: "İstifadəçi rolu dəyişdi",
          detail: `${targetUser.name}: ${roleName}`,
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
      }).catch((error) => notify(`Hesabat exportu sinxronlaşmadı: ${error.message}`, "warning"));
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
          body: delivery.body || delivery.subject || "Bildiriş",
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
      }).catch((error) => notify(`Bildiriş logu sinxronlaşmadı: ${error.message}`, "warning"));
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
            body: delivery.body || delivery.subject || "Bildiriş",
            status: delivery.status === "Göndərildi" ? "sent" : "failed",
            sent_at: delivery.status === "Göndərildi" ? delivery.sentAtIso : null,
            last_error: delivery.status === "Göndərildi" ? null : delivery.status,
            metadata: {
              rule_id: delivery.ruleId,
              dedupe_key: delivery.dedupeKey,
              priority: delivery.priority,
              action_target: delivery.actionTarget,
            },
          },
        }).catch((error) => notify(`Bildiriş logu sinxronlaşmadı: ${error.message}`, "warning"));
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
            const stockRow = warehouseRows.find((row) => row.product === it.product);
            const canReserve = stockRow && getFreeQuantity(stockRow) >= qty;
            return {
              line_no: idx + 1,
              product_id: prod?.id || null,
              description: it.product,
              qty,
              unit_price: unitPrice,
              discount_pct: 0,
              vat_rate: Number(it.vatRate ?? 0),
              warehouse_id: canReserve && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(warehouseId)
                ? warehouseId
                : null,
            };
          });
        const customerRow = customersByName.get(String(values.customer || "").toLowerCase());
        const orderNo = nextSalesOrderNumber(dbOrders);
        createDbOrder({
          request_key: createIdempotencyKey("sales-order"),
          order_no: orderNo,
          customer_id: customerRow?.id || null,
          order_date: values.date || new Date().toISOString().slice(0, 10),
          status: "draft",
          currency: "AZN",
          notes: serializeOrderNotes(values.note, values.internalNotes),
          items,
          credit: values.paymentMethod === "Kredit"
            ? {
                contract_no: nextContractNumber({
                  contracts: state.contracts,
                  orders: state.orders,
                  credits: creditRecords,
                }),
                principal: Number(values.orderTotal || 0),
                initial_payment: Number(values.initialPayment || 0),
                term_months: Number(values.creditMonths || 12),
                start_date: values.date || new Date().toISOString().slice(0, 10),
              }
            : null,
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
        const contractId = isCreditSale ? nextContractNumber(current) : null;
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
              note: serializeOrderNotes(values.note, values.internalNotes) || "",
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
              contractId: nextContractNumber(current),
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
              id: nextContractNumber(current),
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

    const deliveryWillComplete = initialCheck.plan?.lines?.every(
      (line) => Number(line.delivered || 0) + Number(line.deliverable || 0) >= Number(line.ordered || 0),
    );

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

    if (deliveryWillComplete && activeTenantId) {
      const dbOrder = dbOrders.find((order) =>
        String(order.id) === String(orderId) || String(order.order_no) === String(targetOrder.orderNo || orderId),
      );
      if (dbOrder?.id) {
        supabase.rpc("mark_sales_order_delivered", { _order_id: dbOrder.id }).then(({ error }) => {
          if (!error) return;
          console.error("[delivery] order status sync failed:", error);
          notify(`Təhvil tamamlandı, lakin satış statusu yenilənmədi: ${error.message || error}`, "warning");
        });
      }
    }

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
    const linkedCredit = creditRecords.find((credit) => String(credit.orderId) === String(orderId));
    const normalizedOrderId = normalize(orderId);
    const targetOrder = state.orders.find((order) =>
      normalize(order.id) === normalizedOrderId ||
      normalize(order.orderNo || order.order_no) === normalizedOrderId
    ) || (linkedCredit ? state.orders.find((order) => {
      const sameCustomer = normalize(order.customer) === normalize(linkedCredit.customer);
      const sameAmount = Math.abs(Number(order.amount || order.total || 0) - Number(linkedCredit.total || 0)) < 0.01;
      const sameDate = !linkedCredit.date || !order.date || String(order.date).slice(0, 10) === String(linkedCredit.date).slice(0, 10);
      return sameCustomer && sameAmount && sameDate;
    }) : null);

    if (!targetOrder) {
      notify("Bağlı sifariş tapılmadı.", "warning");
      return;
    }

    setSelectedOrder(targetOrder.id);
    setQuery("");
    setActive("sales");
    setMobileNav(false);
    auditOperation({
      module: "Kredit/Satış",
      action: "Bağlı sifarişə keçid edildi",
      detail: `${targetOrder.orderNo || targetOrder.id} · ${targetOrder.customer}`,
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
      const contractId = isCreditSale ? order.contractId || linkedCredit?.contractId || nextContractNumber(current) : null;
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
      status === "Təsdiq edildi" ? "approved" : "rejected",
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

  function startCredit(creditId, startDate) {
    if (!requirePermission("credits.manage", "krediti başlatmaq")) return;
    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === creditId);
    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return;
    }
    if (targetCredit.status === "Başlanmamış" || targetCredit.status === "draft" || targetCredit.startedAt === null) {
      notify("Ödəniş qəbul etmək üçün əvvəlcə krediti başladın.", "warning");
      return;
    }
    if (targetCredit.status !== "Başlanmamış" && targetCredit.status !== "draft") {
      notify("Bu kredit artıq başladılıb.", "warning");
      return;
    }

    const plan = buildCreditPlan({
      total: targetCredit.total,
      initialPayment: targetCredit.initialPayment,
      months: targetCredit.months,
      startDate,
    });
    const startedAt = new Date().toISOString();
    const startedCredit = {
      ...targetCredit,
      status: "Aktiv",
      startDate,
      startedAt,
      installments: plan.installments,
      monthly: plan.monthly,
      lastPayment: plan.lastPayment,
      next: plan.installments[0]?.due || "—",
    };

    setState((current) => {
      const exists = current.credits.some((credit) => credit.id === creditId);
      return {
        ...current,
        credits: exists
          ? current.credits.map((credit) => (credit.id === creditId ? startedCredit : credit))
          : [startedCredit, ...current.credits],
      };
    });
    notify("Kredit başladıldı və ödəniş cədvəli aktiv edildi.");
    auditOperation({
      module: "Kredit",
      action: "Kredit başladıldı",
      detail: `${creditId} · başlanma ${startDate} · ilk ödəniş ${plan.installments[0]?.due || "—"}`,
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
          { id: comment.id, from: sender, text: body, time: stamp, status: "Göndərildi", readAt: stamp },
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
        onLogout={logoutUser}
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
          {active === "roles" && (
            <RolesPermissionsPage
              appUsers={state.settings.users || []}
              appRoles={state.settings.roles || defaultRoles}
              modulePermissionCatalog={modulePermissionCatalog}
              onChangeAppUserRole={updateUserRole}
              onToggleAppUserModule={toggleUserModuleAccess}
              canOverrideUserPermissions={["Super Admin", "Platform Super Admin"].includes(currentUser?.role)}
            />
          )}
          {active === "access-check" && <AccessCheckPage />}
          {active === "audit" && <AuditLogPage />}
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
          {active === "crm" && <CrmCustomersPageV2 onOpenSalesOrder={openLinkedSalesOrder} />}
          {active === "crm-deals" && <CrmDealsPage />}
          {active === "crm-activities" && <CrmActivitiesPage />}
          {active === "crm-tasks" && <CrmTasksPage />}


          {active === "sales-dashboard" && <SalesDashboardPage />}
          {active === "sales" && <SalesOrdersPage selectedOrderId={selectedOrder} onSelectedOrderHandled={() => setSelectedOrder("")} />}
          {active === "stock" && <StockPage />}
          {active === "products" && (
            <ProductsPage
              warehouses={state.warehouses}
              warehouseStock={state.warehouseStock}
              products={state.products || []}
              purchaseOrders={state.purchaseOrders || []}
              orders={state.orders || []}
              stockMovements={dbInventory.movements || []}
              fetchAllMovements={dbInventory.fetchAllMovements}
              onReceiveStock={() => setModal({ type: "stockIntake" })}
              onOpenImport={() => setModal({ type: "warehouseImport" })}
              onCreateProduct={() => setModal({ type: "product", mode: "create" })}
              onEditProduct={(productId) => setModal({ type: "product", mode: "edit", productId })}
              onOpenWarehouse={() => choosePage("stock")}
              onTrackAction={(action, detail) => auditOperation({ module: "Anbar", action, detail })}
            />
          )}
          {active === "cashbook" && <CashbookPage legacyCashEntries={state.cashEntries || []} />}
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
            tenantId={activeTenantId}
            canManagePeriods={can("finance.manage")}
            notify={notify}
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
          {active === "credits" && (
            <CreditsPage
              credits={filtered.credits}
              sendCreditSms={sendCreditSms}
              onUpdatePaymentDate={updateCreditPaymentDate}
              onReceivePayment={receiveCreditPayment}
              onStartCredit={startCredit}
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
              onOpenSalesOrder={openLinkedSalesOrder}
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
              canOverrideUserPermissions={["Super Admin", "Platform Super Admin"].includes(currentUser?.role)}
              canRunSystemBackup={can("system.backup")}
              onOpenAccessCenter={() => choosePage("roles")}
            />
          )}
          </Suspense>
        </main>
      </div>

      <FloatingAssistant />

      {modal && (
        <Suspense fallback={<div className="modal-shell" role="status"><div className="modal-card">Forma yüklənir…</div></div>}>
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
        </Suspense>
      )}
      <ToastStack toasts={toasts} />
    </div>
  );
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
  const modalKind = resolveModalKind(type);

  if (modalKind === "warehouse") {
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

  if (modalKind === "stockIntake") {
    return (
      <StockIntakeModal
        warehouses={orderOptions.warehouses}
        products={orderOptions.products}
        onClose={onClose}
        onSubmit={onReceiveStock}
      />
    );
  }

  if (modalKind === "warehouseImport") {
    return <WarehouseImportModal warehouses={orderOptions.warehouses} onClose={onClose} onImport={onImportWarehouseStock} />;
  }

  if (modalKind === "purchaseOrder") {
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

  if (modalKind === "vendor") {
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

  if (modalKind === "vendorDelete" && vendor) {
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

  if (modalKind === "employee") {
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

  if (modalKind === "department") {
    return <HrDepartmentModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateDepartment} />;
  }

  if (modalKind === "leaveRequest") {
    return <HrLeaveRequestModal employees={orderOptions.employees} onClose={onClose} onSubmit={onCreateLeaveRequest} />;
  }

  if (modalKind === "vacancy") {
    return <HrVacancyModal employees={orderOptions.employees} departments={orderOptions.departments} onClose={onClose} onSubmit={onCreateVacancy} />;
  }

  if (modalKind === "employeeDelete" && employee) {
    return <HrEmployeeDeleteModal employee={employee} employees={orderOptions.employees} onClose={onClose} onConfirm={(replacementManagerId) => onDeleteEmployee(getEmployeeKey(employee), replacementManagerId)} />;
  }

  if (modalKind === "product") {
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

  if (modalKind === "financeAccount") {
    return (
      <FinanceAccountModal
        account={financeAccount}
        onClose={onClose}
        onSubmit={(values) => onSaveFinanceAccount(financeAccount?.id, values)}
      />
    );
  }

  if (modalKind === "contractPrint" && contract) {
    return <ContractPrintModal contract={contract} settings={companySettings} onClose={onClose} />;
  }

  if (modalKind === "salesOperation" && salesOrder) {
    return (
      <SalesOperationModal
        order={salesOrder}
        orderOptions={orderOptions}
        onClose={onClose}
        onSubmit={(values) => onUpdateSalesOrder(salesOrder.id, values)}
      />
    );
  }

  if (modalKind === "salesOperationDelete" && salesOrder) {
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

  if (modalKind === "expenseOperation" && expense) {
    return (
      <ExpenseOperationModal
        expense={expense}
        onClose={onClose}
        onSubmit={(values) => onUpdateExpense(expense.id, values)}
      />
    );
  }

  if (modalKind === "expenseOperationDelete" && expense) {
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

  if (modalKind === "salesOrder") {
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
      { name: "contractId", label: "Müqavilə №", value: nextContractNumber(initialState) },
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
