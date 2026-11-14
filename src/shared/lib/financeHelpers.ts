// Maliyyə qurucuları: faktura sətirləri və xülasəsi, valyuta riski, mühasibat (jurnal, hesablar planı, balans, P&L,
// pul axını), əmək haqqı vergisi kalkulyatoru və vergi təqvimi.
// appHelpers.jsx bu modulu köhnə idxallar üçün yenidən ixrac edir; yeni kod birbaşa buradan idxal etsin.
import { normalize } from "../../services/format.js";
import { formatDateInput, formatPaymentDate, parsePaymentDate } from "../../services/date.js";
import { total } from "../utils/aggregate.js";
import { getOrderBalance, getOrderPaymentMethod, summarizeOrderProducts } from "../../modules/warehouse/deliveryDomain.jsx";
import { currentBusinessDate } from "./businessDate.ts";
import { currentBusinessYear, hasExpenseCashImpact } from "./appDomainFinance.jsx";
import { calculatePayrollTax2026 } from "./appDomainHr.jsx";
import { currentBusinessQuarter } from "./appDomainProcurement.jsx";
import { getAvailableQuantity } from "./appDomainWarehouse.jsx";
import { addDays, daysBetween, getCreditDisplayPlan, roundMoney } from "./credit.js";

type Row = Record<string, any>;

export interface InvoiceSettings {
  vatRate?: number | string;
  prefix?: string;
  paymentTermsDays?: number | string;
  defaultCurrency?: string;
}

export interface InvoiceRow {
  id: string;
  orderId: unknown;
  contractId: string;
  customer: unknown;
  fin: unknown;
  seller: string;
  voen: string;
  date: string;
  dueDate: string;
  products: string;
  paymentMethod: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  paid: number;
  balance: number;
  currency: string;
  eTaxStatus: string;
  invoiceBatchId: unknown;
  invoiceSentAt: unknown;
  status: string;
}

export interface InvoiceSummary {
  count: number;
  total: number;
  vat: number;
  paid: number;
  balance: number;
  ready: number;
}

export interface Accounting {
  journalRows: Row[];
  chartRows: Row[];
  balance: { assets: number; liabilities: number; equity: number };
  pl: {
    revenue: number;
    vat: number;
    costOfGoods: number;
    grossProfit: number;
    penaltyIncome: number;
    operatingExpenses: number;
    netProfit: number;
    margin: number;
  };
  cashFlow: { opening: number; inflow: number; outflow: number; closing: number; pendingOutflow: number };
  vatPayable: number;
}

interface TaxSources {
  invoices: Row[];
  payrollTaxRows: Row[];
  accounting: Pick<Accounting, "pl"> | { pl: Row };
}

function getInvoiceVatRate(invoiceSettings: InvoiceSettings = {}): number {
  return Number(invoiceSettings.vatRate || 18) / 100;
}

function buildInvoiceRows({ orders, settings = {}, invoiceSettings = {} }: { orders: Row[]; settings?: Row; invoiceSettings?: InvoiceSettings }): InvoiceRow[] {
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

function buildInvoiceSummary(invoices: Row[]): InvoiceSummary {
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

function buildCurrencyExposureRows({ currencyRates = [], orders, credits, cashEntries }: { currencyRates?: Row[]; orders: Row[]; credits: Row[]; cashEntries: Row[] }): Row[] {
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

function buildAccountingData({ orders, expenses, cashEntries, credits, stock, invoices, openingBalance = 0 }: {
  orders: Row[];
  expenses: Row[];
  cashEntries: Row[];
  credits: Row[];
  stock: Row[];
  invoices: Row[];
  openingBalance?: number | string;
}): Accounting {
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

function buildPayrollTaxCalculatorRows(records: Row[]): Row[] {
  return records.map((record) => {
    const gross = Number(record.salary || 0) + Number(record.bonus || 0);
    return {
      employee: record.name,
      department: record.department,
      ...calculatePayrollTax2026(gross),
    };
  });
}

function getTaxAmountByType(type: unknown, { invoices, payrollTaxRows, accounting }: TaxSources): number {
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

function buildTaxDueDate(day: number | string, monthOffset = 1): string {
  const [year, month] = currentBusinessDate.split("-").map(Number);
  const date = new Date(year, month - 1 + monthOffset, Number(day || 20));
  return formatDateInput(date);
}

function buildDefaultTaxCalendarItems({ invoices, payrollTaxRows, accounting }: TaxSources): Row[] {
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

function buildTaxCalendarRows({ taxCalendar = [], invoices, payrollTaxRows, accounting }: TaxSources & { taxCalendar?: Row[] | null }): Row[] {
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

export {
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
};
