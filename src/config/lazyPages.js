/**
 * Route-level code-split page registry.
 *
 * Every ERP screen is declared here as a React.lazy component so that App.jsx
 * stays a composition root instead of an import monolith. Keeping the registry
 * in one place also makes the code-splitting boundary auditable: anything
 * imported eagerly in App.jsx lands in the initial bundle, anything listed here
 * is paid for only when the user opens that route.
 *
 * Adding a screen: declare it here, then render it from App.jsx inside the
 * existing <Suspense> boundary.
 */
import { lazy } from "react";

const named = (loader, exportName) => lazy(() => loader().then((m) => ({ default: m[exportName] })));

/* ---------------------------------------------------------------- Core */
export const DashboardPage = lazy(() => import("../pages/DashboardPage.jsx"));
export const OnboardingPage = named(() => import("../modules/onboarding/OnboardingPage.jsx"), "OnboardingPage");
export const HelpCenterPage = named(() => import("../modules/help/HelpCenterPage.jsx"), "HelpCenterPage");
export const SettingsPage = lazy(() => import("../pages/SettingsPage.jsx"));

/* ----------------------------------------------------------------- CRM */
export const CrmPage = lazy(() => import("../pages/CrmPage.jsx"));
export const CrmCustomersPageV2 = lazy(() => import("../modules/crm/CrmCustomersPage.jsx"));
export const CrmDealsPage = lazy(() => import("../modules/crm/CrmDealsPage.jsx"));
export const CrmActivitiesPage = lazy(() => import("../modules/crm/CrmActivitiesPage.jsx"));
export const CrmTasksPage = lazy(() => import("../modules/crm/CrmTasksPage.jsx"));

/* --------------------------------------------------------------- Sales */
export const SalesPage = lazy(() => import("../pages/SalesPage.jsx"));
export const SalesDashboardPage = lazy(() => import("../modules/sales/SalesDashboardPage.jsx"));
export const SalesOrdersPage = lazy(() => import("../modules/sales/SalesOrdersPage.jsx"));
export const DeliveriesPage = lazy(() => import("../pages/DeliveriesPage.jsx"));
export const CreditsPage = lazy(() => import("../pages/CreditsPage.jsx"));
export const ContractsPage = named(() => import("../modules/contracts/ContractsPage.jsx"), "ContractsPage");

/* --------------------------------------------- Procurement & warehouse */
export const ProcurementPage = lazy(() => import("../modules/procurement/ProcurementPage.jsx"));
export const VendorsPage = lazy(() => import("../pages/VendorsPage.jsx"));
export const VendorManagementPage = lazy(() => import("../pages/VendorManagementPage.jsx"));
export const WarehousePage = lazy(() => import("../pages/WarehousePage.jsx"));
export const StockPage = lazy(() => import("../modules/warehouse/StockPage.jsx"));
export const ProductsPage = lazy(() => import("../modules/warehouse/ProductBalancesPage.jsx"));

/* ------------------------------------------------------------- Finance */
export const FinancePage = lazy(() => import("../pages/FinancePage.jsx"));
export const CashbookPage = lazy(() => import("../modules/finance/CashbookPage.jsx"));
export const InvoicesPage = lazy(() => import("../pages/InvoicesPage.jsx"));
export const SalesInvoicesPage = lazy(() => import("../modules/finance/SalesInvoicesPage.jsx"));
export const ReceivablesPage = lazy(() => import("../pages/ReceivablesPage.jsx"));
export const AccountingPage = lazy(() => import("../pages/AccountingPage.jsx"));
export const AccountingPageV2 = lazy(() => import("../modules/accounting/AccountingPage.jsx"));

/* ------------------------------------------------------- HR & analytics */
export const HrPage = lazy(() => import("../pages/HrPage.jsx"));
export const KpiPage = lazy(() => import("../pages/KpiPage.jsx"));
export const BonusesPage = lazy(() => import("../pages/BonusesPage.jsx"));
export const ReportsPage = named(() => import("../modules/reports/ReportsPage.jsx"), "ReportsPage");
export const FinancialStatementsPage = lazy(() => import("../modules/reports/FinancialStatementsPage.jsx"));

/* --------------------------------------------------------- AI & comms */
export const AssistantPage = lazy(() => import("../modules/assistant/AssistantPage.jsx"));
export const InsightsPage = lazy(() => import("../modules/assistant/InsightsPage.jsx"));
export const FloatingAssistant = lazy(() => import("../modules/assistant/FloatingAssistant.jsx"));
export const MessagesPage = lazy(() => import("../pages/MessagesPage.jsx"));
export const NotificationsPage = lazy(() => import("../pages/NotificationsPage.jsx"));
export const CustomerMessengerPanel = lazy(() => import("../modules/notifications/CustomerMessengerPanel.jsx"));
export const SupportPage = lazy(() => import("../pages/SupportPage.jsx"));

/* ------------------------------------------- Administration & platform */
export const RolesPermissionsPage = lazy(() => import("../modules/settings/RolesPermissionsPage.jsx"));
export const AccessCheckPage = lazy(() => import("../modules/settings/AccessCheckPage.jsx"));
export const AuditLogPage = lazy(() => import("../modules/settings/AuditLogPage.jsx"));
export const DataReconciliationPage = lazy(() => import("../modules/admin/DataReconciliationPage.jsx"));
export const PlatformAdminPage = lazy(() => import("../pages/PlatformAdminPage.jsx"));
export const ApiPage = lazy(() => import("../pages/ApiPage.jsx"));
