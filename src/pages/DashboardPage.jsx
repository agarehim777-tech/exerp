import {
  Check,
  ChevronRight,
  CircleAlert,
  Package,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  DataTable,
  MetricCard,
  Panel,
  PanelHeader,
  StatusBadge,
  TwoLine,
} from "../components/ui.jsx";
import { money } from "../services/format.js";
import { formatPaymentDate, parsePaymentDate } from "../services/date.js";
import {
  WorkflowSteps,
  currentBusinessDate,
} from "../shared/lib/appDomain.jsx";
import {
  navIcons,
} from "../shared/lib/appDomain.jsx";

export default function DashboardPage({
  stats,
  orders,
  stock,
  expenses,
  notifications,
  actions = [],
  moduleReadiness = { items: [] },
  advanceOrder,
  setActive,
}) {
  const chart = [
    { month: "Yan", value: 145 },
    { month: "Fev", value: 168 },
    { month: "Mar", value: 192 },
    { month: "Apr", value: 178 },
    { month: "May", value: 249 },
  ];
  const pending = expenses.filter((expense) => expense.status === "Təsdiq gözləyir");

  return (
    <div className="stack">
      <section className="metric-grid">
        <MetricCard
          label="Aylıq gəlir"
          value={money(stats.revenue)}
          trend="+18.4% keçən aya"
          icon={Wallet}
          tone="success"
        />
        <MetricCard
          label="Aktiv müştəri"
          value={stats.activeCustomers}
          trend="+62 bu ay"
          icon={Users}
          tone="primary"
        />
        <MetricCard
          label="Açıq sifariş"
          value={stats.openOrders}
          trend="+12 bu həftə"
          icon={ShoppingCart}
          tone="info"
        />
        <MetricCard
          label="Təsdiq gözləyir"
          value={stats.pending}
          trend={`${pending.length} maliyyə əməliyyatı`}
          icon={CircleAlert}
          tone="warning"
        />
      </section>

      <section className="dashboard-grid">
        <Panel className="span-2">
          <PanelHeader
            title="Aylıq Satış Dinamikası"
            subtitle="Son 5 ay üzrə dövriyyə (min ₼)"
            icon={TrendingUp}
          />
          <div className="bar-chart" aria-label="Aylıq satış qrafiki">
            {chart.map((item) => {
              const height = Math.max(9, (item.value / 249) * 100);
              return (
                <div className="bar-item" key={item.month}>
                  <span>{item.value}k</span>
                  <svg className="bar-visual" viewBox="0 0 58 100" preserveAspectRatio="none" aria-hidden="true">
                    <rect x="0" y={100 - height} width="58" height={height} rx="6" />
                  </svg>
                  <small>{item.month}</small>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Əməliyyat Axını"
            subtitle={`${stats.reserved} rezerv · ${stats.available} satış üçün`}
            icon={Package}
          />
          <WorkflowSteps activeStage="Yoldadır" compact />
          <div className="mini-list">
            {notifications.slice(0, 3).map((item) => (
              <button key={item.id} className="mini-row" onClick={() => setActive("notifications")}>
                <span className={`dot ${item.unread ? "danger" : ""}`} />
                <span>{item.title}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </Panel>
      </section>

      <Panel className="module-handover-panel">
        <PanelHeader
          title="Modul təhvil xəritəsi"
          subtitle={`${moduleReadiness.ready || 0} hazır · ${moduleReadiness.watch || 0} nəzarət · ${moduleReadiness.blockers || 0} bloker`}
          icon={ShieldCheck}
        />
        <div className="module-handover-summary">
          <div>
            <span>Ümumi status</span>
            <strong>{moduleReadiness.status || "Yoxlanılır"}</strong>
            <small>{moduleReadiness.score || 0}% hazırlıq</small>
          </div>
          <div>
            <span>Əsas prinsip</span>
            <strong>Modullar bağlı işləyir</strong>
            <small>Satış - Anbar - Təhvil - Kredit - Maliyyə - KPI</small>
          </div>
          <div>
            <span>Növbəti yoxlama</span>
            <strong>{formatPaymentDate(parsePaymentDate(currentBusinessDate))}</strong>
            <small>Dashboard və Ayarlar panelindən izlənir</small>
          </div>
        </div>
        <div className="module-handover-grid">
          {(moduleReadiness.items || []).map((item) => {
            const Icon = navIcons[item.module] || ShieldCheck;
            return (
              <button key={item.module} className="module-handover-card" type="button" onClick={() => setActive(item.module)}>
                <span className="module-handover-icon"><Icon size={17} /></span>
                <div>
                  <div className="module-handover-title">
                    <strong>{item.title}</strong>
                    <StatusBadge status={item.status} />
                  </div>
                  <p>{item.detail}</p>
                  <div className="module-handover-meta">
                    <span>{item.primary}</span>
                    <span>{item.secondary}</span>
                  </div>
                  <small>{item.next}</small>
                </div>
                <ChevronRight size={16} />
              </button>
            );
          })}
        </div>
      </Panel>

      <section className="dashboard-grid">
        <Panel className="span-2">
          <PanelHeader title="Son Sifarişlər" subtitle="Statusu dəyişmək üçün mərhələ düyməsini istifadə edin" />
          <DataTable
            columns={["№", "Müştəri", "Məhsul", "Məbləğ", "Status", "Əməliyyat"]}
            rows={orders.slice(0, 6).map((order) => [
              <strong>{order.id}</strong>,
              <TwoLine title={order.customer} subtitle={order.fin} />,
              order.products,
              money(order.amount),
              <StatusBadge status={order.status} />,
              <button className="text-btn" onClick={() => advanceOrder(order.id)}>
                Növbəti
              </button>,
            ])}
          />
        </Panel>

        <Panel className="today-action-panel">
          <PanelHeader
            title="Bu gün görüləcək işlər"
            subtitle={`${formatPaymentDate(parsePaymentDate(currentBusinessDate))} üzrə prioritet əməliyyatlar`}
            icon={ShieldCheck}
          />
          <div className="today-action-list">
            {actions.slice(0, 6).map((action) => {
              const Icon = action.icon || CircleAlert;
              return (
                <button key={action.id} className="today-action-row" onClick={() => setActive(action.module)}>
                  <span className={`today-action-icon ${action.priority === "Yüksək" ? "danger" : "info"}`}>
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </div>
                  <TwoLine title={money(action.amount)} subtitle={action.status} />
                </button>
              );
            })}
            {actions.length === 0 && (
              <div className="today-action-empty">
                <Check size={16} />
                Bu gün üçün kritik əməliyyat yoxdur
              </div>
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
}
