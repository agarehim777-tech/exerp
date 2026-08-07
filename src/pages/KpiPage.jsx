import { AvatarLine, DataTable, EmptyState, MetricCard, Panel, PanelHeader, ProgressRow, StatusBadge, TwoLine } from "../components/ui.jsx";
import { CalendarClock, ShieldCheck, SlidersHorizontal, TrendingUp, Wallet } from "lucide-react";
import { money, percent } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useState } from "react";
import { buildKpiEmployeeScoreRows, getKpiPeriodKey } from "../shared/lib/appDomain.jsx";
export default function KpiPage({
  employees,
  salesBonuses = [],
  targetRows = [],
  employeeRows = [],
  activePeriod = {},
  periods = [],
  payouts = [],
  onRunPeriodAction,
}) {
  const [bonusFilter, setBonusFilter] = useState("Hamısı");
  const rankingSource = employeeRows.length > 0 ? employeeRows : buildKpiEmployeeScoreRows(employees, salesBonuses);
  const ranking = [...rankingSource].sort((a, b) => Number(b.kpi || 0) - Number(a.kpi || 0));
  const companyKpi = targetRows.find((row) => row.metricKey === "companyKpi")?.actual || 0;
  const topPerformer = ranking[0];
  const bonusSellers = [...new Set(salesBonuses.map((row) => row.seller).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
  const visibleBonuses = salesBonuses.filter((row) => bonusFilter === "Hamısı" || row.seller === bonusFilter);
  const bonusTotal = total(salesBonuses, "bonusAmount");
  const visibleBonusTotal = total(visibleBonuses, "bonusAmount");
  const payoutRows = rankingSource.filter((row) => Number(row.payoutAmount || 0) > 0);
  const periodHistory = [...periods].sort((a, b) => String(b.period).localeCompare(String(a.period)));
  const lastPayout = payouts[0];
  const canClose = activePeriod.status !== "Period bağlandı";
  const canApprove = activePeriod.status === "Period bağlandı" && activePeriod.approvalStatus !== "Təsdiq edildi";
  const canPayout = activePeriod.approvalStatus === "Təsdiq edildi" && activePeriod.payoutStatus !== "Ödənildi";

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Şirkət ümumi KPI" value={percent(companyKpi)} trend={`${ranking.length} əməkdaş üzrə`} icon={TrendingUp} tone="success" />
        <MetricCard label="Period score" value={percent(activePeriod.companyScore || 0)} trend={activePeriod.period || getKpiPeriodKey()} icon={CalendarClock} tone="primary" />
        <MetricCard label="Payout fondu" value={money(activePeriod.payoutAmount || 0)} trend={`${payoutRows.length} əməkdaş`} icon={Wallet} tone="warning" />
        <MetricCard label="Top performer" value={topPerformer?.name || "Məlumat yoxdur"} trend={topPerformer ? `${topPerformer.kpi}% KPI` : "Əməkdaş əlavə edilməyib"} icon={ShieldCheck} tone="primary" />
      </section>

      <section className="kpi-control-grid">
        <Panel className="kpi-target-plan-panel" data-testid="kpi-target-plan-panel">
          <PanelHeader title="KPI hədəf planı" subtitle="Çəkili hədəflər və cari faktiki nəticələr" icon={SlidersHorizontal} />
          <DataTable
            columns={["Hədəf", "Məsul", "Çəki", "Faktiki / Hədəf", "Progress", "Status"]}
            rows={targetRows.map((row) => [
              <TwoLine title={row.name} subtitle={row.metricKey} />,
              row.owner,
              `${row.weight}%`,
              <strong>{`${new Intl.NumberFormat("az-AZ").format(row.actual)}${row.unit} / ${new Intl.NumberFormat("az-AZ").format(row.target)}${row.unit}`}</strong>,
              <ProgressRow value={row.progress} caption={percent(row.progress)} compact />,
              <StatusBadge status={row.status} />,
            ])}
          />
        </Panel>

        <Panel className="kpi-period-panel" data-testid="kpi-period-panel">
          <PanelHeader title="Period bağlanışı" subtitle="Bağla, təsdiq et və payout-u maliyyəyə yaz" icon={CalendarClock} />
          <div className="kpi-period-grid">
            <div className="kpi-period-card">
              <span>Period</span>
              <strong>{activePeriod.period || getKpiPeriodKey()}</strong>
              <small>{activePeriod.closedAt || "Açıq hesablama"}</small>
            </div>
            <div className="kpi-period-card">
              <span>Status</span>
              <StatusBadge status={activePeriod.status || "Açıq period"} />
              <small>{percent(activePeriod.companyScore || 0)} score</small>
            </div>
            <div className="kpi-period-card">
              <span>Təsdiq</span>
              <StatusBadge status={activePeriod.approvalStatus || "Hazırlanır"} />
              <small>{activePeriod.approvedBy || "Təsdiq edən yoxdur"}</small>
            </div>
            <div className="kpi-period-card">
              <span>Payout</span>
              <StatusBadge status={activePeriod.payoutStatus || "Gözləyir"} />
              <small>{money(activePeriod.payoutAmount || 0)}</small>
            </div>
          </div>
          <div className="kpi-period-actions">
            <button
              className="secondary-btn"
              data-testid="kpi-close-period"
              disabled={!canClose}
              onClick={() => onRunPeriodAction?.("close")}
            >
              Periodu bağla
            </button>
            <button
              className="secondary-btn"
              data-testid="kpi-approve-period"
              disabled={!canApprove}
              onClick={() => onRunPeriodAction?.("approve")}
            >
              Təsdiq et
            </button>
            <button
              className="primary-btn"
              data-testid="kpi-payout-period"
              disabled={!canPayout}
              onClick={() => onRunPeriodAction?.("payout")}
            >
              Payout et
            </button>
          </div>
          {lastPayout && (
            <div className="kpi-last-payout">
              <span>Son payout</span>
              <strong>{money(lastPayout.amount)}</strong>
              <small>{lastPayout.period} · {lastPayout.at}</small>
            </div>
          )}
        </Panel>
      </section>

      <Panel className="kpi-payout-plan-panel" data-testid="kpi-payout-plan-panel">
        <PanelHeader title="Əməkdaş payout planı" subtitle="HR performans bonusu və satış bonuslarının yekun ödəniş siyahısı" icon={Wallet} />
        <DataTable
          columns={["Əməkdaş", "KPI", "Satış", "Performans bonusu", "Satış bonusu", "Payout", "Status"]}
          rows={rankingSource.map((row) => [
            <AvatarLine initials={row.initials} title={row.name} subtitle={`${row.department} · ${row.position}`} />,
            <strong>{percent(row.kpi || 0)}</strong>,
            <TwoLine title={`${row.salesOrders || 0} sifariş`} subtitle={money(row.salesPaid || 0)} />,
            money(row.performanceBonus || 0),
            money(row.salesBonus || 0),
            <strong>{money(row.payoutAmount || 0)}</strong>,
            <StatusBadge status={row.payoutStatus} />,
          ])}
        />
      </Panel>

      <section className="dashboard-grid">
        <Panel>
          <PanelHeader title="Əməkdaş reytinqi" subtitle="KPI nəticələrinə görə" />
          <div className="rank-list">
            {ranking.map((employee, index) => (
              <div className="rank-row" key={employee.employeeKey || employee.name}>
                <span>{index + 1}</span>
                <AvatarLine initials={employee.initials} title={employee.name} subtitle={employee.position} />
                <strong>{employee.kpi}%</strong>
              </div>
            ))}
            {ranking.length === 0 && <EmptyState title="Əməkdaş məlumatı yoxdur" />}
          </div>
        </Panel>
        <Panel className="kpi-period-history-panel">
          <PanelHeader title="Period tarixçəsi" subtitle="Bağlanmış KPI periodları və payout statusu" icon={CalendarClock} />
          <DataTable
            columns={["Period", "Score", "Payout", "Təsdiq", "Ödəniş"]}
            rows={periodHistory.map((period) => [
              <TwoLine title={period.period} subtitle={period.closedAt || "Açıq"} />,
              percent(period.companyScore || 0),
              money(period.payoutAmount || 0),
              <StatusBadge status={period.approvalStatus} />,
              <StatusBadge status={period.payoutStatus} />,
            ])}
          />
        </Panel>
      </section>

      <Panel className="kpi-bonus-panel">
        <PanelHeader
          title="Satışdan gələn bonuslar"
          subtitle="Satış sifarişində qeyd olunan satıcı bonus faizlərinə görə hesablanır"
          icon={Wallet}
        />
        <div className="kpi-bonus-toolbar">
          <div className="tabs" aria-label="Satış bonusu filtri">
            {["Hamısı", ...bonusSellers].map((filter) => (
              <button
                key={filter}
                className={bonusFilter === filter ? "active" : ""}
                onClick={() => setBonusFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="kpi-bonus-total">
            <span>Seçilmiş bonus</span>
            <strong>{money(visibleBonusTotal)}</strong>
          </div>
        </div>
        <DataTable
          columns={["Sifariş", "Satıcı", "Müştəri", "Məhsul", "Ödəniş", "% bonus", "Bonus", "Status"]}
          rows={visibleBonuses.map((row) => [
            <TwoLine title={row.orderId} subtitle={row.date} />,
            row.seller,
            row.customer,
            row.product,
            <TwoLine title={money(row.paid)} subtitle={row.paymentMethod} />,
            `${row.rate}%`,
            <strong>{money(row.bonusAmount)}</strong>,
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}