// API and notification commands moved from moduleActions.js: rotate an API secret, check a webhook rule's
// configuration (no HTTP request is sent), and the notification dispatch stub.
import { checkWebhookConfiguration } from "../lib/apiWebhookCheck.js";
import { ensureApiSecrets, ensureApiWebhooks } from "../lib/apiIntegrationHelpers.ts";
import { currentBusinessDate } from "../lib/businessDate.ts";
import { createPrefixedId } from "../utils/id.js";
import { getActionStamp } from "./actionStamp.ts";

type Row = Record<string, any>;
type AuditEntry = { module: string; action: string; detail: string };

export function createApiModuleActions({ activeRoleInfo, apiWebhookRows, auditCurrentState, currentUser, notify, requirePermission, setState }: {
  activeRoleInfo?: { name?: string } | null;
  apiWebhookRows: Row[];
  auditCurrentState: (state: Row, entry: AuditEntry) => Row;
  currentUser?: { name?: string } | null;
  notify: (message: string, tone?: string) => void;
  requirePermission: (permission: string, action: string) => boolean;
  setState: (update: (current: Row) => Row) => void;
}) {
  function rotateApiSecret(secretId: string) {
    if (!requirePermission("api.manage", "API secret rotasiya etmək")) return;

    const stamp = getActionStamp();
    setState((current) => {
      const secret = ensureApiSecrets(current.apiSecrets || []).find((item) => item.id === secretId);
      if (!secret) return current;
      const suffix = Date.now().toString(16).slice(-4).toUpperCase();
      const prefix = secret.type?.includes("token") ? "tok" : "whsec";
      const nextSecret = {
        ...secret,
        maskedValue: `${prefix}_••••••••${suffix}`,
        status: "Aktiv",
        lastRotatedAt: currentBusinessDate,
        lastRotatedBy: currentUser?.name || activeRoleInfo?.name || "System",
        version: Number(secret.version || 1) + 1,
      };

      return auditCurrentState(
        {
          ...current,
          apiSecrets: ensureApiSecrets(current.apiSecrets || []).map((item) => (item.id === secretId ? nextSecret : item)),
        },
        {
          module: "API/Webhook",
          action: "API secret rotasiya edildi",
          detail: `${secret.key} · v${nextSecret.version} · ${stamp}`,
        },
      );
    });
    notify("API secret/token rotasiyası tamamlandı.");
  }

  function runApiAction(mode = "auto") {
    const targetWebhook =
      mode === "retry"
        ? apiWebhookRows.find((webhook) => webhook.retryQueue > 0) || apiWebhookRows.find((webhook) => webhook.queueCount > 0) || apiWebhookRows[0]
        : apiWebhookRows.find((webhook) => webhook.queueCount > 0) || apiWebhookRows.find((webhook) => webhook.retryQueue > 0) || apiWebhookRows[0];

    if (!targetWebhook) {
      notify("Webhook qaydası tapılmadı.", "warning");
      return;
    }

    // Configuration check only: these rules have no sender, so no response code, latency or retry
    // result is reported. Real delivery runs through webhook-dispatch on the Integration ledger.
    const stamp = getActionStamp();
    let check = null as ReturnType<typeof checkWebhookConfiguration> | null;
    setState((current) => {
      const webhooks = ensureApiWebhooks(current.apiWebhooks || []);
      const secrets = ensureApiSecrets(current.apiSecrets || []);
      const sourceWebhook = webhooks.find((webhook) => webhook.id === targetWebhook.id) || targetWebhook;
      check = checkWebhookConfiguration(sourceWebhook, secrets);
      const log = {
        id: createPrefixedId("API-LOG"),
        webhookId: sourceWebhook.id,
        webhookName: sourceWebhook.name,
        event: sourceWebhook.event,
        method: sourceWebhook.method || "POST",
        target: sourceWebhook.target,
        result: check.result,
        responseCode: null,
        latencyMs: null,
        retryQueue: Number(sourceWebhook.retryQueue || 0),
        error: check.error,
        mode: mode === "retry" ? "Retry qaydası yoxlaması" : "Konfiqurasiya yoxlaması",
        at: stamp,
        nextRetryAt: "",
      };
      return auditCurrentState(
        {
          ...current,
          apiWebhooks: webhooks.map((webhook) => (webhook.id === sourceWebhook.id ? { ...webhook, lastTestAt: stamp } : webhook)),
          apiWebhookLogs: [log, ...(current.apiWebhookLogs || [])].slice(0, 80),
        },
        {
          module: "API/Webhook",
          action: "Webhook konfiqurasiyası yoxlanıldı",
          detail: `${sourceWebhook.id} · ${sourceWebhook.event} · ${check.result}${check.error ? ` (${check.error})` : ""}`,
        },
      );
    });
    notify(
      check?.ready
        ? `${targetWebhook.id} göndərişə hazırdır. HTTP sorğusu göndərilmədi; real göndəriş İnteqrasiya jurnalındadır.`
        : `${targetWebhook.id}: ${check?.error || "konfiqurasiya natamamdır"}. HTTP sorğusu göndərilmədi.`,
      check?.ready ? "info" : "warning",
    );
  }

  function runNotificationDispatchAction() {
    if (!requirePermission("notifications.manage", "bildiriş növbəsini göndərmək")) return;
    notify("Bildiriş xidməti qoşulmayıb. Göndəriş icra olunmadı.", "warning");
  }

  return { rotateApiSecret, runApiAction, runNotificationDispatchAction };
}
