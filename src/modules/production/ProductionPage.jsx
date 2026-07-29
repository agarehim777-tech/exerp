import { useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CircleAlert,
  Factory,
  Pencil,
  Play,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
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

const emptyMaterial = { product: "", qty: 1, unitCost: 0 };

function ProductionPlanModal({ plan, warehouses, stockOptions, onClose, onSubmit }) {
  const [values, setValues] = useState(() => ({
    product: plan?.product || "",
    plannedQty: Number(plan?.plannedQty || 1),
    warehouseId: plan?.warehouseId || warehouses[0]?.id || "",
    salePrice: Number(plan?.salePrice || 0),
    laborCost: Number(plan?.laborCost || 0),
    overheadCost: Number(plan?.overheadCost || 0),
    wasteRate: Number(plan?.wasteRate || 0),
    dueDate: plan?.dueDate || "",
    note: plan?.note || "",
    materials: (plan?.materials || [emptyMaterial]).map((item) => ({
      product: item.product || "",
      qty: Number(item.qty || 1),
      unitCost: Number(item.unitCost || 0),
    })),
  }));

  const selectedStock = stockOptions[values.warehouseId] || [];
  const materialUnitCost = values.materials.reduce(
    (sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || 0),
    0,
  );
  const materialTotal = materialUnitCost * Number(values.plannedQty || 0);
  const estimatedTotal = materialTotal + Number(values.laborCost || 0) + Number(values.overheadCost || 0);
  const unitCost = Number(values.plannedQty || 0) > 0 ? estimatedTotal / Number(values.plannedQty) : 0;
  const canSubmit =
    values.product.trim() &&
    values.warehouseId &&
    Number(values.plannedQty) > 0 &&
    values.materials.length > 0 &&
    values.materials.every((item) => item.product && Number(item.qty) > 0);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateMaterial(index, field, value) {
    setValues((current) => ({
      ...current,
      materials: current.materials.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field !== "product") return { ...item, [field]: value };
        const stockItem = selectedStock.find((row) => row.product === value);
        return {
          ...item,
          product: value,
          unitCost: Number(stockItem?.costPrice || stockItem?.price || item.unitCost || 0),
        };
      }),
    }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal-card production-plan-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit(values);
        }}
      >
        <div className="modal-head">
          <div>
            <h2>{plan ? "İstehsal planını redaktə et" : "Yeni istehsal planı"}</h2>
            <p>BOM, xammal anbarı, istehsal miqdarı və maya komponentlərini daxil edin.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Bağla">
            <X size={18} />
          </button>
        </div>

        <div className="production-form-grid">
          <label>
            <span>Hazır məhsul</span>
            <input
              value={values.product}
              onChange={(event) => update("product", event.target.value)}
              placeholder="Məsələn: Satış komplekti A"
              required
            />
          </label>
          <label>
            <span>Xammal anbarı</span>
            <select value={values.warehouseId} onChange={(event) => update("warehouseId", event.target.value)} required>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Plan miqdarı</span>
            <input type="number" min="1" value={values.plannedQty} onChange={(event) => update("plannedQty", event.target.value)} />
          </label>
          <label>
            <span>Plan bitmə tarixi</span>
            <input type="date" value={values.dueDate} onChange={(event) => update("dueDate", event.target.value)} />
          </label>
          <label>
            <span>Satış qiyməti / vahid</span>
            <input type="number" min="0" step="0.01" value={values.salePrice} onChange={(event) => update("salePrice", event.target.value)} />
          </label>
          <label>
            <span>İtki norması %</span>
            <input type="number" min="0" max="100" step="0.1" value={values.wasteRate} onChange={(event) => update("wasteRate", event.target.value)} />
          </label>
        </div>

        <section className="production-material-editor">
          <div className="section-title-row">
            <div>
              <strong>BOM xammalları</strong>
              <span>Norma bir hazır məhsul vahidi üçündür.</span>
            </div>
            <button
              type="button"
              className="secondary-btn compact"
              onClick={() => setValues((current) => ({ ...current, materials: [...current.materials, { ...emptyMaterial }] }))}
            >
              <Plus size={15} /> Xammal əlavə et
            </button>
          </div>
          <div className="production-material-lines">
            {values.materials.map((item, index) => (
              <div className="production-material-line" key={`${index}-${item.product}`}>
                <select value={item.product} onChange={(event) => updateMaterial(index, "product", event.target.value)} required>
                  <option value="">Xammal seçin</option>
                  {selectedStock.map((stockItem) => (
                    <option key={stockItem.product} value={stockItem.product}>
                      {stockItem.product} · mövcud {Math.max(0, Number(stockItem.total || 0) - Number(stockItem.reserved || 0))}
                    </option>
                  ))}
                </select>
                <label>
                  <span>Norma</span>
                  <input type="number" min="0.01" step="0.01" value={item.qty} onChange={(event) => updateMaterial(index, "qty", event.target.value)} />
                </label>
                <label>
                  <span>Vahid alış</span>
                  <input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateMaterial(index, "unitCost", event.target.value)} />
                </label>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Xammalı sil"
                  disabled={values.materials.length === 1}
                  onClick={() => setValues((current) => ({
                    ...current,
                    materials: current.materials.filter((_, itemIndex) => itemIndex !== index),
                  }))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="production-cost-inputs">
          <label>
            <span>Əmək xərci</span>
            <input type="number" min="0" step="0.01" value={values.laborCost} onChange={(event) => update("laborCost", event.target.value)} />
          </label>
          <label>
            <span>Əlavə istehsal xərci</span>
            <input type="number" min="0" step="0.01" value={values.overheadCost} onChange={(event) => update("overheadCost", event.target.value)} />
          </label>
          <label className="production-note-field">
            <span>Qeyd</span>
            <input value={values.note} onChange={(event) => update("note", event.target.value)} placeholder="Növbə, xətt və ya keyfiyyət qeydi" />
          </label>
        </div>

        <div className="production-cost-preview">
          <TwoLine title={money(materialTotal)} subtitle="Material" />
          <TwoLine title={money(values.laborCost)} subtitle="Əmək" />
          <TwoLine title={money(values.overheadCost)} subtitle="Overhead" />
          <TwoLine title={money(unitCost)} subtitle="Vahid maya" />
          <TwoLine title={money(estimatedTotal)} subtitle="Plan maya dəyəri" />
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
          <button type="submit" className="primary-btn" disabled={!canSubmit}>
            {plan ? "Dəyişiklikləri saxla" : "Planı yarat"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProductionPage({
  plans,
  warehouses = [],
  warehouseStock = {},
  onCreatePlan,
  onUpdatePlan,
  onDeletePlan,
  onStartPlan,
  onCompletePlan,
  canManage = true,
}) {
  const [statusFilter, setStatusFilter] = useState("Hamısı");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [editor, setEditor] = useState(null);
  const visiblePlans = useMemo(
    () => plans.filter((plan) => statusFilter === "Hamısı" || normalize(plan.status) === normalize(statusFilter)),
    [plans, statusFilter],
  );
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;
  const totalCost = total(plans, "totalCost");
  const totalRevenue = total(plans, "projectedRevenue");
  const riskCount = plans.filter((plan) => normalize(plan.status).includes("risk")).length;
  const producedQty = plans.reduce((sum, plan) => sum + Number(plan.producedQty || 0), 0);
  const readyCount = plans.filter((plan) => plan.canProduce).length;
  const completedCount = plans.filter((plan) => normalize(plan.status).includes("istehsal edildi")).length;

  return (
    <div className="stack production-module">
      <div className="production-toolbar">
        <div className="segmented-control" aria-label="İstehsal status filteri">
          {["Hamısı", "Planlandı", "İstehsaldadır", "İstehsal edildi", "Xammal riski"].map((status) => (
            <button key={status} type="button" className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>
              {status}
            </button>
          ))}
        </div>
        <button className="primary-btn" disabled={!canManage || warehouses.length === 0} onClick={() => setEditor({ mode: "create" })}>
          <Plus size={16} /> Yeni plan
        </button>
      </div>

      <section className="metric-grid four">
        <MetricCard label="Aktiv plan" value={plans.length - completedCount} icon={Factory} tone="primary" />
        <MetricCard label="Plan maya dəyəri" value={money(totalCost)} icon={Wallet} tone="warning" />
        <MetricCard label="İstehsala hazır" value={readyCount} trend={`${producedQty} hazır məhsul`} icon={Check} tone="success" />
        <MetricCard label="Xammal riski" value={riskCount} trend={`Proqnoz gəlir ${money(totalRevenue)}`} icon={CircleAlert} tone={riskCount ? "danger" : "success"} />
      </section>

      <section className="production-control-grid" data-testid="production-control-panel">
        <div><span>BOM axını</span><strong>{plans.length}</strong><small>Plan → xammal çıxışı → hazır məhsul mədaxili</small></div>
        <div><span>Faktiki maya</span><strong>{money(totalCost)}</strong><small>Material + əmək + əlavə xərc</small></div>
        <div><span>Anbar əlaqəsi</span><strong>{plans.filter((plan) => plan.warehouseId).length}</strong><small>Xammal və hazır məhsul real stokdadır</small></div>
      </section>

      <Panel className="production-panel">
        <PanelHeader title="İstehsal sifarişləri" subtitle={`${visiblePlans.length} plan · BOM və maya nəzarəti`} icon={Factory} />
        {visiblePlans.length ? (
          <DataTable
            columns={["Plan", "Anbar", "Say", "Material", "Əmək/Overhead", "Vahid maya", "Marja", "Status", "Əməliyyat"]}
            rows={visiblePlans.map((plan) => {
              const completed = normalize(plan.status).includes("istehsal edildi");
              const started = normalize(plan.status).includes("istehsaldadır");
              return [
                <button className="production-plan-link" onClick={() => setSelectedPlanId(plan.id)}>
                  <TwoLine title={plan.product} subtitle={`${plan.id}${plan.dueDate ? ` · ${plan.dueDate}` : ""}`} />
                </button>,
                plan.warehouseName,
                <TwoLine title={`${plan.plannedQty} ədəd`} subtitle={`${plan.producedQty || 0} istehsal`} />,
                <TwoLine title={money(plan.materialCost)} subtitle={plan.bottleneck || `${plan.materials.length} xammal`} />,
                money(Number(plan.laborCost || 0) + Number(plan.overheadCost || 0)),
                <strong>{money(plan.unitCost)}</strong>,
                percent(plan.margin),
                <StatusBadge status={plan.status} />,
                <div className="table-actions production-row-actions">
                  {!started && !completed && (
                    <button className="icon-btn" title="İstehsala başla" disabled={!canManage || !plan.canProduce} onClick={() => onStartPlan(plan.id)}>
                      <Play size={15} />
                    </button>
                  )}
                  {started && (
                    <button className="icon-btn success" title="İstehsalı tamamla" disabled={!canManage} onClick={() => onCompletePlan(plan.id)}>
                      <Check size={15} />
                    </button>
                  )}
                  {!completed && (
                    <>
                      <button className="icon-btn" title="Redaktə et" disabled={!canManage || started} onClick={() => setEditor({ mode: "edit", plan })}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn danger" title="Planı sil" disabled={!canManage || started} onClick={() => onDeletePlan(plan.id)}>
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>,
              ];
            })}
          />
        ) : (
          <EmptyState title="Bu filtr üzrə istehsal planı yoxdur" />
        )}
      </Panel>

      <Panel className="production-bom-panel">
        <PanelHeader title="BOM xammal kartları" subtitle="Tələb, mövcud qalıq və material dəyəri" icon={Boxes} />
        <div className="production-bom-grid">
          {visiblePlans.flatMap((plan) =>
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
        </div>
      </Panel>

      {selectedPlan && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card production-detail-modal">
            <div className="modal-head">
              <div><h2>{selectedPlan.product}</h2><p>{selectedPlan.id} · {selectedPlan.warehouseName}</p></div>
              <button className="icon-btn" onClick={() => setSelectedPlanId("")} aria-label="Bağla"><X size={18} /></button>
            </div>
            <div className="production-detail-summary">
              <TwoLine title={`${selectedPlan.plannedQty} ədəd`} subtitle="Plan" />
              <TwoLine title={money(selectedPlan.materialCost)} subtitle="Material" />
              <TwoLine title={money(selectedPlan.totalCost)} subtitle="Ümumi maya" />
              <TwoLine title={money(selectedPlan.unitCost)} subtitle="Vahid maya" />
              <StatusBadge status={selectedPlan.status} />
            </div>
            <DataTable
              columns={["Xammal", "Norma", "Ümumi tələb", "Mövcud", "Vahid alış", "Dəyər", "Status"]}
              rows={selectedPlan.materials.map((item) => [
                item.product,
                item.qty,
                item.needed,
                item.available,
                money(item.unitCost),
                money(item.cost),
                <StatusBadge status={item.enough ? "Hazır" : "Çatışmır"} />,
              ])}
            />
            {selectedPlan.note && <p className="production-detail-note">{selectedPlan.note}</p>}
          </div>
        </div>
      )}

      {editor && (
        <ProductionPlanModal
          plan={editor.plan}
          warehouses={warehouses}
          stockOptions={warehouseStock}
          onClose={() => setEditor(null)}
          onSubmit={(values) => {
            if (editor.mode === "edit") onUpdatePlan(editor.plan.id, values);
            else onCreatePlan(values);
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
