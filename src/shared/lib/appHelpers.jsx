// Legacy bridge: appHelpers.jsx only re-exports helpers that now live in typed area modules.
// Add or change logic in those modules (see AGENTS.md); do not add functions here.
import { flattenWarehouseStock } from "./warehouseStockRows.ts";
import {
  ensureNotificationProviders, ensureNotificationRules, getNotificationChannelEnabled, renderNotificationTemplate,
  getNotificationEventKey, getNotificationLogTime, splitNotificationEventsByCooldown, getCreditPaymentLeadDays,
  buildNotificationProviderRows, buildNotificationEvent, buildNotificationRuleEvents, buildNotificationAutomationRows,
  createNotificationSendLogEntry, buildNotificationDeliveriesForRules,
} from "./notificationHelpers.ts";
import {
  getReceivableAgingBucket, getReceivableRiskCategory, getReceivableCollectionStatus, getReceivableNextAction,
  enrichReceivableRow, buildReceivableRows,
} from "./receivableHelpers.ts";
import {
  getInitials, buildSupportMessageFromComment, buildSupportConversation, normalizeMessageThread,
  buildMessageParticipantOptions, buildMessageContextOptions, getMessageContextPayload, upsertSupportConversation,
} from "./messagingHelpers.ts";
import {
  buildQuantityMap, buildSerialPrefix, ensureStockItemSerials, ensureWarehouseSerials, getAvailableSerialsForProduct,
  updateSerialStatuses, releaseOrderSerialReservations, adjustStockRows, addStockToRows,
} from "./serialStockHelpers.ts";
import {
  getCurrentUser, hasRolePermission, hasUserModuleAccess, hasEffectivePermission, canAccessNavItem,
  getPageActionPermission, hasPageAction,
} from "./permissionHelpers.ts";
import {
  getInvoiceVatRate, buildInvoiceRows, buildInvoiceSummary, buildCurrencyExposureRows, buildAccountingData,
  buildPayrollTaxCalculatorRows, getTaxAmountByType, buildTaxDueDate, buildDefaultTaxCalendarItems, buildTaxCalendarRows,
} from "./financeHelpers.ts";
import { ensureKpiTargets, getKpiActualValue, buildKpiTargetRows, buildKpiPeriodSnapshot } from "./kpiHelpers.ts";
import { ensureApiWebhooks, ensureApiSecrets, getApiSecretHealth, buildApiSecretRows, buildApiWebhookRows } from "./apiIntegrationHelpers.ts";
import {
  getCreditIdForOrder, buildSalesCreditRecord, buildSalesCreditRecords, buildAllCreditRecords, buildCreditRiskRows,
  buildCreditAgingBuckets,
} from "./creditRecordHelpers.ts";
import { buildProjectPortfolioSource, isDateWithinProject, getProjectOrderCost, buildProjectRoiRows } from "./projectHelpers.ts";
import { buildProductionPlanRows } from "./productionHelpers.ts";
import { buildOnboardingRows, buildHelpModuleGuides, buildHelpArticles } from "./onboardingHelpers.ts";
import { buildSellerBonusRows, summarizeSellerBonusRows, calculateOrderLineTotal, productLineSignature, buildSalesCreditForOrder } from "./salesOrderHelpers.ts";
import {
  getDeliveryActionLabel, matchesDeliveryFilter, buildDriverDeliveryStats, matchesFinanceFilter, matchesFinanceDateRange,
  matchesFinanceSearch,
} from "./listFilterHelpers.ts";
import { normalizeOperationalLabels, normalizeContractNumbers, nextContractNumber, nextSalesOrderNumber, hydrateState, loadPersistentState } from "./stateHydration.ts";
import { buildTodayActionRows, buildExecutiveInsights } from "./dashboardHelpers.ts";
import { buildReportModuleRows, buildReportRiskRows, buildReportPackage } from "./reportHelpers.ts";
import {
  deploymentToolkitReady, getDuplicateValues, buildStateIntegrityReport, buildGoLiveReadiness, buildProductionHardeningReport,
  buildModuleReadiness,
} from "./readinessHelpers.ts";
import { buildPayrollExpense } from "./payrollExpenseHelpers.ts";

export {
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
};


