import { Boxes, Check, CircleAlert, Package, Wallet } from "lucide-react";
import {
  DataTable,
  EmptyState,
  MetricCard,
  Panel,
  PanelHeader,
  StatusBadge,
  TwoLine,
} from "../../components/ui.jsx";
import { money, normalize, percent } from "../../services/format.js";
import { total } from "../../shared/utils/aggregate.js";

export function ProductionPage({ plans, onCompletePlan, canManage = true }) {
  const totalCost = total(plans, "totalCost");
  const totalRevenue = total(plans, "projectedRevenue");
  const riskCount = plans.filter((plan) => normalize(plan.status).includes("risk")).length;
  const producedQty = plans.reduce((sum, plan) => sum + Number(plan.producedQty || 0), 0);
  const readyCount = plans.filter((plan) => plan.canProduce).length;

  return (
    <div className="stack">
      <section className="metric-grid four">
        <MetricCard label="Plan sayı" value={plans.length} icon={Package} tone="primary" />
        <MetricCard label="Maya dəyəri" value={money(totalCost)} icon={Wallet} tone="warning" />
        <MetricCard label="İstehsala hazır" value={readyCount} trend={`${producedQty} hazır məhsul`} icon={Check} tone="success" />
        <MetricCard label="Xammal riski" value={riskCount} trend={money(totalRevenue)} icon={CircleAlert} tone={riskCount ? "danger" : "success"} />
      </section>
      <section className="production-control-grid" data-testid="production-control-panel">
        <div>
          <span>BOM axını</span>
          <strong>{plans.length}</strong>
          <small>Plan → xammal çıxışı → hazır məhsul mədaxili</small>
        </div>
        <div>
          <span>Faktiki maya</span>
          <strong>{money(totalCost)}</strong>
          <small>Material + əmək + overhead</small>
        </div>
        <div>
          <span>Anbar əlaqəsi</span>
          <strong>{plans.filter((plan) => plan.warehouseId).length}</strong>
          <small>Xammal və hazır məhsul real stokdadır</small>
        </div>
      </section>
      <Panel className="production-panel">
        <PanelHeader title="BOM və maya dəyəri" subtitle="Anbar qalığı, xammal sərfi, əmək və overhead əsasında hesablanır" icon={Package} />
        <DataTable
          columns={["Plan", "Anbar", "Say", "Material", "Xammal çıxışı", "Əmək/Overhead", "Vahid maya", "Hazır məhsul", "Status", "Əməliyyat"]}
          rows={plans.map((plan) => [
            <TwoLine title={plan.product} subtitle={plan.id} />,
            plan.warehouseName,
            `${plan.plannedQty} ədəd`,
            <TwoLine
              title={money(plan.materialCost)}
              subtitle={plan.materials.map((item) => `${item.product}: ${item.needed}/${item.available}`).join(", ")}
            />,
            <StatusBadge status={plan.issueStatus} />,
            `${money(Number(plan.laborCost || 0) + Number(plan.overheadCost || 0))}`,
            <strong>{money(plan.unitCost)}</strong>,
            <TwoLine title={plan.receiptStatus} subtitle={`Marja: ${percent(plan.margin)}`} />,
            <StatusBadge status={plan.status} />,
            <button
              className="secondary-btn compact"
              onClick={() => onCompletePlan(plan.id)}
              disabled={!canManage || !plan.canProduce}
              title={!canManage ? "İstehsalat icazəsi yoxdur" : !plan.canProduce ? plan.bottleneck : "Xammal çıxışı və mədaxil et"}
              data-testid="production-complete-plan"
            >
              <Check size={15} />
              İstehsal et
            </button>,
          ])}
        />
      </Panel>
      <Panel className="production-bom-panel">
        <PanelHeader title="BOM xammal kartları" subtitle="Hər plan üzrə tələb, mövcud qalıq və faktiki material dəyəri" icon={Boxes} />
        <div className="production-bom-grid">
          {plans.flatMap((plan) =>
            plan.materials.map((material) => (
              <article key={`${plan.id}-${material.product}`} className="production-bom-card">
                <div>
                  <StatusBadge status={material.enough ? "Hazır" : "Xammal riski"} />
                  <strong>{material.product}</strong>
                  <span>{plan.id} · {plan.warehouseName}</span>
                </div>
                <div>
                  <TwoLine title={`${material.needed} tələb`} subtitle={`${material.available} mövcud`} />
                  <TwoLine title={money(material.cost)} subtitle={`${money(material.unitCost)} / vahid`} />
                </div>
              </article>
            )),
          )}
          {plans.length === 0 && <EmptyState title="İstehsal planı yoxdur" />}
        </div>
      </section>
    </div>
  );
}
