import React, { useState, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { findCustomerDuplicates, useCustomers } from '../../shared/hooks/useCustomers.js';
import Avatar from './Avatar.jsx';
import CustomerDrawer from './CustomerDrawer.jsx';
import BirthDateInput from './BirthDateInput.jsx';
import LoadMoreBar from '../../components/LoadMoreBar.jsx';

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
};
const levelMeta = { standard: { label: 'Adi', color: '#64748b' }, silver: { label: 'Gümüş', color: '#64748b' }, gold: { label: 'Qızıl', color: '#b7791f' }, platinum: { label: 'Platin', color: '#6d28d9' } };

function getNextBirthday(value) {
  if (!value) return null;
  const [, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!month || !day) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return { date: next, days: Math.round((next - today) / 86400000) };
}

export default function CrmCustomersPage({ onOpenSalesOrder }) {
  const { activeTenantId } = useAuth();
  const { customers, levels, create, update, remove, saveLevels, hasMore, loadMore, loading: customersLoading } = useCustomers(activeTenantId);
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showLevels, setShowLevels] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers.filter(c => {
      if (seg !== 'all' && c.segment !== seg) return false;
      if (!term) return true;
      return [c.name, c.email, c.phone, c.tax_id, c.fin_code, c.identity_card_no, c.address].some(v => (v || '').toLowerCase().includes(term));
    });
  }, [customers, q, seg]);

  const stats = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 86400 * 1000;
    return {
      total: customers.length,
      newMonth: customers.filter(c => new Date(c.created_at).getTime() > monthAgo).length,
      active: customers.filter(c => c.last_activity_at && new Date(c.last_activity_at).getTime() > monthAgo).length,
      platinum: customers.filter(c => c.customer_level === 'platinum').length,
    };
  }, [customers]);

  const birthdays = useMemo(() => customers.map(customer => ({ customer, next: getNextBirthday(customer.birth_date) }))
    .filter(item => item.next && item.next.days <= 30).sort((a, b) => a.next.days - b.next.days), [customers]);
  const birthdaysToday = birthdays.filter(item => item.next.days === 0);
  const birthdaysUpcoming = birthdays.filter(item => item.next.days > 0);
  const duplicateGroups = useMemo(() => customers.flatMap((customer, index) => {
    const matches = findCustomerDuplicates(customer, customers.slice(index + 1));
    return matches.map(match => [customer, match]);
  }), [customers]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Müştərilər</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted-fg, #64748b)' }}>360° görünüş, sövdələşmə tarixi və aktivlik</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setShowLevels(true)} style={{ background: '#fff', color: '#08745a', border: '1px solid #08745a', padding: '10px 14px', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Müştəri səviyyələri</button>
        <button onClick={() => setShowNew(true)} className="btn-primary"
          style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}>
          + Yeni müştəri
        </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[
          { label: 'Ümumi', value: stats.total, color: '#10b981' },
          { label: 'Yeni bu ay', value: stats.newMonth, color: '#38bdf8' },
          { label: 'Aktiv (30g)', value: stats.active, color: '#a78bfa' },
          { label: 'Platin', value: stats.platinum, color: '#7c3aed' },
          { label: 'Dublikat riski', value: duplicateGroups.length, color: duplicateGroups.length ? '#dc2626' : '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
            <span style={{ fontSize: 21, lineHeight: 1.2, fontWeight: 750, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {duplicateGroups.length > 0 && <section style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, padding: 14 }}><b style={{ color: '#9a3412' }}>Dublikat ola bilən müştərilər</b><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>{duplicateGroups.map(([left, right]) => <button key={`${left.id}-${right.id}`} type="button" onClick={() => setOpenId(left.id)} style={{ border: '1px solid #fdba74', borderRadius: 7, background: '#fff', padding: '7px 10px', cursor: 'pointer' }}>{left.name} ↔ {right.name}</button>)}</div></section>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar: ad, telefon, FİN, VÖEN, vəsiqə..."
          style={{ flex: 1, minWidth: 220, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14 }} />
        <select value={seg} onChange={e => setSeg(e.target.value)}
          style={{ padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, background: '#fff' }}>
          <option value="all">Bütün müştəri tipləri</option>
          <option value="individual">Fiziki</option>
          <option value="business">Hüquqi</option>
        </select>
      </div>

      <section style={{ background: '#fff', border: '1px solid #e2d8bc', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <div><h3 style={{ margin: 0, fontSize: 17 }}>Ad günləri</h3><p style={{ margin: '3px 0 0', color: '#64748b', fontSize: 12 }}>Bu gün və qarşıdakı 30 gün</p></div>
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{birthdays.length} müştəri</span>
        </div>
        {!birthdays.length ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Yaxınlaşan ad günü yoxdur.</div> : <div style={{ display: 'grid', gap: 8 }}>
          {birthdaysToday.map(({ customer }) => <button key={customer.id} type="button" onClick={() => setOpenId(customer.id)} style={{ border: '1px solid #86efac', background: '#f0fdf4', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}><span><strong>{customer.name}</strong><small style={{ display: 'block', color: '#64748b' }}>{customer.phone || 'Telefon yoxdur'}</small></span><strong style={{ color: '#15803d' }}>Bu gün 🎉</strong></button>)}
          {birthdaysUpcoming.map(({ customer, next }) => <button key={customer.id} type="button" onClick={() => setOpenId(customer.id)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}><span><strong>{customer.name}</strong><small style={{ display: 'block', color: '#64748b' }}>{customer.phone || 'Telefon yoxdur'}</small></span><span style={{ textAlign: 'right' }}><strong>{next.date.toLocaleDateString('az-AZ', { day: '2-digit', month: 'long' })}</strong><small style={{ display: 'block', color: '#64748b' }}>{next.days} gün qalıb</small></span></button>)}
        </div>}
      </section>

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
                <th style={{ padding: '12px 16px' }}>FİN / VÖEN</th>
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
                          <span style={{ marginLeft: 5, color: levelMeta[c.customer_level]?.color, fontSize: 11, fontWeight: 700 }}>{levelMeta[c.customer_level]?.label || 'Adi'}</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      <div>{c.phone || '—'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.email || ''}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      <div>{c.segment === 'business' ? (c.tax_id || '—') : (c.fin_code || c.tax_id || '—')}</div>
                      {c.segment !== 'business' && c.identity_card_no && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.identity_card_no}</div>}
                    </td>
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
          <LoadMoreBar hasMore={hasMore} onLoadMore={loadMore} loading={customersLoading} />
        </div>
      )}

      {openId && <CustomerDrawer customerId={openId} onClose={() => setOpenId(null)} onUpdate={(v) => update(openId, v)} onOpenSalesOrder={onOpenSalesOrder} />}
      {showNew && <NewCustomerModal onClose={() => setShowNew(false)} onCreate={async (v) => { await create(v); setShowNew(false); }} />}
      {showLevels && <LevelSettingsModal levels={levels} onClose={() => setShowLevels(false)} onSave={async (v) => { await saveLevels(v); setShowLevels(false); }} />}
    </div>
  );
}

function NewCustomerModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', tax_id: '', fin_code: '', identity_card_no: '', address: '', birth_date: '', segment: 'individual', customer_level_override: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.name.trim()) { setErr('Ad tələb olunur'); return; }
    if (form.segment === 'business' && form.tax_id && !/^\d{10}$/.test(form.tax_id)) { setErr('VÖEN 10 rəqəm olmalıdır'); return; }
    if (form.segment === 'individual' && form.fin_code && !/^[A-Z0-9]{7}$/i.test(form.fin_code)) { setErr('FİN kod 7 simvoldan ibarət olmalıdır'); return; }
    if (form.phone && !/^\+?\d{9,15}$/.test(form.phone.replace(/\s/g, ''))) { setErr('Telefon formatı yanlışdır'); return; }
    setBusy(true);
    const payload = form.segment === 'business'
      ? { ...form, fin_code: '', identity_card_no: '', birth_date: '' }
      : { ...form, tax_id: form.fin_code };
    try { await onCreate(payload); } catch (e) { setErr(e.message || 'Xəta'); } finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, padding: '20px 12px', overflowY: 'auto' }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ background: '#fff', borderRadius: 16, width: 500, maxWidth: '100%', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 55px rgba(15,23,42,.22)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
          <div><h2 style={{ margin: 0, fontSize: 20 }}>Yeni müştəri</h2><p style={{ margin: '3px 0 0', color: '#64748b', fontSize: 12 }}>Müştərinin əsas məlumatlarını daxil edin</p></div>
          <button type="button" onClick={onClose} aria-label="Pəncərəni bağla" style={{ width: 34, height: 34, border: '1px solid #e2e8f0', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px 8px' }}>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: 8, borderRadius: 8, fontSize: 13 }}>{err}</div>}
        <label style={modalLabel}>Ad və soyad / şirkət adı *<input autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder={form.segment === 'business' ? 'Şirkətin hüquqi adı' : 'Ad və soyad'} style={inp} /></label>
        <label>Telefon<input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+994..." style={inp} /></label>
        <label>E-poçt <span style={{ color: '#94a3b8', fontSize: 12 }}>(məcburi deyil)</span><input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inp} /></label>
        <label>Müştəri tipi
          <select value={form.segment} onChange={e => set('segment', e.target.value)} style={inp}>
            <option value="individual">Fiziki şəxs</option>
            <option value="business">Hüquqi şəxs</option>
          </select>
        </label>
        {form.segment === 'individual' ? <>
          <label>FİN kod<input value={form.fin_code} onChange={e => set('fin_code', e.target.value.toUpperCase())} placeholder="7 simvol" maxLength={7} style={inp} /></label>
          <label>Şəxsiyyət vəsiqəsinin seriya və nömrəsi<input value={form.identity_card_no} onChange={e => set('identity_card_no', e.target.value.toUpperCase())} placeholder="Məsələn: AA1234567" style={inp} /></label>
          <label>Doğum tarixi <span style={{ color: '#94a3b8', fontSize: 12 }}>(məcburi deyil)</span><BirthDateInput value={form.birth_date} onChange={value => set('birth_date', value)} /></label>
        </> : <label>VÖEN<input value={form.tax_id} onChange={e => set('tax_id', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10 rəqəm" inputMode="numeric" style={inp} /></label>}
        <label>Səviyyə
          <select value={form.customer_level_override || ''} onChange={e => set('customer_level_override', e.target.value || null)} style={inp}>
            <option value="">Avtomatik hesablansın</option><option value="standard">Adi</option><option value="silver">Gümüş</option><option value="gold">Qızıl</option><option value="platinum">Platin</option>
          </select>
        </label>
        <label>Ünvan<input value={form.address} onChange={e => set('address', e.target.value)} style={inp} /></label>
        </div>
        <div style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#fff' }}>
          <button type="button" onClick={onClose} style={btnGhost}>Ləğv et</button>
          <button type="submit" disabled={busy} style={btnPrimary}>{busy ? '...' : 'Yarat'}</button>
        </div>
      </form>
    </div>
  );
}

const modalLabel = { display: 'flex', flexDirection: 'column', gap: 5, color: '#334155', fontSize: 13, fontWeight: 600 };

function LevelSettingsModal({ levels, onClose, onSave }) {
  const [form, setForm] = useState(levels);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); if (!(Number(form.silver) <= Number(form.gold) && Number(form.gold) <= Number(form.platinum))) return; setBusy(true); try { await onSave(form); } finally { setBusy(false); } };
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'grid', placeItems: 'center', zIndex: 110 }}><form onClick={e => e.stopPropagation()} onSubmit={submit} style={{ background: '#fff', borderRadius: 16, padding: 24, width: 430, maxWidth: '92vw', display: 'grid', gap: 12 }}>
    <h2 style={{ margin: 0 }}>Müştəri səviyyələri</h2><p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Kassaya daxil olmuş ümumi satış ödənişinə əsasən avtomatik hesablanır.</p>
    {[['silver','Gümüş'],['gold','Qızıl'],['platinum','Platin']].map(([key,label]) => <label key={key}>{label} üçün minimum məbləğ<input type="number" min="0" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inp} /></label>)}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" onClick={onClose} style={btnGhost}>Ləğv et</button><button disabled={busy} style={btnPrimary}>Yadda saxla</button></div>
  </form></div>;
}

const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginTop: 4 };
const btnGhost = { background: 'transparent', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnPrimary = { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
