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
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Aktivliklər</h1>

      <div style={{ display: 'flex', gap: 8, background: '#fff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <option value="note">📝 Qeyd</option><option value="call">📞 Zəng</option><option value="meeting">🤝 Görüş</option>
          <option value="email">✉️ E-poçt</option><option value="sms">💬 SMS</option>
        </select>
        <input value={subject} onChange={e => setSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Sürətli aktivlik əlavə et..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14 }} />
        <button onClick={add} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Əlavə et</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['all', 'call', 'meeting', 'email', 'note', 'sms'].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            style={{
              padding: '6px 12px', borderRadius: 999, border: '1px solid #e2e8f0', cursor: 'pointer',
              background: filter === t ? '#10b981' : '#fff', color: filter === t ? '#fff' : '#475569',
              fontWeight: 600, fontSize: 12,
            }}>{t === 'all' ? 'Hamısı' : `${icon[t] || ''} ${t}`}</button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aktivlik yoxdur</div>
        ) : filtered.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: 12, background: '#f8fafc', borderRadius: 10 }}>
            <span style={{ fontSize: 20 }}>{icon[a.type] || '•'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.subject}</div>
              {a.body && <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{a.body}</div>}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                {a.customer?.name && <b style={{ color: '#10b981' }}>{a.customer.name} · </b>}
                {new Date(a.occurred_at).toLocaleString('az-AZ')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
