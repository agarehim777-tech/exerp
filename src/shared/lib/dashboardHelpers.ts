// Dashboard: bugünkü əməliyyat növbəsi (kredit, vergi, təhvil, xərc, stok, faktura; prioritet və məbləğə görə ilk 12)
// və rəhbərlik xülasə kartları. appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir.
import { CalendarClock, CreditCard, FileText, Package, Truck, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { normalize } from "../../services/format.js";
import { enrichDeliveryOrder, getDeliveryAgeDays, getDeliveryRisk, getOrderBalance, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { buildProductLookup } from "./appDomainProcurement.jsx";
import { getAvailableQuantity, isLowStockItem } from "./appDomainWarehouse.jsx";
import { getCreditDisplayPlan, getCreditPaymentState } from "./credit.js";

type Row = Record<string, any>;

export interface TodayActionRow {
  id: string;
  module: string;
  title: string;
  detail: string;
  amount: number;
  priority: string;
  status: string;
  icon: ComponentType<any>;
}

export interface ExecutiveInsight {
  title: string;
  value: string | number;
  desc: string;
  tone: string;
}

function buildTodayActionRows({ credits, orders, expenses, stock, products = [], invoices, taxRows }: {
  credits: Row[];
  orders: Row[];
  expenses: Row[];
  stock: Row[];
  products?: Row[];
  invoices: Row[];
  taxRows: Row[];
}): TodayActionRow[] {
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

  const priorityOrder: Record<string, number> = { "Yüksək": 0, Orta: 1, "Aşağı": 2 };
  return [...creditActions, ...taxActions, ...deliveryActions, ...expenseActions, ...stockActions, ...invoiceActions]
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 12);
}

function buildExecutiveInsights({ orders, credits, vendors, employees }: { orders: Row[]; credits: Row[]; vendors: Row[]; employees: Row[] }): ExecutiveInsight[] {
  const creditRows = credits.map((credit) => {
    const plan = getCreditDisplayPlan(credit);
    return { credit, plan, paymentState: getCreditPaymentState(credit, plan) };
  });
  const overdueCount = creditRows.filter((item) => item.paymentState.isOverdue).length;
  // HR employee rows carry no KPI score; only rank people who have one, or the card named the first
  // employee as leader with "undefined% KPI".
  const topSeller = employees
    .filter((employee) => employee.kpi !== null && employee.kpi !== undefined && employee.kpi !== "" && Number.isFinite(Number(employee.kpi)))
    .sort((a, b) => Number(b.kpi) - Number(a.kpi))[0];
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

export { buildTodayActionRows, buildExecutiveInsights };
