import { createVendorRegistryActions } from "./shared/state/vendorRegistryActions.js";
import { createWarehouseActions } from "./shared/state/warehouseActions.js";
import { createProductCatalogActions } from "./shared/state/productCatalogActions.js";
import { createRecordCreationActions } from "./shared/state/recordCreationActions.js";
import { createFinanceAccountActions } from "./shared/state/financeAccountActions.js";
import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useModuleNavigation } from "./shared/hooks/useModuleNavigation";
import { useToasts } from "./shared/hooks/useToasts";
import { useAuth } from "./auth/AuthProvider.jsx";
import { supabase } from "./integrations/supabase/client";
import { useCustomers } from "./shared/hooks/useCustomers.js";
import { useProducts } from "./shared/hooks/useProducts.js";
import { useOrders } from "./shared/hooks/useOrders.js";
import { useStock } from "./shared/hooks/useStock.js";
import { readSaleStockShortages } from "./services/inventoryRead.js";
import { useTenantUiPersistence } from "./shared/hooks/useTenantUiPersistence.js";
import { useExpensesSync } from "./shared/hooks/useExpensesSync.js";
import { useKpiLedger } from "./shared/hooks/useFinancialSettlement.js";
import { useCollectionSync } from "./shared/hooks/useCollectionSync.js";
import { useDbReadBridge } from "./shared/hooks/useDbReadBridge.js";
import { useLegacyOrderMigrations, useLegacyPayrollExpense } from "./shared/hooks/useLegacyMigrations.js";
import { useKpiViews } from "./shared/selectors/kpiViews.js";
import { useFinanceViews } from "./shared/selectors/financeViews.js";
import { useOperationsViews } from "./shared/selectors/operationsViews.js";
import { useIntegrationViews } from "./shared/selectors/integrationViews.js";
import { useMessagingViews } from "./shared/selectors/messagingViews.js";
import { useSystemReports } from "./shared/selectors/systemReports.js";
import { useAuditServerSync } from "./shared/hooks/useAuditServerSync.ts";
import { useRemoteApiSession } from "./shared/hooks/useRemoteApiSession.ts";
import { getCreateAudit } from "./shared/lib/createAudit.ts";
import { useFilteredRows } from "./shared/selectors/filteredRows.ts";
import { createAppGuards } from "./shared/state/appGuards.ts";
import { createPageHeaderAction } from "./shared/state/pageHeaderAction.ts";
import { createUserAdminActions } from "./shared/state/userAdminActions.js";
import { createHrActions } from "./shared/state/hrActions.js";
import { createSalesOrderActions } from "./shared/state/salesOrderActions.js";
import { createPurchaseOrderActions } from "./shared/state/purchaseOrderActions.js";
import { createSettingsActions } from "./shared/state/settingsActions.js";
import { createModuleActions } from "./shared/state/moduleActions.js";
import { createCreditActions } from "./shared/state/creditActions.js";
import { createMessagingActions } from "./shared/state/messagingActions.js";
import { appConfirm } from "./shared/ui/dialogService.js";
const syncedCollections = ["employees", "departments", "leaveRequests", "vacancies", "contracts", "cashEntries", "financeAccounts", "credits", "supportTickets", "conversations", "notifications", "notificationSendLog", "projects", "productionPlans", "knowledgeBase", "taxCalendar", "currencyRates", "apiWebhookLogs", "reportExports", "receivableClosures"];
import { useGitHubSync } from "./shared/hooks/useGitHubSync.js";
import { dbOrderToLegacy } from "./shared/adapters/erpShape.js";
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
import { PageHeader, Sidebar, Topbar } from "./components/AppShell.jsx";
import { CompanyModulePicker, LoginScreen, PasswordChangeScreen } from "./components/AuthScreens.jsx";
import { FloatingAssistant } from "./config/lazyPages.js";
import {
  logoutRemote,
  remoteApiEnabled,
  setRemoteToken,
} from "./remote-api.js";
import {
  AvatarLine,
  EmptyState,
  MetricCard,
  Panel,
  PanelHeader,
  ProgressRow,
  SimpleTable as DataTable,
  StatusBadge,
  TextField as Field,
  TwoLine,
} from "./shared/ui/primitives.tsx";
import { money, normalize } from "./services/format.js";
import { useTenantRequestScope } from './shared/hooks/useTenantRequestScope.js';
import { createIdempotencyKey } from "./services/coreOperations.js";
import {
  formatPaymentDate,
  parsePaymentDate,
  toLocalIsoDate,
} from "./services/date.js";
import {
  defaultRoles,
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
import { Toggle, getActiveRole, getAvailableQuantity, getFreeQuantity, getVendorKey, normalizeVendor } from "./shared/lib/appDomain.jsx";

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
  canAccessNavItem,
  getPageActionPermission,
  hasPageAction,
} from "./shared/lib/appHelpers.jsx";

import { SystemPages } from "./pages/groups/SystemPages.jsx";
import { SalesPages } from "./pages/groups/SalesPages.jsx";
import { FinancePages } from "./pages/groups/FinancePages.jsx";
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
  const auditServerSyncedAt = useAuditServerSync({ activeRoleInfo, activeTenantId, authUser, state });
  const { onboardingRows, integrityReport, goLiveReport, productionHardeningReport, helpModuleGuides, helpArticles } = useSystemReports({ state, creditRecords, apiWebhookRows, apiSecretRows, notificationProviderRows, auditServerSynced: Boolean(auditServerSyncedAt) });

  useEffect(() => {
    if (Number(state.dbMeta?.baselineVersion || 0) >= localDbBaselineVersion) return;
    setState(hydrateState(initialState));
  }, [state.dbMeta?.baselineVersion]);

  const { remoteAuthStatus, setRemoteAuthStatus, remoteUser, setRemoteUser, loginWithPassword } = useRemoteApiSession({
    activeTenantId, authUser, notify, setAuthError, setState, state, tenantStateReady,
  });

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

  const filtered = useFilteredRows({
    accountingData, apiWebhookRows, creditRecords, currencyExposureRows, invoiceRows, messageConversations, productionRows, projectRoiRows, query, receivableRows, state, taxCalendarRows,
  });

  const handleGitHubPush = useCallback(
    (commit) => {
      notify(`GitHub-a son push uğurlu: ${commit.sha}`, "success");
    },
    [notify]
  );

  useGitHubSync({ enabled: true, onPush: handleGitHubPush });

  const { can, requirePermission, requireSystemBackup, auditCurrentState, auditOperation, hasCreatePermission, choosePage } = createAppGuards({
    activeRoleInfo, collectionSync, dbCan, dbRole, isPlatformAdmin, notify, setActive, setMobileNav, setState, state, visibleNavItems,
  });

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

  const { openAction } = createPageHeaderAction({
    active, exportReport, requirePermission, runAccountingAction, runApiAction, runHelpAction, runInvoiceAction, runKpiPeriodAction, runNotificationDispatchAction, runOnboardingAction, runProductionAction, runProjectsExportAction, runReceivableSyncAction, runSupportAction, runTaxAction, saveSettings, setModal,
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
          <SystemPages {...{
            collectionsLoading: !collectionSync.ready,
            active, activeRoleInfo, addSupportTicketComment, apiSecretRows, applyDefaultUserPermissions, archiveMessageConversation, can, changeCurrentRole,
            choosePage, conversationId, createMessageConversation, createUser, creditRecords, currentUser, deleteMessageConversation, draftMessage,
            exportBackup, filtered, goLiveReport, helpArticles, helpModuleGuides, importBackup, integrityReport, markAllNotificationsRead,
            messageContextOptions, messageParticipantOptions, notificationAutomationRows, notificationFilter, notificationProviderRows, notify, onboardingRows, openLinkedCredit,
            openLinkedCustomer, openLinkedSalesOrder, openSupportConversation, openSupportTicket, productionHardeningReport, query, rotateApiSecret, runApiAction,
            runGoLiveCheck, runIntegrityCheck, runNotificationDispatchAction, runProductionHardeningCheck, saveSettings, selectMessageThread, selectedSupportTicketId, sendMessage,
            setDraftMessage, setNotificationFilter, setSelectedSupportTicketId, state, toggleSetting, toggleUserModuleAccess, updateCompany, updateSupportTicketStatus,
            updateUserProfile, updateUserRole, updateUserStatus,
          }} />

          
          



          <SalesPages {...{
            active, auditOperation, choosePage, completeWarehouseDelivery, dbCustomers, dbInventory, dbOrders, dbProducts,
            dbSales, deleteWarehouse, filtered, navigate, openLinkedCredit, openLinkedSalesOrder, query, selectedWarehouseId,
            setModal, setQuery, setSelectedWarehouseId, state, transferWarehouseStock,
          }} />


          <FinancePages {...{
            active, activeKpiPeriod, approvePurchaseOrder, can, createPurchaseOrder, creditRecords, dbOrdersError, dbOrdersLoading,
            exportReport, filtered, invoiceRows, kpiAccountId, kpiEmployeeRows, kpiLedger, kpiTargetRows, markPayrollPaid,
            openDepartmentCreator, openEmployeeDelete, openEmployeeEditor, openLeaveRequestCreator, openLinkedSalesOrder, openVacancyCreator, openVendorDelete, payCreditInitial,
            productionRows, receiveCreditPayment, refreshDbOrders, runKpiPeriodAction, salesBonusRows, selectedKpiPeriod, sendCreditSms, setKpiAccountId,
            setModal, setSelectedKpiPeriod, startCredit, state, updateCreditPaymentDate, updateEmployeeDocuments, updateEmployeeStructure, updateLeaveRequestStatus,
          }} />
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
  WarehouseImportModal,
  CreateModal,
  ToastStack,
  createConfig,
} from "./components/AppWidgets.jsx";


export default App;


