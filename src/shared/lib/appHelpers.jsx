import {
  CalendarClock, CreditCard, FileText, Package, Truck, Wallet, X,
} from "lucide-react";
import { money, normalize } from "../../services/format.js";
import { defaultDbProvider } from "../../services/persistence.js";
import { total } from "../utils/aggregate.js";
import { baseFinanceDate, buildHrEmployeeRecords, buildInvoiceControlSummary, currentBusinessDate, getEmployeeKey, getInvoiceAgingBucket, buildProductLookup, buildSalesBonusRows, getCustomerContracts, getCustomerOrders, getCustomerRelatedCredits, getReorderPoint, isPurchaseOrderOpen, ensureSettings, getAvailableQuantity, hasExpenseCashImpact, isLowStockItem, targetDbProvider } from "./appDomain.jsx";
import { enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryRisk, getDeliveryStockCheck, getOrderBalance, getOrderPaymentMethod, isDeliveryQueueOrder, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import {
  getCreditDisplayPlan,
  getCreditPaymentState, isCreditClosed,
} from "./credit.js";
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

export const deploymentToolkitReady = true;

function buildTodayActionRows({ credits, orders, expenses, stock, products = [], invoices, taxRows }) {
  const creditActions = credits
    .map((credit) => {
      const plan = getCreditDisplayPlan(credit);
      return { credit, paymentState: getCreditPaymentState(credit, plan), plan };
    })
    .filter((item) => item.paymentState.isOverdue || item.paymentState.isDueToday)
    .map((item) => ({
      id: `ACT-${item.credit.id}`,
      module: "credits",
      title: item.paymentState.isOverdue ? "Gecikən kredit" : "Bu gün kredit ödənişi",
      detail: `${item.credit.customer} · ${item.credit.contractId || item.credit.id}`,
      amount: Number(item.paymentState.nextInstallment?.amount || item.plan.monthly || 0),
      priority: item.paymentState.isOverdue ? "Yüksək" : "Orta",
      status: item.paymentState.isOverdue ? `${item.paymentState.daysOverdue} gün gecikib` : "Bu gün",
      icon: CreditCard,
    }));

  const deliveryActions = orders
    .filter((order) => order.status !== "Təhvil verilib" && getDeliveryRisk(enrichDeliveryOrder(order)) !== "Normal")
    .slice(0, 5)
    .map((order) => ({
      id: `ACT-${order.id}`,
      module: "deliveries",
      title: "Təhvil nəzarəti",
      detail: `${order.id} · ${order.customer} · ${summarizeOrderProducts(order)}`,
      amount: getOrderBalance(order),
      priority: getDeliveryAgeDays(order) >= 5 ? "Yüksək" : "Orta",
      status: getDeliveryRisk(order),
      icon: Truck,
    }));

  const expenseActions = expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir")
    .map((expense) => ({
      id: `ACT-${expense.id}`,
      module: "finance",
      title: "Xərc təsdiqi",
      detail: `${expense.description} · ${expense.category}`,
      amount: Number(expense.amount || 0),
      priority: Number(expense.amount || 0) >= 5000 ? "Yüksək" : "Orta",
      status: expense.status,
      icon: Wallet,
    }));

  const productsByName = buildProductLookup(products);
  const stockActions = stock
    .filter((item) => isLowStockItem(item, productsByName))
    .map((item) => ({
      id: `ACT-STOCK-${item.product}`,
      module: "warehouse",
      title: "Aşağı stok",
      detail: `${item.product} · satış üçün ${getAvailableQuantity(item)} ədəd`,
      amount: getAvailableQuantity(item) * Number(item.price || 0),
      priority: getAvailableQuantity(item) <= 3 ? "Yüksək" : "Orta",
      status: "PO/transfer lazımdır",
      icon: Package,
    }));

  const invoiceActions = invoices
    .filter((invoice) => invoice.balance > 0)
    .slice(0, 4)
    .map((invoice) => ({
      id: `ACT-${invoice.id}`,
      module: "invoices",
      title: "Açıq faktura",
      detail: `${invoice.id} · ${invoice.customer}`,
      amount: Number(invoice.balance || 0),
      priority: invoice.status === "Ödəniş gözləyir" ? "Orta" : "Aşağı",
      status: invoice.status,
      icon: FileText,
    }));

  const taxActions = taxRows
    .filter((row) => row.status === "Bu gün" || row.status === "Gecikib" || row.status === "Yaxınlaşır")
    .map((row) => ({
      id: `ACT-${row.id}`,
      module: "tax",
      title: "Vergi öhdəliyi",
      detail: `${row.title} · ${row.period}`,
      amount: Number(row.amount || 0),
      priority: row.status === "Gecikib" || row.status === "Bu gün" ? "Yüksək" : "Orta",
      status: row.status,
      icon: CalendarClock,
    }));

  const priorityOrder = { "Yüksək": 0, Orta: 1, "Aşağı": 2 };
  return [...creditActions, ...taxActions, ...deliveryActions, ...expenseActions, ...stockActions, ...invoiceActions]
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 12);
}

function buildExecutiveInsights({ orders, credits, vendors, employees }) {
  const creditRows = credits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
  });
  const overdueCount = creditRows.filter((item) => item.paymentState.isOverdue).length;
  const topSeller = [...employees].sort((a, b) => Number(b.kpi || 0) - Number(a.kpi || 0))[0];
  const vendorAtRisk = vendors.filter((vendor) => normalize(vendor.status).includes("risk") || normalize(vendor.status).includes("aşağı"));
  const openDelivery = orders.filter((order) => order.status !== "Təhvil verilib").length;

  return [
    {
      title: "Kredit portfeli",
      value: `${overdueCount} risk`,
      desc: overdueCount > 0 ? "Gecikən müştərilər üzrə kollektor növbəsi yaradın" : "Gecikmə siqnalı yoxdur",
      tone: overdueCount > 0 ? "danger" : "success",
    },
    {
      title: "Təhvil yükü",
      value: `${openDelivery} sifariş`,
      desc: "Anbar çıxışı və sürücü planı ilə izlənir",
      tone: openDelivery > 4 ? "warning" : "info",
    },
    {
      title: "Vendor riski",
      value: vendorAtRisk.length,
      desc: "Kvota və təchizat üzrə zəif vendorlar",
      tone: vendorAtRisk.length > 0 ? "warning" : "success",
    },
    {
      title: "HR/KPI",
      value: topSeller?.name || "Yoxdur",
      desc: topSeller ? `${topSeller.kpi}% KPI ilə lider` : "KPI datası yoxdur",
      tone: "primary",
    },
  ];
}

function buildReportModuleRows({
  orders = [],
  credits = [],
  vendors = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  invoices = [],
  cashEntries = [],
}) {
  const creditRows = credits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
  });
  const stockRows = flattenWarehouseStock(warehouseStock);
  const productsByName = buildProductLookup(products);
  const lowStockRows = stockRows.filter((item) => isLowStockItem(item, productsByName));
  const openDeliveries = orders.filter((order) => order.status !== "Təhvil verilib");
  const openPos = (purchaseOrders || []).filter(isPurchaseOrderOpen);
  const pendingExpenses = expenses.filter((expense) => expense.status === "Təsdiq gözləyir");
  const approvedExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi");
  const invoiceControl = buildInvoiceControlSummary(invoices);
  const creditBalance = creditRows.reduce((sum, row) => sum + Number(row.plan.balance || 0), 0);
  const overdueCredits = creditRows.filter((row) => row.paymentState.isOverdue);
  const totalStock = stockRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const availableStock = stockRows.reduce((sum, item) => sum + getAvailableQuantity(item), 0);
  const approvedPoAmount = (purchaseOrders || [])
    .filter((po) => po.status === "Təsdiq edildi")
    .reduce((sum, po) => sum + Number(po.amount || 0), 0);
  const payrollRows = buildHrEmployeeRecords(employees);
  const payrollCost = payrollRows.reduce((sum, employee) => sum + Number(employee.employerCost || 0), 0);
  const documentGaps = employees.filter((employee) => employee.documentReviewRequired || Number(employee.documentsComplete || 100) < 100);
  const cashInflow = cashEntries
    .filter((entry) => entry.direction === "in" || normalize(entry.type) === "mədaxil")
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return [
    {
      module: "Satış",
      metric: money(total(orders, "amount")),
      count: `${orders.length} sifariş`,
      signal: openDeliveries.length > 0 ? `${openDeliveries.length} təhvil gözləyir` : "Bağlı axın",
      status: openDeliveries.length > 5 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Kredit",
      metric: money(creditBalance),
      count: `${creditRows.length} müqavilə`,
      signal: overdueCredits.length > 0 ? `${overdueCredits.length} gecikmə` : "Gecikmə yoxdur",
      status: overdueCredits.length > 0 ? "Risk" : "Hazır",
    },
    {
      module: "Anbar",
      metric: `${availableStock}/${totalStock}`,
      count: `${products.length} SKU`,
      signal: lowStockRows.length > 0 ? `${lowStockRows.length} minimum qalıq` : "Stok sağlam",
      status: lowStockRows.length > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Vendor / PO",
      metric: money(approvedPoAmount),
      count: `${(purchaseOrders || []).length} PO`,
      signal: openPos.length > 0 ? `${openPos.length} təsdiqdə` : `${vendors.length} vendor aktiv`,
      status: openPos.length > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Maliyyə",
      metric: money(cashInflow),
      count: `${expenses.length} xərc`,
      signal: pendingExpenses.length > 0 ? `${pendingExpenses.length} xərc təsdiqdə` : `${money(total(approvedExpenses, "amount"))} təsdiqli xərc`,
      status: pendingExpenses.length > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "Faktura",
      metric: money(invoiceControl.openBalance),
      count: `${invoices.length} faktura`,
      signal: invoiceControl.overdueCount > 0 ? `${invoiceControl.overdueCount} gecikmiş faktura` : `${invoiceControl.ready} e-qaimə hazır`,
      status: invoiceControl.overdueCount > 0 || invoiceControl.openBalance > 0 ? "Nəzarət" : "Hazır",
    },
    {
      module: "HR",
      metric: money(payrollCost),
      count: `${employees.length} əməkdaş`,
      signal: documentGaps.length > 0 ? `${documentGaps.length} sənəd açığı` : "Payroll hazır",
      status: documentGaps.length > 0 ? "Nəzarət" : "Hazır",
    },
  ];
}

function buildReportRiskRows({
  orders = [],
  credits = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  invoices = [],
}) {
  const riskRows = [];
  const stockRows = flattenWarehouseStock(warehouseStock);
  const productsByName = buildProductLookup(products);

  credits.forEach((credit) => {
    const plan = getCreditDisplayPlan(credit);
    const paymentState = getCreditPaymentState(credit, plan);
    if (!paymentState.isOverdue && !paymentState.isDueToday) return;
    riskRows.push({
      id: credit.id,
      area: "Kredit",
      title: credit.customer,
      amount: Number(paymentState.nextInstallment?.amount || plan.monthly || 0),
      owner: credit.contractId || credit.orderId || "Kredit",
      action: paymentState.isOverdue ? `${paymentState.daysOverdue} gün gecikib` : "Bu gün ödəniş",
      priority: paymentState.isOverdue ? "Yüksək" : "Orta",
      status: paymentState.isOverdue ? "Gecikmə" : "Bu gün",
    });
  });

  orders
    .filter((order) => order.status !== "Təhvil verilib")
    .slice(0, 8)
    .forEach((order) => {
      riskRows.push({
        id: order.id,
        area: "Satış/Təhvil",
        title: order.customer,
        amount: getOrderBalance(order),
        owner: order.warehouseName || order.seller || "Anbar",
        action: summarizeOrderProducts(order),
        priority: "Orta",
        status: "Təhvil gözləyir",
      });
    });

  stockRows
    .filter((item) => isLowStockItem(item, productsByName))
    .slice(0, 10)
    .forEach((item) => {
      const reorderPoint = getReorderPoint(item, productsByName);
      riskRows.push({
        id: `${item.warehouseId}-${item.product}`,
        area: "Anbar",
        title: item.product,
        amount: getAvailableQuantity(item) * Number(item.price || 0),
        owner: item.warehouseName || item.warehouseId || "Anbar",
        action: `${getAvailableQuantity(item)} qalıq / min ${reorderPoint}`,
        priority: getAvailableQuantity(item) === 0 ? "Yüksək" : "Orta",
        status: "Minimum qalıq",
      });
    });

  (purchaseOrders || [])
    .filter(isPurchaseOrderOpen)
    .slice(0, 8)
    .forEach((po) => {
      riskRows.push({
        id: po.id,
        area: "Vendor / PO",
        title: po.product,
        amount: Number(po.amount || 0),
        owner: po.vendor,
        action: `${po.qty || 0} ədəd sifariş`,
        priority: po.status === "Təsdiq gözləyir" ? "Orta" : "Aşağı",
        status: po.status || "Açıq PO",
      });
    });

  expenses
    .filter((expense) => expense.status === "Təsdiq gözləyir")
    .slice(0, 8)
    .forEach((expense) => {
      riskRows.push({
        id: expense.id,
        area: "Maliyyə",
        title: expense.description,
        amount: Number(expense.amount || 0),
        owner: expense.category,
        action: expense.cashImpact === false ? "Cash təsiri yoxdur" : "Təsdiq lazımdır",
        priority: Number(expense.amount || 0) >= 5000 ? "Yüksək" : "Orta",
        status: expense.status,
      });
    });

  invoices
    .filter((invoice) => Number(invoice.balance || 0) > 0)
    .slice(0, 8)
    .forEach((invoice) => {
      const bucket = getInvoiceAgingBucket(invoice);
      riskRows.push({
        id: invoice.id,
        area: "Faktura",
        title: invoice.customer,
        amount: Number(invoice.balance || 0),
        owner: invoice.orderId,
        action: bucket,
        priority: bucket.includes("30+") || bucket.includes("8-30") ? "Yüksək" : "Orta",
        status: invoice.status,
      });
    });

  employees
    .filter((employee) => employee.documentReviewRequired || Number(employee.documentsComplete || 100) < 100)
    .slice(0, 8)
    .forEach((employee) => {
      riskRows.push({
        id: getEmployeeKey(employee),
        area: "HR",
        title: employee.name,
        amount: Number(employee.salary || 0),
        owner: employee.department,
        action: `${Number(employee.documentsComplete || 0)}% sənəd`,
        priority: Number(employee.documentsComplete || 0) < 70 ? "Yüksək" : "Orta",
        status: employee.payrollStatus || employee.hrStatus || "Sənəd gözləyir",
      });
    });

  const priorityOrder = { "Yüksək": 0, Orta: 1, "Aşağı": 2 };
  return riskRows.sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) ||
      Number(b.amount || 0) - Number(a.amount || 0),
  );
}

function buildReportPackage({
  orders = [],
  credits = [],
  vendors = [],
  employees = [],
  expenses = [],
  warehouseStock = {},
  products = [],
  purchaseOrders = [],
  productionPlans = [],
  invoices = [],
  cashEntries = [],
}) {
  const moduleRows = buildReportModuleRows({
    orders,
    credits,
    vendors,
    employees,
    expenses,
    warehouseStock,
    products,
    purchaseOrders,
    invoices,
    cashEntries,
  });
  const riskRows = buildReportRiskRows({
    orders,
    credits,
    employees,
    expenses,
    warehouseStock,
    products,
    purchaseOrders,
    invoices,
  });
  const invoiceControl = buildInvoiceControlSummary(invoices);
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const criticalCount = riskRows.filter((row) => row.priority === "Yüksək").length;
  const warningCount = riskRows.filter((row) => row.priority === "Orta").length;
  const score = Math.max(0, Math.min(100, 100 - criticalCount * 12 - warningCount * 4));
  const rows =
    orders.length +
    credits.length +
    vendors.length +
    employees.length +
    expenses.length +
    products.length +
    (purchaseOrders || []).length +
    (productionPlans || []).length +
    invoices.length +
    cashEntries.length;

  return {
    period: currentBusinessDate.slice(0, 7),
    generatedAt: currentBusinessDate,
    rows,
    sections: moduleRows.length,
    score,
    riskCount: riskRows.length,
    criticalCount,
    revenue: total(orders, "amount"),
    creditBalance,
    invoiceBalance: invoiceControl.openBalance,
    moduleRows,
    riskRows,
    checklist: [
      { label: "Satış və kredit müqavilələri", status: credits.length > 0 || orders.length > 0 ? "Hazır" : "Məlumat yoxdur" },
      { label: "Anbar minimum qalıq siqnalları", status: moduleRows.find((row) => row.module === "Anbar")?.status || "Hazır" },
      { label: "Maliyyə təsdiq və faktura nəzarəti", status: invoiceControl.openBalance > 0 ? "Nəzarət" : "Hazır" },
      { label: "HR payroll və sənəd tamamlığı", status: moduleRows.find((row) => row.module === "HR")?.status || "Hazır" },
    ],
  };
}

function getDuplicateValues(rows = [], key, label) {
  const seen = new Set();
  const duplicates = new Set();

  rows.forEach((row) => {
    const value = row?.[key];
    if (!value) return;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });

  return [...duplicates].map((value) => ({
    id: `${label}-${value}`,
    severity: "Kritik",
    area: label,
    title: "Dublikat identifikator",
    detail: `${value} təkrar istifadə olunub`,
    fix: "ID/FIN unikal saxlanmalıdır",
  }));
}

function buildStateIntegrityReport(snapshot = {}, creditRows = []) {
  const issues = [];
  const orders = snapshot.orders || [];
  const customers = snapshot.customers || [];
  const warehouses = snapshot.warehouses || [];
  const purchaseOrders = snapshot.purchaseOrders || [];
  const contracts = snapshot.contracts || [];
  const stock = snapshot.stock || [];
  const warehouseStock = snapshot.warehouseStock || {};
  const credits = creditRows.length > 0 ? creditRows : snapshot.credits || [];
  const employees = snapshot.employees || [];
  const departments = snapshot.departments || [];
  const leaveRequests = snapshot.leaveRequests || [];
  const vacancies = snapshot.vacancies || [];
  const users = snapshot.settings?.users || [];
  const currentUser = getCurrentUser(snapshot.settings || {});

  issues.push(...getDuplicateValues(orders, "id", "Satış"));
  issues.push(...getDuplicateValues(customers, "fin", "CRM"));
  issues.push(...getDuplicateValues(warehouses, "id", "Anbar"));
  issues.push(...getDuplicateValues(purchaseOrders, "id", "PO"));
  issues.push(...getDuplicateValues(contracts, "id", "Müqavilə"));
  issues.push(...getDuplicateValues(credits, "id", "Kredit"));
  issues.push(...getDuplicateValues(departments, "name", "HR şöbə"));
  issues.push(...getDuplicateValues(leaveRequests, "id", "HR məzuniyyət"));
  issues.push(...getDuplicateValues(vacancies, "id", "HR vakansiya"));

  if (!currentUser) {
    issues.push({
      id: "AUTH-NO-SESSION",
      severity: "Kritik",
      area: "Auth",
      title: "Aktiv sessiya yoxdur",
      detail: "Permission yoxlaması üçün aktiv istifadəçi seçilməlidir",
      fix: "Ayarlar bölməsində aktiv istifadəçi ilə giriş edin",
    });
  }

  if (users.filter((user) => user.status === "Aktiv").length === 0) {
    issues.push({
      id: "AUTH-NO-ACTIVE-USER",
      severity: "Kritik",
      area: "Auth",
      title: "Aktiv istifadəçi yoxdur",
      detail: "Sistemə giriş üçün ən azı bir aktiv istifadəçi lazımdır",
      fix: "Super Admin istifadəçisini aktiv saxlayın",
    });
  }

  const stockGroups = [
    { label: "Ümumi stok", rows: stock },
    ...Object.entries(warehouseStock).map(([warehouseId, rows]) => ({
      label: `Anbar ${warehouseId}`,
      rows: rows || [],
    })),
  ];

  stockGroups.forEach((group) => {
    group.rows.forEach((item) => {
      const totalQty = Number(item.total || 0);
      const reservedQty = Number(item.reserved || 0);
      if (totalQty < 0 || reservedQty < 0) {
        issues.push({
          id: `STOCK-NEG-${group.label}-${item.product}`,
          severity: "Kritik",
          area: "Anbar",
          title: "Mənfi stok göstəricisi",
          detail: `${group.label}: ${item.product}`,
          fix: "Mədaxil/məxaric tarixçəsini yoxlayın",
        });
      }
      if (reservedQty > totalQty) {
        issues.push({
          id: `STOCK-RES-${group.label}-${item.product}`,
          severity: "Xəbərdarlıq",
          area: "Anbar",
          title: "Çatışmazlıq (backorder)",
          detail: `${group.label}: ${item.product} — rezerv ${reservedQty}, qalıq ${totalQty}, çatışmayan ${reservedQty - totalQty}`,
          fix: "Təchizatdan mədaxil edin və ya sifarişi bağlayın",
        });
      }
      if (Array.isArray(item.serials) && item.serials.length > 0) {
        const activeSerials = item.serials.filter((serial) => serial.status !== "Satılıb").length;
        if (activeSerials < totalQty) {
          issues.push({
            id: `SERIAL-MISS-${group.label}-${item.product}`,
            severity: "Xəbərdarlıq",
            area: "IMEI",
            title: "Serial sayı stokdan azdır",
            detail: `${group.label}: ${item.product} üçün aktiv serial ${activeSerials}, stok ${totalQty}`,
            fix: "IMEI/serial reyestrini tamamlayın",
          });
        }
      }
    });
  });

  const creditIds = new Set(credits.map((credit) => credit.orderId || credit.id));
  orders.forEach((order) => {
    const amount = Number(order.amount || 0);
    const paid = Number(order.paid || 0);
    if (paid > amount) {
      issues.push({
        id: `ORDER-OVERPAID-${order.id}`,
        severity: "Xəbərdarlıq",
        area: "Satış",
        title: "Ödəniş sifariş məbləğini keçir",
        detail: `${order.id}: ödənilib ${money(paid)}, məbləğ ${money(amount)}`,
        fix: "Artıq ödənişi kredit və ya avans kimi ayırın",
      });
    }
    if (order.paymentMethod === "Kredit" && !creditIds.has(order.id) && !creditIds.has(order.creditId)) {
      issues.push({
        id: `ORDER-CREDIT-MISS-${order.id}`,
        severity: "Kritik",
        area: "Satış/Kredit",
        title: "Kredit satışı kredit portfelində yoxdur",
        detail: `${order.id}: ${order.customer}`,
        fix: "Satışdan kredit datasını yenidən sinxronlaşdırın",
      });
    }
  });

  credits.forEach((credit) => {
    const plan = getCreditDisplayPlan(credit);
    if (Number(plan.balance || 0) < 0 || Number(plan.balance || 0) > Number(plan.total || 0)) {
      issues.push({
        id: `CREDIT-BAL-${credit.id}`,
        severity: "Kritik",
        area: "Kredit",
        title: "Kredit balansı uyğunsuzdur",
        detail: `${credit.id}: balans ${money(plan.balance)} / total ${money(plan.total)}`,
        fix: "Ödəniş tarixçəsini və əsas məbləğ silinməsini yoxlayın",
      });
    }
    if (!isCreditClosed(credit, plan) && !getCreditPaymentState(credit, plan).nextInstallment) {
      issues.push({
        id: `CREDIT-NEXT-${credit.id}`,
        severity: "Xəbərdarlıq",
        area: "Kredit",
        title: "Növbəti ödəniş tarixi yoxdur",
        detail: `${credit.id}: ${credit.customer}`,
        fix: "Ödəniş cədvəlini yeniləyin",
      });
    }
  });

  const employeeKeys = new Set(employees.map((employee) => getEmployeeKey(employee)));
  const employeeNames = new Set(employees.map((employee) => employee.name));
  employees.forEach((employee) => {
    const employeeKey = getEmployeeKey(employee);
    if (employee.managerId === employeeKey || employee.managerName === employee.name) {
      issues.push({
        id: `HR-SELF-MANAGER-${employeeKey}`,
        severity: "Kritik",
        area: "HR",
        title: "Əməkdaş özü-özünə tabedir",
        detail: `${employee.name} üçün rəhbər əlaqəsi özünə işarə edir`,
        fix: "Əməkdaş kartında birbaşa rəhbərlik və ya düzgün rəhbər seçin",
      });
    } else if (employee.managerId && !employeeKeys.has(employee.managerId)) {
      issues.push({
        id: `HR-MANAGER-MISSING-${employeeKey}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Rəhbər qeydi tapılmadı",
        detail: `${employee.name}: ${employee.managerId}`,
        fix: "Əməkdaş kartında tabeçilik əlaqəsini yeniləyin",
      });
    } else if (!employee.managerId && employee.managerName && !employeeNames.has(employee.managerName)) {
      issues.push({
        id: `HR-MANAGER-NAME-MISSING-${employeeKey}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Rəhbər adı reyestrdə yoxdur",
        detail: `${employee.name}: ${employee.managerName}`,
        fix: "Rəhbəri siyahıdan yenidən seçin",
      });
    }
  });

  const departmentNames = new Set([
    ...departments.map((department) => department.name),
    ...employees.map((employee) => employee.department),
  ].filter(Boolean));
  departments.forEach((department) => {
    if (department.parentDepartment === department.name) {
      issues.push({
        id: `HR-DEPARTMENT-SELF-${department.name}`,
        severity: "Kritik",
        area: "HR",
        title: "Şöbə özü-özünün üst şöbəsidir",
        detail: department.name,
        fix: "Şöbə kartındakı üst şöbə dəyərini dəyişin",
      });
    } else if (department.parentDepartment && !departmentNames.has(department.parentDepartment)) {
      issues.push({
        id: `HR-DEPARTMENT-PARENT-MISSING-${department.name}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Üst şöbə tapılmadı",
        detail: `${department.name}: ${department.parentDepartment}`,
        fix: "Şöbə strukturunu yeniləyin və ya üst şöbəni yaradın",
      });
    }
  });

  leaveRequests.forEach((request) => {
    const start = new Date(request.from || "");
    const end = new Date(request.to || "");
    const employeeFound = request.employeeId ? employeeKeys.has(request.employeeId) : employeeNames.has(request.employeeName);
    if (!employeeFound) {
      issues.push({
        id: `HR-LEAVE-EMPLOYEE-MISSING-${request.id}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Məzuniyyət əməkdaşı tapılmadı",
        detail: request.employeeName || request.employeeId || request.id,
        fix: "Məzuniyyət qeydini aktiv əməkdaşla bağlayın",
      });
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start || Number(request.days || 0) <= 0) {
      issues.push({
        id: `HR-LEAVE-DATE-${request.id}`,
        severity: "Xəbərdarlıq",
        area: "HR",
        title: "Məzuniyyət tarixi uyğunsuzdur",
        detail: `${request.employeeName || request.id}: ${request.from || "—"} - ${request.to || "—"}`,
        fix: "Başlanğıc, bitiş və gün sayını yeniləyin",
      });
    }
  });

  const critical = issues.filter((issue) => issue.severity === "Kritik").length;
  const warnings = issues.filter((issue) => issue.severity !== "Kritik").length;
  const score = Math.max(0, Math.round(100 - critical * 18 - warnings * 6));

  return {
    checkedAt: new Date().toISOString(),
    score,
    status: critical > 0 ? "Risk" : warnings > 0 ? "Nəzarət" : "Sağlam",
    critical,
    warnings,
    issueCount: issues.length,
    issues,
  };
}

function buildGoLiveReadiness(snapshot = {}, integrityReport = {}) {
  const settings = ensureSettings(snapshot.settings || {});
  const dbMeta = snapshot.dbMeta || {};
  const auditLog = snapshot.auditLog || [];
  const roles = settings.roles || [];
  const users = settings.users || [];
  const hasActiveAdmin = users.some((user) => user.status === "Aktiv" && user.role === "Super Admin");
  const hasBackupPermission = roles.some(
    (role) => role.name === "Super Admin" && (role.permissions || []).includes("system.backup"),
  );
  const hasBackupTrace = Boolean(dbMeta.lastBackupAt || dbMeta.lastRestoreAt);
  const hasCriticalBusinessData =
    (snapshot.orders || []).length > 0 &&
    (snapshot.warehouses || []).length > 0 &&
    (snapshot.employees || []).length > 0 &&
    (snapshot.customers || []).length > 0;
  const isServerRuntime = dbMeta.runtime === "server";
  const isExternalDb = isServerRuntime && !normalize(dbMeta.provider || "").includes("local persistent");
  const integrityClear = Number(integrityReport.critical || 0) === 0;

  const items = [
    {
      area: "Backend DB",
      requirement: "PostgreSQL/Supabase kimi real server DB",
      status: isExternalDb ? "Hazır" : "Bloker",
      risk: "Yüksək",
      next: isExternalDb
        ? "Connection monitor aktiv saxlanılsın"
        : `Brauzer local adapteri ${targetDbProvider} backend adapteri ilə əvəz edilməlidir`,
    },
    {
      area: "Auth/RBAC",
      requirement: "Aktiv admin, rol və kritik permission xəritəsi",
      status: hasActiveAdmin && hasBackupPermission ? "Hazır" : "Bloker",
      risk: hasActiveAdmin ? "Orta" : "Yüksək",
      next: hasActiveAdmin ? "Server-side token yoxlaması əlavə olunmalıdır" : "Super Admin istifadəçisi aktiv edilməlidir",
    },
    {
      area: "Data integrity",
      requirement: "Stok, kredit, satış və audit bütövlüyü",
      status: integrityClear ? "Hazır" : "Bloker",
      risk: integrityClear ? "Aşağı" : "Yüksək",
      next: integrityClear ? "Planlı günlük yoxlama saxlanılsın" : "Integrity panelində kritik siqnallar bağlanmalıdır",
    },
    {
      area: "Backup/Restore",
      requirement: "Export/import və bərpa izi",
      status: hasBackupTrace ? "Hazır" : "Nəzarət",
      risk: hasBackupTrace ? "Aşağı" : "Orta",
      next: hasBackupTrace ? "Avtomatik backup qrafiki qurulsun" : "İlk backup export/import yoxlaması aparılsın",
    },
    {
      area: "Audit",
      requirement: "Əməliyyatların audit log-a düşməsi",
      status: auditLog.length >= 5 ? "Hazır" : "Nəzarət",
      risk: auditLog.length >= 5 ? "Aşağı" : "Orta",
      next: auditLog.length >= 5 ? "Audit log serverdə immutable saxlanmalıdır" : "Kritik əməliyyatlar üzrə audit nümunələri yaradılmalıdır",
    },
    {
      area: "Biznes axınları",
      requirement: "Satış, kredit, anbar, təhvil, maliyyə, HR data zənciri",
      status: hasCriticalBusinessData ? "Hazır" : "Bloker",
      risk: hasCriticalBusinessData ? "Aşağı" : "Yüksək",
      next: hasCriticalBusinessData ? "UAT ssenariləri imzalanmalıdır" : "Əsas modullara başlanğıc data əlavə olunmalıdır",
    },
    {
      area: "Monitoring",
      requirement: "Error, uptime, webhook və backup monitorinqi",
      status: "Nəzarət",
      risk: "Orta",
      next: "Production hostda error logging və uptime monitor qurulmalıdır",
    },
    {
      area: "Deployment",
      requirement: "Docker/nginx/env/smoke test faylları",
      status: deploymentToolkitReady ? "Hazır" : "Hazırlanır",
      risk: deploymentToolkitReady ? "Aşağı" : "Orta",
      next: deploymentToolkitReady
        ? "Staging serverdə npm run smoke nəticəsi saxlanılsın"
        : "Build artefaktı staging-də smoke testdən keçirilməlidir",
    },
  ];
  const blockers = items.filter((item) => item.status === "Bloker").length;
  const watch = items.filter((item) => item.status === "Nəzarət" || item.status === "Hazırlanır").length;
  const ready = items.filter((item) => item.status === "Hazır").length;
  const score = Math.max(0, Math.round((ready / items.length) * 100 - blockers * 8));

  return {
    checkedAt: new Date().toISOString(),
    status: blockers > 0 ? "Bloker var" : watch > 0 ? "Staging hazırdır" : "Go-live hazır",
    score,
    blockers,
    watch,
    ready,
    items,
  };
}

function buildProductionHardeningReport(snapshot = {}, { goLiveReport = {}, apiWebhookRows = [], apiSecretRows = [], notificationProviderRows = [], auditServerSynced = false } = {}) {
  const dbMeta = snapshot.dbMeta || {};
  const isServerRuntime = dbMeta.runtime === "server";
  const immutableAudit = normalize(dbMeta.auditMode || import.meta.env?.VITE_AUDIT_MODE || "").includes("immutable") || auditServerSynced;
  const backupReady = Boolean(dbMeta.lastBackupAt || dbMeta.lastRestoreAt || snapshot.productionHardeningSnapshot?.backupCheckedAt);
  const deploymentReady = Boolean(snapshot.goLiveSnapshot || goLiveReport.checkedAt || deploymentToolkitReady);
  const apiReady = apiWebhookRows.length > 0 && apiWebhookRows.some((row) => row.lastTestAt || row.health === "Test OK");
  const activeNotificationProviders = notificationProviderRows.filter((provider) => provider.status === "Aktiv" && provider.enabled !== false);
  const secretsHealthy = apiSecretRows.length > 0 && apiSecretRows.every((secret) => !normalize(secret.health).includes("tapılmadı"));

  const items = [
    {
      area: "Backend sərtləşdirmə",
      status: isServerRuntime && immutableAudit ? "Hazır" : "Nəzarət",
      score: isServerRuntime && immutableAudit ? 100 : immutableAudit ? 70 : 45,
      detail: `${dbMeta.provider || defaultDbProvider} · ${dbMeta.runtime || "browser"} · audit ${dbMeta.auditMode || "client audit"}`,
      next: isServerRuntime ? "Server-side permission və migration yoxlaması davamlı saxlanılsın" : "Frontend local cache əsas data mənbəyi olmamalıdır",
    },
    {
      area: "Backup/Restore",
      status: backupReady ? "Hazır" : "Nəzarət",
      score: backupReady ? 100 : 65,
      detail: dbMeta.lastBackupAt || dbMeta.lastRestoreAt || "Backup izi hələ yaradılmayıb",
      next: backupReady ? "Gündəlik avtomatik server snapshot planlaşdırılsın" : "İlk backup export/import və ya server snapshot yaradılmalıdır",
    },
    {
      area: "Deployment monitorinqi",
      status: deploymentReady && goLiveReport.score >= 70 ? "Hazır" : "Nəzarət",
      score: deploymentReady ? Math.max(70, Number(goLiveReport.score || 70)) : 55,
      detail: `Go-live ${goLiveReport.status || "yoxlanmayıb"} · deploy toolkit ${deploymentToolkitReady ? "hazır" : "yoxdur"}`,
      next: "Health endpoint, smoke test və deploy nəticəsi release checklist-də saxlanmalıdır",
    },
    {
      area: "Real provider inteqrasiyaları",
      status: apiReady && activeNotificationProviders.length >= 2 && secretsHealthy ? "Hazır" : "Nəzarət",
      score: apiReady && activeNotificationProviders.length >= 2 && secretsHealthy ? 95 : 68,
      detail: `${activeNotificationProviders.length} bildiriş provider · ${apiWebhookRows.length} webhook · ${apiSecretRows.length} secret`,
      next: "SMS/email/payment provider-lər backend secret-lərlə canlı mühitdə yoxlanmalıdır",
    },
    {
      area: "Kodun modullara parçalanması",
      status: "Nəzarət",
      score: 60,
      detail: "UI və biznes məntiqi hələ əsasən App qatındadır",
      next: "Satış, kredit, anbar, maliyyə, HR, KPI və API ayrıca route/module paketlərinə çıxarılmalıdır",
    },
  ];
  const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
  const blockers = items.filter((item) => item.status === "Bloker").length;
  const watch = items.filter((item) => item.status === "Nəzarət").length;

  return {
    checkedAt: new Date().toISOString(),
    status: blockers > 0 ? "Bloker var" : watch > 0 ? "Production nəzarəti" : "Production hazır",
    score,
    blockers,
    watch,
    ready: items.filter((item) => item.status === "Hazır").length,
    items,
  };
}

function buildModuleReadiness(snapshot = {}, integrityReport = {}) {
  const orders = snapshot.orders || [];
  const customers = snapshot.customers || [];
  const warehouses = snapshot.warehouses || [];
  const products = snapshot.products || [];
  const warehouseStock = snapshot.warehouseStock || {};
  const expenses = snapshot.expenses || [];
  const cashEntries = snapshot.cashEntries || [];
  const purchaseOrders = snapshot.purchaseOrders || [];
  const employees = snapshot.employees || [];
  const departments = snapshot.departments || [];
  const credits = buildAllCreditRecords(orders, snapshot.credits || []);
  const contracts = snapshot.contracts || [];
  const salesBonuses = buildSalesBonusRows(orders);
  const integrityIssues = integrityReport.issues || [];
  const hasCriticalIntegrity = Number(integrityReport.critical || 0) > 0;
  const deliveryOrders = orders.filter(isDeliveryQueueOrder);
  const blockedDeliveries = deliveryOrders.filter((order) => {
    const warehouseId = order.warehouseId || warehouses[0]?.id || "";
    return !getDeliveryStockCheck({ ...order, warehouseId }, warehouseStock).ok;
  });
  const allStockRows = Object.values(warehouseStock).flatMap((rows) => rows || []);
  const totalStock = allStockRows.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const reservedStock = allStockRows.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const lowStockRows = allStockRows.filter((item) => {
    const product = products.find((row) => normalize(row.name) === normalize(item.product));
    const reorderLevel = Number(item.reorderLevel ?? product?.reorderLevel ?? 0);
    return reorderLevel > 0 && getAvailableQuantity(item) <= reorderLevel;
  });
  const creditOrders = orders.filter((order) => getOrderPaymentMethod(order) === "Kredit");
  const salesLinkIssues = creditOrders.filter(
    (order) =>
      !credits.some((credit) => credit.orderId === order.id || credit.id === order.creditId) ||
      !contracts.some((contract) => contract.orderId === order.id || contract.id === order.contractId),
  );
  const customer360Rows = customers.filter(
    (customer) =>
      getCustomerOrders(customer, orders).length > 0 ||
      getCustomerRelatedCredits(customer, credits).length > 0 ||
      getCustomerContracts(customer, contracts).length > 0,
  );
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const unpaidCreditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const approvedCashExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense));
  const payrollExpense = expenses.find((expense) => expense.source === "HR Payroll");
  const openPurchaseOrders = purchaseOrders.filter((po) => !["Təsdiq edildi", "Ləğv edildi"].includes(po.status));
  const approvedPurchaseOrders = purchaseOrders.filter((po) => po.status === "Təsdiq edildi");
  const vendorNames = new Set((snapshot.vendors || []).map((vendor) => normalize(vendor.name)));
  const missingVendorPo = purchaseOrders.filter((po) => po.vendor && !vendorNames.has(normalize(po.vendor)));
  const employeesWithManagers = employees.filter((employee) => employee.managerId || employee.managerName);
  const hrIntegrityIssues = integrityIssues.filter((issue) => issue.area === "HR");

  const statusFrom = ({ blockers = 0, warnings = 0, hasData = true }) => {
    if (blockers > 0) return "Bloker";
    if (warnings > 0 || !hasData) return "Nəzarət";
    return "Hazır";
  };

  const items = [
    {
      module: "sales",
      title: "Satış",
      status: statusFrom({ blockers: salesLinkIssues.length, warnings: orders.length === 0 ? 1 : 0, hasData: orders.length > 0 }),
      primary: `${orders.length} sifariş`,
      secondary: `${creditOrders.length} kredit satış`,
      detail: "Sifariş, rezerv, bonus, kredit və müqavilə bağlantısı",
      next: salesLinkIssues.length
        ? "Kredit satışlarda müqavilə/kredit linklərini tamamlayın"
        : orders.length
          ? "UAT üçün real satış ssenarilərini işlədin"
          : "İlk satış sifarişini yaradın",
    },
    {
      module: "warehouse",
      title: "Anbar",
      status: statusFrom({ blockers: hasCriticalIntegrity ? 1 : 0, warnings: lowStockRows.length, hasData: warehouses.length > 0 && products.length > 0 }),
      primary: `${totalStock} ümumi stok`,
      secondary: `${reservedStock} rezerv`,
      detail: "Qalıq, minimum stok, mədaxil, import/export və PO örtüyü",
      next: lowStockRows.length
        ? "Minimumdan aşağı məhsullar üçün PO yaradın"
        : totalStock
          ? "Cycle count və export yoxlamasını saxlayın"
          : "Anbara ilk mədaxili edin",
    },
    {
      module: "deliveries",
      title: "Təhvil",
      status: statusFrom({ blockers: blockedDeliveries.length, warnings: deliveryOrders.length, hasData: true }),
      primary: `${deliveryOrders.length} gözləyir`,
      secondary: `${blockedDeliveries.length} bloklu`,
      detail: "Yalnız rezervli sifarişlər görünür, Təhvil verildi stokdan çıxır",
      next: blockedDeliveries.length
        ? "Bloklu təhvillərdə rezerv/stok uyğunsuzluğunu bağlayın"
        : deliveryOrders.length
          ? "Hazır sifarişləri Təhvil verildi ilə tamamlayın"
          : "Açıq təhvil növbəsi yoxdur",
    },
    {
      module: "credits",
      title: "Kredit",
      status: statusFrom({ blockers: salesLinkIssues.length, warnings: overdueCredits.length, hasData: credits.length > 0 }),
      primary: `${credits.length} müqavilə`,
      secondary: money(unpaidCreditBalance),
      detail: "Hər kredit satışı ayrıca müqavilə və ödəniş cədvəli kimi qalır",
      next: overdueCredits.length
        ? "Gecikən kreditlər üzrə ödəniş və xatırlatma işlədin"
        : credits.length
          ? "Aylıq ödəniş tarixlərini UAT-da yoxlayın"
          : "Kredit satış yaradın",
    },
    {
      module: "crm",
      title: "CRM 360",
      status: statusFrom({ warnings: customers.length > 0 && customer360Rows.length === 0 ? 1 : 0, hasData: customers.length > 0 }),
      primary: `${customers.length} müştəri`,
      secondary: `${customer360Rows.length} 360 kart`,
      detail: "Müştəri, müqavilə, cihaz, ödəniş və qalıq borc görünüşü",
      next: customers.length
        ? "Müştəri kartlarında kredit və satış tarixçəsini yoxlayın"
        : "İlk müştərini yaradın",
    },
    {
      module: "finance",
      title: "Maliyyə",
      status: statusFrom({ warnings: expenses.length + cashEntries.length === 0 ? 1 : 0, hasData: true }),
      primary: `${cashEntries.length} kassa girişi`,
      secondary: `${approvedCashExpenses.length} təsdiqli xərc`,
      detail: "Satış, kredit ödənişi, PO xərci və payroll accrual ayrılır",
      next: payrollExpense?.cashImpact === false
        ? "Kassa/bank hesabları üzrə real açılış balanslarını yoxlayın"
        : "HR payroll cash-neutral accrual kimi yaradılmalıdır",
    },
    {
      module: "vendors",
      title: "Vendor + PO",
      status: statusFrom({ blockers: missingVendorPo.length, warnings: openPurchaseOrders.length, hasData: (snapshot.vendors || []).length > 0 }),
      primary: `${purchaseOrders.length} PO`,
      secondary: `${approvedPurchaseOrders.length} təsdiqli`,
      detail: "Zavod sifarişi, təsdiq, anbara mədaxil və maliyyə xərci",
      next: missingVendorPo.length
        ? "Vendoru olmayan PO-ları vendor kartına bağlayın"
        : openPurchaseOrders.length
          ? "Açıq PO-ları təsdiqləyin və anbara mədaxil edin"
          : "Minimum stok siqnallarından yeni PO yaradın",
    },
    {
      module: "hr",
      title: "HR",
      status: statusFrom({ blockers: hrIntegrityIssues.filter((issue) => issue.severity === "Kritik").length, warnings: employees.length === 0 ? 1 : 0, hasData: employees.length > 0 }),
      primary: `${employees.length} əməkdaş`,
      secondary: `${departments.length} şöbə`,
      detail: "Struktur ağacı, əməkdaş CRUD, məzuniyyət, vakansiya və payroll",
      next: employeesWithManagers.length
        ? "Struktur ağacını periodik yeniləyin"
        : "Kim kimə tabedir məlumatını tamamlayın",
    },
    {
      module: "kpi",
      title: "KPI",
      status: statusFrom({ warnings: salesBonuses.length === 0 ? 1 : 0, hasData: employees.length > 0 }),
      primary: `${salesBonuses.length} bonus sətri`,
      secondary: `${employees.length} əməkdaş`,
      detail: "Satış bonusları KPI nəticələrinə ayrıca düşür",
      next: salesBonuses.length
        ? "Aylıq bonus filterlərini yoxlayın"
        : "Bonuslu satış yaradın",
    },
  ];

  const ready = items.filter((item) => item.status === "Hazır").length;
  const watch = items.filter((item) => item.status === "Nəzarət").length;
  const blockers = items.filter((item) => item.status === "Bloker").length;
  const score = Math.max(0, Math.round((ready / Math.max(items.length, 1)) * 100 - blockers * 10));

  return {
    checkedAt: new Date().toISOString(),
    status: blockers > 0 ? "Bloker var" : watch > 0 ? "Təhvil nəzarətdə" : "Təhvilə hazır",
    ready,
    watch,
    blockers,
    score,
    items,
  };
}

function buildPayrollExpense(employees) {
  const payrollRows = buildHrEmployeeRecords(employees);
  const netTotal = payrollRows.reduce((sum, employee) => sum + Number(employee.netSalary || 0), 0);
  const grossTotal = payrollRows.reduce((sum, employee) => sum + Number(employee.salary || 0) + Number(employee.bonus || 0), 0);
  const deductions = payrollRows.reduce((sum, employee) => sum + Number(employee.tax || 0) + Number(employee.social || 0), 0);
  const employerCost = payrollRows.reduce((sum, employee) => sum + Number(employee.employerCost || 0), 0);

  return {
    id: `PAY-${baseFinanceDate.slice(0, 7)}`,
    description: `HR payroll - ${baseFinanceDate.slice(0, 7)}`,
    category: "Payroll",
    date: baseFinanceDate,
    amount: employerCost || netTotal,
    status: "Təsdiq gözləyir",
    source: "HR Payroll",
    cashImpact: false,
    cashImpactNote: "HR payroll uçot/accrual xərcidir, real kassadan avtomatik çıxılmır.",
    grossTotal,
    deductions,
    netTotal,
    employerCost,
    payrollRows,
  };
}

export {
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


