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

  async function createRecord(type, values) {
    if (!hasCreatePermission(type, values)) return false;

    if (type === "sales" || type === "dashboard") {
      const warehouseId = values.warehouseId || state.warehouses[0]?.id;
      const productLines = (Array.isArray(values.products) ? values.products : [])
        .filter((item) => item.product)
        .map((item) => ({ product: item.product, qty: Number(item.qty || 0) }));
      const invalidQtyLine = productLines.some((line) => line.qty <= 0);

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

      let shortageLines;
      if (activeTenantId) {
        const isCurrent = beginTenantRequest('sale-stock-preview');
        try {
          const shortages = await readSaleStockShortages(activeTenantId, warehouseId, productLines, dbProducts || [], isCurrent);
          if (!isCurrent() || shortages === null) return false;
          shortageLines = shortages.map(line => `${line.product} (${line.shortage} ədəd)`);
        } catch (error) {
          if (isCurrent()) notify(`Qalıq serverdən yoxlanılmadı: ${error.message}`, 'error');
          return false;
        }
      } else if (ENABLE_LEGACY_WRITES) {
        const warehouseRows = state.warehouseStock?.[warehouseId] || [];
        shortageLines = productLines.map(line => {
          const item = warehouseRows.find(row => row.product === line.product);
          const shortage = Math.max(0, line.qty - (item ? getFreeQuantity(item) : 0));
          return shortage > 0 ? `${line.product} (${shortage} ədəd)` : null;
        }).filter(Boolean);
      } else {
        notify('Aktiv şirkət seçilməyib.', 'error');
        return false;
      }

      if (shortageLines.length > 0) {
        // Rezervasiya mümkün deyil — istifadəçidən açıq təsdiq alınmadan sifariş yaradılmır.
        const confirmed = await appConfirm(
          `Qalıq çatışmazlığı: ${shortageLines.join(", ")}.\n\n` +
            "Bu sətirlər rezerv edilə bilməyəcək və sifariş backorder (mənfi mövcud) kimi qeyd olunacaq.\n\n" +
            "Davam edilsin?",
        );
        if (!confirmed) {
          notify(
            `Sifariş bloklandı — rezervasiya üçün qalıq çatışmır: ${shortageLines.join(", ")}.`,
            "warning",
          );
          auditOperation({
            module: "Satış/Anbar",
            action: "Rezervasiya bloklandı",
            detail: `${values.customer || "—"} · ${shortageLines.join(", ")}`,
            status: "Bloklandı",
          });
          return;
        }
        notify(
          `Qalıq çatışmır — sifariş backorder kimi yaradıldı: ${shortageLines.join(", ")}. Təchizatdan gətirilib təhvil verilməlidir.`,
          "warning",
        );
      }

      // Persist to DB (Supabase). Realtime bridge will merge into state.orders.
      if (activeTenantId && createDbOrder) {
        const customerRow = resolveOrderCustomer(
          { customerId: values.customerId, fin: values.fin, name: values.customer },
          dbCustomers || [],
        );
        if (!customerRow) {
          notify("Müştəri dəqiq müəyyən edilmədi (tapılmadı və ya eyni adlı bir neçə müştəri var). Müştərini siyahıdan yenidən seçin.", "warning");
          return false;
        }
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
            // Rezerv həmişə yaradılır: məhsul DB-də tanınırsa və anbar UUID-dirsə,
            // sətir anbarın təhvil növbəsinə düşür (qalıq çatmasa belə backorder rezervi).
            const isUuidWarehouse = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              String(warehouseId || ""),
            );
            return {
              line_no: idx + 1,
              product_id: prod?.id || null,
              description: it.product,
              qty,
              unit_price: unitPrice,
              discount_pct: 0,
              vat_rate: Number(it.vatRate ?? 0),
              warehouse_id: prod?.id && isUuidWarehouse ? warehouseId : null,
            };
          });
        const orderNo = nextSalesOrderNumber(dbOrders);
        const savedOrder = await createDbOrder({
          request_key: createIdempotencyKey("sales-order"),
          order_no: orderNo,
          customer_id: customerRow.id,
          order_date: values.date || toLocalIsoDate(),
          // Satış ayrıca təsdiq mərhələsi gözləmir. Yaradılan kimi anbarın
          // təhvil növbəsinə düşən təsdiqli sifariş kimi saxlanılır.
          status: "confirmed",
          currency: "AZN",
          notes: serializeOrderNotes(values.note, values.internalNotes),
          bonus_allocations: buildSellerBonusRows(values.sellers).map((row) => ({
            seller_name: row.seller,
            rate: Number(row.bonus || 0),
          })),
          items,
          credit: values.paymentMethod === "Kredit"
            ? {
                contract_no: nextContractNumber({
                  contracts: state.contracts,
                  orders: state.orders,
                  credits: creditRecords,
                }),
                principal: Number(values.orderTotal || 0),
                initial_payment: Number(values.depositPaid ?? values.initialPayment ?? 0),
                required_initial: Number(values.initialPayment || 0),
                term_months: Number(values.creditMonths || 12),
                start_date: values.date || toLocalIsoDate(),
              }
            : null,
        }).catch((err) => {
          console.error("[orders] DB insert failed:", err);
          notify(describeStockError(err, "DB-yə saxlanılmadı"), "warning");
          if (isStockShortageError(err)) {
            auditOperation({
              module: "Satış/Anbar",
              action: "Rezervasiya bloklandı",
              detail: `${values.customer || "—"} · server rezervasiyanı rədd etdi`,
              status: "Bloklandı",
            });
          }
          return null;
        });
        if (!savedOrder) return false;
        setModal(null);
        notify("Yeni qeyd əlavə olundu.");
        auditOperation(getCreateAudit(type, values));
        return true;
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
      let persistedProduct = null;
      if (activeTenantId && createDbProduct) {
        try {
          persistedProduct = await createDbProduct({
            sku,
            name,
            description: values.category || null,
            unit: values.unit || "ədəd",
            price: Math.max(0, Number(values.salePrice || 0)),
            minimum_stock: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
            recommended_order_qty: Math.max(0, Math.round(Number(values.recommendedOrderQty || 0))),
            currency: "AZN",
            vat_rate: 18,
            is_active: true,
          });
          if (values.imageFile && uploadDbProductImage) {
            persistedProduct = await uploadDbProductImage(persistedProduct.id, values.imageFile);
          }
        } catch (err) {
          console.error("[products] DB insert failed:", err);
          notify(`Məhsul DB-yə saxlanılmadı: ${err.message || err}`, "warning");
          return;
        }
      }
      const product = {
        id: persistedProduct?.id || `PRD-${Date.now()}`,
        name,
        sku,
        category: values.category || "Digər",
        unit: values.unit || "ədəd",
        salePrice: Math.max(0, Number(values.salePrice || 0)),
        costPrice: Math.max(0, Number(values.costPrice || 0)),
        reorderLevel: Math.max(0, Math.round(Number(values.reorderLevel || 0))),
        recommendedOrderQty: Math.max(0, Math.round(Number(values.recommendedOrderQty || 0))),
        serialTracked: values.serialTracked === "Bəli",
        status: "Aktiv",
        imagePath: persistedProduct?.image_path || "",
        imageUrl: persistedProduct?.image_url || "",
      };
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
        const depositPaid = isCreditSale
          ? Math.min(Number(values.depositPaid ?? creditPlan.initialPayment ?? 0), creditPlan.initialPayment)
          : 0;
        const paid = isCreditSale
          ? depositPaid
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
                  requiredInitial: creditPlan.initialPayment,
                  initialPaid: depositPaid,
                  balance: creditPlan.balance,
                  monthly: creditPlan.monthly,
                  lastPayment: creditPlan.lastPayment,
                  months: creditPlan.months,
                  paidMonths: 0,
                  rate: 0,
                  next: "—",
                  status: "Başlanmamış",
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
              requiredInitial: creditPlan?.initialPayment || 0,
              initialPaid: isCreditSale ? depositPaid : 0,
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
    return true;
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

  async function importWarehouseStock(rows, requestKey) {
    if (!requirePermission("warehouse.manage", "anbara toplu import etmək")) return;
    const isCurrent = beginTenantRequest();
    await importWarehouseStockAtomic(activeTenantId, rows, requestKey);
    if (!isCurrent()) return;
    await Promise.all([refreshDbProducts(), dbInventory.refresh()]);
    if (!isCurrent()) return;
    setModal(null);
    notify(`${rows.length} stok sətri serverdə anbara import edildi.`);
  }

  async function updateProduct(productId, values) {
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
      recommendedOrderQty: Math.max(0, Math.round(Number(values.recommendedOrderQty || 0))),
      serialTracked: values.serialTracked === "Bəli",
      imageUrl: values.removeImage ? "" : values.imagePreview || currentProduct.imageUrl || "",
      imagePath: values.removeImage ? "" : currentProduct.imagePath || "",
    };

    const dbRow =
      (dbProducts || []).find((p) => p.id === productId) ||
      (dbProducts || []).find((p) => String(p.sku).toLowerCase() === String(currentProduct.sku).toLowerCase());
    if (activeTenantId && dbRow) {
      try {
        let persisted = await updateDbProduct(dbRow.id, {
          sku: nextProduct.sku,
          name: nextProduct.name,
          description: nextProduct.category || null,
          unit: nextProduct.unit,
          price: nextProduct.salePrice,
          minimum_stock: nextProduct.reorderLevel,
          recommended_order_qty: nextProduct.recommendedOrderQty,
        });
        if (values.imageFile && uploadDbProductImage) {
          persisted = await uploadDbProductImage(dbRow.id, values.imageFile, dbRow.image_path || currentProduct.imagePath || "");
        } else if (values.removeImage && removeDbProductImage) {
          persisted = await removeDbProductImage(dbRow.id, dbRow.image_path || currentProduct.imagePath || "");
        }
        nextProduct.imagePath = persisted?.image_path || "";
        nextProduct.imageUrl = persisted?.image_url || "";
      } catch (err) {
        console.error("[products] DB update failed:", err);
        notify(`Məhsul DB-də yenilənmədi: ${err.message || err}`, "warning");
        return;
      }
    }
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
    setModal(null);
    notify(`${nextProduct.name} məhsul məlumatları yeniləndi.`);
  }

  async function deleteProduct(productId) {
    if (!requirePermission("warehouse.manage", "məhsul kataloqunu silmək")) return;
    const currentProduct = state.products.find((product) => product.id === productId);
    if (!currentProduct) {
      notify("Məhsul tapılmadı.", "warning");
      return;
    }
    if (!(await appConfirm(`${currentProduct.name} məhsulunu silmək istədiyinizə əminsiniz?`, { danger: true }))) return;

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


  async function completeWarehouseDelivery(orderId, acceptance = {}) {
    if (!requirePermission("delivery.complete", "təhvili tamamlamaq")) return;
    const isCurrentDelivery = beginTenantRequest("delivery");

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

    // Server is authoritative for a completed delivery: physical stock and
    // the linked reservation must be committed atomically before the UI is
    // allowed to show the order as delivered.
    if (deliveryWillComplete && activeTenantId) {
      const dbOrder = dbOrders.find((order) =>
        String(order.id) === String(orderId) || String(order.order_no) === String(targetOrder.orderNo || orderId),
      );
      if (!dbOrder?.id) {
        notify("Təhvil ediləcək satış bazada tapılmadı.", "warning");
        return;
      }
      const warehouseId = targetOrder.warehouseId || state.warehouses?.[0]?.id;
      const { error } = await supabase.rpc("complete_sales_delivery", {
        _tenant_id: activeTenantId,
        _order_id: dbOrder.id,
        _warehouse_id: warehouseId,
        _request_key: `delivery:${dbOrder.id}`,
        _acceptance: {
          recipientName: acceptance.recipientName || targetOrder.customer || "",
          documentNo: acceptance.documentNo || "",
          warehouseEmployeeName: acceptance.warehouseEmployeeName || "",
          signatureConfirmed: Boolean(acceptance.signatureConfirmed),
          note: acceptance.note || "",
        },
      });
      if (error) {
        console.error("[delivery] stock fulfillment failed:", error);
        notify(describeStockError(error, "Təhvil tamamlanmadı"), "warning");
        return;
      }
      if (!isCurrentDelivery()) return;
      try {
        await refreshDbOrders();
        await dbInventory.refresh();
        if (isCurrentDelivery()) notify("Təhvil və anbar əməliyyatları serverdə tamamlandı.");
      } catch (refreshError) {
        if (isCurrentDelivery()) notify("Təhvil serverdə saxlanıldı, ekran yenilənmədi. Səhifəni yeniləyin.", "warning");
        console.error("[delivery] committed delivery refresh failed:", refreshError);
      }
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
                  deliveryAcceptance: {
                    recipientName: acceptance.recipientName || order.customer,
                    documentNo: acceptance.documentNo || "",
                    warehouseEmployeeName: acceptance.warehouseEmployeeName || "",
                    signatureConfirmed: Boolean(acceptance.signatureConfirmed),
                    note: acceptance.note || "",
                    acceptedAt: new Date().toISOString(),
                  },
                }
              : item,
          ),
        },
        {
          module: "Təhvil/Anbar",
          action: fullyDelivered ? "Təhvil tamamlandı" : "Qismən təhvil",
          detail: `${orderId} · ${summarizeOrderProducts(order)} · ${deliveredNow} ədəd anbardan çıxıldı · Təhvil alan: ${acceptance.recipientName || order.customer}${
            fullyDelivered ? "" : ` · ${remainingAfter} ədəd backorder qalır`
          }`,
          role: getActiveRole(current.settings)?.name || activeRoleInfo?.name || "System",
        },
      );
    });

    if (deliveryWillComplete && activeTenantId) {
      await Promise.all([refreshDbOrders(), dbInventory.refresh()]);
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


