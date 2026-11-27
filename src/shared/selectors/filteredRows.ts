// Topbar search, moved from App.jsx: every list the pages show, filtered by the search query.
import { useMemo } from "react";
import { filterRows } from "../lib/warehouseDomain.ts";

type Row = Record<string, any>;

export function useFilteredRows({ accountingData, apiWebhookRows, creditRecords, currencyExposureRows, invoiceRows, messageConversations, productionRows, projectRoiRows, query, receivableRows, state, taxCalendarRows }: {
  accountingData: { journalRows: Row[]; chartRows: Row[] };
  apiWebhookRows: Row[];
  creditRecords: Row[];
  currencyExposureRows: Row[];
  invoiceRows: Row[];
  messageConversations: Row[];
  productionRows: Row[];
  projectRoiRows: Row[];
  query: string;
  receivableRows: Row[];
  state: Row;
  taxCalendarRows: Row[];
}) {
  const filtered = useMemo(
    () => ({
      customers: filterRows(state.customers, query),
      orders: filterRows(state.orders, query),
      stock: filterRows(state.stock, query),
      warehouses: filterRows(state.warehouses, query),
      expenses: filterRows(state.expenses, query),
      invoices: filterRows(invoiceRows, query),
      accountingJournal: filterRows(accountingData.journalRows, query),
      accountingChart: filterRows(accountingData.chartRows, query),
      taxCalendar: filterRows(taxCalendarRows, query),
      currency: filterRows(currencyExposureRows, query),
      apiWebhooks: filterRows(apiWebhookRows, query),
      credits: filterRows(creditRecords, query),
      vendors: filterRows(state.vendors, query),
      employees: filterRows(state.employees, query),
      contracts: filterRows(state.contracts, query),
      receivables: filterRows(receivableRows, query),
      projects: filterRows(projectRoiRows, query),
      productionPlans: filterRows(productionRows, query),
      supportTickets: filterRows(state.supportTickets || [], query),
      knowledgeBase: filterRows(state.knowledgeBase || [], query),
      notifications: filterRows(state.notifications, query),
      conversations: filterRows(messageConversations, query),
    }),
    [
      query,
      state,
      creditRecords,
      receivableRows,
      projectRoiRows,
      productionRows,
      invoiceRows,
      accountingData,
      taxCalendarRows,
      currencyExposureRows,
      apiWebhookRows,
      messageConversations,
    ],
  );

  return filtered;
}
