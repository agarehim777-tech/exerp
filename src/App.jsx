Warning: truncated output (original token count: 69452)
Total output lines: 7130

import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { moduleFromPath, pathForModule, canonicalPath } from "./config/routes.js";
import { resolveModalKind } from "./config/modal-registry.js";
import { useAuth } from "./auth/AuthProvider.jsx";
import { supabase } from "./integrations/supabase/client";
import { useCustomers } from "./shared/hooks/useCustomers.js";
import { useProducts } from "./shared/hooks/useProducts.js";
import { useOrders } from "./shared/hooks/useOrders.js";
import { useStock } from "./shared/hooks/useStock.js";
import { useTenantUiPersistence } from "./shared/hooks/useTenantUiPersistence.js";
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
import { AccessCheckPage, AccountingPage, AccountingPageV2, ApiPage, AssistantPage, AuditLogPage, BonusesPage, CashbookPage, ContractsPage, CreditsPage, CrmActivitiesPage, CrmCustomersPageV2, CrmDealsPage, CrmPage, CrmTasksPage, CustomerMessengerPanel, DashboardPage, DataReconciliationPage, DeliveriesPage, FinancePage, FinancialStatementsPage, FloatingAssistant, HelpCenterPage, HrPage, InsightsPage, InvoicesPage, KpiPage, MessagesPage, NotificationsPage, OnboardingPage, PlatformAdminPage, ProcurementPage, ProductsPage, ReceivablesPage, ReportsPage, RolesPermissionsPage, SalesDashboardPage, SalesInvoicesPage, SalesOrdersPage, SalesPage, SettingsPage, StockPage, SupportPage, VendorManagementPage, VendorsPage, WarehousePage } from "./config/lazyPages.js";
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
import { createIdempotencyKey, postCreditPayment } from "./services/coreOperations.js";
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
import { describeStockError, isStockShortageError } from "./shared/lib/stockErrors.js";
import { buildProjectRoiSummary } from "./shared/analytics/projects.js";
import { withoutOperationalData } from "./shared/state/tenantPersistence.js";

import { OrderProductLines, baseDeliveryDate, baseFinanceDate, buildHrEmployeeRecords, buildInvoiceControlSummary, buildKpiEmployeeScoreRows, buildReceivableAgingSummary, calculatePayrollTax2026, currentBusinessDate, currentBusinessYear, enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryPlan, getDeliveryRisk, getDeliveryStockCheck, getDeliveryTotalQuantity, getEmployeeKey, getEmployeeLevel, getEmployeeManager, getEmployeeManagerName, getHrDocumentHealth, getHrDocumentRows, getInvoiceAgingBucket, getKpiPeriodKey, getOrderBalance, getOrderDeliveryStatus, getOrderPaymentMethod, getSupportThreadId, isDeliveryQueueOrder, normalizeOrderProductLines, summarizeOrderProducts } from "./shared/lib/appDomain.jsx";
import { baseCreditDate, buildProductLookup, getBackorderPlan, buildPurchaseOrderCoverage, buildSalesBonusRows, currentBusinessQuarter, dayInMs, getCreditOrder, getCustomerContracts, getCustomerOrders, getCustomerRelatedCredits, getDepartmentParentName, getOrderSellerBonuses, getReorderPoint, hrLevelOptions, isPurchaseOrderOpen } from "./shared/lib/appDomain.jsx";
import { Toggle, ensureSettings, filterRows, getActiveRole, getAvailableQuantity, getDefaultModuleAccessForRole, getFreeQuantity, getModuleForPermission, getVendorKey, hasExpenseCashImpact, isLowStockItem, isSerialTrackedProduct, modulePermissionCatalog, normalizeUserModuleAccess, normalizeVendor, targetDbProvider } from "./shared/lib/appDomain.jsx";

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
  isCreditStarted,
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
} from "./shared/lib/appHelpers.jsx";

function App() {

  const [state, setState] = useState(() => hydrateState(withoutOperationalData(initialState)));
  const [authError, setAuthError] = useState("");
  const { activeTenantId, isPlatformAdmin, user: authUser, signOut } = useAuth();
  const { customers: dbCustomers, create: createDbCustomer, remove: deleteDbCustomer } = useCustomers(activeTenantId);
  const { products: dbProducts, create: createDbProduct, update: updateDbProduct, remove: deleteDbProduct, uploadImage: uploadDbProductImage, removeImage: removeDbProductImage } = useProducts(activeTenantId);
  const { orders: dbOrders, loaded: dbOrdersLoaded, refresh: refreshDbOrders, create: createDbOrder, updateHeader: updateDbOrder, remove: deleteDbOrder } = useOrders(activeTenantId);
  const dbInventory = useStock(activeTenantId);
  const legacyBonusMigrationRef = useRef("");
  const { ready: tenantStateReady } = useTenantUiPersistence({
    tenantId: activeTenantId, userId: authUser?.id, state, setState, hydrateState,
    localKey: localDbKey, schemaVersion: localDbSchemaVersion,
    onWarning: useCallback((error) => console.warn('[tenant-ui-state]', error), []),
    onError: useCallback(() => setAuthError('UI sazlamaları serverdə saxlanmadı.'), []),
  });

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
      if (target && target.status !== 'cancelled') {
        paidByOrder.set(target.id, Number(paidByOrder.get(target.id) || 0) + Number(entry.principal ?? entry.amount));
      }
    });
    paidByOrder.forEach((legacyPaid, orderId) => {
      const order = dbOrders.find(item => item.id === orderId);
      const currentPaid = Number(order?.paid_amount || 0);
      const nextPaid = Math.min(Number(order?.total || 0), Math.max(currentPaid, legacyPaid));
      if (nextPaid > currentPaid) updateDbOrder(orderId, { paid_amount: nextPaid, payment_status: nextPaid >= Number(order.total || 0) ? "paid" : "partial" }).catch(error => console.error("Sifariş ödənişi sinxronlaşdırılmadı:", error));
    });
  }, [activeTenantId, dbOrders, state.cashEntries, updateDbOrder]);

  // Older sales stored seller percentages only inside the tenant snapshot.
  // Recover those assignments before the DB read-bridge replaces legacy rows.
  useEffect(() => {
    if (!activeTenantId || !tenantStateReady || !dbOrders.length) return;
    const migrationKey = `${activeTenantId}:${dbOrders.map((row) => `${row.id}:${row.bonus_assignments?.length || 0}`).join("|")}`;
    if (legacyBonusMigrationRef.current === migrationKey) return;
    legacyBonusMigrationRef.current = migrationKey;

    const legacyOrders = (state.orders || []).filter((order) =>
      getOrderSellerBonuses(order).some((row) => row?.seller && Number(row.bonus || 0) > 0),
    );
    const pending = dbOrders
      .filter((order) => !(order.bonus_assignments || []).length)
      .map((dbOrder) => {
        const exact = legacyOrders.find((order) =>
          normalize(order.id) === normalize(dbOrder.id)
          || normalize(order.id) === normalize(dbOrder.order_no)
          || normalize(order.orderNo) === normalize(dbOrder.order_no),
        );
        const candidates = exact ? [exact] : legacyOrders.filter((order) =>
          normalize(order.customer) === normalize(dbOrder.customer?.name)
          && String(order.date || "").slice(0, 10) === String(dbOrder.order_date || "").slice(0, 10)
          && Math.abs(Number(order.amount || 0) - Number(dbOrder.total || 0)) < 0.01,
        );
        if (candidates.length !== 1) return null;
        const allocations = getOrderSellerBonuses(candidates[0])
          .map((row) => ({ seller_name: String(row.seller || "").trim(), rate: Number(row.bonus || 0) }))
          .filter((row) => row.seller_name && row.rate > 0);
        return allocations.length ? { dbOrder, allocations } : null;
      })
      .filter(Boolean);
    if (!pending.length) return;

    let active = true;
    (async () => {
      for (const { dbOrder, allocations } of pending) {
        const { error } = await supabase.rpc("set_order_bonus_assignments", {
          _order_id: dbOrder.id,
          _effective_from: dbOrder.order_date || new Date().toISOString().slice(0, 10),
          _allocations: allocations,
          _reason: "Əvvəlki satış məlumatından avtomatik bərpa",
        });
        if (error) throw error;
      }
      if (active) await refreshDbOrders();
    })().catch((error) => {
      if (!active) return;
      legacyBonusMigrationRef.current = "";
      console.error("[sales-bonus] Köhnə satıcı bölgüsü bərpa edilmədi:", error);
    });
    return () => { active = false; };
  }, [activeTenantId, tenantStateReady, dbOrders, refreshDbOrders, state.orders]);

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
        problemQty: Number(balance.problem_qty || 0),
        reorderLevel: Number(balance.reorder_point ?? balance.minimum_level ?? 0),
        costPrice: Number(balance.avg_cost || 0),
        price: Number(balance.product?.price ?? balance.avg_cost ?? 0),
      });
      byWarehouse[warehouseId] = rows;
      return byWarehouse;
    }, {});

    const aggregateStock = Object.values(warehouseStock)
      .flat()
      .reduce((byProduct, row) => {
        const key = row.productId || row.sku || row.product;
        const current = byProduct.get(key) || { ...row, total: 0, reserved: 0, problemQty: 0 };
        current.total += row.total;
        current.reserved += row.reserved;
        current.problemQty += row.problemQty;
        byProduct.set(key, current);
        return byProduct;
      }, new Map());

    setState((prev) => ({
      ...prev,
      ...(dbCustomers.length ? { customers: dbCustomers.map(dbCustomerToLegacy) } : {}),
      ...(dbProducts.length ? { products: dbProducts.map(dbProductToLegacy) } : {}),
      ...(dbOrdersLoaded ? { orders: dbOrders.map(dbOrderToLegacy) } : {}),
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
    dbOrdersLoaded,
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
  const [remoteUser, setRemoteUser] = useState(null);
  const remoteSaveTimer = useRef(null);
  const syncedAuditIds = useRef(new Set());
  const notificationAutoRunRef = useRef("");
  const creditSourceOrders = useMemo(
    () => (dbOrdersLoaded ? dbOrders.map(dbOrderToLegacy) : state.orders),
    [dbOrders, dbOrdersLoaded, state.orders],
  );
  const creditRecords = useMemo(
    () => buildAllCreditRecords(creditSourceOrders, state.credits),
    [creditSourceOrders, state.credits],
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
  const salesUsers = useMemo(() => {
    const byName = new Map();
    (state.employees || [])
      .filter((employee) => normalize(employee.department) === normalize("Satış"))
      .forEach((employee) => byName.set(normalize(employee.name), employee));
    (state.settings?.users || [])
      .filter((user) => {
        const role = normalize(user.role);
        return user.status !== "Bloklanıb" && (role.includes("satış") || role.includes("satıcı") || role.includes("sales"));
      })
      .forEach((user) => {
        const key = normalize(user.name);
        if (!key || byName.has(key)) return;
        byName.set(key, {
          id: user.id,
          name: user.name,
          email: user.email,
          department: "Satış",
          position: user.role,
          source: "Sistem istifadəçisi",
        });
      });
    return [...byName.values()];
  }, [state.employees, state.settings?.users]);
  const { can: dbCan, role: dbRole } = usePermissions();
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => {
      // "Şirkətlər" (platform) is only for super-admins
      if (item.id === "platform") return isPlatformAdmin;
      if (item.id === "roles") return dbRole === "owner" || dbRole === "admin";
      const legacyOk = canAccessNavItem(state.settings, item.id);
      const dbModule = item.id === "products" ? "warehouse" : item.id;
      const dbOk = dbRole ? dbCan(dbModule, "view") : true;
      // Supabase owner/admin is authoritative. Legacy local settings must not
      // hide modules from a database administrator.
      if (isPlatformAdmin || dbRole === "owner" || dbRole === "admin") return dbOk;
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
    if (!remoteApiEnabled || !getRemoteToken()) {
      return undefined;
    }
    window.clearTimeout(remoteSaveTimer.current);
    remoteSaveTimer.current = window.setTimeout(() => {
      saveRemoteState(state).catch((error) => {
        setAuthError(error instanceof Error ? error.message : "Serverə yazılış alınmadı.");
      });
    }, 500);
    return () => {
      window.clearTimeout(remoteSaveTimer.current);
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
    const isVisible = visibleNavItems.some((item) => item.id === id);
    if (!isVisible) {
      notify("Bu modul aktiv istifadəçi üçün gizlədilib.", "warning");
      return false;
    }
    setActive(id);
    setMobileNav(false);
    return true;
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

  function updateUserProfile(userId, values) {
    if (!requirePermission("settings.manage", "istifadəçini redaktə etmək")) return;
    const name = String(values.name || "").trim();
    const email = String(values.email || "").trim().toLowerCase();
    if (!name || !email) {
      notify("İstifadəçi adı və e-poçt daxil edilməlidir.", "warning");
      return;
    }
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        users: (current.settings.users || []).map((user) => {
          if (user.id !== userId) return user;
          const nextRole = values.role || user.role;
          return {
            ...user,
            name,
            email,
            role: nextRole,
            status: values.status || user.status,
            moduleAccess: nextRole === user.role
              ? user.moduleAccess
              : getDefaultModuleAccessForRole(nextRole, current.settings.roles || defaultRoles),
          };
        }),
      },
      auditLog: [
        {
          id: `AUD-${Date.now()}`,
          date: new Date().toISOString(),
          module: "Ayarlar/Auth",
          action: "İstifadəçi redaktə edildi",
          detail: `${name} · ${values.role || ""}`,
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        },
        ...(current.auditLog || []),
      ],
    }));
    notify(`${name} istifadəçisi yeniləndi.`);
  }

  function applyDefaultUserPermissions() {
    if (!requirePermission("settings.manage", "başlanğıc istifadəçi icazələrini qurmaq")) return;
    setState((current) => {
      const roles = current.settings.roles || defaultRoles;
      const users = (current.settings.users || []).map((user) => ({
        ...user,
        moduleAccess: getDefaultModuleAccessForRole(user.role, roles),
        permissionOverrides: {},
      }));
      return {
        ...current,
        settings: { ...current.settings, roles, users },
        auditLog: [
          {
            id: `AUD-${Date.now()}`,
            date: new Date().toISOString(),
            module: "Ayarlar/Auth",
            action: "Başlanğıc rol icazələri quruldu",
            detail: `${users.length} istifadəçiyə rol üzrə standart modul icazələri tətbiq edildi`,
            role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
          },
          ...(current.auditLog || []),
        ],
      };
    });
    notify("Satıcı, maliyyəçi, anbardar və digər rolların başlanğıc icazələri tətbiq edildi.");
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
    const linked = res…19452 tokens truncated… sameCustomer && sameAmount && sameDate;
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

  async function deleteSalesOrder(orderId) {
    if (!requirePermission("sales.create", "satış əməliyyatını silmək")) return;
    const targetOrder = state.orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      notify("Satış əməliyyatı tapılmadı.", "warning");
      return;
    }

    // DB delete for UUID ids (order_items cascade)
    const isUuid = typeof orderId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (isUuid && deleteDbOrder) {
      try {
        await deleteDbOrder(orderId);
      } catch (e) {
        notify(`Silmə DB xətası: ${e?.message || e}`, "warning");
        return;
      }
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

  async function receiveCreditPayment(creditId, values) {
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

    if (!isCreditStarted(targetCredit)) {
      notify("Ödəniş qəbul etmək üçün əvvəlcə krediti başladın.", "warning");
      return;
    }


    const paymentResult = applyCreditPrincipalPayment(targetCredit, principalAmount);
    const cashAmount = paymentResult.appliedPrincipal + penaltyAmount;
    try {
      if (activeTenantId && targetCredit.salesSource && targetCredit.id) {
        const mainCode = `MAIN-${String(activeTenantId).slice(0, 8).toUpperCase()}`;
        let { data: cashAccount, error: accountError } = await supabase
          .from("cash_accounts")
          .select("id")
          .eq("tenant_id", activeTenantId)
          .eq("account_no", mainCode)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (accountError) throw accountError;
        if (!cashAccount) {
          const byName = await supabase
            .from("cash_accounts")
            .select("id")
            .eq("tenant_id", activeTenantId)
            .ilike("name", "Əsas kassa")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (byName.error) throw byName.error;
          cashAccount = byName.data;
        }
        if (!cashAccount) throw new Error("Əsas kassa tapılmadı.");

        await postCreditPayment({
          tenantId: activeTenantId,
          creditId: targetCredit.id,
          receiptNo: `KRD-${Date.now()}`,
          amount: cashAmount,
          penaltyAmount,
          cashAccountId: cashAccount.id,
          paymentMethod: "cash",
          note: values.note || null,
        });
        await refreshDbOrders();
      }
    } catch (error) {
      notify(`Kredit ödənişi qeydə alınmadı: ${error.message}`, "error");
      return;
    }

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

  async function payCreditInitial(creditId, amount) {
    if (!requirePermission("credits.manage", "ilkin ödəniş qəbul etmək")) return;
    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === creditId);
    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return;
    }
    const requiredInitial = Number(targetCredit.requiredInitial ?? targetCredit.initialPayment ?? 0);
    const alreadyPaid = Number(targetCredit.initialPaid ?? 0);
    const payment = Math.min(Math.max(0, Math.round(Number(amount || 0))), Math.max(0, requiredInitial - alreadyPaid));
    if (payment <= 0) {
      notify("Qəbul ediləcək məbləğ düzgün deyil.", "warning");
      return;
    }

    try {
      if (activeTenantId && targetCredit.salesSource && targetCredit.id) {
        const mainCode = `MAIN-${String(activeTenantId).slice(0, 8).toUpperCase()}`;
        let { data: cashAccount, error: accountError } = await supabase
          .from("cash_accounts")
          .select("id")
          .eq("tenant_id", activeTenantId)
          .eq("account_no", mainCode)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (accountError) throw accountError;
        if (!cashAccount) {
          const byName = await supabase
            .from("cash_accounts")
            .select("id")
            .eq("tenant_id", activeTenantId)
            .ilike("name", "Əsas kassa")
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (byName.error) throw byName.error;
          cashAccount = byName.data;
        }
        const { error: rpcError } = await supabase.rpc("post_credit_initial_payment", {
          _tenant_id: activeTenantId,
          _credit_id: targetCredit.id,
          _amount: payment,
          _cash_account_id: cashAccount?.id || null,
          _note: "İlkin ödəniş (beh) qəbulu",
        });
        if (rpcError) throw rpcError;
        await refreshDbOrders();
      }
    } catch (error) {
      notify(`İlkin ödəniş qeydə alınmadı: ${error.message}`, "error");
      return;
    }

    const nextPaid = alreadyPaid + payment;
    setState((current) => ({
      ...current,
      cashEntries: [
        {
          id: `KS-${Date.now()}`,
          source: "Kredit ilkin ödənişi",
          creditId,
          orderId: targetCredit.orderId,
          customer: targetCredit.customer,
          contractId: targetCredit.contractId,
          amount: payment,
          principal: payment,
          penalty: 0,
          date: baseCreditDate,
          note: "İlkin ödəniş (beh)",
        },
        ...(current.cashEntries || []),
      ],
      orders: current.orders.map((order) => {
        const isLinkedOrder = targetCredit.orderId
          ? order.id === targetCredit.orderId
          : order.creditId === creditId || getCreditIdForOrder(order) === creditId;
        if (!isLinkedOrder) return order;
        return {
          ...order,
          paid: Math.min(Number(order.amount || 0), Number(order.paid || 0) + payment),
          initialPaid: nextPaid,
        };
      }),
      credits: (() => {
        const exists = current.credits.some((credit) => credit.id === creditId);
        const nextCredits = exists ? current.credits : [targetCredit, ...current.credits];
        return nextCredits.map((item) =>
          item.id === creditId ? { ...item, requiredInitial, initialPaid: nextPaid } : item,
        );
      })(),
    }));

    notify(`${money(payment)} ilkin ödəniş qəbul edildi. Yığılıb: ${money(nextPaid)} / ${money(requiredInitial)}.`);
    auditOperation({
      module: "Kredit/Maliyyə",
      action: "İlkin ödəniş qəbul edildi",
      detail: `${creditId}: ${money(payment)} · toplam ${money(nextPaid)}/${money(requiredInitial)}`,
    });
  }


  function startCredit(creditId, startDate) {
    if (!requirePermission("credits.manage", "krediti başlatmaq")) return;
    const targetCredit = buildAllCreditRecords(state.orders, state.credits).find((credit) => credit.id === creditId);
    if (!targetCredit) {
      notify("Kredit tapılmadı.", "warning");
      return;
    }
    if (isCreditStarted(targetCredit)) {
      notify("Bu kredit artıq başladılıb.", "warning");
      return;
    }
    const requiredInitial = Number(targetCredit.requiredInitial ?? targetCredit.initialPayment ?? 0);
    const initialPaid = Number(targetCredit.initialPaid ?? 0);
    if (requiredInitial > 0 && initialPaid + 0.01 < requiredInitial) {
      notify(
        `İlkin ödəniş tamamlanmayıb: ${money(initialPaid)} / ${money(requiredInitial)}. Kredit başladıla bilməz.`,
        "warning",
      );
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
          {active === "insights" && <InsightsPage />}
          {active === "roles" && (
            <RolesPermissionsPage
              appUsers={state.settings.users || []}
              appRoles={state.settings.roles || defaultRoles}
              modulePermissionCatalog={modulePermissionCatalog}
              onCreateAppUser={createUser}
              onUpdateAppUser={updateUserProfile}
              onUpdateAppUserStatus={updateUserStatus}
              onApplyDefaultPermissions={applyDefaultUserPermissions}
              onChangeAppUserRole={updateUserRole}
              onToggleAppUserModule={toggleUserModuleAccess}
              canOverrideUserPermissions={["Super Admin", "Platform Super Admin"].includes(currentUser?.role)}
              requiresPassword={remoteApiEnabled}
              canManageUsers={can("settings.manage")}
            />
          )}
          {active === "access-check" && <AccessCheckPage />}
          {active === "audit" && <AuditLogPage />}
          {active === "financial-statements" && <FinancialStatementsPage />}
          {active === "data-reconciliation" && <DataReconciliationPage />}

          
          



          {active === "dashboard" && (
            <DashboardPage
              orders={dbOrders.map(dbOrderToLegacy)}
              customers={dbCustomers.map(dbCustomerToLegacy)}
              onOpenPendingExpenses={() => {
                if (choosePage("cashbook")) {
                  navigate(`${pathForModule("cashbook")}?tab=expenses&status=pending`);
                }
              }}
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
              inventoryBalances={dbInventory.balances || []}
              products={state.products || []}
              purchaseOrders={state.purchaseOrders || []}
              orders={state.orders || []}
              stockMovements={dbInventory.movements || []}
              fetchAllMovements={dbInventory.fetchAllMovements}
              onReceiveStock={() => setModal({ type: "stockIntake" })}
              onOpenImport={() => setModal({ type: "warehouseImport" })}
              onCreateProduct={() => setModal({ type: "product", mode: "create" })}
              onEditProduct={(productId) => setModal({ type: "product", mode: "edit", productId })}
              onOpenWarehouse={(warehouseId) => {
                setSelectedWarehouseId(warehouseId || "all");
                choosePage("warehouse");
              }}
              onOpenSalesOrder={openLinkedSalesOrder}
              onOpenProcurementDocument={(document) => {
                setModal(null);
                setQuery(document?.receipt_no || document?.shipment_no || "");
                choosePage("procurement");
              }}
              onTrackAction={(action, detail) => auditOperation({ module: "Anbar", action, detail })}
            />
          )}
          {active === "cashbook" && <CashbookPage legacyCashEntries={state.cashEntries || []} />}
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
              onPayCreditInitial={payCreditInitial}
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
          {active === "bonuses" && <BonusesPage salesBonuses={salesBonusRows} />}
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
            <div className="stack" style={{ marginBottom: 16 }}><CustomerMessengerPanel /></div>
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

      <Suspense fallback={null}>
        <FloatingAssistant />
      </Suspense>

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
            sellers: salesUsers,
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


import {
  parseDelimitedCsv,
  parseWarehouseImportNumber,
  parseWarehouseImportBoolean,
  getWarehouseImportCell,
  parseWarehouseImportCsv,
  downloadWarehouseImportTemplate,
  ContractPrintModal,
  CreditListRow,
  MessagesPageV2,
  TaskItem,
  WarehouseImportModal,
  CreateModal,
  GenericCreateModal,
  ToastStack,
  createConfig,
} from "./components/AppWidgets.jsx";


export default App;

