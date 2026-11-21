// Hesabatlar: modul xülasə sətirləri, risk reyestri (prioritet və məbləğə görə) və export üçün hesabat paketi
// (bal, risk sayı, checklist). appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { money, normalize } from "../../services/format.js";
import { total } from "../utils/aggregate.js";
import { getOrderBalance, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { currentBusinessDate } from "./businessDate.ts";
import { buildInvoiceControlSummary, getInvoiceAgingBucket } from "./financeDomain.ts";
import { buildHrEmployeeRecords, getEmployeeKey } from "./appDomainHr.jsx";
import { buildProductLookup, getReorderPoint, isPurchaseOrderOpen } from "./appDomainProcurement.jsx";
import { getAvailableQuantity, isLowStockItem } from "./appDomainWarehouse.jsx";
import { getCreditDisplayPlan, getCreditPaymentState } from "./credit.js";
import { flattenWarehouseStock } from "./warehouseStockRows.ts";

type Row = Record<string, any>;

export interface ReportSources {
  orders?: Row[];
  credits?: Row[];
  vendors?: Row[];
  employees?: Row[];
  expenses?: Row[];
  warehouseStock?: Record<string, Row[]>;
  products?: Row[];
  purchaseOrders?: Row[] | null;
  invoices?: Row[];
  cashEntries?: Row[];
}

export interface ReportModuleRow {
  module: string;
  metric: string;
  count: string;
  signal: string;
  status: string;
}

export interface ReportRiskRow {
  id: unknown;
  area: string;
  title: unknown;
  amount: number;
  owner: unknown;
  action: unknown;
  priority: string;
  status: unknown;
}

export interface ReportPackage {
  period: string;
  generatedAt: string;
  rows: number;
  sections: number;
  score: number;
  riskCount: number;
  criticalCount: number;
  revenue: number;
  creditBalance: number;
  invoiceBalance: number;
  moduleRows: ReportModuleRow[];
  riskRows: ReportRiskRow[];
  checklist: { label: string; status: string }[];
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
}: ReportSources): ReportModuleRow[] {
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
  const payrollCost = payrollRows.reduce((sum: number, employee: Row) => sum + Number(employee.employerCost || 0), 0);
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
      module: "Təchizatçı / PO",
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
}: ReportSources): ReportRiskRow[] {
  const riskRows: ReportRiskRow[] = [];
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
        area: "Təchizatçı / PO",
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

  const priorityOrder: Record<string, number> = { "Yüksək": 0, Orta: 1, "Aşağı": 2 };
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
}: ReportSources & { productionPlans?: Row[] | null }): ReportPackage {
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

export { buildReportModuleRows, buildReportRiskRows, buildReportPackage };
