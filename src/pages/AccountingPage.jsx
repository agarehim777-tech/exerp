import { BarChart3, CircleAlert, FileText, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { DataTable, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money, percent } from "../services/format.js";
import { useMemo } from "react";
import { buildAccountingCloseChecklist } from "../shared/lib/appDomain.jsx";
export default function AccountingPage({ accounting, closeRun }) {
  const { balance, pl, cashFlow, journalRows, chartRows } = accounting;
  const closeControl = useMemo(() => buildAccountingCloseChecklist(accounting, closeRun), [accounting, closeRun]);

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Aktivlər" value={money(balance.assets)} icon={Wallet} tone="primary" />
        <MetricCard label="Öhdəliklər" value={money(balance.liabilities)} icon={CircleAlert} tone="warning" />
        <MetricCard label="Kapital" value={money(balance.equity)} icon={ShieldCheck} tone="success" />
        <MetricCard label="Net mənfəət" value={money(pl.netProfit)} trend={percent(pl.margin)} icon={TrendingUp} tone="info" />
      </section>

      <Panel className="accounting-close-panel" data-testid="accounting-close-readiness">
        <PanelHeader
          title="Ay bağlanışı nəzarəti"
          subtitle="Balans, kassa, jurnal və ƏDV sətirləri real əməliyyat datasından yoxlanır"
          icon={ShieldCheck}
        />
        <div className="accounting-close-summary">
          <div>
            <span>Hazır maddələr</span>
            <strong>{closeControl.readyCount}/{closeControl.checks.length}</strong>
            <small>{closeControl.warningCount} yoxlama gözləyir</small>
          </div>
          <div>
            <span>Balans fərqi</span>
            <strong>{money(closeControl.equationDiff)}</strong>
            <small>Aktiv - öhdəlik - kapital</small>
          </div>
          <div>
            <span>Kassa fərqi</span>
            <strong>{money(closeControl.cashDiff)}</strong>
            <small>1010 hesabı və cash-flow</small>
          </div>
          <div>
            <span>Bölüşdürülməmiş mənfəət</span>
            <strong>{money(closeControl.retainedEarnings)}</strong>
            <small>Net nəticə</small>
          </div>
        </div>
        <DataTable
          columns={["Yoxlama", "Detallar", "Status"]}
          rows={closeControl.checks.map((check) => [
            <strong>{check.label}</strong>,
            check.detail,
            <StatusBadge status={check.status} />,
          ])}
        />
      </Panel>

      {closeRun && (
        <Panel className="module-action-panel">
          <PanelHeader title="Son jurnal exportu" subtitle="Mühasibat bağlanışı üçün hazırlanan son əməliyyat" icon={FileText} />
          <div className="db-status-grid">
            <div>
              <span>Dövr</span>
              <strong>{closeRun.period}</strong>
            </div>
            <div>
              <span>Export vaxtı</span>
              <strong>{closeRun.exportedAt}</strong>
            </div>
            <div>
              <span>Jurnal sətri</span>
              <strong>{closeRun.journalCount}</strong>
            </div>
            <div>
              <span>Net mənfəət</span>
              <strong>{money(closeRun.netProfit)}</strong>
            </div>
          </div>
        </Panel>
      )}

      <section className="accounting-statement-grid">
        <Panel>
          <PanelHeader title="Balans" subtitle="Aktiv, öhdəlik və kapitalın qısa görünüşü" icon={BarChart3} />
          <div className="statement-list">
            <TwoLine title="Aktivlər" subtitle={money(balance.assets)} />
            <TwoLine title="Öhdəliklər" subtitle={money(balance.liabilities)} />
            <TwoLine title="Kapital" subtitle={money(balance.equity)} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="P&L" subtitle="Satış, maya, xərc və mənfəət" icon={TrendingUp} />
          <div className="statement-list">
            <TwoLine title="Satış gəliri" subtitle={money(pl.revenue)} />
            <TwoLine title="Maya dəyəri" subtitle={money(pl.costOfGoods)} />
            <TwoLine title="Əməliyyat xərci" subtitle={money(pl.operatingExpenses)} />
            <TwoLine title="Net mənfəət" subtitle={money(pl.netProfit)} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Cash flow" subtitle="Açılış, daxilolma, çıxış və bağlanış" icon={Wallet} />
          <div className="statement-list">
            <TwoLine title="Açılış" subtitle={money(cashFlow.opening)} />
            <TwoLine title="Daxilolma" subtitle={money(cashFlow.inflow)} />
            <TwoLine title="Çıxış" subtitle={money(cashFlow.outflow)} />
            <TwoLine title="Bağlanış" subtitle={money(cashFlow.closing)} />
          </div>
        </Panel>
      </section>

      <Panel>
        <PanelHeader title="Hesablar planı" subtitle="IFRS məntiqinə yaxınlaşdırılmış əməliyyat hesab qalıqları" />
        <DataTable
          columns={["Kod", "Hesab", "Tip", "Debet", "Kredit", "Qalıq"]}
          rows={chartRows.map((row) => [
            <strong>{row.code}</strong>,
            row.account,
            <StatusBadge status={row.type} />,
            row.debit > 0 ? money(row.debit) : "—",
            row.credit > 0 ? money(row.credit) : "—",
            <strong>{money(row.balance)}</strong>,
          ])}
        />
      </Panel>

      <Panel>
        <PanelHeader title="Jurnal yazılışları" subtitle="Satış, kredit kassası və xərc əməliyyatlarının ikili yazılışı" />
        <DataTable
          columns={["Tarix", "Mənbə", "Debet", "Kredit", "Məbləğ", "Status"]}
          rows={journalRows.map((row) => [
            row.date,
            <strong>{row.source}</strong>,
            row.debit,
            row.credit,
            money(row.amount),
            <StatusBadge status={row.status} />,
          ])}
        />
      </Panel>
    </div>
  );
}