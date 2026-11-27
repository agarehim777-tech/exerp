// Durum yüklənməsi: köhnə demo etiketlərinin normallaşdırılması, köhnə müqavilə nömrələrinin İN-xxxx formatına
// köçürülməsi, növbəti müqavilə/satış nömrəsi, snapshot-un default-larla birləşdirilməsi və localStorage-dan yüklənmə.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { initialState } from "../../data.js";
import { normalize } from "../../services/format.js";
import { defaultDbProvider, localDbBaselineVersion, localDbKey, localDbSchemaVersion } from "../../services/persistence.js";
import { baseFinanceDate } from "./appDomainHr.jsx";
import { ensureSettings } from "./appDomainPlatform.jsx";
import { ensureApiSecrets, ensureApiWebhooks } from "./apiIntegrationHelpers.ts";
import { ensureNotificationProviders, ensureNotificationRules } from "./notificationHelpers.ts";
import { ensureWarehouseSerials } from "./serialStockHelpers.ts";

type Row = Record<string, any>;

function normalizeOperationalLabels(snapshot: Row = {}): Row {
  return {
    ...snapshot,
    onboarding: {
      ...(snapshot.onboarding || {}),
      companyStage: normalize(snapshot.onboarding?.companyStage).includes("demo")
        ? "İstifadəyə hazırlıq"
        : snapshot.onboarding?.companyStage,
    },
    invoiceSettings: {
      ...(snapshot.invoiceSettings || {}),
      eTaxMode: normalize(snapshot.invoiceSettings?.eTaxMode).includes("demo")
        ? "E-qaimə inteqrasiya rejimi"
        : snapshot.invoiceSettings?.eTaxMode,
    },
    productionPlans: (snapshot.productionPlans || []).map((plan: Row) => ({
      ...plan,
      product: normalize(plan.product).includes("showroom demo") ? "Showroom nümayiş dəsti" : plan.product,
    })),
  };
}

function normalizeContractNumbers(snapshot: Row = {}): Row {
  const found: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value || /^İN-\d+$/u.test(value) || found.includes(value)) return;
    if (/^(MQ-|MÜQ-|CONTRACT-)/iu.test(value)) found.push(value);
  };
  (snapshot.contracts || []).forEach((item: Row) => add(item.id));
  (snapshot.orders || []).forEach((item: Row) => add(item.contractId));
  (snapshot.credits || []).forEach((item: Row) => add(item.contractId));
  (snapshot.cashEntries || []).forEach((item: Row) => add(item.contractId));
  (snapshot.invoices || []).forEach((item: Row) => add(item.contractId));
  if (!found.length) return snapshot;
  const used: number[] = [];
  const collectUsed = (value: unknown) => { if (typeof value === "string") { const match = value.match(/^İN-(\d+)$/u); if (match) used.push(Number(match[1])); } };
  [...(snapshot.contracts || []), ...(snapshot.orders || []), ...(snapshot.credits || [])].forEach((item: Row) => { collectUsed(item.id); collectUsed(item.contractId); });
  let next = Math.max(1000, ...used) + 1;
  const replacements = new Map(found.map(oldId => [oldId, `İN-${next++}`]));
  const replaceDeep = (value: unknown): unknown => {
    if (typeof value === "string") return replacements.get(value) || value;
    if (Array.isArray(value)) return value.map(replaceDeep);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceDeep(item)]));
    return value;
  };
  return replaceDeep(snapshot) as Row;
}

function nextContractNumber(state: Row = {}): string {
  const numbers: number[] = [];
  [...(state.contracts || []), ...(state.orders || []), ...(state.credits || [])].forEach((item: Row) => {
    [item.id, item.contractId].forEach(value => {
      const match = String(value || "").match(/^İN-(\d+)$/u);
      if (match) numbers.push(Number(match[1]));
    });
  });
  return `İN-${Math.max(1000, ...numbers) + 1}`;
}

function nextSalesOrderNumber(orders: Row[] = []): string {
  const numbers = orders.map(order => String(order.order_no || order.orderNo || "").match(/^SF-(\d+)$/u))
    .filter(Boolean).map(match => Number(match![1]));
  return `SF-${Math.max(1000, ...numbers) + 1}`;
}

function hydrateState(snapshot: Row = {}): Row {
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

  return normalizeContractNumbers(merged);
}

function loadPersistentState(): Row {
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

export { normalizeOperationalLabels, normalizeContractNumbers, nextContractNumber, nextSalesOrderNumber, hydrateState, loadPersistentState };
