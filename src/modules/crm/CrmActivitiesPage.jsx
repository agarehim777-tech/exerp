import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useActivities } from '../../shared/hooks/useActivities.js';

const icon = { call: '📞', meeting: '🤝', email: '✉️', note: '📝', sms: '💬' };

export default function CrmActivitiesPage() {
  const { activeTenantId } = useAuth();
  const { items, create } = useActivities(activeTenantId, { limit: 200 });
  const [filter, setFilter] = useState('all');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('note');

  const filtered = filter === 'all' ? items : items.filter(a => a.type === filter);

  const add = async () => {
    if (!subject.trim()) return;
    await create({ type, subject });
    setSubject('');
  };

  return (
    <div className="u-padding-24px u-display-flex u-flex-direction-column u-gap-16px">
      <h1 className="u-margin-0 u-font-size-26px u-font-weight-800">Aktivliklər</h1>

      <div className="u-display-flex u-gap-8px u-background-surface u-padding-12px u-border-radius-12px u-border-1px_solid_border">
        <select value={type} onChange={e => setType(e.target.value)} className="u-padding-8px_10px u-border-1px_solid_border u-border-radius-8px">
          <option value="note">📝 Qeyd</option><option value="call">📞 Zəng</option><option value="meeting">🤝 Görüş</option>
          <option value="email">✉️ E-poçt</option><option value="sms">💬 SMS</option>
        </select>
        <input value={subject} onChange={e => setSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Sürətli aktivlik əlavə et..."
          className="u-flex-1 u-padding-8px_12px u-border-1px_solid_border u-border-radius-8px u-font-size-14px" />
        <button onClick={add} className="u-background-action u-color-surface u-border-0 u-padding-8px_18px u-border-radius-8px u-cursor-pointer u-font-weight-700">Əlavə et</button>
      </div>

      <div className="u-display-flex u-gap-6px u-flex-wrap-wrap">
        {['all', 'call', 'meeting', 'email', 'note', 'sms'].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid #e2e8f0', cursor: 'pointer',
              background: filter === t ? '#10b981' : '#fff', color: filter === t ? '#fff' : '#475569',
              fontWeight: 600, fontSize: 12,
            }}>{t === 'all' ? 'Hamısı' : `${icon[t] || ''} ${t}`}</button>
        ))}
      </div>

      <div className="u-background-surface u-border-1px_solid_border u-border-radius-14px u-padding-16px u-display-flex u-flex-direction-column u-gap-8px">
        {filtered.length === 0 ? (
          <div className="u-padding-40px u-text-align-center u-color-text_secondary">Aktivlik yoxdur</div>
        ) : filtered.map(a => (
          <div key={a.id} className="u-display-flex u-gap-12px u-padding-12px u-background-surface_subtle u-border-radius-10px">
            <span className="u-font-size-20px">{icon[a.type] || '•'}</span>
            <div className="u-flex-1">
              <div className="u-font-weight-600">{a.subject}</div>
              {a.body && <div className="u-font-size-13px u-color-text_secondary u-margin-top-2px">{a.body}</div>}
              <div className="u-font-size-11px u-color-text_secondary u-margin-top-4px">
                {a.customer?.name && <b className="u-color-action">{a.customer.name} · </b>}
                {new Date(a.occurred_at).toLocaleString('az-AZ')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
