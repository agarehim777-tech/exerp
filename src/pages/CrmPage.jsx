import { CalendarClock, CircleAlert, RefreshCw, Search, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { DataTable, MetricCard, Panel, PanelHeader, StatusBadge, TwoLine } from "../components/ui.jsx";
import { money } from "../services/format.js";
import { total } from "../shared/utils/aggregate.js";
import { useMemo, useState } from "react";
import { Customer360Modal, CustomerCreditHistory, buildCrmPipelineRows, buildCustomer360, matchesCrmCustomerSearch, matchesCrmCustomerSegment, matchesCrmPipelineFilter } from "../shared/lib/appDomain.jsx";
export default function CrmPage({ customers, credits, orders = [], contracts = [], onOpenSalesOrder, onOpenCredit, onDeleteCustomer }) {
  const [pipelineFilter, setPipelineFilter] = useState("Hamısı");
  const [selectedPipelineId, setSelectedPipelineId] = useState(null);
  const [selectedCustomerFin, setSelectedCustomerFin] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSegment, setCustomerSegment] = useState("Hamısı");
  const customerProfiles = useMemo(
    () =>
      customers.map((customer) => ({
        customer,
        profile: buildCustomer360(customer, { credits, orders, contracts }),
      })),
    [customers, credits, orders, contracts],
  );
  const delayed = customerProfiles.filter(({ customer, profile }) => profile.overdueCount > 0 || customer.delay > 0);
  const delayedDebt = delayed.reduce(
    (sum, { customer, profile }) => sum + Number(customer.debt || 0) + Number(profile.totalBalance || 0),
    0,
  );
  const platin = customers.filter((customer) => customer.category === "Platin");
  const creditsByCustomer = useMemo(
    () => new Map(customerProfiles.map(({ customer, profile }) => [customer.fin, profile.credits])),
    [customerProfiles],
  );
  const pipelineRows = useMemo(
    () => buildCrmPipelineRows(customers, credits, orders),
    [customers, credits, orders],
  );
  const pipelineStages = ["Hamısı", "Kredit uyğunluğu", "Təklif", "Upsell", "Təhvil sonrası", "Risk follow-up"];
  const customerSegments = ["Hamısı", "Aktiv kredit", "Gecikmə", "Açıq təhvil", "Borcsuz"];
  const visibleCustomerProfiles = customerProfiles.filter(
    (entry) => matchesCrmCustomerSegment(entry, customerSegment) && matchesCrmCustomerSearch(entry, customerSearch),
  );
  const visiblePipeline = pipelineRows.filter((row) => matchesCrmPipelineFilter(row, pipelineFilter));
  const pipelineValue = pipelineRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const selectedPipeline = pipelineRows.find((row) => row.id === selectedPipelineId) || null;
  const selectedCustomer = customers.find((customer) => customer.fin === selectedCustomerFin) || null;
  const portalReady = pipelineRows.filter((row) => row.activeCreditCount > 0 || row.openOrders > 0);
  const nextBestActions = [...pipelineRows]
    .sort((a, b) => {
      const scoreA = (a.stage === "Risk follow-up" ? 100 : 0) + a.value * (a.probability / 100);
      const scoreB = (b.stage === "Risk follow-up" ? 100 : 0) + b.value * (b.probability / 100);
      return scoreB - scoreA;
    })
    .slice(0, 4);
  const kanbanColumns = pipelineStages
    .filter((stage) => stage !== "Hamısı")
    .map((stage) => ({
      stage,
      rows: pipelineRows.filter((row) => row.stage === stage),
      value: pipelineRows
        .filter((row) => row.stage === stage)
        .reduce((sum, row) => sum + Number(row.value || 0), 0),
    }));

  return (
    <div className="stack">
      <section className="metric-grid three">
        <MetricCard label="Ümumi müştəri" value={customers.length} icon={Users} tone="primary" />
        <MetricCard label="Platin müştərilər" value={platin.length} icon={ShieldCheck} tone="success" />
        <MetricCard
          label="Gecikmiş ödəniş"
          value={`${delayed.length} müştəri`}
          trend={`${money(delayedDebt)} ümumi borc`}
          icon={CircleAlert}
          tone="danger"
        />
      </section>
      <section className="dashboard-grid crm-command-grid">
        <Panel className="span-2 crm-pipeline-panel">
          <PanelHeader
            title="CRM Pipeline"
            subtitle="Lead, təklif, kredit uyğunluğu və təhvil sonrası satış fürsətləri"
            icon={TrendingUp}
          />
          <div className="crm-pipeline-toolbar">
            <div className="tabs">
              {pipelineStages.map((stage) => (
                <button
                  key={stage}
                  className={pipelineFilter === stage ? "active" : ""}
                  onClick={() => setPipelineFilter(stage)}
                >
                  {stage}
                  <span>
                    {stage === "Hamısı"
                      ? pipelineRows.length
                      : pipelineRows.filter((row) => row.stage === stage).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="crm-pipeline-total">
              <span>Pipeline dəyəri</span>
              <strong>{money(pipelineValue)}</strong>
            </div>
          </div>
          <div className="crm-kanban-board">
            {kanbanColumns.map((column) => (
              <div className="crm-kanban-column" key={column.stage}>
                <div className="crm-kanban-head">
                  <strong>{column.stage}</strong>
                  <span>{column.rows.length} · {money(column.value)}</span>
                </div>
                <div className="crm-kanban-cards">
                  {column.rows.slice(0, 3).map((row) => (
                    <button
                      key={`${column.stage}-${row.id}`}
                      className={`crm-kanban-card${selectedPipelineId === row.id ? " is-selected" : ""}`}
                      onClick={() => setSelectedPipelineId(row.id)}
                      aria-pressed={selectedPipelineId === row.id}
                    >
                      <strong>{row.customer.name}</strong>
                      <span>{row.nextAction}</span>
                      <small>{money(row.value)} · {row.probability}%</small>
                    </button>
                  ))}
                  {column.rows.length === 0 && <span className="crm-kanban-empty">Boşdur</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="crm-pipeline-list">
            {visiblePipeline.map((row) => (
              <button
                key={row.id}
                className={`crm-pipeline-row${selectedPipelineId === row.id ? " is-selected" : ""}`}
                onClick={() => setSelectedPipelineId(row.id)}
                aria-pressed={selectedPipelineId === row.id}
              >
                <div>
                  <strong>{row.customer.name}</strong>
                  <span>
                    {row.source} · {row.nextAction}
                  </span>
                </div>
                <TwoLine title={money(row.value)} subtitle={`${row.probability}% ehtimal`} />
                <TwoLine title={row.owner} subtitle={`${money(row.limitLeft)} limit qalığı`} />
                <StatusBadge status={row.stage} />
              </button>
            ))}
          </div>
          {selectedPipeline && (
            <div className="crm-pipeline-selection" aria-live="polite">
              <div>
                <span>Secilmis musteri</span>
                <button
                  type="button"
                  className="crm-customer-link"
                  onClick={() => setSelectedCustomerFin(selectedPipeline.customer.fin)}
                >
                  {selectedPipeline.customer.name}
                </button>
                <small>FIN {selectedPipeline.customer.fin}</small>
              </div>
              <div>
                <span>Novbeti addim</span>
                <strong>{selectedPipeline.nextAction}</strong>
                <small>{selectedPipeline.owner} · {selectedPipeline.stage}</small>
              </div>
              <div>
                <span>Fursat</span>
                <strong>{money(selectedPipeline.value)}</strong>
                <small>{selectedPipeline.probability}% ehtimal</small>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="crm-automation-panel">
          <PanelHeader title="Növbəti addımlar" subtitle="Satış və risk komandası üçün avtomatik iş siyahısı" icon={CalendarClock} />
          <div className="crm-action-list">
            {nextBestActions.map((row) => (
              <div className="crm-action-row" key={`${row.id}-action`}>
                <div>
                  <strong>{row.customer.name}</strong>
                  <span>{row.nextAction}</span>
                </div>
                <StatusBadge status={row.stage} />
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel className="customer-portal-panel">
        <PanelHeader
          title="Müştəri portalı hazırlığı"
          subtitle="Balans, müqavilə, ödəniş tarixi və təhvil statusu müştəri kabinetində görünəcək"
          icon={Users}
        />
        <DataTable
          columns={["Müştəri", "Aktiv kredit", "Qalıq", "Növbəti ödəniş", "Açıq sifariş", "Portal statusu"]}
          rows={portalReady.map((row) => [
            <button
              type="button"
              className="crm-customer-name-btn"
              onClick={() => setSelectedCustomerFin(row.customer.fin)}
            >
              <TwoLine title={row.customer.name} subtitle={`FİN ${row.customer.fin}`} />
            </button>,
            row.activeCreditCount,
            money(row.totalBalance),
            row.nextPayment ? `${money(row.nextPayment.amount)} · ${row.nextPayment.due}` : "Yoxdur",
            row.openOrders,
            <StatusBadge status={row.totalBalance > 0 ? "Aktiv kabinet" : "Məlumat kabineti"} />,
          ])}
        />
      </Panel>
      <Panel>
        <PanelHeader title="Müştəri Reyestri" subtitle="FİN, müqavilə, cihaz, qalıq və gecikmə üzrə 360 nəzarət" />
        <div className="crm-registry-toolbar">
          <label className="crm-search-field">
            <span>Axtarış</span>
            <div>
              <Search size={15} />
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Müştəri, FİN, müqavilə, cihaz..."
              />
            </div>
          </label>
          <label>
            <span>Segment</span>
            <select value={customerSegment} onChange={(event) => setCustomerSegment(event.target.value)}>
              {customerSegments.map((segment) => (
                <option key={segment}>{segment}</option>
              ))}
            </select>
          </label>
          <button
            className="secondary-btn icon-only"
            type="button"
            title="Filterləri sıfırla"
            onClick={() => {
              setCustomerSearch("");
              setCustomerSegment("Hamısı");
            }}
          >
            <RefreshCw size={16} />
          </button>
          <div className="crm-registry-count">
            <span>Görünən müştəri</span>
            <strong>{visibleCustomerProfiles.length}</strong>
          </div>
        </div>
        <DataTable
          columns={["FİN", "Ad Soyad", "Telefon", "Kateqoriya", "Müqavilə", "Qalıq", "Növbəti ödəniş", "Status", "Əməliyyat"]}
          rows={visibleCustomerProfiles.map(({ customer, profile }) => {
            const customerCredits = creditsByCustomer.get(customer.fin) || [];
            const nextPayment = profile.nextPayment;
            const status =
              profile.overdueCount > 0 || customer.delay > 0
                ? `${Math.max(customer.delay || 0, nextPayment?.overdueDays || 0)} gün gecikmə`
                : profile.activeCreditCount > 0
                  ? "Aktiv kredit"
                  : profile.openOrders > 0
                    ? "Təhvil gözləyir"
                    : "Sağlam";

            return [
              <strong>{customer.fin}</strong>,
              <button
                type="button"
                className="crm-customer-name-btn"
                onClick={() => setSelectedCustomerFin(customer.fin)}
              >
                {customer.name}
              </button>,
              customer.phone,
              <StatusBadge status={customer.category} />,
              <CustomerCreditHistory credits={customerCredits} />,
              <strong>{money(profile.totalBalance + Number(customer.debt || 0))}</strong>,
              nextPayment ? `${money(nextPayment.monthly)} · ${nextPayment.nextDue}` : "Yoxdur",
              <StatusBadge status={status} />,
              onDeleteCustomer ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCustomer(customer.fin);
                  }}
                  title="Müştərini sil"
                >
                  Sil
                </button>
              ) : null,
            ];
          })}

        />
      </Panel>
      {selectedCustomer ? (
        <Customer360Modal
          customer={selectedCustomer}
          credits={credits}
          orders={orders}
          contracts={contracts}
          onOpenSalesOrder={onOpenSalesOrder}
          onOpenCredit={onOpenCredit}
          onClose={() => setSelectedCustomerFin("")}
        />
      ) : null}
    </div>
  );
}