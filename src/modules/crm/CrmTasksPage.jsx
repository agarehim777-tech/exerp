import React, { useState, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useTasks } from '../../shared/hooks/useTasks.js';
import { Button, Input, Select } from "../../shared/ui/primitives.tsx";

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
    <div className="u-padding-24px u-display-flex u-flex-direction-column u-gap-16px">
      <h1 className="u-margin-0 u-font-size-26px u-font-weight-800">Tapşırıqlar</h1>

      <div className="u-display-flex u-gap-8px u-background-surface u-padding-12px u-border-radius-12px u-border-1px_solid_border u-flex-wrap-wrap">
        <Input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Nə etmək lazımdır?"
 className="u-flex-1 u-min-width-200px u-padding-8px_12px u-border-1px_solid_border u-border-radius-8px u-font-size-14px" />
        <Input type="datetime-local" value={due} onChange={e => setDue(e.target.value)}
 className="u-padding-8px_12px u-border-1px_solid_border u-border-radius-8px" />
        <Select value={pri} onChange={e => setPri(e.target.value)} className="u-padding-8px_10px u-border-1px_solid_border u-border-radius-8px">
          <option value="low">Aşağı</option><option value="medium">Orta</option><option value="high">Yüksək</option>
        </Select>
        <Button variant="ghost" onClick={add} className="u-background-action u-color-surface u-border-0 u-padding-8px_18px u-border-radius-8px u-cursor-pointer u-font-weight-700">+ Əlavə et</Button>
      </div>

      <div className="u-display-grid u-grid-template-columns-repeat_auto_fit_minmax_250px_1fr u-gap-12px">
        <Bucket title="Gecikən" color="#ef4444" tasks={buckets.overdue} onToggle={toggle} onRemove={remove} />
        <Bucket title="Bu gün" color="#10b981" tasks={buckets.today} onToggle={toggle} onRemove={remove} />
        <Bucket title="Bu həftə" color="#38bdf8" tasks={buckets.week} onToggle={toggle} onRemove={remove} />
        <Bucket title="Sonra" color="#a78bfa" tasks={buckets.later} onToggle={toggle} onRemove={remove} />
      </div>

      {buckets.done.length > 0 && (
        <details className="u-background-surface u-border-1px_solid_border u-border-radius-12px u-padding-12px">
          <summary className="u-cursor-pointer u-font-weight-600 u-color-text_secondary">Tamamlanmış ({buckets.done.length})</summary>
          <div className="u-margin-top-8px u-display-flex u-flex-direction-column u-gap-6px">
            {buckets.done.map(t => <TaskRow key={t.id} t={t} onToggle={toggle} onRemove={remove} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function Bucket({ title, color, tasks, onToggle, onRemove }) {
  return (
    <div className="u-background-surface u-border-1px_solid_border u-border-radius-12px u-padding-12px">
      <div className="u-display-flex u-align-items-center u-gap-8px u-margin-bottom-10px">
        <span className="sx-90bc849 sx-c984939 sx-8f633ef" style={{ background: color }} />
        <b>{title}</b>
        <span className="u-margin-left-auto u-background-surface_subtle u-padding-2px_8px u-border-radius-999px u-font-size-11px u-font-weight-700 u-color-text_secondary">{tasks.length}</span>
      </div>
      <div className="u-display-flex u-flex-direction-column u-gap-6px">
        {tasks.length === 0 ? <div className="u-color-line_strong u-font-size-13px u-text-align-center u-padding-12px">Boşdur</div>
          : tasks.map(t => <TaskRow key={t.id} t={t} onToggle={onToggle} onRemove={onRemove} />)}
      </div>
    </div>
  );
}

function TaskRow({ t, onToggle, onRemove }) {
  return (
    <div className="u-display-flex u-align-items-center u-gap-8px u-padding-8px u-background-surface_subtle u-border-radius-8px">
      <input type="checkbox" checked={t.done} onChange={e => onToggle(t.id, e.target.checked)} />
      <span className="sx-dd518b1 sx-eeb774e sx-0384986" style={{ background: priColor[t.priority] }} />
      <div className={`sx-da5cd67 ${t.done ? "sx-c9b77c9" : "sx-116e33d"} ${t.done ? "sx-8cd4ae7" : "sx-5cfb91b"} sx-3044b60`}>
        <div>{t.title}</div>
        {t.due_at && <div className="u-font-size-11px u-color-text_secondary">{new Date(t.due_at).toLocaleString('az-AZ')}</div>}
      </div>
      <Button variant="ghost" onClick={() => onRemove(t.id)} className="u-background-none u-border-0 u-cursor-pointer u-color-text_secondary u-font-size-16px">×</Button>
    </div>
  );
}
