import { Bell, Check, CircleAlert, Send, ShieldCheck } from "lucide-react";
import { DataTable, EmptyState, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { normalize } from "../services/format.js";
export default function NotificationsPage({
  notifications,
  automationRows = [],
  providerRows = [],
  sendLog = [],
  dispatchSnapshot = null,
  filter,
  setFilter,
  markAll,
  runDispatch,
  lastSweepAt,
  canManage = true,
}) {
  const filters = ["Cəmi", "Kredit", "Push", "SMS", "Email", "Oxunmamış"];
  const list = notifications.filter((item) => {
    if (filter === "Cəmi") return true;
    if (filter === "Oxunmamış") return item.unread;
    if (filter === "Kredit") return item.module === "credits" || normalize(`${item.title} ${item.body}`).includes("kredit");
    return item.type === filter;
  });
  const queueTotal = automationRows.reduce((sum, row) => sum + Number(row.queueCount || 0), 0);
  const eventTotal = automationRows.reduce((sum, row) => sum + Number(row.totalEventCount || 0), 0);
  const cooldownTotal = automationRows.reduce((sum, row) => sum + Number(row.cooldownCount || 0), 0);
  const activeProviders = providerRows.filter((provider) => provider.status === "Aktiv" && provider.enabled);
  const sentCount = sendLog.filter((row) => row.status === "Göndərildi").length;
  const blockedCount = sendLog.filter((row) => row.status !== "Göndərildi").length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Hazır növbə" value={queueTotal} trend={`${eventTotal} hadisə · ${cooldownTotal} cooldown`} icon={Bell} tone={queueTotal ? "warning" : "success"} />
        <MetricCard label="Aktiv provider" value={activeProviders.length} trend={`${providerRows.length} kanal`} icon={ShieldCheck} tone="primary" />
        <MetricCard label="Göndərildi" value={sentCount} trend={dispatchSnapshot ? `Son: ${dispatchSnapshot.sent}` : "Log üzrə"} icon={Send} tone="success" />
        <MetricCard label="Bloklandı" value={blockedCount} trend={dispatchSnapshot ? `${dispatchSnapshot.source || "Son"}: ${dispatchSnapshot.blocked}` : "Provider/kanal"} icon={CircleAlert} tone={blockedCount ? "danger" : "info"} />
      </section>
      <Panel>
        <div className="filter-bar">
          <div className="tabs">
            {filters.map((item) => (
              <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                {item}
              </button>
            ))}
          </div>
          <div className="notification-toolbar-actions">
            <button
              className="primary-btn"
              onClick={runDispatch}
              disabled={!canManage || queueTotal === 0}
              title={!canManage ? "Bildirişləri idarə etmək üçün icazə yoxdur" : queueTotal === 0 ? "Göndəriş növbəsi boşdur" : ""}
              data-testid="notification-run-dispatch"
            >
              <Send size={16} />
              Növbəni işlə
            </button>
            <button
              className="secondary-btn"
              onClick={markAll}
              disabled={!canManage}
              title={!canManage ? "Bildirişləri idarə etmək üçün icazə yoxdur" : ""}
            >
              <Check size={16} />
              Oxunmuş et
            </button>
          </div>
        </div>
        {(lastSweepAt || dispatchSnapshot) && (
          <div className="module-action-note">
            <Check size={16} />
            <span>
              {dispatchSnapshot
                ? `Son göndəriş: ${dispatchSnapshot.at} · ${dispatchSnapshot.source || "Növbə"} · ${dispatchSnapshot.sent} göndərildi · ${dispatchSnapshot.blocked} bloklandı`
                : `Son oxunma yoxlaması: ${lastSweepAt}`}
            </span>
          </div>
        )}
      </Panel>
      <Panel className="notification-provider-panel" data-testid="notification-provider-panel">
        <PanelHeader
          title="Provider bağlantıları"
          subtitle="SMS, email və push kanalları üçün endpoint, secret statusu və göndəriş sağlamlığı"
          icon={ShieldCheck}
        />
        <DataTable
          columns={["Kanal", "Provider", "Endpoint", "Sender", "Rejim", "Secret", "Göndərilib", "Status"]}
          rows={providerRows.map((provider) => [
            <StatusBadge status={provider.channel} />,
            <TwoLine title={provider.name} subtitle={provider.provider} />,
            provider.endpoint,
            provider.sender,
            provider.mode,
            provider.secretStatus,
            <TwoLine title={provider.sentCount || 0} subtitle={provider.lastSentAt || "Hələ yoxdur"} />,
            <StatusBadge status={provider.health} />,
          ])}
        />
      </Panel>
      <Panel className="notification-automation-panel">
        <PanelHeader
          title="Avtomatik xatırlatma qaydaları"
          subtitle="Kredit, anbar, PO, payroll və təhvil SLA siqnalları üçün göndəriş növbəsi"
          icon={Bell}
        />
        <DataTable
          columns={["Qayda", "Kanal", "Provider", "Trigger", "Hazır/Cooldown", "Son hadisə", "Prioritet", "Son run", "Status"]}
          rows={automationRows.map((rule) => [
            <TwoLine title={rule.name} subtitle={rule.id} />,
            <StatusBadge status={rule.channel} />,
            rule.providerName,
            rule.trigger,
            <TwoLine title={`${rule.queueCount} hazır`} subtitle={`${rule.cooldownCount || 0} cooldown / ${rule.totalEventCount || 0} hadisə`} />,
            rule.lastEvent,
            rule.events?.[0]?.priority || rule.cooldownEvents?.[0]?.priority || "—",
            rule.lastRunAt || "—",
            <StatusBadge status={rule.health} />,
          ])}
        />
      </Panel>
      <Panel className="notification-sendlog-panel" data-testid="notification-sendlog-panel">
        <PanelHeader title="Göndəriş logu" subtitle="Provider cavabı, kanal, alıcı və bağlı modul üzrə son göndərişlər" icon={Send} />
        <DataTable
          columns={["Tarix", "Kanal", "Provider", "Alıcı", "Mənbə", "Son tarix", "Mətn", "Status"]}
          rows={sendLog.slice(0, 12).map((row) => [
            row.sentAt,
            <StatusBadge status={row.channel} />,
            row.providerName,
            <TwoLine title={row.recipient} subtitle={row.target} />,
            <TwoLine title={row.ruleName} subtitle={row.context || row.entityId || row.source} />,
            row.dueDate || "—",
            row.body,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
      <Panel>
        <PanelHeader title="Sistem içi xəbərdarlıqlar" subtitle="Göndərişlər və modul hadisələri üzrə daxili bildiriş axını" icon={Bell} />
        <div className="notification-list">
          {list.map((item) => (
            <article className={`notification-row ${item.unread ? "unread" : ""}`} key={item.id}>
              <span className={`dot ${item.unread ? "danger" : ""}`} />
              <div>
                <div className="notification-title">
                  <strong>{item.title}</strong>
                  <StatusBadge status={item.type} />
                </div>
                <p>{item.body}</p>
                <small>{item.time}</small>
              </div>
            </article>
          ))}
          {list.length === 0 && <EmptyState title="Bu filtrdə bildiriş yoxdur" />}
        </div>
      </Panel>
    </div>
  );
}

// SettingsPage extracted to src/pages/SettingsPage.jsx