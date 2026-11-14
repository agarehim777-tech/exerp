// Bildiriş avtomatikası: provider/qayda defaultları, hadisə növbəsi, cooldown və göndəriş jurnalı.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { initialState } from "../../data.js";
import { money, normalize } from "../../services/format.js";
import { parsePaymentDate } from "../../services/date.js";
import { getDeliveryAgeDays } from "../../modules/warehouse/deliveryDomain.jsx";
import { buildProductLookup } from "./appDomainProcurement.jsx";
import { getAvailableQuantity, isLowStockItem } from "./appDomainWarehouse.jsx";
import { baseCreditDate, daysBetween, getCreditDisplayPlan, getCreditPaymentState } from "./credit.js";
import { flattenWarehouseStock } from "./warehouseStockRows.ts";

type Row = Record<string, unknown>;

export interface NotificationProvider extends Row {
  id?: string;
  name?: string;
  channel?: string;
  status?: string;
  lastSentAt?: string;
}

export interface NotificationRule extends Row {
  id?: string;
  name?: string;
  channel?: string;
  providerId?: string;
  status?: string;
  template?: string;
  trigger?: string;
  cooldownHours?: number | string;
  lastRunAt?: string;
  sentCount?: number | string;
  events?: NotificationEvent[];
}

export type NotificationEvent = Row;

export interface NotificationLogEntry extends Row {
  ruleId?: string;
  providerId?: string;
  entityId?: string;
  dedupeKey?: string;
  status?: string;
  sentAt?: string;
  sentAtIso?: string;
}

export interface NotificationSettings {
  toggles?: { sms?: boolean; email?: boolean; push?: boolean };
}

export interface NotificationSources {
  credits?: Row[];
  stock?: Row[];
  warehouseStock?: Record<string, Row[]>;
  products?: Row[];
  purchaseOrders?: Row[];
  expenses?: Row[];
  orders?: Row[];
}

type ProviderRow = NotificationProvider & {
  enabled: boolean;
  sentCount: number;
  failureCount: number;
  lastSentAt: string;
  health: unknown;
};

const text = (value: unknown): string => (value == null ? "" : String(value));

function mergeDefaults<T extends { id?: string }>(defaults: T[], stored: T[] = []): T[] {
  const storedById = new Map((stored || []).map((item) => [item.id, item]));
  const merged = defaults.map((item) => ({ ...item, ...(storedById.get(item.id) || {}) }));
  const knownIds = new Set(merged.map((item) => item.id));
  return [...merged, ...(stored || []).filter((item) => !knownIds.has(item.id))];
}

function ensureNotificationProviders(providers: NotificationProvider[] = []): NotificationProvider[] {
  return mergeDefaults<NotificationProvider>(initialState.notificationProviders || [], providers);
}

function ensureNotificationRules(rules: NotificationRule[] = []): NotificationRule[] {
  return mergeDefaults<NotificationRule>(initialState.notificationRules || [], rules);
}

function getNotificationChannelEnabled(channel: unknown, settings: NotificationSettings = {}): boolean {
  const key = normalize(channel);
  const toggles = settings.toggles || {};
  if (key.includes("sms")) return toggles.sms !== false;
  if (key.includes("email")) return toggles.email === true;
  if (key.includes("push")) return toggles.push !== false;
  return true;
}

function renderNotificationTemplate(template: unknown = "", values: Row = {}): string {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key: string) => text(values[key] ?? ""));
}

function getNotificationEventKey(rule: NotificationRule = {}, event: NotificationEvent = {}): string {
  return [
    rule.id || "RULE",
    event.entityId || event.id || event.target || event.recipient || "EVENT",
  ].join(":");
}

function getNotificationLogTime(log: NotificationLogEntry = {}): number {
  const iso = Date.parse(log.sentAtIso || "");
  if (!Number.isNaN(iso)) return iso;
  const fallback = Date.parse(log.sentAt || "");
  return Number.isNaN(fallback) ? 0 : fallback;
}

function splitNotificationEventsByCooldown(
  rule: NotificationRule = {},
  events: NotificationEvent[] = [],
  sendLog: NotificationLogEntry[] = [],
  now: Date = new Date(),
): { ready: NotificationEvent[]; held: NotificationEvent[] } {
  const cooldownMs = Math.max(0, Number(rule.cooldownHours || 0)) * 60 * 60 * 1000;
  const ready: NotificationEvent[] = [];
  const held: NotificationEvent[] = [];

  events.forEach((event) => {
    const dedupeKey = getNotificationEventKey(rule, event);
    const enriched = { ...event, dedupeKey };
    const recentLog = (sendLog || []).find(
      (log) => log.dedupeKey === dedupeKey || (log.ruleId === rule.id && log.entityId === event.entityId),
    );
    const coolingDown = Boolean(cooldownMs > 0 && recentLog && now.getTime() - getNotificationLogTime(recentLog) < cooldownMs);

    if (coolingDown && recentLog) {
      held.push({
        ...enriched,
        heldReason: `${rule.cooldownHours || 0} saat cooldown`,
        lastSentAt: recentLog.sentAt || recentLog.sentAtIso || "",
      });
      return;
    }

    ready.push(enriched);
  });

  return { ready, held };
}

function getCreditPaymentLeadDays(paymentState: { dueDate?: unknown } | null | undefined): number | null {
  const today = parsePaymentDate(baseCreditDate);
  const dueDate = paymentState?.dueDate;
  if (!today || !dueDate) return null;
  return daysBetween(today, dueDate);
}

function buildNotificationProviderRows(
  providers: NotificationProvider[] = [],
  settings: NotificationSettings = {},
  sendLog: NotificationLogEntry[] = [],
): ProviderRow[] {
  return ensureNotificationProviders(providers).map((provider) => {
    const enabled = getNotificationChannelEnabled(provider.channel, settings);
    const rows = sendLog.filter((log) => log.providerId === provider.id);
    const failures = rows.filter((log) => normalize(log.status).includes("uğursuz") || normalize(log.status).includes("blok")).length;
    return {
      ...provider,
      enabled,
      sentCount: rows.filter((log) => normalize(log.status).includes("göndərildi")).length,
      failureCount: failures,
      lastSentAt: rows[0]?.sentAt || provider.lastSentAt || "",
      health: !enabled ? "Kanal bağlıdır" : provider.status === "Aktiv" && failures === 0 ? "Hazır" : provider.status,
    };
  });
}

function buildNotificationEvent(rule: NotificationRule, values: Row = {}): NotificationEvent {
  return {
    id: values.id || `${rule.id}-${values.entityId || Date.now()}`,
    entityId: values.entityId || "",
    dedupeKey: values.dedupeKey || "",
    recipient: values.recipient || values.customer || values.owner || "Daxili komanda",
    target: values.target || values.phone || values.email || "internal",
    subject: values.subject || rule.name,
    body: renderNotificationTemplate(rule.template, values) || values.body || rule.trigger,
    amount: Number(values.amount || 0),
    module: values.module || "notifications",
    dueDate: values.dueDate || "",
    context: values.context || values.contractId || values.orderId || values.poId || values.product || "",
    actionTarget: values.actionTarget || "",
    priority: values.priority || "Orta",
  };
}

function creditEvent(rule: NotificationRule, credit: Row, plan: Row, paymentState: Row, extra: Row): NotificationEvent {
  const nextInstallment = paymentState.nextInstallment as Row | undefined;
  return buildNotificationEvent(rule, {
    id: `${rule.id}-${credit.id}`,
    entityId: credit.id,
    customer: credit.customer,
    recipient: credit.customer,
    target: credit.phone || credit.fin || credit.customer,
    contractId: credit.contractId || credit.id,
    amount: nextInstallment?.amount || plan.monthly,
    dueDate: nextInstallment?.due || credit.next,
    context: `${credit.contractId || credit.id} · ${credit.device || credit.product || "Cihaz"}`,
    actionTarget: credit.id,
    module: "credits",
    ...extra,
  });
}

function buildNotificationRuleEvents(
  rule: NotificationRule,
  { credits = [], stock = [], warehouseStock = {}, products = [], purchaseOrders = [], expenses = [], orders = [] }: NotificationSources,
): NotificationEvent[] {
  const productsByName = buildProductLookup(products);
  const stockSource = [...(stock || []), ...flattenWarehouseStock(warehouseStock || {})];

  if (rule.id === "RULE-CREDIT-OVERDUE") {
    return credits
      .map((credit) => {
        const plan = getCreditDisplayPlan(credit);
        return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
      })
      .filter((item) => item.paymentState.isOverdue || item.paymentState.isDueToday)
      .map((item) =>
        creditEvent(rule, item.credit, item.plan, item.paymentState, {
          status: item.paymentState.isOverdue ? `${item.paymentState.daysOverdue} gün gecikib` : "bu gün ödənilməlidir",
          priority: item.paymentState.isOverdue ? "Yüksək" : "Orta",
        }),
      );
  }

  if (rule.id === "RULE-CREDIT-UPCOMING") {
    return credits
      .map((credit) => {
        const plan = getCreditDisplayPlan(credit);
        const paymentState = getCreditPaymentState(credit, plan);
        return { credit, plan, paymentState, leadDays: getCreditPaymentLeadDays(paymentState) };
      })
      .filter((item) => Number(item.leadDays || 0) >= 1 && Number(item.leadDays || 0) <= 3)
      .map((item) =>
        creditEvent(rule, item.credit, item.plan, item.paymentState, {
          leadDays: item.leadDays,
          priority: Number(item.leadDays) <= 1 ? "Yüksək" : "Orta",
        }),
      );
  }

  if (rule.id === "RULE-LOW-STOCK") {
    return stockSource
      .filter((item) => isLowStockItem(item, productsByName))
      .map((item) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${normalize(item.product)}`,
          entityId: item.product,
          recipient: "Anbar",
          target: "warehouse-team",
          product: item.product,
          available: getAvailableQuantity(item),
          module: "warehouse",
          priority: "Yüksək",
        }),
      );
  }

  if (rule.id === "RULE-PO-APPROVAL") {
    return (purchaseOrders || [])
      .filter((po) => normalize(po.status).includes("gözl"))
      .map((po) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${po.id}`,
          entityId: po.id,
          recipient: po.vendor || "Satınalma",
          target: po.vendor || "procurement",
          poId: po.id,
          amount: po.amount,
          module: "vendors",
          priority: Number(po.amount || 0) >= 5000 ? "Yüksək" : "Orta",
        }),
      );
  }

  if (rule.id === "RULE-PAYROLL") {
    return expenses
      .filter((expense) => expense.source === "HR Payroll" && normalize(expense.status).includes("gözl"))
      .map((expense) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${expense.id}`,
          entityId: expense.id,
          recipient: "HR/Maliyyə",
          target: "finance-team",
          amount: expense.amount,
          module: "finance",
          priority: "Orta",
        }),
      );
  }

  if (rule.id === "RULE-DELIVERY-SLA") {
    return orders
      .filter((order) => order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 5)
      .map((order) =>
        buildNotificationEvent(rule, {
          id: `${rule.id}-${order.id}`,
          entityId: order.id,
          recipient: order.customer || "Təhvil komandası",
          target: order.fin || order.customer,
          orderId: order.id,
          module: "deliveries",
          priority: "Yüksək",
        }),
      );
  }

  return [];
}

interface AutomationInput extends NotificationSources {
  notificationRules?: NotificationRule[];
  providers?: NotificationProvider[];
  settings?: NotificationSettings;
  sendLog?: NotificationLogEntry[];
}

function buildNotificationAutomationRows({
  notificationRules,
  providers = [],
  settings = {},
  sendLog = [],
  credits = [],
  stock,
  warehouseStock = {},
  products = [],
  purchaseOrders,
  expenses = [],
  orders = [],
}: AutomationInput) {
  const providerRows = buildNotificationProviderRows(providers, settings, sendLog);
  const providerById = new Map(providerRows.map((provider) => [provider.id, provider]));
  const productsByName = buildProductLookup(products);
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const dueSoonCredits = credits.filter((credit) => {
    const paymentState = getCreditPaymentState(credit, getCreditDisplayPlan(credit));
    const leadDays = getCreditPaymentLeadDays(paymentState);
    return Number(leadDays || 0) >= 1 && Number(leadDays || 0) <= 3;
  });
  const stockSource = [...(stock || []), ...flattenWarehouseStock(warehouseStock || {})];
  const lowStock = stockSource.filter((item) => isLowStockItem(item, productsByName));
  const pendingPo = (purchaseOrders || []).filter((po) => po.status === "Təsdiq gözləyir");
  const pendingPayroll = expenses.filter((expense) => expense.source === "HR Payroll" && expense.status === "Təsdiq gözləyir");
  const lateDeliveries = orders.filter((order) => order.status !== "Təhvil verilib" && getDeliveryAgeDays(order) >= 5);
  const now = new Date();

  const queueByRule: Record<string, { count: number; event: unknown }> = {
    "RULE-CREDIT-OVERDUE": {
      count: overdueCredits.length,
      event: overdueCredits[0]?.customer || "Gecikmə yoxdur",
    },
    "RULE-CREDIT-UPCOMING": {
      count: dueSoonCredits.length,
      event: dueSoonCredits[0]?.customer || "Yaxınlaşan ödəniş yoxdur",
    },
    "RULE-LOW-STOCK": {
      count: lowStock.length,
      event: lowStock[0]?.product || "Stok normaldır",
    },
    "RULE-PO-APPROVAL": {
      count: pendingPo.length,
      event: pendingPo[0]?.id || "PO növbəsi boşdur",
    },
    "RULE-PAYROLL": {
      count: pendingPayroll.length,
      event: pendingPayroll[0] ? money(pendingPayroll[0].amount) : "Payroll təsdiqdə deyil",
    },
    "RULE-DELIVERY-SLA": {
      count: lateDeliveries.length,
      event: lateDeliveries[0]?.id || "Təhvil SLA riski yoxdur",
    },
  };

  return ensureNotificationRules(notificationRules).map((rule) => {
    const queued = queueByRule[text(rule.id)];
    const allEvents = buildNotificationRuleEvents(rule, { credits, stock, warehouseStock, products, purchaseOrders, expenses, orders });
    const { ready: events, held: cooldownEvents } = splitNotificationEventsByCooldown(rule, allEvents, sendLog, now);
    const provider = providerById.get(rule.providerId) || providerRows.find((item) => item.channel === rule.channel);
    const channelEnabled = getNotificationChannelEnabled(rule.channel, settings);
    const lastLog = sendLog.find((log) => log.ruleId === rule.id);
    const queueCount = events.length;
    const totalEventCount = allEvents.length || queued?.count || 0;

    return {
      ...rule,
      provider,
      providerName: provider?.name || "Provider seçilməyib",
      queueCount,
      totalEventCount,
      cooldownCount: cooldownEvents.length,
      events,
      cooldownEvents,
      lastEvent: events[0]?.recipient || cooldownEvents[0]?.recipient || queued?.event || "Siqnal yoxdur",
      lastRunAt: lastLog?.sentAt || rule.lastRunAt || "",
      sentCount: Number(rule.sentCount || 0),
      health:
        rule.status !== "Aktiv"
          ? rule.status
          : !channelEnabled
            ? "Kanal bağlıdır"
            : !provider || provider.status !== "Aktiv"
              ? "Provider hazır deyil"
              : queueCount > 0
                ? "Göndəriş hazırdır"
                : cooldownEvents.length > 0
                  ? "Cooldown-da saxlanıb"
                : "Növbə boşdur",
    };
  });
}

interface SendLogInput {
  rule?: NotificationRule;
  event?: NotificationEvent;
  provider?: NotificationProvider;
  stamp?: string;
  status?: string;
  source?: string;
}

function createNotificationSendLogEntry({ rule = {}, event = {}, provider = {}, stamp, status = "Göndərildi", source = "Avtomatik" }: SendLogInput) {
  const channel = rule.channel || provider.channel || event.channel || "Push";
  const sentAtIso = new Date().toISOString();
  return {
    id: `NTF-${Date.now()}-${String(Math.random()).slice(2, 6)}`,
    ruleId: rule.id || "MANUAL",
    ruleName: rule.name || "Manual göndəriş",
    dedupeKey: event.dedupeKey || getNotificationEventKey(rule, event),
    providerId: provider.id || rule.providerId || "",
    providerName: provider.name || "Provider seçilməyib",
    channel,
    source,
    recipient: event.recipient || event.target || "Daxili komanda",
    target: event.target || event.recipient || "internal",
    entityId: event.entityId || "",
    module: event.module || "notifications",
    subject: event.subject || rule.name || "Bildiriş",
    body: event.body || rule.template || "",
    amount: Number(event.amount || 0),
    dueDate: event.dueDate || "",
    context: event.context || "",
    actionTarget: event.actionTarget || "",
    priority: event.priority || "Orta",
    status,
    sentAt: stamp || new Date().toLocaleString("az-AZ"),
    sentAtIso,
  };
}

interface DeliveriesInput {
  rules?: NotificationRule[];
  providerRows?: NotificationProvider[];
  settings?: NotificationSettings;
  stamp?: string;
  source?: string;
}

function buildNotificationDeliveriesForRules({ rules = [], providerRows = [], settings = {}, stamp, source = "Avtomatik qayda" }: DeliveriesInput) {
  return rules.flatMap((rule) => {
    const provider: NotificationProvider =
      providerRows.find((item) => item.id === rule.providerId) ||
      providerRows.find((item) => item.channel === rule.channel) ||
      {};
    const channelEnabled = getNotificationChannelEnabled(rule.channel, settings);
    const status = !channelEnabled || provider.status !== "Aktiv" ? "Bloklandı" : "Göndərildi";

    return (rule.events || []).map((event) =>
      createNotificationSendLogEntry({
        rule,
        event,
        provider,
        stamp,
        status,
        source,
      }),
    );
  });
}

export {
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
};
