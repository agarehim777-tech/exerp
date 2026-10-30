import { useMemo } from "react";
import { buildApiSecretRows, buildApiWebhookRows, buildNotificationAutomationRows, buildNotificationProviderRows } from "../lib/appHelpers.jsx";

// Notification providers/automations and API webhook/secret rows.
export function useIntegrationViews({ state, creditRecords, invoiceRows }) {
  const notificationProviderRows = useMemo(
    () => buildNotificationProviderRows(state.notificationProviders || [], state.settings, state.notificationSendLog || []),
    [state.notificationProviders, state.settings, state.notificationSendLog],
  );
  const notificationAutomationRows = useMemo(
    () =>
      buildNotificationAutomationRows({
        notificationRules: state.notificationRules || [],
        providers: state.notificationProviders || [],
        settings: state.settings,
        sendLog: state.notificationSendLog || [],
        credits: creditRecords,
        stock: state.stock,
        warehouseStock: state.warehouseStock,
        products: state.products || [],
        purchaseOrders: state.purchaseOrders || [],
        expenses: state.expenses,
        orders: state.orders,
      }),
    [state.notificationRules, state.notificationProviders, state.settings, state.notificationSendLog, creditRecords, state.stock, state.warehouseStock, state.products, state.purchaseOrders, state.expenses, state.orders],
  );
  // External delivery remains disabled until a server provider adapter is configured.
  const apiWebhookRows = useMemo(
    () =>
      buildApiWebhookRows({
        apiWebhooks: state.apiWebhooks || [],
        apiSecrets: state.apiSecrets || [],
        apiWebhookLogs: state.apiWebhookLogs || [],
        invoices: invoiceRows,
        credits: creditRecords,
        stock: state.stock,
        products: state.products || [],
        purchaseOrders: state.purchaseOrders || [],
        expenses: state.expenses,
      }),
    [state.apiWebhooks, state.apiSecrets, state.apiWebhookLogs, invoiceRows, creditRecords, state.stock, state.products, state.purchaseOrders, state.expenses],
  );
  const apiSecretRows = useMemo(
    () => buildApiSecretRows(state.apiSecrets || [], state.apiWebhooks || []),
    [state.apiSecrets, state.apiWebhooks],
  );
  return { notificationProviderRows, notificationAutomationRows, apiWebhookRows, apiSecretRows };
}
