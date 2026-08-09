import React, { useState, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useCustomers } from '../../shared/hooks/useCustomers.js';
import Avatar from './Avatar.jsx';
import CustomerDrawer from './CustomerDrawer.jsx';

function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}dəq`;
  if (s < 86400) return `${Math.floor(s/3600)}s`;
  if (s < 2592000) return `${Math.floor(s/86400)}g əvvəl`;
  return `${Math.floor(s/2592000)}ay əvvəl`;
}

const segmentBadge = {
  individual: { label: 'Fiziki', bg: '#f1f5f9', color: '#475569' },
  business:   { label: 'Hüquqi', bg: '#dbeafe', color: '#1e40af' },
  vip:        { label: 'VIP',    bg: '#fef3c7', color: '#92400e' },
};

export default function CrmCustomersPage({ onOpenSalesOrder }) {
  const { activeTenantId } = useAuth();
  const { customers, create, update, remove } = useCustomers(activeTenantId);
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers.filter(c => {
      if (seg !== 'all' && c.segment !== seg) return false;
      if (!term) return true;
      return [c.name, c.email, c.phone, c.tax_id, c.address].some(v => (v || '').toLowerCase().includes(term));
    });
  }, [customers, q, seg]);

  const stats = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 86400 * 1000;
    return {
      total: customers.length,
      newMonth: customers.filter(c => new Date(c.created_at).getTime() > monthAgo).length,
      active: customers.filter(c => c.last_activity_at && new Date(c.last_activity_at).getTime() > monthAgo).length,
      vip: customers.filter(c => c.segment === 'vip').length,
    };
  }, [customers]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Müştərilər</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-fg, #64748b)' }}>360° görünüş, sövdələşmə tarixi və aktivlik</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}>
          + Yeni müştəri
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[
          { label: 'Ümumi', value: stats.total, color: '#10b981' },
          { label: 'Yeni bu ay', value: stats.newMonth, color: '#38bdf8' },
          { label: 'Aktiv (30g)', value: stats.active, color: '#a78bfa' },
          { label: 'VIP', value: stats.vip, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
            <span style={{ fontSize: 21, lineHeight: 1.2, fontWeight: 750, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar: ad, telefon, VÖEN, e-poçt..."
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14 }} />
        <select value={seg} onChange={e => setSeg(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff' }}>
          <option value="all">Bütün seqmentlər</option>
          <option value="individual">Fiziki</option>
          <option value="business">Hüquqi</option>
          <option value="vip">VIP</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: '#fff', borderRadius: 14, border: '1px dashed #cbd5e1' }}>
          <div style={{ fontSize: 48 }}>👥</div>
          <h3 style={{ margin: '12px 0 4px' }}>Hələ müştəri yoxdur</h3>
          <p style={{ color: '#64748b', margin: 0 }}>İlk müştərinizi əlavə edərək başlayın.</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#f8fafc', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>
              <tr>
                <th style={{ padding: '12px 16px' }}>Müştəri</th>
                <th style={{ padding: '12px 16px' }}>Əlaqə</th>
                <th style={{ padding: '12px 16px' }}>VÖEN</th>
                <th style={{ padding: '12px 16px' }}>Son aktivlik</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const seg = segmentBadge[c.segment] || segmentBadge.individual;
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)}
                    style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar name={c.name} />
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          <span style={{ background: seg.bg, color: seg.color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{seg.label}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      <div>{c.phone || '—'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.email || ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{c.tax_id || '—'}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{timeAgo(c.last_activity_at)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { if (confirm(`"${c.name}" silinsin?`)) remove(c.id); }}
                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sil</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openId && <CustomerDrawer customerId={openId} onClose={() => setOpenId(null)} onUpdate={(v) => update(openId, v)} onOpenSalesOrder={onOpenSalesOrder} />}
      {showNew && <NewCustomerModal onClose={() => setShowNew(false)} onCreate={async (v) => { await create(v); setShowNew(false); }} />}
    </div>
  );
}

function NewCustomerModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', tax_id: '', address: '', segment: 'individual' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr('Ad tələb olunur'); return; }
    if (form.tax_id && !/^\d{10}$/.test(form.tax_id)) { setErr('VÖEN 10 rəqəm olmalıdır'); return; }
    if (form.phone && !/^\+?\d{9,15}$/.test(form.phone.replace(/\s/g, ''))) { setErr('Telefon formatı yanlışdır'); return; }
    setBusy(true);
    try { await onCreate(form); } catch (e) { setErr(e.message || 'Xəta'); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: '#fff', borderRadius: 16, padding: 24, width: 480, maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ margin: 0 }}>Yeni müştəri</h2>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 8, borderRadius: 8, fontSize: 13 }}>{err}</div>}
        <label>Ad *<input value={form.name} onChange={e => set('name', e.target.value)} style={inp} /></label>
        <label>Telefon<input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+994..." style={inp} /></label>
        <label>E-poçt<input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inp} /></label>
        <label>VÖEN<input value={form.tax_id} onChange={e => set('tax_id', e.target.value)} placeholder="10 rəqəm" style={inp} /></label>
        <label>Seqment
          <select value={form.segment} onChange={e => set('segment', e.target.value)} style={inp}>
            <option value="individual">Fiziki şəxs</option>
            <option value="business">Hüquqi şəxs</option>
            <option value="vip">VIP</option>
          </select>
        </label>
        <label>Ünvan<input value={form.address} onChange={e => set('address', e.target.value)} style={inp} /></label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnGhost}>Ləğv et</button>
          <button type="submit" disabled={busy} style={btnPrimary}>{busy ? '...' : 'Yarat'}</button>
        </div>
      </form>
    </div>
  );
}

const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginTop: 4 };
const btnGhost = { background: 'transparent', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnPrimary = { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
