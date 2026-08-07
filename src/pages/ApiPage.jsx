import { Bell, Check, Database, FileText, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { DataTable, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { total } from "../shared/utils/aggregate.js";
export default function ApiPage({
  webhooks,
  secrets = [],
  logs = [],
  snapshot = null,
  dbMeta = {},
  auditLog = [],
  onRunTest,
  onRotateSecret,
  canManage = true,
}) {
  const activeHooks = webhooks.filter((webhook) => webhook.status === "Aktiv");
  const queueTotal = total(webhooks, "queueCount");
  const retryTotal = total(webhooks, "retryQueue");
  const lastLog = logs[0];
  const failedLogs = logs.filter((log) => log.result !== "Uğurlu");

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Endpoint" value={webhooks.length} icon={ShieldCheck} tone="primary" />
        <MetricCard label="Aktiv webhook" value={activeHooks.length} icon={Check} tone="success" />
        <MetricCard label="Göndəriş növbəsi" value={queueTotal} icon={Bell} tone="warning" />
        <MetricCard label="Retry növbəsi" value={retryTotal} trend={lastLog ? `${lastLog.responseCode} · ${lastLog.result}` : "Test gözləyir"} icon={RefreshCw} tone={retryTotal ? "warning" : "info"} />
      </section>

      <Panel className="api-console-panel" data-testid="api-console-panel">
        <PanelHeader
          title="API konsolu"
          subtitle="Endpoint health, test nəticələri, retry və secret idarəetməsi"
          icon={ShieldCheck}
        />
        <div className="db-status-grid">
          <div>
            <span>DB provider</span>
            <strong>{dbMeta.provider || "Local persistent DB"}</strong>
          </div>
          <div>
            <span>Son əməliyyat</span>
            <strong>{dbMeta.lastAction || "—"}</strong>
          </div>
          <div>
            <span>Versiya</span>
            <strong>{dbMeta.version || 1}</strong>
          </div>
          <div>
            <span>Queue</span>
            <strong>{queueTotal}</strong>
          </div>
          <div>
            <span>Son API test</span>
            <strong>{snapshot?.result || lastLog?.result || "Yoxdur"}</strong>
          </div>
          <div>
            <span>Audit yazısı</span>
            <strong>{auditLog.length}</strong>
          </div>
        </div>
        <div className="api-action-row">
          <button className="primary-btn" data-testid="api-run-webhook-test" onClick={() => onRunTest?.("auto")} disabled={!canManage}>
            <Send size={16} />
            Webhook test
          </button>
          <button className="secondary-btn" data-testid="api-run-retry-test" onClick={() => onRunTest?.("retry")} disabled={!canManage || retryTotal === 0}>
            <RefreshCw size={16} />
            Retry işlə
          </button>
          <span>{lastLog ? `${lastLog.webhookId} · ${lastLog.at}` : "Hələ test nəticəsi yoxdur"}</span>
        </div>
      </Panel>

      <Panel className="api-endpoint-panel" data-testid="api-endpoint-panel">
        <PanelHeader title="Endpoint xəritəsi" subtitle="Modul hadisələrinin göndərildiyi real inteqrasiya endpoint-ləri" />
        <DataTable
          columns={["Endpoint", "Event", "URL", "Auth", "SLA", "Növbə", "Retry", "Status"]}
          rows={webhooks.map((webhook) => [
            <TwoLine title={webhook.name} subtitle={`${webhook.method || "POST"} · ${webhook.id}`} />,
            <StatusBadge status={webhook.event} />,
            <TwoLine title={webhook.target} subtitle={webhook.owner} />,
            <TwoLine title={webhook.authLabel} subtitle={webhook.secretStatus} />,
            `${webhook.slaSeconds || 30}s`,
            <strong>{webhook.queueCount}</strong>,
            <TwoLine title={`${webhook.retryQueue}/${webhook.retryMax}`} subtitle={webhook.nextRetryAt || webhook.retryState} />,
            <StatusBadge status={webhook.health} />,
          ])}
        />
      </Panel>

      <section className="api-ops-grid">
        <Panel className="api-secret-panel" data-testid="api-secret-panel">
          <PanelHeader title="Token / Secret vault" subtitle="Maskalanmış tokenlər, istifadə və rotasiya nəzarəti" icon={Database} />
          <DataTable
            columns={["Secret", "Maska", "Bağlı endpoint", "Rotasiya", "Status", "Əməliyyat"]}
            rows={secrets.map((secret) => [
              <TwoLine title={secret.label} subtitle={`${secret.key} · v${secret.version || 1}`} />,
              secret.maskedValue,
              <TwoLine title={`${secret.linkedCount} endpoint`} subtitle={secret.linkedEvents} />,
              <TwoLine title={`${secret.daysLeft} gün`} subtitle={secret.lastRotatedAt || "Tarix yoxdur"} />,
              <StatusBadge status={secret.health} />,
              <button
                className="text-btn"
                data-testid="api-secret-rotate"
                disabled={!canManage}
                onClick={() => onRotateSecret?.(secret.id)}
              >
                Yenilə
              </button>,
            ])}
          />
        </Panel>

        <Panel className="api-testlog-panel" data-testid="api-testlog-panel">
          <PanelHeader title="Test nəticələri və retry logu" subtitle={`${logs.length} log · ${failedLogs.length} uğursuz cəhd`} icon={FileText} />
          <DataTable
            columns={["Webhook", "Rejim", "Cavab", "Latency", "Retry", "Tarix"]}
            rows={logs.slice(0, 8).map((log) => [
              <TwoLine title={log.webhookName || log.webhookId} subtitle={log.event} />,
              log.mode,
              <TwoLine title={`${log.responseCode} · ${log.result}`} subtitle={log.error || log.target} />,
              `${log.latencyMs} ms`,
              <TwoLine title={String(log.retryQueue || 0)} subtitle={log.nextRetryAt || "—"} />,
              log.at,
            ])}
          />
        </Panel>
      </section>

      <Panel className="api-webhook-rule-panel">
        <PanelHeader title="Webhook qaydaları" subtitle="Hadisə, son payload və son test nəticəsi" />
        <DataTable
          columns={["Qayda", "Son payload", "Son test", "Cavab", "Məsul", "Retry vəziyyəti"]}
          rows={webhooks.map((webhook) => [
            <TwoLine title={webhook.name} subtitle={webhook.id} />,
            webhook.lastPayload,
            webhook.lastTestAt || "—",
            <TwoLine title={webhook.lastResponseCode} subtitle={webhook.lastLatencyMs ? `${webhook.lastLatencyMs} ms` : "—"} />,
            webhook.owner,
            <StatusBadge status={webhook.retryState} />,
          ])}
        />
      </Panel>
    </div>
  );
}

// CreditsPage extracted to src/pages/CreditsPage.jsx