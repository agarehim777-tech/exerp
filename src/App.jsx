import { createVendorRegistryActions } from "./shared/state/vendorRegistryActions.js";
import { createWarehouseActions } from "./shared/state/warehouseActions.js";
import { createProductCatalogActions } from "./shared/state/productCatalogActions.js";
import { createRecordCreationActions } from "./shared/state/recordCreationActions.js";
import { createFinanceAccountActions } from "./shared/state/financeAccountActions.js";
import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { pathForModule } from "./config/routes.js";
import { useModuleNavigation } from "./shared/hooks/useModuleNavigation";
import { useToasts } from "./shared/hooks/useToasts";
import { useAuth } from "./auth/AuthProvider.jsx";
import { ProductionLedgerPage } from './config/lazyPages.js';
import { supabase } from "./integrations/supabase/client";
import { useCustomers } from "./shared/hooks/useCustomers.js";
import { useProducts } from "./shared/hooks/useProducts.js";
import { useOrders } from "./shared/hooks/useOrders.js";
import { useStock } from "./shared/hooks/useStock.js";
import { readSaleStockShortages } from "./services/inventoryRead.js";
import { useTenantUiPersistence } from "./shared/hooks/useTenantUiPersistence.js";
import { useExpensesSync } from "./shared/hooks/useExpensesSync.js";
import { useKpiLedger } from "./shared/hooks/useFinancialSettlement.js";
import { kpiPeriodView } from "./services/financialSettlement.js";
import { useCollectionSync } from "./shared/hooks/useCollectionSync.js";
import { useDbReadBridge } from "./shared/hooks/useDbReadBridge.js";
import { useLegacyOrderMigrations, useLegacyPayrollExpense } from "./shared/hooks/useLegacyMigrations.js";
import { useKpiViews } from "./shared/selectors/kpiViews.js";
import { useFinanceViews } from "./shared/selectors/financeViews.js";
import { useOperationsViews } from "./shared/selectors/operationsViews.js";
import { useIntegrationViews } from "./shared/selectors/integrationViews.js";
import { useMessagingViews } from "./shared/selectors/messagingViews.js";
import { useSystemReports } from "./shared/selectors/systemReports.js";
import { AUDIT_SYNC_RETRY_MS, pendingAuditEventRows } from "./services/auditSync.js";
import { createUserAdminActions } from "./shared/state/userAdminActions.js";
import { createHrActions } from "./shared/state/hrActions.js";
import { createSalesOrderActions } from "./shared/state/salesOrderActions.js";
import { createPurchaseOrderActions } from "./shared/state/purchaseOrderActions.js";
import { createSettingsActions } from "./shared/state/settingsActions.js";
import { createModuleActions } from "./shared/state/moduleActions.js";
import { createCreditActions } from "./shared/state/creditActions.js";
import { createMessagingActions } from "./shared/state/messagingActions.js";
import { appConfirm } from "./shared/ui/dialogService.js";
const syncedCollections = ["employees", "departments", "leaveRequests", "vacancies", "contracts", "cashEntries", "financeAccounts", "credits"];
import { useGitHubSync } from "./shared/hooks/useGitHubSync.js";
import { dbCustomerToLegacy, dbOrderToLegacy } from "./shared/adapters/erpShape.js";
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
  initialState,
  navItems,
} from "./data.js";
import { pageMeta } from "./config/page-meta.js";
import { ProjectsPage } from "./config/lazyPages.js";
import { PageHeader, Sidebar, Topbar } from "./components/AppShell.jsx";
import { CompanyModulePicker, LoginScreen, PasswordChangeScreen } from "./components/AuthScreens.jsx";
import { AccessCheckPage, AccountingPageV2, ApiPage, AssistantPage, AuditLogPage, BonusesPage, CashbookPage, ContractsPage, CreditsPage, CrmActivitiesPage, CrmCustomersPageV2, CrmDealsPage, CrmPage, CrmTasksPage, CustomerMessengerPanel, DashboardPage, DataReconciliationPage, DeliveriesPage, FinancialStatementsPage, FloatingAssistant, HelpCenterPage, HrPage, InsightsPage, InvoicesPage, KpiPage, MessagesPage, NotificationsPage, OnboardingPage, PlatformAdminPage, ProcurementPage, ProductsPage, ReceivablesPage, ReportsPage, RolesPermissionsPage, SalesDashboardPage, SalesInvoicesPage, SalesOrdersPage, SalesPage, SettingsPage, StockPage, SupportPage, VendorManagementPage, VendorsPage, WarehousePage } from "./config/lazyPages.js";
import {
  getRemoteSession,
  getRemoteToken,
  loadRemoteState,
  loginRemote,
  logoutRemote,
  remoteApiEnabled,
  saveRemoteState,
  setRemoteToken,
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
import { money, normalize } from "./services/format.js";
import { useTenantRequestScope } from './shared/hooks/useTenantRequestScope.js';
import { createIdempotencyKey } from "./services/coreOperations.js";
import {
  formatPaymentDate,
  parsePaymentDate,
  toLocalIsoDate,
} from "./services/date.js";
import {
  createPermissionByType,
  defaultRoles,
  permissionCatalog,
} from "./services/permissions.js";
import {
  appendAudit,
  localDbBaselineVersion,
  localDbKey,
  localDbSchemaVersion,
} from "./services/persistence.js";

import { serializeOrderNotes } from "./shared/utils/orderNotes.js";
import { describeStockError, isStockShortageError } from "./shared/lib/stockErrors.js";
import { resolveOrderCustomer } from "./shared/lib/orderCustomer.js";
import { withoutDbBackedData } from "./shared/state/tenantPersistence.js";
import { importWarehouseStockAtomic } from "./services/warehouseImport.js";

import { currentBusinessDate, getEmployeeKey, getKpiPeriodKey } from "./shared/lib/appDomain.jsx";
import { OrderProductLines, baseDeliveryDate, getDeliveryPlan, getDeliveryStockCheck, isDeliveryQueueOrder, summarizeOrderProducts } from "./modules/warehouse/deliveryDomain.jsx";
import { isPurchaseOrderOpen } from "./shared/lib/appDomain.jsx";
import { Toggle, filterRows, getActiveRole, getAvailableQuantity, getFreeQuantity, getModuleForPermission, getVendorKey, modulePermissionCatalog, normalizeVendor } from "./shared/lib/appDomain.jsx";

import {
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



import {
  buildAllCreditRecords,
  buildInvoiceSummary,
  buildExecutiveInsights,
  buildReportPackage,
  buildSellerBonusRows,
  buildQuantityMap,
  ensureStockItemSerials,
  updateSerialStatuses,
  adjustStockRows,
  nextContractNumber,
  nextSalesOrderNumber,
  hydrateState,
  getCurrentUser,
  addStockToRows,
  hasEffectivePermission,
  canAccessNavItem,
  getPageActionPermission,
  hasPageAction,
} from "./shared/lib/appHelpers.jsx";

import { ENABLE_LEGACY_WRITES } from "./config/legacyWrites.js";

function App() {

  const [state, setState] = useState(() => hydrateState(withoutDbBackedData(initialState)));
  const [authError, setAuthError] = useState("");
  const { activeTenantId, isPlatformAdmin, user: authUser, signOut } = useAuth();
  const { begin: beginTenantRequest } = useTenantRequestScope(activeTenantId);
  const { customers: dbCustomers, loaded: dbCustomersLoaded, refresh: refreshDbCustomers, create: createDbCustomer } = useCustomers(activeTenantId);
  const { products: dbProducts, loaded: dbProductsLoaded, refresh: refreshDbProducts, create: createDbProduct, update: updateDbProduct, remove: deleteDbProduct, uploadImage: uploadDbProductImage, removeImage: removeDbProductImage } = useProducts(activeTenantId);
  const dbSales = useOrders(activeTenantId);
  const { orders: dbOrders, loaded: dbOrdersLoaded, loading: dbOrdersLoading, error: dbOrdersError, refresh: refreshDbOrders, create: createDbOrder, updateHeader: updateDbOrder, remove: deleteDbOrder } = dbSales;
  const dbInventory = useStock(activeTenantId);
  const refreshDbInventory = dbInventory.refresh;
  const { ready: tenantStateReady } = useTenantUiPersistence({
    tenantId: activeTenantId, userId: authUser?.id, state, setState, hydrateState,
    localKey: localDbKey, schemaVersion: localDbSchemaVersion,
    onWarning: useCallback((error) => console.warn('[tenant-ui-state]', error), []),
    onError: useCallback(() => setAuthError('UI sazlamaları serverdə saxlanmadı.'), []),
  });

  const expenseSync = useExpensesSync({
    tenantId: activeTenantId,
    allowLegacyWrites: ENABLE_LEGACY_WRITES,
    ready: tenantStateReady,
    expenses: state.expenses,
    setState,
    onError: useCallback((error) => console.error('[expenses-sync]', error), []),
  });

  const collectionSync = useCollectionSync({
    tenantId: activeTenantId,
    ready: tenantStateReady,
    collections: syncedCollections,
    state,
    setState,
    onError: useCallback((error) => console.error('[collection-sync]', error), []),
  });

  useLegacyOrderMigrations({ activeTenantId, tenantStateReady, dbOrders, updateDbOrder, refreshDbOrders, state });

  useDbReadBridge({
    tenantId: activeTenantId, ready: tenantStateReady,
    customers: dbCustomers, products: dbProducts, orders: dbOrders,
    customersLoaded: dbCustomersLoaded, productsLoaded: dbProductsLoaded,
    ordersLoaded: dbOrdersLoaded, inventory: dbInventory, setState,
  });

  const { active, setActive, navigate } = useModuleNavigation();


  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [modal, setModal] = useState(null);
  useEffect(() => {
    if (['sales', 'warehouseImport'].includes(modal?.type) && activeTenantId) {
      refreshDbCustomers();
      refreshDbProducts();
      refreshDbInventory();
    }
  }, [modal?.type, activeTenantId, refreshDbCustomers, refreshDbProducts, refreshDbInventory]);
  const { toasts, notify } = useToasts();
  const [selectedKpiPeriod, setSelectedKpiPeriod] = useState(getKpiPeriodKey);
  const [kpiAccountId, setKpiAccountId] = useState("");
  const kpiLedger = useKpiLedger(active === "kpi" ? activeTenantId : null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");
  const [notificationFilter, setNotificationFilter] = useState("Cəmi");
  const [conversationId, setConversationId] = useState("c1");
  const [draftMessage, setDraftMessage] = useState("");
  const [selectedSupportTicketId, setSelectedSupportTicketId] = useState("");
  const [remoteAuthStatus, setRemoteAuthStatus] = useState(remoteApiEnabled ? "checking" : "local");
  const [remoteUser, setRemoteUser] = useState(null);
  const remoteSaveTimer = useRef(null);
  const syncedAuditIds = useRef(new Set());
  const auditRetryTimer = useRef(null);
  const auditSessionStart = useRef(new Date().toISOString());
  const [auditRetryTick, setAuditRetryTick] = useState(0);
  const [auditServerSyncedAt, setAuditServerSyncedAt] = useState("");

  const creditSourceOrders = useMemo(
    () => (!ENABLE_LEGACY_WRITES || dbOrdersLoaded ? dbOrders.map(dbOrderToLegacy) : state.orders),
    [dbOrders, dbOrdersLoaded, state.orders],
  );
  const creditRecords = useMemo(
    () => buildAllCreditRecords(creditSourceOrders, state.credits),
    [creditSourceOrders, state.credits],
  );
  const { salesBonusRows, kpiEmployeeRows, kpiTargetRows, activeKpiPeriod } = useKpiViews({ state, selectedKpiPeriod, kpiLedger });
  const legacyCurrentUser = useMemo(() => getCurrentUser(state.settings), [state.settings]);
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
  const { can: dbCan, role: dbRole, loading: dbPermissionsLoading } = usePermissions();
  const currentUser = useMemo(() => {
    if (legacyCurrentUser) return legacyCurrentUser;
    if (!authUser) return null;
    const email = authUser.email || "";
    return {
      id: authUser.id,
      name: authUser.user_metadata?.full_name || email.split("@")[0] || "İstifadəçi",
      email,
      role: dbRole || "authenticated",
      status: "Aktiv",
    };
  }, [legacyCurrentUser, authUser, dbRole]);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => {
      // "Şirkətlər" (platform) is only for super-admins
      if (item.id === "platform") return isPlatformAdmin;
      if (item.id === "roles") return dbRole === "owner" || dbRole === "admin";
      const legacyOk = canAccessNavItem(state.settings, item.id);
      const dbOk = dbRole ? dbCan(item.id, "view") : true;
      // Supabase owner/admin is authoritative. Legacy local settings must not
      // hide modules from a database administrator.
      if (isPlatformAdmin || dbRole === "owner" || dbRole === "admin") return dbOk;
      return legacyOk && dbOk;
    }),
    [state.settings, dbRole, dbCan, isPlatformAdmin],
  );

  const { receivableRows, invoiceRows, accountingData, taxCalendarRows, currencyExposureRows, todayActionRows } = useFinanceViews({ state, creditRecords });
  const { projectRoiRows, productionRows } = useOperationsViews({ state });
  const { notificationProviderRows, notificationAutomationRows, apiWebhookRows, apiSecretRows } = useIntegrationViews({ state, creditRecords, invoiceRows });
  const { messageConversations, messageParticipantOptions, messageContextOptions } = useMessagingViews({ state, creditRecords });
  const { onboardingRows, integrityReport, goLiveReport, productionHardeningReport, helpModuleGuides, helpArticles } = useSystemReports({ state, creditRecords, apiWebhookRows, apiSecretRows, notificationProviderRows, auditServerSynced: Boolean(auditServerSyncedAt) });

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
    const rows = pendingAuditEventRows(state.auditLog, syncedAuditIds.current, {
      tenantId: activeTenantId,
      actorId: authUser?.id,
      fallbackRole: activeRoleInfo?.name,
      since: auditSessionStart.current,
    });
    if (!rows.length) return;

    rows.forEach((row) => syncedAuditIds.current.add(row.id));
    supabase
      .from("audit_events")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) {
          setAuditServerSyncedAt(new Date().toISOString());
          return;
        }
        rows.forEach((row) => syncedAuditIds.current.delete(row.id));
        console.warn("[audit] immutable server log unavailable", {
          code: error.code,
          message: error.message,
        });
        // Retry on a timer as well, so a failed batch does not wait for the next audited action.
        window.clearTimeout(auditRetryTimer.current);
        auditRetryTimer.current = window.setTimeout(() => setAuditRetryTick((tick) => tick + 1), AUDIT_SYNC_RETRY_MS);
      });
  }, [state.auditLog, activeTenantId, authUser?.id, activeRoleInfo?.name, auditRetryTick]);

  useEffect(() => () => window.clearTimeout(auditRetryTimer.current), []);

  useLegacyPayrollExpense({ state, setState });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [active]);

  useEffect(() => {
    if (!currentUser) return;
    if (dbPermissionsLoading || !tenantStateReady) return;
    if (visibleNavItems.some((item) => item.id === active)) return;
    setActive(visibleNavItems[0]?.id || "dashboard");
  }, [active, currentUser, dbPermissionsLoading, tenantStateReady, visibleNavItems, setActive]);

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

  const handleGitHubPush = useCallback(
    (commit) => {
      notify(`GitHub-a son push uğurlu: ${commit.sha}`, "success");
    },
    [notify]
  );

  useGitHubSync({ enabled: true, onPush: handleGitHubPush });

  function can(permission) {
    if (!permission || isPlatformAdmin) return true;

    const legacyOk = hasEffectivePermission(state.settings, permission);
    if (!dbRole) return legacyOk;

    const dbModule = getModuleForPermission(permission);
    const dbOk = dbCan(dbModule, "edit");
    if (dbRole === "owner" || dbRole === "admin") return dbOk;
    return legacyOk && dbOk;
  }

  function requirePermission(permission, action) {
    if (permission?.startsWith("hr.") && !collectionSync.ready) {
      notify("HR məlumatları serverdən yüklənir. Bir qədər sonra yenidən cəhd edin.", "warning");
      return false;
    }
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
    if (type === "hr" && !collectionSync.ready) return requirePermission("hr.manage", "əməkdaş yaratmaq");
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

  const { createUser, updateUserStatus, updateUserProfile, applyDefaultUserPermissions, toggleUserModuleAccess, updateUserRole } = createUserAdminActions({
    state, setState, notify, requirePermission, auditCurrentState, activeRoleInfo, currentUser,
  });

  const { getActionStamp, runInvoiceAction, runAccountingAction, runTaxAction, runReceivableSyncAction, exportReport, runProjectsExportAction, runProductionAction, syncHrWorkflow, syncCommunicationWorkflow, runSupportAction, runHelpAction, runOnboardingAction, rotateApiSecret, runApiAction, runNotificationDispatchAction, runKpiPeriodAction } = createModuleActions({
    accountingData, activeKpiPeriod, activeRoleInfo, activeTenantId, apiWebhookRows, auditCurrentState, auditOperation, beginTenantRequest, choosePage, creditRecords, currentUser, helpModuleGuides, invoiceRows, kpiAccountId, kpiLedger, notify, onboardingRows, projectRoiRows, receivableRows, requirePermission,
    // selectMessageThread comes from createMessagingActions further down, which itself needs
    // getActionStamp and syncCommunicationWorkflow from here. It is only called from a click
    // handler, so a wrapper that looks it up at call time breaks the cycle.
    selectMessageThread: (...args) => selectMessageThread(...args),
    selectedKpiPeriod, setSelectedSupportTicketId, setState, state, taxCalendarRows, todayActionRows,
  });

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

  const { createRecord } = createRecordCreationActions({ ENABLE_LEGACY_WRITES, activeTenantId, adjustStockRows, appConfirm, auditCurrentState, auditOperation, beginTenantRequest, buildCreditPlan, buildQuantityMap, buildSellerBonusRows, createDbCustomer, createDbOrder, createDbProduct, createIdempotencyKey, creditRecords, currentBusinessDate, dbCustomers, dbOrders, dbProducts, describeStockError, getCreateAudit, getEmployeeKey, getFreeQuantity, hasCreatePermission, isStockShortageError, nextContractNumber, nextSalesOrderNumber, normalize, normalizeVendor, notify, readSaleStockShortages, resolveOrderCustomer, serializeOrderNotes, setModal, setSelectedWarehouseId, setState, state, toLocalIsoDate, updateSerialStatuses, uploadDbProductImage });


  const { updateVendor, deleteVendor } = createVendorRegistryActions({ auditCurrentState, getVendorKey, isPurchaseOrderOpen, normalize, normalizeVendor, notify, requirePermission, setModal, setState, state });


  

  const { updateWarehouse, recordStockIntake, importWarehouseStock, deleteWarehouse, completeWarehouseDelivery, transferWarehouseStock } = createWarehouseActions({ activeRoleInfo, activeTenantId, addStockToRows, adjustStockRows, appendAudit, auditCurrentState, auditOperation, baseDeliveryDate, beginTenantRequest, buildQuantityMap, currentUser, dbInventory, dbOrders, describeStockError, formatPaymentDate, getActiveRole, getAvailableQuantity, getDeliveryPlan, getDeliveryStockCheck, importWarehouseStockAtomic, isDeliveryQueueOrder, normalize, notify, parsePaymentDate, refreshDbOrders, refreshDbProducts, requirePermission, selectedWarehouseId, setModal, setSelectedWarehouseId, setState, state, summarizeOrderProducts, supabase, updateSerialStatuses });


  

  

  const { updateProduct, deleteProduct } = createProductCatalogActions({ activeTenantId, appConfirm, auditCurrentState, dbProducts, deleteDbProduct, ensureStockItemSerials, normalize, notify, removeDbProductImage, requirePermission, setModal, setState, state, updateDbProduct, uploadDbProductImage });


  




  const { saveFinanceAccount } = createFinanceAccountActions({ auditCurrentState, money, normalize, notify, requirePermission, setModal, setState, state });


  


  


  


  const { openLinkedSalesOrder, openLinkedCredit, openVendorDelete, updateSalesOrder, deleteSalesOrder, updateExpense, deleteExpense } = createSalesOrderActions({
    activeTenantId, auditCurrentState, auditOperation, creditRecords, dbCustomers, deleteDbOrder, navigate, notify, requirePermission, setMobileNav, setModal, setQuery, setState, state, updateDbOrder,
  });

  const { updateEmployeeStructure, openEmployeeEditor, updateEmployee, openDepartmentCreator, createDepartment, openLeaveRequestCreator, createLeaveRequest, updateLeaveRequestStatus, markPayrollPaid, updateEmployeeDocuments, openVacancyCreator, createVacancy, openEmployeeDelete, deleteEmployee } = createHrActions({
    state, setState, setModal, notify, requirePermission, auditCurrentState, auditOperation, getActionStamp, syncHrWorkflow,
  });

  const { sendCreditSms, updateCreditPaymentDate, receiveCreditPayment, payCreditInitial, startCredit } = createCreditActions({
    activeTenantId, auditOperation, creditRecords, notify, refreshDbOrders, requirePermission, setState, state,
  });

  const { createPurchaseOrder, approvePurchaseOrder } = createPurchaseOrderActions({
    auditCurrentState, notify, requirePermission, setState, state,
  });

  const { markAllNotificationsRead, toggleSetting, updateCompany, saveSettings, runIntegrityCheck, runGoLiveCheck, runProductionHardeningCheck, exportBackup, importBackup, changeCurrentRole } = createSettingsActions({
    activeRoleInfo, apiSecretRows, apiWebhookRows, auditCurrentState, auditOperation, auditServerSyncedAt, creditRecords, currentUser, getActionStamp, goLiveReport, integrityReport, notificationProviderRows, notify, requirePermission, requireSystemBackup, setState, state,
  });

  const { addSupportTicketComment, updateSupportTicketStatus, openSupportConversation, openSupportTicket, openLinkedCustomer, selectMessageThread, createMessageConversation, archiveMessageConversation, deleteMessageConversation, sendMessage } = createMessagingActions({
    activeRoleInfo, auditCurrentState, auditOperation, conversationId, creditRecords, currentUser, draftMessage, getActionStamp, messageContextOptions, messageParticipantOptions, notify, requirePermission, setActive, setConversationId, setDraftMessage, setMobileNav, setQuery, setSelectedSupportTicketId, setState, state, syncCommunicationWorkflow,
  });

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
  const canPerformPageAction = pageHasHeaderAction && (active !== "hr" || collectionSync.ready) && (!actionPermission || can(actionPermission));
  const actionDeniedReason =
    active === "hr" && !collectionSync.ready ? "HR məlumatları serverdən yüklənir."
    : pageHasHeaderAction && actionPermission && !can(actionPermission)
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
          {expenseSync.phase === "error" && (
            <div role="alert" className="error-banner">
              <span>Xərc məlumatları saxlanmadı: {expenseSync.error?.message || "Bağlantını yoxlayın."}</span>
              <button type="button" className="secondary-btn" onClick={expenseSync.retry}>Yenidən cəhd et</button>
            </div>
          )}
          {collectionSync.phase === "error" && (
            <div role="alert" className="error-banner">
              <span>Məlumat serverdə saxlanmadı: {collectionSync.error?.message || "Bağlantını yoxlayın."}</span>
              <button type="button" className="secondary-btn" onClick={collectionSync.retry}>Yenidən cəhd et</button>
            </div>
          )}
          <PageHeader
            meta={meta}
            onAction={openAction}
            showAction={pageHasHeaderAction}
            canAct={canPerformPageAction}
            disabledReason={actionDeniedReason}
          />

          <Suspense fallback={<div className="page-suspense-loader u-padding-32px u-opacity-0_6" >Yüklənir…</div>}>
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
          {active === "crm" && <CrmCustomersPageV2 onOpenSalesOrder={openLinkedSalesOrder} onOpenCredit={openLinkedCredit} />}
          {active === "crm-deals" && <CrmDealsPage />}
          {active === "crm-activities" && <CrmActivitiesPage />}
          {active === "crm-tasks" && <CrmTasksPage />}


          {active === "sales-dashboard" && <SalesDashboardPage />}
          {active === "sales" && <SalesOrdersPage repository={dbSales} customers={dbCustomers} products={dbProducts} />}
          {active === "stock" && <StockPage inventory={dbInventory} products={dbProducts} />}
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
          {active === "ar-invoices" && <SalesInvoicesPage onOpenSalesOrder={openLinkedSalesOrder} />}
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
              loading={dbOrdersLoading}
              error={dbOrdersError}
              onRefresh={refreshDbOrders}
              sendCreditSms={sendCreditSms}
              onUpdatePaymentDate={updateCreditPaymentDate}
              onReceivePayment={receiveCreditPayment}
              onStartCredit={startCredit}
              onPayCreditInitial={payCreditInitial}
              onCreateCredit={() => setModal({ type: "sales", presetPaymentMethod: "Kredit" })}
              onOpenSalesOrder={openLinkedSalesOrder}
            />
          )}
          {active === "receivables" && (
            <ReceivablesPage
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
              periods={(kpiLedger.data?.periods || []).map(kpiPeriodView)}
              payouts={(kpiLedger.data?.periods || []).filter(row => row.status === 'paid').map(row => ({ id: row.id, period: row.period.slice(0, 7), amount: Number(row.payout_amount), at: row.paid_at, expenseId: row.expense_id }))}
              period={selectedKpiPeriod}
              onSelectPeriod={setSelectedKpiPeriod}
              accounts={kpiLedger.data?.accounts || []}
              accountId={kpiAccountId}
              onSelectAccount={setKpiAccountId}
              busy={kpiLedger.busy || !kpiLedger.ready}
              error={kpiLedger.error}
              onRetry={() => kpiLedger.refresh().catch(() => {})}
              onRunPeriodAction={runKpiPeriodAction}
            />
          )}
          {active === "bonuses" && <BonusesPage salesBonuses={salesBonusRows} />}
          {active === "production" && <ProductionLedgerPage />}
          {active === "contracts" && (
            <ContractsPage
              contracts={filtered.contracts}
              onExport={(id) => setModal({ type: "contractPrint", contractId: id })}
            />
          )}
          {active === "projects" && <ProjectsPage projects={filtered.projects} snapshot={state.projectRoiSnapshot} />}
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
            <div className="stack u-margin-bottom-16px" ><CustomerMessengerPanel /></div>
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
            warehouses: dbInventory.warehouses,
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


