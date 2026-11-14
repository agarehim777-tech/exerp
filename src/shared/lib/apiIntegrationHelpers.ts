// API inteqrasiyası: webhook və secret siyahılarının default-larla birləşdirilməsi, secret rotasiya sağlamlığı,
// webhook növbəsi, retry vəziyyəti və son payload. appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { initialState } from "../../data.js";
import { parsePaymentDate } from "../../services/date.js";
import { currentBusinessDate } from "./businessDate.ts";
import { buildProductLookup } from "./appDomainProcurement.jsx";
import { isLowStockItem } from "./appDomainWarehouse.jsx";
import { daysBetween, getCreditDisplayPlan, getCreditPaymentState } from "./credit.js";

type Row = Record<string, any>;

export interface ApiSecretHealth {
  daysLeft: number;
  status: string;
}

function ensureApiWebhooks(apiWebhooks: Row[] | null | undefined = []): Row[] {
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

function ensureApiSecrets(apiSecrets: Row[] | null | undefined = []): Row[] {
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

function getApiSecretHealth(secret: Row = {}): ApiSecretHealth {
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

function buildApiSecretRows(apiSecrets: Row[] | null | undefined = [], apiWebhooks: Row[] | null | undefined = []): Row[] {
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

function buildApiWebhookRows({ apiWebhooks = [], apiSecrets = [], apiWebhookLogs = [], invoices = [], credits = [], stock = [], products = [], purchaseOrders = [], expenses = [] }: {
  apiWebhooks?: Row[] | null;
  apiSecrets?: Row[] | null;
  apiWebhookLogs?: Row[] | null;
  invoices?: Row[];
  credits?: Row[];
  stock?: Row[];
  products?: Row[];
  purchaseOrders?: Row[] | null;
  expenses?: Row[];
}): Row[] {
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const productsByName = buildProductLookup(products);
  const lowStock = stock.filter((item) => isLowStockItem(item, productsByName));
  const eventCounts: Record<string, number> = {
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
  const logsByWebhook = (apiWebhookLogs || []).reduce((map: Map<string, Row[]>, log) => {
    if (!log.webhookId) return map;
    if (!map.has(log.webhookId)) map.set(log.webhookId, []);
    map.get(log.webhookId)!.push(log);
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

export { ensureApiWebhooks, ensureApiSecrets, getApiSecretHealth, buildApiSecretRows, buildApiWebhookRows };
