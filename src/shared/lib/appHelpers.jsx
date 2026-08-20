import {
  CalendarClock, CreditCard, FileText, Package, Truck, Wallet, X,
} from "lucide-react";
import { initialState, navItems } from "../../data.js";
import { pageMeta } from "../../config/page-meta.js";
import { money, normalize } from "../../services/format.js";
import { formatDateInput, formatPaymentDate, parsePaymentDate } from "../../services/date.js";
import { navPermissionByType, pageActionPermissionByType, pageActionlessModules } from "../../services/permissions.js";
import { defaultDbProvider, localDbBaselineVersion, localDbKey, localDbSchemaVersion } from "../../services/persistence.js";
import { total } from "../utils/aggregate.js";
import {
  baseFinanceDate, buildHrEmployeeRecords, buildInvoiceControlSummary, calculatePayrollTax2026,
  currentBusinessDate, currentBusinessYear, enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryRisk,
  getDeliveryStockCheck, getEmployeeKey, getInvoiceAgingBucket, getOrderBalance, getOrderPaymentMethod,
  getSupportThreadId, isDeliveryQueueOrder, normalizeOrderProductLines, summarizeOrderProducts,
  baseCreditDate, buildProductLookup, buildSalesBonusRows, currentBusinessQuarter, getCreditOrder,
  getCustomerContracts, getCustomerOrders, getCustomerRelatedCredits, getReorderPoint, isPurchaseOrderOpen,
  ensureSettings, getActiveRole, getAvailableQuantity, getModuleForPermission, hasExpenseCashImpact,
  isLowStockItem, isSerialTrackedProduct, normalizeUserModuleAccess, targetDbProvider,
} from "./appDomain.jsx";
import {
  addDays, applyCreditPrincipalPayment, buildCreditPlan, daysBetween, getCreditDisplayPlan,
  getCreditPaymentState, isCreditClosed, roundMoney,
} from "./credit.js";

export const deploymentToolkitReady = true;

function getCreditIdForOrder(order) {
  return order.creditId || `KR-${String(order.id || "").replace(/\D/g, "")}`;
}

function buildSalesCreditRecord(order, storedCredit) {
  const totalAmount = Number(order.amount || storedCredit?.total || 0);
  const initialPayment = Number(order.initialPayment ?? order.paid ?? storedCredit?.initialPayment ?? 0);
  const months = Number(order.creditMonths || storedCredit?.months || 12);
  const basePlan = buildCreditPlan({ total: totalAmount, initialPayment, months });
  const productSummary = summarizeOrderProducts(order);
  const balance = Number(storedCredit?.balance ?? order.creditBalance ?? basePlan.balance);
  const paidMonths = Number(storedCredit?.paidMonths ?? (balance <= 0 ? months : 0));
  // Satışdan gələn kredit təhvildən sonra əl ilə başladılır: başlanma tarixi
  // təyin edilməyibsə, kredit "Başlanmamış" statusunda gözləyir.
  const isStarted = Boolean(storedCredit?.startedAt || storedCredit?.startDate);
  const status = isCreditClosed({ ...(storedCredit || {}), balance, paidMonths, months }, { ...basePlan, balance })
    ? "Tamamlandı"
    : storedCredit?.status || (isStarted ? "Aktiv" : "Başlanmamış");

  return {
    ...(storedCredit || {}),
    id: storedCredit?.id || getCreditIdForOrder(order),
    salesSource: true,
    createdFrom: "Satış modulu",
    orderId: order.id,
    customer: order.customer,
    fin: order.fin,
    contractId: order.contractId || storedCredit?.contractId || `MQ-${order.id}`,
    product: productSummary,
    device: productSummary,
    productLines: order.productLines || [],
    seller: order.seller,
    warehouseName: order.warehouseName,
    total: totalAmount,
    initialPayment,
    balance,
    monthly: storedCredit?.monthly ?? order.creditMonthly ?? basePlan.monthly,
    lastPayment: storedCredit?.lastPayment ?? order.creditLastPayment ?? basePlan.lastPayment,
    months,
    paidMonths,
    rate: storedCredit?.rate ?? 0,
    startedAt: storedCredit?.startedAt ?? (isStarted ? storedCredit?.startedAt : null),
    startDate: storedCredit?.startDate ?? (isStarted ? storedCredit?.startDate : null),
    next: isStarted ? storedCredit?.next || basePlan.installments[0]?.due || "—" : "—",
    status,
    installments: storedCredit?.installments || basePlan.installments,
    payments: storedCredit?.payments || [],
  };
}

function buildSalesCreditRecords(orders, storedCredits) {
  const storedByOrderId = new Map(storedCredits.filter((credit) => credit.orderId).map((credit) => [credit.orderId, credit]));
  const storedById = new Map(storedCredits.map((credit) => [credit.id, credit]));

  return orders
    .filter((order) => order.paymentMethod === "Kredit" || order.creditId)
    .map((order) => {
      const storedCredit = storedByOrderId.get(order.id) || storedById.get(order.creditId) || storedById.get(getCreditIdForOrder(order));
      return buildSalesCreditRecord(order, storedCredit);
    });
}

function buildAllCreditRecords(orders, storedCredits) {
  const salesRecords = buildSalesCreditRecords(orders, storedCredits);
  const salesRecordIds = new Set(salesRecords.map((credit) => credit.id));
  const salesOrderIds = new Set(salesRecords.map((credit) => credit.orderId).filter(Boolean));
  const manualRecords = storedCredits.filter((credit) => {
    if (salesRecordIds.has(credit.id)) return false;
    if (credit.orderId && salesOrderIds.has(credit.orderId)) return false;
    // Satışdan yaranmış kreditin bağlı sifarişi artıq mövcud deyilsə, onu
    // manual kredit kimi göstərmək olmaz. Bu, silinmiş sifarişlərin kredit
    // modulunda təkrar/orphan qeyd kimi qalmasının qarşısını alır.
    if (credit.orderId) return false;
    if (credit.salesSource) return false;
    const source = normalize(credit.createdFrom || "");
    if (source.includes("satış") || source.includes("satis")) return false;
    return true;
  });

  return [...salesRecords, ...manualRecords];
}

function ensureKpiTargets(targets = []) {
  return Array.isArray(targets) && targets.length > 0 ? targets : initialState.kpiTargets || [];
}

function getKpiActualValue(metricKey, { employees = [], employeeRows = [], salesBonuses = [] } = {}) {
  if (metricKey === "companyKpi") {
    return employees.length ? Math.round(total(employees, "kpi") / employees.length) : 0;
  }
  if (metricKey === "salesBonus") return Math.round(total(salesBonuses, "bonusAmount"));
  if (metricKey === "hrBonus") return Math.round(total(employeeRows, "performanceBonus"));
  if (metricKey === "highPerformers") {
    return employees.length
      ? Math.round((employees.filter((employee) => Number(employee.kpi || 0) >= 95).length / employees.length) * 100)
      : 0;
  }
  return 0;
}

function buildKpiTargetRows({ targets = [], employees = [], employeeRows = [], salesBonuses = [] } = {}) {
  return ensureKpiTargets(targets).map((target) => {
    const actual = getKpiActualValue(target.metricKey, { employees, employeeRows, salesBonuses });
    const targetValue = Number(target.target || 0);
    const progress = targetValue > 0 ? Math.round((actual / targetValue) * 100) : 0;
    const weightedScore = Math.round((Math.min(progress, 100) / 100) * Number(target.weight || 0));

    return {
      ...target,
      actual,
      progress,
      weightedScore,
      status: progress >= 100 ? "Tamamlandı" : progress >= 75 ? "Nəzarət" : "Risk",
    };
  });
}

function buildKpiPeriodSnapshot({ period, targetRows = [], employeeRows = [], salesBonuses = [], existing = {}, stamp = "" } = {}) {
  const totalWeight = Math.max(1, total(targetRows, "weight"));
  const companyScore = Math.round((total(targetRows, "weightedScore") / totalWeight) * 100);
  const salesBonusTotal = Math.round(total(salesBonuses, "bonusAmount"));
  const performanceBonusTotal = Math.round(total(employeeRows, "performanceBonus"));
  const payoutAmount = Math.round(total(employeeRows, "payoutAmount"));

  return {
    id: existing.id || `KPI-PER-${period}`,
    period,
    status: existing.status || "Açıq period",
    approvalStatus: existing.approvalStatus || "Hazırlanır",
    payoutStatus: existing.payoutStatus || "Gözləyir",
    companyScore,
    employeeCount: employeeRows.length,
    targetCount: targetRows.length,
    salesBonusTotal,
    performanceBonusTotal,
    payoutAmount,
    closedAt: existing.closedAt || "",
    approvedAt: existing.approvedAt || "",
    approvedBy: existing.approvedBy || "",
    paidAt: existing.paidAt || "",
    payoutExpenseId: existing.payoutExpenseId || "",
    updatedAt: stamp || existing.updatedAt || "",
    targetRows: targetRows.map((row) => ({
      id: row.id,
      name: row.name,
      target: row.target,
      unit: row.unit,
      weight: row.weight,
      actual: row.actual,
      progress: row.progress,
      status: row.status,
    })),
    payoutRows: employeeRows
      .filter((row) => Number(row.payoutAmount || 0) > 0)
      .map((row) => ({
        employeeId: row.id,
        employee: row.name,
        department: row.department,
        kpi: row.kpi,
        performanceBonus: row.performanceBonus,
        salesBonus: row.salesBonus,
        payoutAmount: row.payoutAmount,
      })),
  };
}

function buildCreditRiskRows(enrichedCredits) {
  return enrichedCredits
    .map((item) => {
      const overdueDays = Number(item.paymentState.daysOverdue || 0);
      const balance = Number(item.plan.balance || 0);
      const monthly = Number(item.paymentState.nextInstallment?.amount || item.plan.monthly || 0);
      const score = Math.min(
        100,
        Math.round(overdueDays * 4 + balance / 150 + monthly / 40 + (item.paymentState.isOverdue ? 22 : 0)),
      );
      const level = score >= 75 ? "Yüksək risk" : score >= 45 ? "Nəzarət" : "Sağlam";
      const bucket =
        overdueDays === 0 ? "Vaxtında" : overdueDays <= 7 ? "1-7 gün" : overdueDays <= 30 ? "8-30 gün" : "30+ gün";

      return {
        ...item,
        riskScore: score,
        riskLevel: level,
        bucket,
        recommendedAction:
          level === "Yüksək risk"
            ? "Kollektor zəngi + restruktur təklifi"
            : level === "Nəzarət"
              ? "SMS və ödəmə linki"
              : "Avtomatik xatırlatma",
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

function buildCreditAgingBuckets(riskRows) {
  const buckets = ["Vaxtında", "1-7 gün", "8-30 gün", "30+ gün"];
  return buckets.map((bucket) => {
    const rows = riskRows.filter((row) => row.bucket === bucket);
    return {
      bucket,
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row.paymentState.nextInstallment?.amount || 0), 0),
      balance: rows.reduce((sum, row) => sum + Number(row.plan.balance || 0), 0),
    };
  });
}

function getInvoiceVatRate(invoiceSettings = {}) {
  return Number(invoiceSettings.vatRate || 18) / 100;
}

function buildInvoiceRows({ orders, settings = {}, invoiceSettings = {} }) {
  const vatRate = getInvoiceVatRate(invoiceSettings);
  const prefix = invoiceSettings.prefix || "EQ";
  const paymentTermsDays = Number(invoiceSettings.paymentTermsDays || 7);

  return orders.map((order, index) => {
    const totalAmount = roundMoney(order.amount);
    const netAmount = roundMoney(totalAmount / (1 + vatRate));
    const vatAmount = Math.max(0, totalAmount - netAmount);
    const balance = getOrderBalance(order);
    const dueDate = formatPaymentDate(addDays(order.date || currentBusinessDate, paymentTermsDays));
    const status =
      balance <= 0
        ? "Ödənilib"
        : Number(order.paid || 0) > 0
          ? "Qismən ödənilib"
          : "Ödəniş gözləyir";

    return {
      id: `${prefix}-${String(index + 1).padStart(4, "0")}`,
      orderId: order.id,
      contractId: order.contractId || "—",
      customer: order.customer,
      fin: order.fin,
      seller: settings.company || "ERP+CRM AZ",
      voen: settings.voen || "—",
      date: order.date || currentBusinessDate,
      dueDate,
      products: summarizeOrderProducts(order),
      paymentMethod: getOrderPaymentMethod(order),
      netAmount,
      vatAmount,
      totalAmount,
      paid: Number(order.paid || 0),
      balance,
      currency: invoiceSettings.defaultCurrency || "AZN",
      eTaxStatus: order.eTaxStatus || (balance <= 0 ? "E-qaimə göndərildi" : "Göndərişə hazır"),
      invoiceBatchId: order.invoiceBatchId,
      invoiceSentAt: order.invoiceSentAt,
      status,
    };
  });
}

function buildInvoiceSummary(invoices) {
  const paidRows = invoices.filter((invoice) => invoice.balance <= 0);
  const waitingRows = invoices.filter((invoice) => invoice.balance > 0);

  return {
    count: invoices.length,
    total: total(invoices, "totalAmount"),
    vat: total(invoices, "vatAmount"),
    paid: total(paidRows, "paid"),
    balance: total(waitingRows, "balance"),
    ready: invoices.filter((invoice) => invoice.eTaxStatus === "Göndərişə hazır").length,
  };
}

function buildCurrencyExposureRows({ currencyRates = [], orders, credits, cashEntries }) {
  const salesTotal = orders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const collectedTotal = orders.reduce((sum, order) => sum + Number(order.paid || 0), 0) + total(cashEntries, "amount");
  const creditBalance = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);

  return currencyRates.map((rate) => {
    const fxRate = Number(rate.rate || 1);
    const foreignSales = fxRate > 0 ? Math.round(salesTotal / fxRate) : salesTotal;
    const openExposure = Math.round((creditBalance / Math.max(fxRate, 1)) * Number(rate.change || 0) / 100);

    return {
      ...rate,
      salesEquivalent: foreignSales,
      collectedEquivalent: fxRate > 0 ? Math.round(collectedTotal / fxRate) : collectedTotal,
      exposureAzn: openExposure,
      status: rate.code === "AZN" ? "Baza" : Math.abs(Number(rate.change || 0)) >= 0.3 ? "Nəzarət" : rate.status,
    };
  });
}

function buildAccountingData({ orders, expenses, cashEntries, credits, stock, invoices, openingBalance = 0 }) {
  const salesRevenue = total(orders, "amount");
  const salesVat = total(invoices, "vatAmount");
  const salesNet = Math.max(0, salesRevenue - salesVat);
  const approvedExpenses = expenses.filter((expense) => expense.status === "Təsdiq edildi");
  const pendingExpenses = expenses.filter((expense) => expense.status === "Təsdiq gözləyir");
  const approvedExpenseTotal = total(approvedExpenses, "amount");
  const approvedCashExpenseTotal = approvedExpenses
    .filter((expense) => hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const pendingExpenseTotal = total(pendingExpenses, "amount");
  const pendingCashExpenseTotal = pendingExpenses
    .filter((expense) => hasExpenseCashImpact(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const salesCollected = orders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
  const creditCash = total(cashEntries, "amount");
  const cash = Number(openingBalance || 0) + salesCollected + creditCash - approvedCashExpenseTotal;
  const nonCreditReceivable = orders
    .filter((order) => getOrderPaymentMethod(order) !== "Kredit")
    .reduce((sum, order) => sum + getOrderBalance(order), 0);
  const creditReceivable = credits.reduce((sum, credit) => sum + Number(getCreditDisplayPlan(credit).balance || 0), 0);
  const receivable = nonCreditReceivable + creditReceivable;
  const inventory = stock.reduce(
    (sum, item) => sum + Math.round(getAvailableQuantity(item) * Number(item.price || 0) * 0.68),
    0,
  );
  const costOfGoods = Math.round(salesRevenue * 0.68);
  const penaltyIncome = cashEntries.reduce((sum, entry) => sum + Number(entry.penalty || 0), 0);
  const grossProfit = salesNet - costOfGoods;
  const netProfit = grossProfit + penaltyIncome - approvedExpenseTotal;
  const vatPayable = Math.max(0, salesVat - Math.round((approvedExpenseTotal * 18) / 118));

  const journalRows = [
    ...invoices.slice(0, 8).map((invoice) => ({
      id: `JR-${invoice.id}`,
      date: invoice.date,
      source: invoice.orderId,
      debit: invoice.balance > 0 ? "Kassa / Debitor" : "Kassa",
      credit: "Satış gəliri / ƏDV",
      amount: invoice.totalAmount,
      status: invoice.balance > 0 ? "Açıq" : "Bağlandı",
    })),
    ...cashEntries.slice(0, 4).map((entry) => ({
      id: `JR-${entry.id}`,
      date: entry.date,
      source: entry.creditId,
      debit: "Kassa",
      credit: Number(entry.penalty || 0) > 0 ? "Debitor / Gecikmə gəliri" : "Debitor",
      amount: entry.amount,
      status: "Kassa yazıldı",
    })),
    ...expenses.slice(0, 6).map((expense) => ({
      id: `JR-${expense.id}`,
      date: expense.date,
      source: expense.id,
      debit: expense.category,
      credit: expense.status === "Təsdiq edildi" && hasExpenseCashImpact(expense) ? "Kassa" : "Kreditor",
      amount: expense.amount,
      status: hasExpenseCashImpact(expense) ? expense.status : "Cash təsiri yoxdur",
    })),
  ];

  const chartRows = [
    { code: "1010", account: "Kassa", type: "Aktiv", debit: cash, credit: 0, balance: cash },
    { code: "1210", account: "Debitor borclar", type: "Aktiv", debit: receivable, credit: 0, balance: receivable },
    { code: "2050", account: "Mal ehtiyatları", type: "Aktiv", debit: inventory, credit: 0, balance: inventory },
    { code: "4310", account: "ƏDV öhdəliyi", type: "Öhdəlik", debit: 0, credit: vatPayable, balance: vatPayable },
    { code: "5310", account: "Kreditor borclar", type: "Öhdəlik", debit: 0, credit: pendingExpenseTotal, balance: pendingExpenseTotal },
    { code: "6010", account: "Satış gəliri", type: "Gəlir", debit: 0, credit: salesNet, balance: salesNet },
    { code: "7010", account: "Maya dəyəri", type: "Xərc", debit: costOfGoods, credit: 0, balance: costOfGoods },
    { code: "7310", account: "Əməliyyat xərcləri", type: "Xərc", debit: approvedExpenseTotal, credit: 0, balance: approvedExpenseTotal },
  ];

  return {
    journalRows,
    chartRows,
    balance: {
      assets: cash + receivable + inventory,
      liabilities: vatPayable + pendingExpenseTotal,
      equity: cash + receivable + inventory - vatPayable - pendingExpenseTotal,
    },
    pl: {
      revenue: salesNet,
      vat: salesVat,
      costOfGoods,
      grossProfit,
      penaltyIncome,
      operatingExpenses: approvedExpenseTotal,
      netProfit,
      margin: salesNet > 0 ? (netProfit / salesNet) * 100 : 0,
    },
    cashFlow: {
      opening: Number(openingBalance || 0),
      inflow: salesCollected + creditCash,
      outflow: approvedCashExpenseTotal,
      closing: cash,
      pendingOutflow: pendingCashExpenseTotal,
    },
    vatPayable,
  };
}

function buildPayrollTaxCalculatorRows(records) {
  return records.map((record) => {
    const gross = Number(record.salary || 0) + Number(record.bonus || 0);
    return {
      employee: record.name,
      department: record.department,
      ...calculatePayrollTax2026(gross),
    };
  });
}

function getTaxAmountByType(type, { invoices, payrollTaxRows, accounting }) {
  const normalized = normalize(type);
  if (normalized.includes("ədv")) return total(invoices, "vatAmount");
  if (normalized.includes("payroll")) {
    return payrollTaxRows.reduce(
      (sum, row) =>
        sum +
        Number(row.incomeTax || 0) +
        Number(row.employeeSocial || 0) +
        Number(row.employeeUnemployment || 0) +
        Number(row.employerSocial || 0) +
        Number(row.employerUnemployment || 0),
      0,
    );
  }
  if (normalized.includes("mənfəət")) return Math.max(0, Math.round(Number(accounting.pl.netProfit || 0) * 0.2));
  if (normalized.includes("sadələşdirilmiş")) return Math.round(Number(accounting.pl.revenue || 0) * 0.02);
  return 0;
}

function buildTaxDueDate(day, monthOffset = 1) {
  const [year, month] = currentBusinessDate.split("-").map(Number);
  const date = new Date(year, month - 1 + monthOffset, Number(day || 20));
  return formatDateInput(date);
}

function buildDefaultTaxCalendarItems({ invoices, payrollTaxRows, accounting }) {
  const invoiceSummary = buildInvoiceSummary(invoices);
  const payrollAmount = getTaxAmountByType("Payroll", { invoices, payrollTaxRows, accounting });
  const profitAmount = getTaxAmountByType("Mənfəət", { invoices, payrollTaxRows, accounting });
  const period = currentBusinessDate.slice(0, 7);

  return [
    {
      id: `TAX-AUTO-VAT-${period}`,
      title: "ƏDV bəyannaməsi",
      type: "ƏDV",
      period,
      dueDate: buildTaxDueDate(20, 1),
      owner: "Maliyyə",
      source: "Avtomatik",
      plannedAmount: invoiceSummary.vat,
    },
    {
      id: `TAX-AUTO-PAYROLL-${period}`,
      title: "Payroll vergi/DSMF",
      type: "Payroll",
      period,
      dueDate: buildTaxDueDate(15, 1),
      owner: "HR/Maliyyə",
      source: "Avtomatik",
      plannedAmount: payrollAmount,
    },
    {
      id: `TAX-AUTO-PROFIT-${currentBusinessYear}-Q${currentBusinessQuarter}`,
      title: "Mənfəət vergisi avans",
      type: "Mənfəət",
      period: `${currentBusinessYear} Q${currentBusinessQuarter}`,
      dueDate: buildTaxDueDate(20, 1),
      owner: "Maliyyə",
      source: "Avtomatik",
      plannedAmount: profitAmount,
    },
  ];
}

function buildTaxCalendarRows({ taxCalendar = [], invoices, payrollTaxRows, accounting }) {
  const today = parsePaymentDate(currentBusinessDate);
  const defaults = buildDefaultTaxCalendarItems({ invoices, payrollTaxRows, accounting });
  const existingIds = new Set((taxCalendar || []).map((item) => item.id));
  const sourceRows = [
    ...(taxCalendar || []),
    ...defaults.filter((item) => !existingIds.has(item.id)),
  ];

  return sourceRows.map((item) => {
    const dueDate = parsePaymentDate(item.dueDate);
    const daysLeft = dueDate && today ? daysBetween(today, dueDate) : 0;
    const status =
      item.paymentStatus ||
      (daysLeft < 0 ? "Gecikib" : daysLeft === 0 ? "Bu gün" : daysLeft <= 7 ? "Yaxınlaşır" : "Planlı");

    return {
      ...item,
      daysLeft,
      amount: getTaxAmountByType(item.type, { invoices, payrollTaxRows, accounting }),
      status,
      autoGenerated: item.source === "Avtomatik" || item.id?.startsWith("TAX-AUTO"),
    };
  });
}

function ensureApiWebhooks(apiWebhooks = []) {
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

function ensureApiSecrets(apiSecrets = []) {
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

function getApiSecretHealth(secret = {}) {
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

function buildApiSecretRows(apiSecrets = [], apiWebhooks = []) {
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

function buildApiWebhookRows({ apiWebhooks = [], apiSecrets = [], apiWebhookLogs = [], invoices = [], credits = [], stock = [], products = [], purchaseOrders = [], expenses = [] }) {
  const overdueCredits = credits.filter((credit) => getCreditPaymentState(credit, getCreditDisplayPlan(credit)).isOverdue);
  const productsByName = buildProductLookup(products);
  const lowStock = stock.filter((item) => isLowStockItem(item, productsByName));
  const eventCounts = {
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
  const logsByWebhook = (apiWebhookLogs || []).reduce((map, log) => {
    if (!log.webhookId) return map;
    if (!map.has(log.webhookId)) map.set(log.webhookId, []);
    map.get(log.webhookId).push(log);
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

function flattenWarehouseStock(warehouseStock = {}) {
  return Object.entries(warehouseStock || {}).flatMap(([warehouseId, rows]) =>
    (rows || []).map((row) => ({ ...row, warehouseId })),
  );
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
  const cashInflow = total(cashEntries, "amount") + orders.reduce((sum, order) => sum + Number(order.paid || 0), 0);

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

function getInitials(value = "ERP") {
  const words = String(value || "ERP")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "E";
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase("az-AZ");
}

function buildSupportMessageFromComment(comment) {
  return {
    from: comment.author || "Admin",
    text: comment.text,
    time: comment.at || "indi",
    mine: comment.mine !== false,
    commentId: comment.id,
  };
}

function buildSupportConversation(ticket, comment) {
  const firstMessage = buildSupportMessageFromComment(comment);
  const person = ticket.linkedLabel || ticket.customer || ticket.title || ticket.id;
  return {
    id: getSupportThreadId(ticket),
    type: "task",
    status: "Aktiv",
    ticketId: ticket.id,
    linkedType: ticket.linkedType,
    linkedId: ticket.linkedId,
    orderId: ticket.orderId,
    creditId: ticket.creditId,
    customerFin: ticket.fin,
    person,
    initials: getInitials(person),
    team: ticket.module || "Support",
    preview: firstMessage.text,
    time: firstMessage.time,
    unread: 0,
    participants: [ticket.owner || "Support", firstMessage.from].filter(Boolean),
    messages: [firstMessage],
  };
}

function normalizeMessageThread(conversation = {}) {
  const title = conversation.title || conversation.person || conversation.name || conversation.id || "Söhbət";
  const type = conversation.type || (conversation.ticketId ? "task" : (conversation.participants || []).length > 2 ? "group" : "direct");
  const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    ...conversation,
    title,
    person: conversation.person || title,
    type,
    status: conversation.archived || conversation.status === "Arxiv" ? "Arxiv" : "Aktiv",
    archived: Boolean(conversation.archived || conversation.status === "Arxiv"),
    initials: conversation.initials || getInitials(title),
    team: conversation.team || conversation.department || (type === "group" ? "Qrup" : "Daxili"),
    participants: Array.isArray(conversation.participants) ? conversation.participants : [],
    preview: conversation.preview || lastMessage?.text || "Mesaj yoxdur",
    time: conversation.time || lastMessage?.time || conversation.createdAt || "Yeni",
    unread: Number(conversation.unread || 0),
    messages,
  };
}

function buildMessageParticipantOptions(settings = {}, employees = []) {
  const users = (settings.users || []).map((user) => ({
    id: user.id,
    name: user.name || user.email || user.id,
    role: user.role || "İstifadəçi",
    team: user.role || "Sistem",
    source: "user",
  }));
  const staff = (employees || []).map((employee) => ({
    id: employee.id,
    name: employee.name || employee.fullName || employee.id,
    role: employee.position || employee.role || "Əməkdaş",
    team: employee.department || "HR",
    source: "employee",
  }));
  const byKey = new Map();

  [...users, ...staff]
    .filter((item) => item.id && item.name)
    .forEach((item) => {
      const key = normalize(`${item.source}-${item.id}-${item.name}`);
      if (!byKey.has(key)) byKey.set(key, item);
    });

  return [...byKey.values()];
}

function buildMessageContextOptions({ customers = [], orders = [], credits = [], tickets = [] } = {}) {
  const customerOptions = customers.slice(0, 60).map((customer) => ({
    type: "customer",
    id: customer.fin || customer.id,
    label: customer.name || customer.fin || customer.id,
    detail: customer.fin ? `Müştəri · FİN ${customer.fin}` : "Müştəri",
  }));
  const orderOptions = orders.slice(0, 60).map((order) => ({
    type: "order",
    id: order.id,
    label: order.id,
    detail: `${order.customer || order.customerName || "Sifariş"} · ${money(order.amount || order.total || order.totalAmount || 0)}`,
  }));
  const creditOptions = credits.slice(0, 60).map((credit) => ({
    type: "credit",
    id: credit.id,
    label: credit.contractId || credit.id,
    detail: `${credit.customer || "Kredit"} · qalıq ${money(credit.remaining || credit.balance || credit.amount || 0)}`,
  }));
  const ticketOptions = tickets.slice(0, 60).map((ticket) => ({
    type: "support",
    id: ticket.id,
    label: ticket.title || ticket.id,
    detail: `${ticket.module || "Support"} · ${ticket.status || "Aktiv"}`,
  }));

  return [
    { type: "", id: "", label: "Bağlantı yoxdur", detail: "Ümumi daxili yazışma" },
    ...customerOptions,
    ...orderOptions,
    ...creditOptions,
    ...ticketOptions,
  ];
}

function getMessageContextPayload(linkedType, linkedId, { customers = [], orders = [], credits = [], tickets = [] } = {}) {
  if (!linkedType || !linkedId) return {};

  if (linkedType === "customer") {
    const customer = customers.find((item) => item.fin === linkedId || item.id === linkedId);
    return {
      linkedType,
      linkedId,
      customerFin: customer?.fin || linkedId,
      linkedLabel: customer?.name || linkedId,
    };
  }

  if (linkedType === "order") {
    const order = orders.find((item) => item.id === linkedId);
    return {
      linkedType,
      linkedId,
      orderId: linkedId,
      customerFin: order?.fin,
      linkedLabel: order ? `${order.id} · ${order.customer || order.customerName || "Sifariş"}` : linkedId,
    };
  }

  if (linkedType === "credit") {
    const credit = credits.find((item) => item.id === linkedId || item.contractId === linkedId);
    return {
      linkedType,
      linkedId,
      creditId: credit?.id || linkedId,
      orderId: credit?.orderId,
      customerFin: credit?.fin,
      linkedLabel: credit?.contractId || credit?.id || linkedId,
    };
  }

  if (linkedType === "support") {
    const ticket = tickets.find((item) => item.id === linkedId);
    return {
      linkedType: ticket?.linkedType || "support",
      linkedId,
      ticketId: linkedId,
      orderId: ticket?.orderId,
      creditId: ticket?.creditId,
      customerFin: ticket?.fin,
      linkedLabel: ticket?.title || linkedId,
    };
  }

  return { linkedType, linkedId };
}

function upsertSupportConversation(conversations = [], ticket, comment) {
  const threadId = getSupportThreadId(ticket);
  const message = buildSupportMessageFromComment(comment);
  const existing = conversations.find((conversation) => conversation.id === threadId || conversation.ticketId === ticket.id);

  if (!existing) {
    return [buildSupportConversation(ticket, comment), ...(conversations || [])];
  }

  return conversations.map((conversation) =>
    conversation.id === existing.id
      ? {
          ...conversation,
          ticketId: ticket.id,
          linkedType: ticket.linkedType,
          linkedId: ticket.linkedId,
          orderId: ticket.orderId,
          creditId: ticket.creditId,
          customerFin: ticket.fin,
          preview: comment.text,
          time: comment.at || "indi",
          unread: 0,
          messages: [...(conversation.messages || []), message],
        }
      : conversation,
  );
}

function getReceivableAgingBucket(days = 0) {
  const value = Math.max(0, Number(days || 0));
  if (value === 0) return "Cari";
  if (value <= 30) return "1-30 gün";
  if (value <= 60) return "31-60 gün";
  if (value <= 90) return "61-90 gün";
  return "90+ gün";
}

function getReceivableRiskCategory({ amount = 0, overdueDays = 0, type = "Debitor" }) {
  const value = Number(amount || 0);
  const days = Number(overdueDays || 0);
  if (value <= 0) return "Bağlı";
  if (days > 90 || value >= 10000) return "Kritik";
  if (days > 30 || value >= 5000) return "Yüksək";
  if (days > 0 || value >= 1500 || type === "Kreditor") return "Nəzarət";
  return "Sağlam";
}

function getReceivableCollectionStatus({ amount = 0, overdueDays = 0, type = "Debitor" }) {
  const value = Number(amount || 0);
  const days = Number(overdueDays || 0);
  if (value <= 0) return "Bağlandı";
  if (type === "Kreditor") return days > 0 ? "Ödəniş prioriteti" : "Ödəniş planı";
  if (days > 90) return "Hüquqi eskalasiya";
  if (days > 30) return "Eskalasiyada";
  if (days > 7) return "Kolleksiyada";
  if (days > 0) return "Xatırlatma";
  return "İzləmədə";
}

function getReceivableNextAction(row) {
  if (Number(row.amount || 0) <= 0) return "Arxivdə saxla";
  if (row.type === "Kreditor") {
    return Number(row.overdueDays || 0) > 0 ? "Vendor ödənişini bağla" : "Ödəniş tarixini təsdiqlə";
  }
  if (Number(row.overdueDays || 0) > 90) return "Hüquqi mərhələyə ötür";
  if (Number(row.overdueDays || 0) > 30) return "Menecer eskalasiyası";
  if (Number(row.overdueDays || 0) > 7) return "Kollektor zəngi";
  if (Number(row.overdueDays || 0) > 0) return "SMS xatırlatma";
  return "Planlı izləmə";
}

function enrichReceivableRow(row) {
  const agingBucket = getReceivableAgingBucket(row.overdueDays);
  const riskCategory = getReceivableRiskCategory(row);
  const collectionStatus = getReceivableCollectionStatus(row);
  return {
    ...row,
    agingBucket,
    riskCategory,
    collectionStatus,
    nextAction: getReceivableNextAction({ ...row, agingBucket, riskCategory, collectionStatus }),
  };
}

function buildReceivableRows({ customers = [], orders = [], credits = [], vendors = [], purchaseOrders = [] }) {
  const matchedCreditIds = new Set();

  const createCreditDebtRow = (credit, customer = null) => {
    const plan = getCreditDisplayPlan(credit);
    const balance = Number(plan.balance || 0);
    if (balance <= 0 || isCreditClosed(credit, plan)) return null;

    const paymentState = getCreditPaymentState(credit, plan);
    const relatedOrder = getCreditOrder(credit, orders);
    const device = credit.device || credit.product || relatedOrder?.products || "Cihaz qeyd edilməyib";

    return enrichReceivableRow({
      id: `DB-CR-${credit.id}`,
      type: "Debitor",
      party: customer?.name || credit.customer || "Müştəri qeyd edilməyib",
      source: credit.contractId || credit.id,
      sourceType: "credit",
      sourceTypeLabel: "Kredit müqaviləsi",
      amount: balance,
      orderBalance: 0,
      creditBalance: balance,
      customerDebt: 0,
      overdueDays: Number(paymentState.daysOverdue || 0),
      owner: credit.seller || relatedOrder?.sellerBonuses?.[0]?.seller || relatedOrder?.seller || "Kredit",
      status: paymentState.isOverdue ? "Gecikmə" : "Aktiv",
      detail: `${credit.id} · ${device} · ${plan.months} ay`,
      orderIds: credit.orderId ? [credit.orderId] : [],
      openOrderIds: [],
      creditIds: [credit.id],
      contractIds: [credit.contractId].filter(Boolean),
      closingMode: "cash-in",
    });
  };

  const customerRows = customers.flatMap((customer) => {
    const relatedOrders = getCustomerOrders(customer, orders);
    const relatedCredits = getCustomerRelatedCredits(customer, credits);
    const rows = [];
    const manualDebt = Math.max(0, Number(customer.debt || 0));

    if (manualDebt > 0) {
      rows.push(
        enrichReceivableRow({
          id: `DB-CUST-${customer.fin || normalize(customer.name)}`,
          type: "Debitor",
          party: customer.name,
          source: customer.fin || customer.name,
          sourceType: "manual",
          sourceTypeLabel: "Manual borc",
          amount: manualDebt,
          orderBalance: 0,
          creditBalance: 0,
          customerDebt: manualDebt,
          overdueDays: Number(customer.delay || 0),
          owner: "CRM",
          status: Number(customer.delay || 0) > 0 ? "Gecikmə" : "Aktiv",
          detail: "Müştəri kartındakı ayrıca borc",
          orderIds: [],
          openOrderIds: [],
          creditIds: [],
          contractIds: [],
          closingMode: "cash-in",
        }),
      );
    }

    relatedOrders
      .filter((order) => getOrderPaymentMethod(order) !== "Kredit" && !order.creditId)
      .forEach((order) => {
        const balance = getOrderBalance(order);
        if (balance <= 0) return;

        const dueDate = parsePaymentDate(order.dueDate) || addDays(order.date || currentBusinessDate, 7);
        const today = parsePaymentDate(currentBusinessDate);
        const overdueDays = dueDate && today ? Math.max(0, daysBetween(dueDate, today)) : 0;

        rows.push(
          enrichReceivableRow({
            id: `DB-ORD-${order.id}`,
            type: "Debitor",
            party: customer.name,
            source: order.id,
            sourceType: "order",
            sourceTypeLabel: "Nağd/qalıqlı sifariş",
            amount: balance,
            orderBalance: balance,
            creditBalance: 0,
            customerDebt: 0,
            overdueDays,
            owner: order.sellerBonuses?.[0]?.seller || order.seller || "Satış",
            status: overdueDays > 0 ? "Gecikmə" : "Aktiv",
            detail: `${order.id} · ${summarizeOrderProducts(order)}`,
            orderIds: [order.id],
            openOrderIds: [order.id],
            creditIds: [],
            contractIds: [],
            closingMode: "cash-in",
          }),
        );
      });

    relatedCredits.forEach((credit) => {
      matchedCreditIds.add(credit.id);
      const row = createCreditDebtRow(credit, customer);
      if (row) rows.push(row);
    });

    return rows;
  });

  const orphanCreditRows = credits
    .filter((credit) => !matchedCreditIds.has(credit.id))
    .map((credit) => createCreditDebtRow(credit))
    .filter(Boolean);

  const vendorRows = vendors.flatMap((vendor) => {
    const vendorPos = (purchaseOrders || []).filter((po) => po.vendor === vendor.name);
    const payablePos = vendorPos.filter((po) => {
      const status = normalize(po.status);
      return !status.includes("ödən") && !status.includes("oden") && !status.includes("imtina") && !status.includes("cancel");
    });
    const pendingAmount = vendorPos
      .filter((po) => {
        const status = normalize(po.status);
        return !status.includes("ödən") && !status.includes("oden") && !status.includes("imtina") && !status.includes("cancel");
      })
      .reduce((sum, po) => sum + Number(po.amount || 0), 0);
    const latestPo = vendorPos[0];
    const today = parsePaymentDate(currentBusinessDate);
    const overdueDays = Math.max(
      vendor.status !== "Aktiv" && pendingAmount > 0 ? 5 : 0,
      ...payablePos.map((po) => {
        const dueDate = parsePaymentDate(po.paymentDueDate || po.expectedAt) || addDays(po.date || currentBusinessDate, 30);
        return dueDate && today ? Math.max(0, daysBetween(dueDate, today)) : 0;
      }),
    );

    if (pendingAmount <= 0) return [];

    return [
      enrichReceivableRow({
      id: `CR-${vendor.name}`,
      type: "Kreditor",
      party: vendor.name,
      source: vendor.country,
      sourceType: "vendor",
      sourceTypeLabel: "Vendor/PO",
      amount: pendingAmount,
      overdueDays,
      owner: "Vendor/Maliyyə",
      status: pendingAmount > 0 ? "Ödəniş gözləyir" : vendor.status,
      detail: latestPo ? `${vendorPos.length} PO · son: ${latestPo.id}` : `${vendor.sku} SKU · PO yoxdur`,
      poIds: payablePos.map((po) => po.id),
      closingMode: "cash-out",
      }),
    ];
  });

  return [...customerRows, ...orphanCreditRows, ...vendorRows].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
}

function buildProjectPortfolioSource(projects = [], orders = [], expenses = [], products = []) {
  if ((projects || []).length > 0) return projects;
  if ((orders || []).length === 0 && (expenses || []).length === 0) return [];

  const linkedProducts = [
    ...new Set(
      orders.flatMap((order) => (order.productLines || []).map((line) => line.product).filter(Boolean)),
    ),
  ].slice(0, 8);
  const expenseCategories = [...new Set((expenses || []).map((expense) => expense.category).filter(Boolean))].slice(0, 8);
  const revenue = total(orders, "amount");
  const catalogCostBase = orders.reduce(
    (sum, order) =>
      sum +
      (order.productLines || []).reduce((lineSum, line) => {
        const product = products.find((item) => normalize(item.name) === normalize(line.product));
        return lineSum + Number(line.qty || 0) * Number(product?.costPrice || Math.round(Number(line.price || 0) * 0.68));
      }, 0),
    0,
  );
  const budget = Math.max(revenue || 0, catalogCostBase + total(expenses, "amount"));

  return [
    {
      id: `AUTO-ROI-${currentBusinessDate.slice(0, 7)}`,
      name: "Avtomatik satış layihəsi",
      owner: "Satış/Maliyyə",
      start: orders[orders.length - 1]?.date || currentBusinessDate,
      end: currentBusinessDate,
      budget,
      linkedProducts,
      expenseCategories,
      status: "Avtomatik",
      autoGenerated: true,
    },
  ];
}

function isDateWithinProject(dateValue, project) {
  const date = parsePaymentDate(dateValue);
  const start = parsePaymentDate(project.start);
  const end = parsePaymentDate(project.end);
  if (!date) return true;
  if (start && daysBetween(date, start) > 0) return false;
  if (end && daysBetween(end, date) > 0) return false;
  return true;
}

function getProjectOrderCost(order, productsByName = new Map()) {
  const lines = Array.isArray(order.productLines) ? order.productLines : [];
  const lineCost = lines.reduce((sum, line) => {
    const product = productsByName.get(normalize(line.product));
    const unitCost = Number(product?.costPrice || Math.round(Number(line.price || 0) * 0.68));
    return sum + Number(line.qty || 0) * unitCost;
  }, 0);
  return Math.round(lineCost || Number(order.amount || 0) * 0.68);
}

function buildProjectRoiRows({ projects, orders, expenses, products = [] }) {
  const portfolio = buildProjectPortfolioSource(projects, orders, expenses, products);
  const productsByName = buildProductLookup(products);

  return portfolio.map((project) => {
    const linkedProducts = new Set(project.linkedProducts || []);
    const linkedCategories = new Set(project.expenseCategories || []);
    const projectOrders = orders.filter((order) => {
      const productMatch =
        linkedProducts.size === 0 ||
        (order.productLines || []).some((line) => linkedProducts.has(line.product));
      return productMatch && isDateWithinProject(order.date, project);
    });
    const matchedExpenses = expenses.filter((expense) => {
      const categoryMatch = linkedCategories.size === 0 || linkedCategories.has(expense.category);
      const explicitMatch = expense.projectId === project.id || normalize(expense.description).includes(normalize(project.name));
      return (categoryMatch || explicitMatch) && isDateWithinProject(expense.date, project);
    });
    const approvedExpenses = matchedExpenses.filter((expense) => expense.status === "Təsdiq edildi");
    const pendingExpenses = matchedExpenses.filter((expense) => expense.status !== "Təsdiq edildi");
    const revenue = projectOrders.reduce((sum, order) => sum + Number(order.amount || 0), 0);
    const collected = projectOrders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
    const productCost = projectOrders.reduce((sum, order) => sum + getProjectOrderCost(order, productsByName), 0);
    const approvedExpenseCost = total(approvedExpenses, "amount");
    const pendingExpenseCost = total(pendingExpenses, "amount");
    const totalCost = productCost + approvedExpenseCost;
    const committedCost = totalCost + pendingExpenseCost;
    const profit = revenue - totalCost;
    const projectedProfit = revenue - committedCost;
    const investmentBase = Number(project.budget || committedCost || totalCost || revenue || 1);
    const roi = investmentBase > 0 ? (profit / investmentBase) * 100 : 0;
    const budgetUsage = Number(project.budget || 0) > 0 ? (committedCost / Number(project.budget || 1)) * 100 : 0;
    const collectionRate = revenue > 0 ? (collected / revenue) * 100 : 0;
    const status =
      profit < 0 || projectedProfit < 0
        ? "Risk"
        : collectionRate < 50 && revenue > 0
          ? "Yığım riski"
          : budgetUsage > 100
            ? "Büdcə aşımı"
            : roi >= 45
              ? "Yüksək ROI"
              : roi >= 15
                ? "Aktiv"
                : project.status || "Nəzarət";

    return {
      ...project,
      orders: projectOrders.length,
      orderIds: projectOrders.map((order) => order.id),
      revenue,
      collected,
      productCost,
      approvedExpenseCost,
      pendingExpenseCost,
      totalCost,
      committedCost,
      profit,
      projectedProfit,
      roi,
      budgetUsage,
      collectionRate,
      investmentBase,
      expenseCount: matchedExpenses.length,
      reportStatus: project.lastExportAt ? "Export olunub" : "Export gözləyir",
      nextAction: status === "Risk" || status === "Büdcə aşımı" ? "Xərci yoxla" : status === "Yığım riski" ? "Yığımı sürətləndir" : "Hesabat hazır",
      status,
    };
  });
}


function ensureNotificationProviders(providers = []) {
  const storedById = new Map((providers || []).map((provider) => [provider.id, provider]));
  const defaults = initialState.notificationProviders || [];
  const merged = defaults.map((provider) => ({
    ...provider,
    ...(storedById.get(provider.id) || {}),
  }));
  const knownIds = new Set(merged.map((provider) => provider.id));
  return [...merged, ...(providers || []).filter((provider) => !knownIds.has(provider.id))];
}

function ensureNotificationRules(rules = []) {
  const storedById = new Map((rules || []).map((rule) => [rule.id, rule]));
  const defaults = initialState.notificationRules || [];
  const merged = defaults.map((rule) => ({
    ...rule,
    ...(storedById.get(rule.id) || {}),
  }));
  const knownIds = new Set(merged.map((rule) => rule.id));
  return [...merged, ...(rules || []).filter((rule) => !knownIds.has(rule.id))];
}

function getNotificationChannelEnabled(channel, settings = {}) {
  const key = normalize(channel);
  const toggles = settings.toggles || {};
  if (key.includes("sms")) return toggles.sms !== false;
  if (key.includes("email")) return toggles.email === true;
  if (key.includes("push")) return toggles.push !== false;
  return true;
}

function renderNotificationTemplate(template = "", values = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function getNotificationEventKey(rule = {}, event = {}) {
  return [
    rule.id || "RULE",
    event.entityId || event.id || event.target || event.recipient || "EVENT",
  ].join(":");
}

function getNotificationLogTime(log = {}) {
  const iso = Date.parse(log.sentAtIso || "");
  if (!Number.isNaN(iso)) return iso;
  const fallback = Date.parse(log.sentAt || "");
  return Number.isNaN(fallback) ? 0 : fallback;
}

function splitNotificationEventsByCooldown(rule = {}, events = [], sendLog = [], now = new Date()) {
  const cooldownMs = Math.max(0, Number(rule.cooldownHours || 0)) * 60 * 60 * 1000;
  const ready = [];
  const held = [];

  events.forEach((event) => {
    const dedupeKey = getNotificationEventKey(rule, event);
    const enriched = { ...event, dedupeKey };
    const recentLog = (sendLog || []).find(
      (log) => log.dedupeKey === dedupeKey || (log.ruleId === rule.id && log.entityId === event.entityId),
    );
    const coolingDown = Boolean(cooldownMs > 0 && recentLog && now.getTime() - getNotificationLogTime(recentLog) < cooldownMs);

    if (coolingDown) {
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

function getCreditPaymentLeadDays(paymentState) {
  const today = parsePaymentDate(baseCreditDate);
  const dueDate = paymentState?.dueDate;
  if (!today || !dueDate) return null;
  return daysBetween(today, dueDate);
}

function buildNotificationProviderRows(providers = [], settings = {}, sendLog = []) {
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

function buildNotificationEvent(rule, values = {}) {
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

function buildNotificationRuleEvents(rule, { credits = [], stock = [], warehouseStock = {}, products = [], purchaseOrders = [], expenses = [], orders = [] }) {
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
        buildNotificationEvent(rule, {
          id: `${rule.id}-${item.credit.id}`,
          entityId: item.credit.id,
          customer: item.credit.customer,
          recipient: item.credit.customer,
          target: item.credit.phone || item.credit.fin || item.credit.customer,
          contractId: item.credit.contractId || item.credit.id,
          amount: item.paymentState.nextInstallment?.amount || item.plan.monthly,
          dueDate: item.paymentState.nextInstallment?.due || item.credit.next,
          status: item.paymentState.isOverdue ? `${item.paymentState.daysOverdue} gün gecikib` : "bu gün ödənilməlidir",
          context: `${item.credit.contractId || item.credit.id} · ${item.credit.device || item.credit.product || "Cihaz"}`,
          actionTarget: item.credit.id,
          module: "credits",
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
        buildNotificationEvent(rule, {
          id: `${rule.id}-${item.credit.id}`,
          entityId: item.credit.id,
          customer: item.credit.customer,
          recipient: item.credit.customer,
          target: item.credit.phone || item.credit.fin || item.credit.customer,
          contractId: item.credit.contractId || item.credit.id,
          amount: item.paymentState.nextInstallment?.amount || item.plan.monthly,
          dueDate: item.paymentState.nextInstallment?.due || item.credit.next,
          leadDays: item.leadDays,
          context: `${item.credit.contractId || item.credit.id} · ${item.credit.device || item.credit.product || "Cihaz"}`,
          actionTarget: item.credit.id,
          module: "credits",
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

function buildNotificationAutomationRows({ notificationRules, providers = [], settings = {}, sendLog = [], credits, stock, warehouseStock = {}, products = [], purchaseOrders, expenses, orders }) {
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

  const queueByRule = {
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
    const allEvents = buildNotificationRuleEvents(rule, { credits, stock, warehouseStock, products, purchaseOrders, expenses, orders });
    const { ready: events, held: cooldownEvents } = splitNotificationEventsByCooldown(rule, allEvents, sendLog, now);
    const provider = providerById.get(rule.providerId) || providerRows.find((item) => item.channel === rule.channel);
    const channelEnabled = getNotificationChannelEnabled(rule.channel, settings);
    const lastLog = sendLog.find((log) => log.ruleId === rule.id);
    const queueCount = events.length;
    const totalEventCount = allEvents.length || queueByRule[rule.id]?.count || 0;

    return {
      ...rule,
      provider,
      providerName: provider?.name || "Provider seçilməyib",
      queueCount,
      totalEventCount,
      cooldownCount: cooldownEvents.length,
      events,
      cooldownEvents,
      lastEvent: events[0]?.recipient || cooldownEvents[0]?.recipient || queueByRule[rule.id]?.event || "Siqnal yoxdur",
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

function createNotificationSendLogEntry({ rule = {}, event = {}, provider = {}, stamp, status = "Göndərildi", source = "Avtomatik" }) {
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

function buildNotificationDeliveriesForRules({ rules = [], providerRows = [], settings = {}, stamp, source = "Avtomatik qayda" }) {
  return rules.flatMap((rule) => {
    const provider =
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

function buildProductionPlanRows(productionPlans, stock, warehouseStock = {}, products = [], warehouses = []) {
  const aggregateStockByProduct = new Map((stock || []).map((item) => [item.product, item]));
  const productsByName = buildProductLookup(products);
  const warehouseById = new Map((warehouses || []).map((warehouse) => [warehouse.id, warehouse]));

  return (productionPlans || []).map((plan) => {
    const completed = normalize(plan.status).includes("istehsal edildi");
    const warehouseId =
      plan.warehouseId ||
      Object.entries(warehouseStock || {}).find(([, rows]) =>
        (rows || []).some((row) => (plan.materials || []).some((material) => material.product === row.product)),
      )?.[0] ||
      warehouses[0]?.id ||
      "";
    const warehouseRows = warehouseStock?.[warehouseId] || [];
    const sourceRows = warehouseRows.length > 0 ? warehouseRows : stock || [];
    const sourceByProduct = new Map(sourceRows.map((item) => [item.product, item]));
    const issuedByProduct = new Map((plan.issuedMaterials || []).map((item) => [item.product, item]));

    const materials = (plan.materials || []).map((material) => {
      const stockItem = sourceByProduct.get(material.product) || aggregateStockByProduct.get(material.product);
      const product = productsByName.get(normalize(material.product));
      const issued = issuedByProduct.get(material.product);
      const available = stockItem ? getAvailableQuantity(stockItem) : 0;
      const needed = Number(material.needed ?? Number(material.qty || 0) * Number(plan.plannedQty || 0));
      const configuredCost = issued?.unitCost ?? material.unitCost ?? product?.costPrice;
      const unitCost = Number(configuredCost || stockItem?.costPrice || stockItem?.price || product?.salePrice || 0);
      const cost = Math.round(Number(issued?.cost ?? material.cost ?? needed * unitCost));

      return {
        ...material,
        needed,
        available,
        availableAfter: completed ? issued?.availableAfter ?? available : available,
        unitPrice: unitCost,
        unitCost,
        cost,
        enough: completed || available >= needed,
      };
    });
    const materialCost = Number(plan.actualMaterialCost ?? materials.reduce((sum, material) => sum + Number(material.cost || 0), 0));
    const totalCost = Number(plan.actualTotalCost ?? materialCost + Number(plan.laborCost || 0) + Number(plan.overheadCost || 0));
    const unitCost = Number(plan.actualUnitCost ?? (Number(plan.plannedQty || 0) > 0 ? Math.round(totalCost / Number(plan.plannedQty || 1)) : 0));
    const projectedRevenue = Number(plan.salePrice || 0) * Number(plan.plannedQty || 0);
    const projectedProfit = projectedRevenue - totalCost;
    const bottleneck = completed ? null : materials.find((material) => !material.enough);
    const producedQty = Number(plan.producedQty || (completed ? plan.plannedQty : 0) || 0);

    return {
      ...plan,
      warehouseId,
      warehouseName: warehouseById.get(warehouseId)?.name || plan.warehouseName || "Anbar seçilməyib",
      materials,
      materialCost,
      totalCost,
      unitCost,
      projectedRevenue,
      projectedProfit,
      producedQty,
      margin: projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0,
      bottleneck: bottleneck?.product || (completed ? "İstehsal bağlandı" : "Xammal kifayətdir"),
      canProduce: !completed && !bottleneck && Number(plan.plannedQty || 0) > 0,
      issueStatus: completed ? "Xammal çıxıldı" : bottleneck ? "Xammal çatmır" : "Çıxışa hazır",
      receiptStatus: completed ? `${producedQty} hazır məhsul mədaxil` : "Mədaxil gözləyir",
      status: completed ? "İstehsal edildi" : bottleneck ? "Xammal riski" : plan.status || "Planlandı",
    };
  });
}

function buildOnboardingRows(onboarding = {}, snapshot = {}) {
  const warehouseStockRows = Object.values(snapshot.warehouseStock || {}).flatMap((rows) => rows || []);
  const creditRecords = buildAllCreditRecords(snapshot.orders || [], snapshot.credits || []);
  const payrollReady = (snapshot.expenses || []).some((expense) => expense.source === "HR Payroll");
  const reportReady = (snapshot.reportExports || []).length > 0;
  const backupReady = Boolean(snapshot.integritySnapshot || snapshot.goLiveSnapshot);
  const checks = {
    "ONB-1": Boolean(snapshot.settings?.company && snapshot.settings?.voen),
    "ONB-2": (snapshot.warehouses || []).length > 0,
    "ONB-3": (snapshot.products || []).length > 0 && warehouseStockRows.some((item) => Number(item.total || 0) > 0),
    "ONB-4": (snapshot.settings?.users || []).length > 1 || (snapshot.settings?.roles || []).length > 0,
    "ONB-5": (snapshot.financeAccounts || []).length > 0,
    "ONB-6": (snapshot.employees || []).length > 0 && payrollReady,
    "ONB-7": (snapshot.orders || []).length > 0 && creditRecords.length > 0,
    "ONB-8": (snapshot.vendors || []).length > 0 || (snapshot.purchaseOrders || []).length > 0,
    "ONB-9": reportReady,
    "ONB-10": backupReady,
  };
  const defaultSteps = [
    { id: "ONB-1", title: "Şirkət məlumatları və VÖEN", owner: "Administrator", module: "settings", detail: "Ayarlar bölməsində şirkət adı, VÖEN və əsas rekvizitlər doldurulur." },
    { id: "ONB-2", title: "İlk anbarın yaradılması", owner: "Anbar", module: "warehouse", detail: "Ən azı bir aktiv anbar yaradılır." },
    { id: "ONB-3", title: "Məhsul kataloqu və ilkin stok", owner: "Anbar", module: "warehouse", detail: "Məhsullar, minimum qalıq və ilkin mədaxil real stok kimi yazılır." },
    { id: "ONB-4", title: "İstifadəçi rolları və permission", owner: "Administrator", module: "settings", detail: "Rol və modul icazələri real düymələrə tətbiq olunur." },
    { id: "ONB-5", title: "Kassa və bank açılış balansı", owner: "Maliyyə", module: "finance", detail: "Kassa/bank hesabları maliyyə modulunda yaradılır." },
    { id: "ONB-6", title: "HR əməkdaşları və payroll", owner: "HR", module: "hr", detail: "Əməkdaş kartları, sənəd faizi və cash-neutral payroll accrual tamamlanır." },
    { id: "ONB-7", title: "Satış və kredit UAT ssenarisi", owner: "Satış/Maliyyə", module: "sales", detail: "Satışdan kredit, müqavilə, rezerv və təhvil axını test edilir." },
    { id: "ONB-8", title: "Vendor və PO axını", owner: "Procurement", module: "vendors", detail: "Vendor, minimum stok və PO təsdiq/mədaxil axını hazırlanır." },
    { id: "ONB-9", title: "Hesabat və analitika export", owner: "Rəhbərlik", module: "reports", detail: "Executive hesabat, ROI və audit snapshot-ları export edilir." },
    { id: "ONB-10", title: "Backup və go-live yoxlaması", owner: "Administrator", module: "settings", detail: "Integrity, backup və go-live readiness yoxlaması saxlanılır." },
  ];
  const storedById = new Map((onboarding.steps || []).map((step) => [step.id, step]));
  const sourceSteps = defaultSteps.map((step) => ({ ...step, ...(storedById.get(step.id) || {}) }));
  let nextFound = false;
  const steps = sourceSteps.map((step) => {
    const completed = Boolean(checks[step.id]);
    const status = completed ? "Tamamlandı" : nextFound ? "Gözləyir" : "İcrada";
    if (!completed) nextFound = true;
    return {
      ...step,
      status,
      completed,
      action: completed ? "Yoxlanılıb" : "Modula keç",
    };
  });
  const completed = steps.filter((step) => step.status === "Tamamlandı").length;
  const blockers = steps.filter((step) => step.status === "İcrada").length;

  return {
    steps,
    completed,
    blockers,
    progress: steps.length > 0 ? (completed / steps.length) * 100 : 0,
    nextStep: steps.find((step) => step.status !== "Tamamlandı") || null,
  };
}

function buildHelpModuleGuides({ moduleReadiness = { items: [] }, onboardingRows = { steps: [] } }) {
  const readinessByModule = new Map((moduleReadiness.items || []).map((item) => [item.module, item]));
  const onboardingByModule = new Map((onboardingRows.steps || []).map((step) => [step.module, step]));

  return navItems
    .filter((item) => !["dashboard", "messages", "notifications"].includes(item.id))
    .map((item) => {
      const meta = pageMeta[item.id] || {};
      const readiness = readinessByModule.get(item.id);
      const onboarding = onboardingByModule.get(item.id);
      const permission = getPageActionPermission(item.id) || navPermissionByType[item.id] || "Oxunuş";
      return {
        id: item.id,
        module: item.label,
        title: meta.title || item.label,
        purpose: meta.subtitle || "Modul üzrə əməliyyatlar və nəzarət.",
        action: meta.action || "Baxış",
        permission,
        readiness: readiness?.status || onboarding?.status || "Nəzarət",
        next: readiness?.next || onboarding?.detail || "Modul üzrə əsas əməliyyatı tamamlayın.",
        owner: onboarding?.owner || "Admin",
      };
    });
}

function buildHelpArticles(articles = [], moduleGuides = [], onboardingRows = { steps: [] }) {
  const generated = [
    {
      id: "HELP-START",
      title: "Sistemi real istifadəyə necə başlatmaq olar",
      category: "Onboarding",
      answer: "Ayarlar, anbar, məhsul, rol, maliyyə, HR, satış/kredit, vendor, hesabat və backup addımlarını ardıcıl tamamlayın.",
      tags: ["qurulum", "checklist", "go-live"],
      createdAt: currentBusinessDate,
      generated: true,
    },
    {
      id: "HELP-PERMISSIONS",
      title: "Rollar və icazələr necə işləyir",
      category: "Ayarlar",
      answer: "Hər modul əməliyyatı permission ilə qorunur. İstifadəçinin rolunda permission yoxdursa düymə deaktiv olur və ya əməliyyat bloklanır.",
      tags: ["rol", "permission", "təhlükəsizlik"],
      createdAt: currentBusinessDate,
      generated: true,
    },
    {
      id: "HELP-AUDIT",
      title: "Audit log və hesabat izi",
      category: "Audit",
      answer: "Satış, kredit, anbar, maliyyə, HR, ROI, support və export əməliyyatları audit log-a yazılır. Hesabat snapshot-ları reportExports içində saxlanır.",
      tags: ["audit", "hesabat", "snapshot"],
      createdAt: currentBusinessDate,
      generated: true,
    },
  ];
  const moduleArticles = moduleGuides.slice(0, 12).map((guide) => ({
    id: `HELP-MOD-${guide.id}`,
    title: `${guide.module}: ${guide.action}`,
    category: "Modul izahı",
    answer: `${guide.purpose} Növbəti addım: ${guide.next}`,
    tags: [guide.module, guide.permission, guide.readiness].filter(Boolean),
    createdAt: currentBusinessDate,
    generated: true,
  }));
  const manualIds = new Set((articles || []).map((article) => article.id));
  return [...(articles || []), ...generated.filter((article) => !manualIds.has(article.id)), ...moduleArticles.filter((article) => !manualIds.has(article.id))];
}

function buildSellerBonusRows(rows = []) {
  return rows
    .filter((row) => row?.seller)
    .slice(0, 3)
    .map((row) => ({
      seller: row.seller,
      bonus: Math.max(0, Number(row.bonus || 0)),
    }));
}

function summarizeSellerBonusRows(rows = []) {
  return buildSellerBonusRows(rows)
    .map((row) => `${row.seller} ${Number(row.bonus || 0)}%`)
    .join(", ");
}

function calculateOrderLineTotal(productLines = []) {
  return normalizeOrderProductLines(productLines).reduce(
    (sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0),
    0,
  );
}

function productLineSignature(productLines = []) {
  return normalizeOrderProductLines(productLines)
    .map((line) => `${line.product}:${line.qty}:${line.price}`)
    .join("|");
}

function buildSalesCreditForOrder(order, storedCredit) {
  const totalAmount = Number(order.amount || 0);
  const initialPayment = Number(order.initialPayment || 0);
  const months = Number(order.creditMonths || storedCredit?.months || 12);
  const creditPlan = buildCreditPlan({ total: totalAmount, initialPayment, months });
  const payments = Array.isArray(storedCredit?.payments) ? storedCredit.payments : [];
  const installments = creditPlan.installments.map((installment, index) => ({
    ...installment,
    due: storedCredit?.installments?.[index]?.due || installment.due,
  }));
  const baseCredit = {
    ...(storedCredit || {}),
    id: order.creditId || storedCredit?.id || getCreditIdForOrder(order),
    salesSource: true,
    createdFrom: "Satış modulu",
    orderId: order.id,
    contractId: order.contractId || storedCredit?.contractId || `MQ-${order.id}`,
    customer: order.customer,
    fin: order.fin,
    product: summarizeOrderProducts(order),
    device: summarizeOrderProducts(order),
    productLines: order.productLines || [],
    seller: order.seller,
    warehouseName: order.warehouseName,
    total: creditPlan.total,
    initialPayment: creditPlan.initialPayment,
    balance: creditPlan.balance,
    monthly: creditPlan.monthly,
    lastPayment: creditPlan.lastPayment,
    months: creditPlan.months,
    paidMonths: 0,
    rate: 0,
    next: installments[0]?.due || "—",
    status: storedCredit?.status || "Başlanmamış",
    startDate: storedCredit?.startDate ?? null,
    startedAt: storedCredit?.startedAt ?? null,
    installments,
    payments,
  };
  const paidPrincipal = payments.reduce((sum, payment) => sum + Number(payment.principal || 0), 0);
  if (paidPrincipal <= 0) {
    return isCreditClosed(storedCredit || baseCredit, { ...creditPlan, installments })
      ? { ...baseCredit, balance: 0, paidMonths: creditPlan.months, rate: 100, status: "Tamamlandı" }
      : baseCredit;
  }

  const paymentResult = applyCreditPrincipalPayment(baseCredit, paidPrincipal);
  return {
    ...baseCredit,
    balance: paymentResult.nextBalance,
    installments: paymentResult.installments,
    paidMonths: paymentResult.nextPaidMonths,
    rate: Math.round((paymentResult.nextPaidMonths / Math.max(1, creditPlan.months)) * 100),
    next: paymentResult.nextDue,
    monthly: paymentResult.nextMonthly,
    status: paymentResult.nextBalance <= 0 ? "Tamamlandı" : paymentResult.status,
  };
}

function getDeliveryActionLabel(order) {
  if (order.status === "Təhvil verilib") return "Tamamlanıb";
  if (order.status === "Təhvilə çıxıb") return "Təhvili tamamla";
  return "Növbəti mərhələ";
}

function matchesDeliveryFilter(order, filter) {
  if (filter === "Hamısı") return true;
  if (filter === "Aktiv") return order.status !== "Təhvil verilib";
  if (filter === "Gecikmə riski") return order.risk === "Gecikmə riski";
  if (filter === "Sürücü yoxdur") return order.risk === "Sürücü yoxdur";
  if (filter === "Tamamlanan") return order.status === "Təhvil verilib";
  return order.status === filter;
}

function buildDriverDeliveryStats(orders) {
  const driverMap = new Map();
  orders
    .filter((order) => order.driver && order.driver !== "—")
    .forEach((order) => {
      const current = driverMap.get(order.driver) || {
        driver: order.driver,
        active: 0,
        completed: 0,
        outForDelivery: 0,
        risk: 0,
      };
      if (order.status === "Təhvil verilib") {
        current.completed += 1;
      } else {
        current.active += 1;
      }
      if (order.status === "Təhvilə çıxıb" || order.status === "Yoldadır") {
        current.outForDelivery += 1;
      }
      if (order.risk !== "Normal" && order.risk !== "Tamamlandı") {
        current.risk += 1;
      }
      driverMap.set(order.driver, current);
    });
  const maxActive = Math.max(1, ...[...driverMap.values()].map((item) => item.active + item.outForDelivery));
  return [...driverMap.values()].map((item) => ({
    ...item,
    load: ((item.active + item.outForDelivery) / maxActive) * 100,
  }));
}

function matchesFinanceFilter(row, filter) {
  if (filter === "Daxilolma") return row.direction === "in";
  if (filter === "Xərc") return row.type === "Xərc";
  if (filter === "Satış") return row.type === "Satış";
  if (filter === "Kredit") return row.type === "Kredit";
  if (filter === "Gecikmə gəliri") return Number(row.penalty || 0) > 0;
  if (filter === "Təsdiq gözləyir") return row.direction === "pending";
  if (filter === "Cash təsirsiz") return row.direction === "accrual";
  return true;
}

function matchesFinanceDateRange(row, dateFrom, dateTo) {
  const rowDate = parsePaymentDate(row.date);
  if (!rowDate) return !dateFrom && !dateTo;
  const fromDate = dateFrom ? parsePaymentDate(dateFrom) : null;
  const toDate = dateTo ? parsePaymentDate(dateTo) : null;
  if (fromDate && rowDate < fromDate) return false;
  if (toDate && rowDate > toDate) return false;
  return true;
}

function matchesFinanceSearch(row, query) {
  if (!query.trim()) return true;
  return normalize([
    row.id,
    row.type,
    row.source,
    row.category,
    row.account,
    row.title,
    row.description,
    row.party,
    row.status,
    row.orderId,
    row.creditId,
    row.contractId,
    row.poId,
    row.expenseId,
  ].join(" ")).includes(normalize(query));
}

function buildQuantityMap(items) {
  return items.reduce((map, item) => {
    if (!item.product) return map;
    map.set(item.product, (map.get(item.product) || 0) + Number(item.qty || 0));
    return map;
  }, new Map());
}

function buildSerialPrefix(product = "", warehouseId = "") {
  const productCode = normalize(product).replace(/[^a-z0-9]/g, "").slice(0, 4).toLocaleUpperCase("az-AZ") || "SKU";
  const warehouseCode = String(warehouseId || "WH").replace(/[^A-Z0-9]/gi, "").slice(-3).toLocaleUpperCase("az-AZ");
  return `${productCode}${warehouseCode}`;
}

function ensureStockItemSerials(item, warehouseId = "WH") {
  if (!isSerialTrackedProduct(item)) return { ...item, serials: item.serials || [] };

  const totalCount = Math.max(0, Math.round(Number(item.total || 0)));
  const reservedCount = Math.max(0, Math.round(Number(item.reserved || 0)));
  const existingSerials = Array.isArray(item.serials) ? item.serials : [];
  const nonSoldSerials = existingSerials.filter((serial) => serial.status !== "Satılıb");
  const serials = [...existingSerials];
  const prefix = buildSerialPrefix(item.product, warehouseId);

  for (let index = nonSoldSerials.length; index < totalCount; index += 1) {
    serials.push({
      imei: `${prefix}-${String(index + 1).padStart(5, "0")}`,
      status: index < reservedCount ? "Rezervdə" : "Anbarda",
      warehouseId,
      product: item.product,
    });
  }

  let reservedSeen = 0;
  const normalizedSerials = serials.map((serial) => {
    if (serial.status === "Satılıb") return serial;
    reservedSeen += 1;
    return {
      ...serial,
      status: reservedSeen <= reservedCount ? "Rezervdə" : "Anbarda",
      warehouseId: serial.warehouseId || warehouseId,
      product: serial.product || item.product,
    };
  });

  return {
    ...item,
    serials: normalizedSerials,
  };
}

function ensureWarehouseSerials(warehouseStock = {}) {
  return Object.fromEntries(
    Object.entries(warehouseStock).map(([warehouseId, rows]) => [
      warehouseId,
      (rows || []).map((item) => ensureStockItemSerials(item, warehouseId)),
    ]),
  );
}

function getAvailableSerialsForProduct(warehouseStock = {}, warehouseId, product) {
  const item = (warehouseStock?.[warehouseId] || []).find((row) => row.product === product);
  if (!item || !isSerialTrackedProduct(item)) return [];
  return (item.serials || []).filter((serial) => serial.status === "Anbarda").map((serial) => serial.imei);
}

function updateSerialStatuses(rows, productLines, nextStatus, orderId) {
  return rows.map((item) => {
    const matchingLines = productLines.filter((line) => line.product === item.product);
    if (matchingLines.length === 0 || !Array.isArray(item.serials) || item.serials.length === 0) return item;

    const requestedSerials = new Set(matchingLines.flatMap((line) => line.serials || []).filter(Boolean));
    const neededFallback = matchingLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    let fallbackCount = 0;

    return {
      ...item,
      serials: item.serials.map((serial) => {
        const explicit = requestedSerials.has(serial.imei);
        const fallback =
          requestedSerials.size === 0 &&
          serial.status !== "Satılıb" &&
          fallbackCount < neededFallback &&
          (nextStatus === "Satılıb" ? serial.status === "Rezervdə" : serial.status === "Anbarda");

        if (!explicit && !fallback) return serial;
        fallbackCount += fallback ? 1 : 0;
        return {
          ...serial,
          status: nextStatus,
          orderId,
          reservedAt: nextStatus === "Rezervdə" ? currentBusinessDate : serial.reservedAt,
          soldAt: nextStatus === "Satılıb" ? currentBusinessDate : serial.soldAt,
        };
      }),
    };
  });
}

function releaseOrderSerialReservations(rows, productLines, orderId) {
  return rows.map((item) => {
    const matchingLines = productLines.filter((line) => line.product === item.product);
    if (matchingLines.length === 0 || !Array.isArray(item.serials) || item.serials.length === 0) return item;

    const requestedSerials = new Set(matchingLines.flatMap((line) => line.serials || []).filter(Boolean));
    const fallbackLimit = matchingLines.reduce((sum, line) => sum + Number(line.qty || 0), 0);
    let releasedCount = 0;

    return {
      ...item,
      serials: item.serials.map((serial) => {
        const explicit = requestedSerials.has(serial.imei);
        const sameOrder = serial.orderId === orderId;
        const fallback = requestedSerials.size === 0 && sameOrder && releasedCount < fallbackLimit;
        if (serial.status !== "Rezervdə" || (!explicit && !fallback)) return serial;
        releasedCount += 1;
        return {
          ...serial,
          status: "Anbarda",
          orderId: "",
          reservedAt: "",
        };
      }),
    };
  });
}

function adjustStockRows(rows, quantities, { totalDelta = 0, reservedDelta = 0, createMissing = false }) {
  const seen = new Set();
  const next = rows.map((item) => {
    const qty = quantities.get(item.product) || 0;
    if (!qty) return item;
    seen.add(item.product);
    return {
      ...item,
      // Qalıq heç vaxt mənfi olmur; rezerv qalıqdan çox ola bilər (backorder).
      total: Math.max(0, item.total + totalDelta * qty),
      reserved: Math.max(0, item.reserved + reservedDelta * qty),
    };
  });
  if (!createMissing) return next;
  // Anbarda sətri olmayan məhsul da satıla bilər — sıfır qalıqla rezerv sətri açılır.
  quantities.forEach((qty, product) => {
    if (!qty || seen.has(product) || next.some((item) => item.product === product)) return;
    next.push({
      product,
      total: 0,
      reserved: Math.max(0, reservedDelta * qty),
      price: 0,
      serials: [],
    });
  });
  return next;
}


function normalizeOperationalLabels(snapshot = {}) {
  return {
    ...snapshot,
    onboarding: {
      ...(snapshot.onboarding || {}),
      companyStage: normalize(snapshot.onboarding?.companyStage).includes("demo")
        ? "Go-live hazırlığı"
        : snapshot.onboarding?.companyStage,
    },
    invoiceSettings: {
      ...(snapshot.invoiceSettings || {}),
      eTaxMode: normalize(snapshot.invoiceSettings?.eTaxMode).includes("demo")
        ? "E-qaimə inteqrasiya rejimi"
        : snapshot.invoiceSettings?.eTaxMode,
    },
    productionPlans: (snapshot.productionPlans || []).map((plan) => ({
      ...plan,
      product: normalize(plan.product).includes("showroom demo") ? "Showroom nümayiş dəsti" : plan.product,
    })),
  };
}

function normalizeContractNumbers(snapshot = {}) {
  const found = [];
  const add = value => {
    if (typeof value !== "string" || !value || /^İN-\d+$/u.test(value) || found.includes(value)) return;
    if (/^(MQ-|MÜQ-|CONTRACT-)/iu.test(value)) found.push(value);
  };
  (snapshot.contracts || []).forEach(item => add(item.id));
  (snapshot.orders || []).forEach(item => add(item.contractId));
  (snapshot.credits || []).forEach(item => add(item.contractId));
  (snapshot.cashEntries || []).forEach(item => add(item.contractId));
  (snapshot.invoices || []).forEach(item => add(item.contractId));
  if (!found.length) return snapshot;
  const used = [];
  const collectUsed = value => { if (typeof value === "string") { const match = value.match(/^İN-(\d+)$/u); if (match) used.push(Number(match[1])); } };
  [...(snapshot.contracts || []), ...(snapshot.orders || []), ...(snapshot.credits || [])].forEach(item => { collectUsed(item.id); collectUsed(item.contractId); });
  let next = Math.max(1000, ...used) + 1;
  const replacements = new Map(found.map(oldId => [oldId, `İN-${next++}`]));
  const replaceDeep = value => {
    if (typeof value === "string") return replacements.get(value) || value;
    if (Array.isArray(value)) return value.map(replaceDeep);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceDeep(item)]));
    return value;
  };
  return replaceDeep(snapshot);
}

function nextContractNumber(state = {}) {
  const numbers = [];
  [...(state.contracts || []), ...(state.orders || []), ...(state.credits || [])].forEach(item => {
    [item.id, item.contractId].forEach(value => {
      const match = String(value || "").match(/^İN-(\d+)$/u);
      if (match) numbers.push(Number(match[1]));
    });
  });
  return `İN-${Math.max(1000, ...numbers) + 1}`;
}

function nextSalesOrderNumber(orders = []) {
  const numbers = orders.map(order => String(order.order_no || order.orderNo || "").match(/^SF-(\d+)$/u))
    .filter(Boolean).map(match => Number(match[1]));
  return `SF-${Math.max(1000, ...numbers) + 1}`;
}

function hydrateState(snapshot = {}) {
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

function loadPersistentState() {
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

function getCurrentUser(settings = {}) {
  const safeSettings = ensureSettings(settings);
  return safeSettings.users.find((user) => user.id === safeSettings.sessionUserId) || null;
}

function hasRolePermission(settings, permission) {
  if (!permission) return true;
  const user = getCurrentUser(settings);
  if (!user) return false;
  if (user.role === "Platform Super Admin") return true;
  const role = getActiveRole(settings);
  return Array.isArray(role?.permissions) && role.permissions.includes(permission);
}

function hasUserModuleAccess(settings, moduleId) {
  if (!moduleId) return true;
  const user = getCurrentUser(settings);
  if (!user) return false;
  if (user.role === "Platform Super Admin") return true;
  return normalizeUserModuleAccess(user, ensureSettings(settings).roles).includes(moduleId);
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

function buildProductionHardeningReport(snapshot = {}, { goLiveReport = {}, apiWebhookRows = [], apiSecretRows = [], notificationProviderRows = [] } = {}) {
  const dbMeta = snapshot.dbMeta || {};
  const auditLog = snapshot.auditLog || [];
  const isServerRuntime = dbMeta.runtime === "server";
  const providerName = normalize(dbMeta.provider || "");
  const isExternalDb = isServerRuntime && !providerName.includes("local persistent");
  const immutableAudit = normalize(dbMeta.auditMode || import.meta.env?.VITE_AUDIT_MODE || "").includes("immutable") || auditLog.length > 0;
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

function addStockToRows(rows, product, qty, price, warehouseId = "", productMeta = {}) {
  const amount = Math.max(0, Math.round(Number(qty || 0)));
  if (!product || amount <= 0) return rows;

  const exists = rows.some((item) => item.product === product);
  if (exists) {
    return rows.map((item) => {
      if (item.product !== product) return item;

      const nextItem = {
        ...item,
        total: Number(item.total || 0) + amount,
        price: Number(price || item.price || 0),
        ...(Number.isFinite(Number(productMeta.costPrice)) ? { costPrice: Number(productMeta.costPrice) } : {}),
        ...(productMeta.sku ? { sku: productMeta.sku } : {}),
        ...(productMeta.category ? { category: productMeta.category } : {}),
        ...(productMeta.unit ? { unit: productMeta.unit } : {}),
        ...(typeof productMeta.serialTracked === "boolean" ? { serialTracked: productMeta.serialTracked } : {}),
        ...(Number.isFinite(Number(productMeta.reorderLevel)) ? { reorderLevel: Number(productMeta.reorderLevel) } : {}),
      };
      return {
        ...nextItem,
        serials: ensureStockItemSerials(nextItem, warehouseId).serials,
      };
    });
  }

  return [
    ...rows,
    ensureStockItemSerials(
      {
        product,
        total: amount,
        reserved: 0,
        price: Number(price || 0),
        ...(Number.isFinite(Number(productMeta.costPrice)) ? { costPrice: Number(productMeta.costPrice) } : {}),
        ...(productMeta.sku ? { sku: productMeta.sku } : {}),
        ...(productMeta.category ? { category: productMeta.category } : {}),
        ...(productMeta.unit ? { unit: productMeta.unit } : {}),
        ...(typeof productMeta.serialTracked === "boolean" ? { serialTracked: productMeta.serialTracked } : {}),
        ...(Number.isFinite(Number(productMeta.reorderLevel)) ? { reorderLevel: Number(productMeta.reorderLevel) } : {}),
      },
      warehouseId,
    ),
  ];
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

function hasEffectivePermission(settings, permission) {
  if (!hasRolePermission(settings, permission)) return false;
  return hasUserModuleAccess(settings, getModuleForPermission(permission));
}

function canAccessNavItem(settings, id) {
  const permission = navPermissionByType[id];
  return hasUserModuleAccess(settings, id) && (!permission || hasRolePermission(settings, permission));
}

function getPageActionPermission(moduleId) {
  return pageActionPermissionByType[moduleId] || null;
}

function hasPageAction(moduleId) {
  return Boolean(pageMeta[moduleId]?.action) && !pageActionlessModules.has(moduleId);
}

export const dbBackedCollections = [
  "customers",
  "products",
  "orders",
  "invoices",
  "stock",
  "warehouses",
  "vendors",
  "accounting",
];

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
