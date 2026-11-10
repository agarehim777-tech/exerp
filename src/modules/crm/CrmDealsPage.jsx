import React, { useState, useEffect } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { usePipelines } from '../../shared/hooks/usePipelines.js';
import { useDeals } from '../../shared/hooks/useDeals.js';
import { useCustomers } from '../../shared/hooks/useCustomers.js';

export default function CrmDealsPage() {
  const { activeTenantId } = useAuth();
  const { activePipeline, stagesFor, seedDefault, pipelines } = usePipelines(activeTenantId);
  const { deals, move, create } = useDeals(activeTenantId, activePipeline?.id);
  const { customers } = useCustomers(activeTenantId);
  const [showNew, setShowNew] = useState(false);
  const [defaultStage, setDefaultStage] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (activeTenantId && pipelines.length === 0) {
      seedDefault().catch(() => {});
    }
  }, [activeTenantId, pipelines.length, seedDefault]);

  if (!activePipeline) {
    return <div className="u-padding-40px u-text-align-center">
      <p>Pipeline hazırlanır...</p>
      <button onClick={seedDefault} className="u-background-action u-color-surface u-border-0 u-padding-10px_18px u-border-radius-10px u-cursor-pointer u-font-weight-700">Standart pipeline yarat</button>
    </div>;
  }

  const stages = stagesFor(activePipeline.id);
  const totalOpen = deals.filter(d => d.status === 'open').reduce((s, d) => s + Number(d.amount || 0), 0);

  const onDragEnd = async (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const deal = deals.find(d => d.id === active.id);
    if (!deal) return;
    const newStageId = over.id;
    if (deal.stage_id === newStageId) return;
    const stage = stages.find(s => s.id === newStageId);
    const status = stage?.is_won ? 'won' : stage?.is_lost ? 'lost' : 'open';
    await move(deal.id, newStageId, status);
  };

  return (
    <div className="u-padding-24px u-display-flex u-flex-direction-column u-gap-16px u-height-100">
      <header className="u-display-flex u-justify-content-space_between u-align-items-center u-flex-wrap-wrap u-gap-12px">
        <div>
          <h1 className="u-margin-0 u-font-size-26px u-font-weight-800">{activePipeline.name}</h1>
          <div className="u-color-text_secondary u-font-size-14px">Açıq: <b className="u-color-action">{totalOpen.toFixed(0)} ₼</b> · {deals.filter(d => d.status === 'open').length} sövdələşmə</div>
        </div>
        <button onClick={() => { setDefaultStage(stages[0]?.id); setShowNew(true); }}
          className="sx-ef4ac23 sx-4eb23a8 sx-012333e sx-618e663 sx-3c85720 sx-83e4487 sx-b202c6d">+ Sövdələşmə</button>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="u-display-flex u-gap-12px u-overflow-x-auto u-padding-bottom-12px u-flex-1">
          {stages.map(stage => {
            const stageDeals = deals.filter(d => d.stage_id === stage.id);
            const sum = stageDeals.reduce((s, d) => s + Number(d.amount || 0), 0);
            return (
              <StageColumn key={stage.id} stage={stage} count={stageDeals.length} sum={sum}
                onAdd={() => { setDefaultStage(stage.id); setShowNew(true); }}>
                {stageDeals.map(d => <DealCard key={d.id} deal={d} />)}
              </StageColumn>
            );
          })}
        </div>
      </DndContext>

      {showNew && (
        <NewDealModal
          stages={stages}
          defaultStage={defaultStage}
          customers={customers}
          onClose={() => setShowNew(false)}
          onCreate={async (v) => { await create(v); setShowNew(false); }}
 />
      )}
    </div>
  );
}

function StageColumn({ stage, count, sum, onAdd, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div ref={setNodeRef} className={`sx-0ee1255 ${isOver ? "sx-e016922" : "sx-b55f8cb"} sx-2f18f99 sx-f7dbba7 sx-678b59d sx-b1185e5`} style={{ border: `2px solid ${isOver ? stage.color : 'transparent'}` }}>
      <div className="u-padding-12px u-border-bottom-1px_solid_border">
        <div className="u-display-flex u-align-items-center u-gap-8px">
          <span className="sx-90bc849 sx-c984939 sx-8f633ef" style={{ background: stage.color }} />
          <b className="u-flex-1">{stage.name}</b>
          <span className="u-background-surface u-padding-2px_8px u-border-radius-999px u-font-size-11px u-font-weight-700 u-color-text_secondary">{count}</span>
        </div>
        <div className="u-font-size-12px u-color-text_secondary u-margin-top-4px">{sum.toFixed(0)} ₼</div>
        <button onClick={onAdd} className="u-margin-top-6px u-width-100 u-background-transparent u-border-1px_dashed_line_strong u-padding-6px u-border-radius-8px u-cursor-pointer u-color-text_secondary u-font-size-12px">+ əlavə et</button>
      </div>
      <div className="u-padding-8px u-display-flex u-flex-direction-column u-gap-8px u-min-height-100px u-flex-1">
        {children}
      </div>
    </div>
  );
}

function DealCard({ deal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 12,
    cursor: 'grab', transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1, boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div className="u-font-weight-600 u-font-size-14px">{deal.title}</div>
      {deal.customer && <div className="u-font-size-12px u-color-text_secondary u-margin-top-2px">{deal.customer.name}</div>}
      <div className="u-display-flex u-justify-content-space_between u-align-items-center u-margin-top-8px">
        <span className="u-font-weight-700 u-color-action">{Number(deal.amount).toFixed(0)} {deal.currency}</span>
        {deal.expected_close && <span className="u-font-size-11px u-color-text_secondary">{new Date(deal.expected_close).toLocaleDateString('az-AZ')}</span>}
      </div>
    </div>
  );
}

function NewDealModal({ stages, defaultStage, customers, onClose, onCreate }) {
  const [form, setForm] = useState({ title: '', amount: 0, currency: 'AZN', customer_id: '', stage_id: defaultStage || stages[0]?.id, expected_close: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.stage_id) return;
    setBusy(true);
    try {
      await onCreate({
        title: form.title, amount: Number(form.amount) || 0, currency: form.currency,
        stage_id: form.stage_id, customer_id: form.customer_id || null,
        expected_close: form.expected_close || null,
      });
    } finally { setBusy(false); }
  };

  const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginTop: 4 };
  return (
    <div onClick={onClose} className="u-position-fixed u-inset-0 u-background-rgba_15_23_42_0_5 u-display-flex u-align-items-center u-justify-content-center u-z-index-100">
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
 className="u-background-surface u-border-radius-16px u-padding-24px u-width-480px u-max-width-92vw u-display-flex u-flex-direction-column u-gap-12px">
        <h2 className="u-margin-0">Yeni sövdələşmə</h2>
        <label>Başlıq *<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inp} required /></label>
        <label>Müştəri
          <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} style={inp}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="u-display-grid u-grid-template-columns-2fr_1fr u-gap-8px">
          <label>Məbləğ<input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} style={inp} /></label>
          <label>Valyuta
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={inp}>
              <option>AZN</option><option>USD</option><option>EUR</option>
            </select>
          </label>
        </div>
        <label>Mərhələ
          <select value={form.stage_id} onChange={e => setForm({ ...form, stage_id: e.target.value })} style={inp}>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Gözlənilən bağlanma<input type="date" value={form.expected_close} onChange={e => setForm({ ...form, expected_close: e.target.value })} style={inp} /></label>
        <div className="u-display-flex u-justify-content-flex_end u-gap-8px">
          <button type="button" onClick={onClose} className="u-padding-8px_16px u-border-1px_solid_border u-border-radius-8px u-cursor-pointer u-background-surface">Ləğv</button>
          <button type="submit" disabled={busy} className="u-background-action u-color-surface u-border-0 u-padding-8px_16px u-border-radius-8px u-cursor-pointer u-font-weight-700">{busy ? '...' : 'Yarat'}</button>
        </div>
      </form>
    </div>
  );
}
