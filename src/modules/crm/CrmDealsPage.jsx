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
    return <div style={{ padding: 40, textAlign: 'center' }}>
      <p>Pipeline hazırlanır...</p>
      <button onClick={seedDefault} style={{ background: '#10b981', color: '#fff', border: 0, padding: '10px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>Standart pipeline yarat</button>
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
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{activePipeline.name}</h1>
          <div style={{ color: '#64748b', fontSize: 14 }}>Açıq: <b style={{ color: '#10b981' }}>{totalOpen.toFixed(0)} ₼</b> · {deals.filter(d => d.status === 'open').length} sövdələşmə</div>
        </div>
        <button onClick={() => { setDefaultStage(stages[0]?.id); setShowNew(true); }}
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>+ Sövdələşmə</button>
      </header>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, flex: 1 }}>
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
    <div ref={setNodeRef} style={{
      minWidth: 280, background: isOver ? '#ecfdf5' : '#f8fafc', borderRadius: 14,
      display: 'flex', flexDirection: 'column', border: `2px solid ${isOver ? stage.color : 'transparent'}`,
      transition: 'all 0.2s',
    }}>
      <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }} />
          <b style={{ flex: 1 }}>{stage.name}</b>
          <span style={{ background: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#64748b' }}>{count}</span>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{sum.toFixed(0)} ₼</div>
        <button onClick={onAdd} style={{ marginTop: 6, width: '100%', background: 'transparent', border: '1px dashed #cbd5e1', padding: 6, borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: 12 }}>+ əlavə et</button>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 100, flex: 1 }}>
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
      <div style={{ fontWeight: 600, fontSize: 14 }}>{deal.title}</div>
      {deal.customer && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{deal.customer.name}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontWeight: 700, color: '#10b981' }}>{Number(deal.amount).toFixed(0)} {deal.currency}</span>
        {deal.expected_close && <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(deal.expected_close).toLocaleDateString('az-AZ')}</span>}
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
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Yeni sövdələşmə</h2>
        <label>Başlıq *<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inp} required /></label>
        <label>Müştəri
          <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} style={inp}>
            <option value="">—</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>Ləğv</button>
          <button type="submit" disabled={busy} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>{busy ? '...' : 'Yarat'}</button>
        </div>
      </form>
    </div>
  );
}
