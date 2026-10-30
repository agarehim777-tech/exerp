import { useMemo } from "react";
import { buildHrEmployeeRecords } from "../lib/appDomain.jsx";
import { buildAccountingData, buildCurrencyExposureRows, buildInvoiceRows, buildPayrollTaxCalculatorRows, buildReceivableRows, buildTaxCalendarRows, buildTodayActionRows } from "../lib/appHelpers.jsx";
import { total } from "../utils/aggregate.js";

// Receivables, invoices, accounting, tax and currency views derived from the tenant snapshot.
export function useFinanceViews({ state, creditRecords }) {
  const receivableRows = useMemo(
    () =>
      buildReceivableRows({
        customers: state.customers,
        orders: state.orders,
        credits: creditRecords,
        vendors: state.vendors,
        purchaseOrders: state.purchaseOrders || [],
      }),
    [state.customers, state.orders, creditRecords, state.vendors, state.purchaseOrders],
  );
  const invoiceRows = useMemo(
    () =>
      buildInvoiceRows({
        orders: state.orders,
        settings: state.settings,
        invoiceSettings: state.invoiceSettings,
      }),
    [state.orders, state.settings, state.invoiceSettings],
  );
  const payrollTaxRows = useMemo(
    () => buildPayrollTaxCalculatorRows(buildHrEmployeeRecords(state.employees)),
    [state.employees],
  );
  const financeOpeningBalance = useMemo(
    () => total(state.financeAccounts || [], "openingBalance"),
    [state.financeAccounts],
  );
  const accountingData = useMemo(
    () =>
      buildAccountingData({
        orders: state.orders,
        expenses: state.expenses,
        cashEntries: state.cashEntries || [],
        credits: creditRecords,
        stock: state.stock,
        invoices: invoiceRows,
        openingBalance: financeOpeningBalance,
      }),
    [state.orders, state.expenses, state.cashEntries, creditRecords, state.stock, invoiceRows, financeOpeningBalance],
  );
  const taxCalendarRows = useMemo(
    () =>
      buildTaxCalendarRows({
        taxCalendar: state.taxCalendar || [],
        invoices: invoiceRows,
        payrollTaxRows,
        accounting: accountingData,
      }),
    [state.taxCalendar, invoiceRows, payrollTaxRows, accountingData],
  );
  const currencyExposureRows = useMemo(
    () =>
      buildCurrencyExposureRows({
        currencyRates: state.currencyRates || [],
        orders: state.orders,
        credits: creditRecords,
        cashEntries: state.cashEntries || [],
      }),
    [state.currencyRates, state.orders, creditRecords, state.cashEntries],
  );
  const todayActionRows = useMemo(
    () =>
      buildTodayActionRows({
        credits: creditRecords,
        orders: state.orders,
        expenses: state.expenses,
        stock: state.stock,
        products: state.products || [],
        invoices: invoiceRows,
        taxRows: taxCalendarRows,
      }),
    [creditRecords, state.orders, state.expenses, state.stock, state.products, invoiceRows, taxCalendarRows],
  );
  return { receivableRows, invoiceRows, payrollTaxRows, financeOpeningBalance, accountingData, taxCalendarRows, currencyExposureRows, todayActionRows };
}
