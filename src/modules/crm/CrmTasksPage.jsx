import React, { useState, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useTasks } from '../../shared/hooks/useTasks.js';

const priColor = { high: '#ef4444', medium: '#f59e0b', low: '#94a3b8' };

export default function CrmTasksPage() {
  const { activeTenantId } = useAuth();
  const { items, create, toggle, remove } = useTasks(activeTenantId);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [pri, setPri] = useState('medium');

  const buckets = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endToday = new Date(startToday.getTime() + 86400000);
    const endWeek = new Date(startToday.getTime() + 7 * 86400000);
    const b = { overdue: [], today: [], week: [], later: [], done: [] };
    for (const t of items) {
      if (t.done) { b.done.push(t); continue; }
      const d = t.due_at ? new Date(t.due_at) : null;
      if (!d) { b.later.push(t); continue; }
      if (d < startToday) b.overdue.push(t);
      else if (d < endToday) b.today.push(t);
      else if (d < endWeek) b.week.push(t);
      else b.later.push(t);
    }
    return b;
  }, [items]);

  const add = async () => {
    if (!title.trim()) return;
    await create({ title, due_at: due ? new Date(due).toISOString() : null, priority: pri });
    setTitle(''); setDue('');
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Tapşırıqlar</h1>

      <div style={{ display: 'flex', gap: 8, background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Nə etmək lazımdır?"
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
        <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
        <select value={pri} onChange={e => setPri(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <option value="low">Aşağı</option><option value="medium">Orta</option><option value="high">Yüksək</option>
        </select>
        <button onClick={add} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>+ Əlavə et</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
        <Bucket title="Gecikən" color="#ef4444" tasks={buckets.overdue} onToggle={toggle} onRemove={remove} />
        <Bucket title="Bu gün" color="#10b981" tasks={buckets.today} onToggle={toggle} onRemove={remove} />
        <Bucket title="Bu həftə" color="#38bdf8" tasks={buckets.week} onToggle={toggle} onRemove={remove} />
        <Bucket title="Sonra" color="#a78bfa" tasks={buckets.later} onToggle={toggle} onRemove={remove} />
      </div>

      {buckets.done.length > 0 && (
        <details style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#64748b' }}>Tamamlanmış ({buckets.done.length})</summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {buckets.done.map(t => <TaskRow key={t.id} t={t} onToggle={toggle} onRemove={remove} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function Bucket({ title, color, tasks, onToggle, onRemove }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <b>{title}</b>
        <span style={{ marginLeft: 'auto', background: '#f1f5f9', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#64748b' }}>{tasks.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.length === 0 ? <div style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', padding: 12 }}>Boşdur</div>
          : tasks.map(t => <TaskRow key={t.id} t={t} onToggle={onToggle} onRemove={onRemove} />)}
      </div>
    </div>
  );
}

function TaskRow({ t, onToggle, onRemove }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#f8fafc', borderRadius: 8 }}>
      <input type="checkbox" checked={t.done} onChange={e => onToggle(t.id, e.target.checked)} />
      <span style={{ width: 4, height: 24, borderRadius: 2, background: priColor[t.priority] }} />
      <div style={{ flex: 1, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? '#94a3b8' : '#0f172a', fontSize: 13 }}>
        <div>{t.title}</div>
        {t.due_at && <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(t.due_at).toLocaleString('az-AZ')}</div>}
      </div>
      <button onClick={() => onRemove(t.id)} style={{ background: 'none', border: 0, cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>×</button>
    </div>
  );
}
