import React, { useState, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { findCustomerDuplicates, useCustomers } from '../../shared/hooks/useCustomers.js';
import Avatar from './Avatar.jsx';
import CustomerDrawer from './CustomerDrawer.jsx';
import BirthDateInput from './BirthDateInput.jsx';
import LoadMoreBar from '../../components/LoadMoreBar.jsx';
import { appConfirm } from '../../shared/ui/dialogService.js';

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

export default function CrmCustomersPage({ onOpenSalesOrder, onOpenCredit }) {
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
    <div className="u-padding-24px u-display-flex u-flex-direction-column u-gap-20px">
      <header className="u-display-flex u-justify-content-space_between u-align-items-flex_end u-gap-16px u-flex-wrap-wrap">
        <div>
          <h1 className="u-margin-0 u-font-size-28px u-font-weight-800">Müştərilər</h1>
          <p className="u-margin-4px_0_0 u-color-var_muted_fg_text_secondary">360° görünüş, sövdələşmə tarixi və aktivlik</p>
        </div>
        <div className="u-display-flex u-gap-8px">
        <button onClick={() => setShowLevels(true)} className="u-background-surface u-color-08745a u-border-1px_solid_08745a u-padding-10px_14px u-border-radius-10px u-font-weight-700 u-cursor-pointer">Müştəri səviyyələri</button>
        <button onClick={() => setShowNew(true)} className="btn-primary u-background-linear_gradient_135deg_action_action u-color-surface u-border-0 u-padding-10px_18px u-border-radius-10px u-font-weight-700 u-cursor-pointer u-box-shadow-0_4px_14px_rgba_16_185_129_0_35"
          >
          + Yeni müştəri
        </button>
        </div>
      </header>

      <div className="u-display-grid u-grid-template-columns-repeat_auto_fit_minmax_180px_1fr u-gap-12px">
        {[
          { label: 'Ümumi', value: stats.total, color: '#10b981' },
          { label: 'Yeni bu ay', value: stats.newMonth, color: '#38bdf8' },
          { label: 'Aktiv (30g)', value: stats.active, color: '#a78bfa' },
          { label: 'Platin', value: stats.platinum, color: '#7c3aed' },
          { label: 'Dublikat riski', value: duplicateGroups.length, color: duplicateGroups.length ? '#dc2626' : '#10b981' },
        ].map(s => (
          <div key={s.label} className="u-background-surface u-border-1px_solid_border u-border-radius-14px u-padding-16px u-display-flex u-flex-direction-column u-gap-6px">
            <span className="u-font-size-12px u-color-text_secondary u-font-weight-600 u-text-transform-uppercase u-letter-spacing-0_5px">{s.label}</span>
            <span style={{ fontSize: 21, lineHeight: 1.2, fontWeight: 750, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {duplicateGroups.length > 0 && <section className="u-background-fff7ed u-border-1px_solid_fdba74 u-border-radius-10px u-padding-14px"><b className="u-color-9a3412">Dublikat ola bilən müştərilər</b><div className="u-display-flex u-gap-8px u-flex-wrap-wrap u-margin-top-8px">{duplicateGroups.map(([left, right]) => <button key={`${left.id}-${right.id}`} type="button" onClick={() => setOpenId(left.id)} style={{ border: '1px solid #fdba74', borderRadius: 7, background: '#fff', padding: '7px 10px', cursor: 'pointer' }}>{left.name} ↔ {right.name}</button>)}</div></section>}

      <div className="u-display-flex u-gap-10px u-flex-wrap-wrap">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar: ad, telefon, FİN, VÖEN, vəsiqə..."
          className="u-flex-1 u-min-width-220px u-padding-10px_14px u-border-1px_solid_border u-border-radius-10px u-font-size-14px" />
        <select value={seg} onChange={e => setSeg(e.target.value)}
          className="u-padding-10px_14px u-border-1px_solid_border u-border-radius-10px u-font-size-14px u-background-surface">
          <option value="all">Bütün müştəri tipləri</option>
          <option value="individual">Fiziki</option>
          <option value="business">Hüquqi</option>
        </select>
      </div>

      <section className="u-background-surface u-border-1px_solid_e2d8bc u-border-radius-14px u-padding-16px">
        <div className="u-display-flex u-justify-content-space_between u-gap-12px u-align-items-center u-margin-bottom-12px">
          <div><h3 className="u-margin-0 u-font-size-17px">Ad günləri</h3><p className="u-margin-3px_0_0 u-color-text_secondary u-font-size-12px">Bu gün və qarşıdakı 30 gün</p></div>
          <span className="u-background-fef3c7 u-color-92400e u-padding-5px_10px u-border-radius-999px u-font-size-12px u-font-weight-700">{birthdays.length} müştəri</span>
        </div>
        {!birthdays.length ? <div className="u-color-text_secondary u-font-size-13px">Yaxınlaşan ad günü yoxdur.</div> : <div className="u-display-grid u-gap-8px">
          {birthdaysToday.map(({ customer }) => <button key={customer.id} type="button" onClick={() => setOpenId(customer.id)} className="u-border-1px_solid_86efac u-background-f0fdf4 u-border-radius-10px u-padding-10px u-display-flex u-justify-content-space_between u-cursor-pointer u-text-align-left"><span><strong>{customer.name}</strong><small className="u-display-block u-color-text_secondary">{customer.phone || 'Telefon yoxdur'}</small></span><strong className="u-color-15803d">Bu gün 🎉</strong></button>)}
          {birthdaysUpcoming.map(({ customer, next }) => <button key={customer.id} type="button" onClick={() => setOpenId(customer.id)} className="u-border-1px_solid_border u-background-surface u-border-radius-10px u-padding-10px u-display-flex u-justify-content-space_between u-cursor-pointer u-text-align-left"><span><strong>{customer.name}</strong><small className="u-display-block u-color-text_secondary">{customer.phone || 'Telefon yoxdur'}</small></span><span className="u-text-align-right"><strong>{next.date.toLocaleDateString('az-AZ', { day: '2-digit', month: 'long' })}</strong><small className="u-display-block u-color-text_secondary">{next.days} gün qalıb</small></span></button>)}
        </div>}
      </section>

      {filtered.length === 0 ? (
        <div className="u-padding-60px u-text-align-center u-background-surface u-border-radius-14px u-border-1px_dashed_line_strong">
          <div className="u-font-size-48px">👥</div>
          <h3 className="u-margin-12px_0_4px">Hələ müştəri yoxdur</h3>
          <p className="u-color-text_secondary u-margin-0">İlk müştərinizi əlavə edərək başlayın.</p>
        </div>
      ) : (
        <div className="u-background-surface u-border-1px_solid_border u-border-radius-14px u-overflow-hidden">
          <table className="u-width-100 u-border-collapse-collapse u-font-size-14px">
            <thead className="u-background-surface_subtle u-text-align-left u-font-size-12px u-text-transform-uppercase u-color-text_secondary u-letter-spacing-0_5px">
              <tr>
                <th className="u-padding-12px_16px">Müştəri</th>
                <th className="u-padding-12px_16px">Əlaqə</th>
                <th className="u-padding-12px_16px">FİN / VÖEN</th>
                <th className="u-padding-12px_16px">Son aktivlik</th>
                <th className="u-padding-12px_16px u-text-align-right">Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const seg = segmentBadge[c.segment] || segmentBadge.individual;
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)}
                    className="u-border-top-1px_solid_surface_subtle u-cursor-pointer u-transition-background_0_15s"
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td className="u-padding-12px_16px">
                      <div className="u-display-flex u-align-items-center u-gap-12px">
                        <Avatar name={c.name} />
                        <div>
                          <div className="u-font-weight-600">{c.name}</div>
                          <span style={{ background: seg.bg, color: seg.color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{seg.label}</span>
                          <span style={{ marginLeft: 5, color: levelMeta[c.customer_level]?.color, fontSize: 11, fontWeight: 700 }}>{levelMeta[c.customer_level]?.label || 'Adi'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="u-padding-12px_16px u-color-text_secondary">
                      <div>{c.phone || '—'}</div>
                      <div className="u-font-size-12px u-color-text_secondary">{c.email || ''}</div>
                    </td>
                    <td className="u-padding-12px_16px u-color-text_secondary">
                      <div>{c.segment === 'business' ? (c.tax_id || '—') : (c.fin_code || c.tax_id || '—')}</div>
                      {c.segment !== 'business' && c.identity_card_no && <div className="u-font-size-11px u-color-text_secondary u-margin-top-2px">{c.identity_card_no}</div>}
                    </td>
                    <td className="u-padding-12px_16px u-color-text_secondary">{timeAgo(c.last_activity_at)}</td>
                    <td className="u-padding-12px_16px u-text-align-right" onClick={e => e.stopPropagation()}>
                      <button onClick={async () => { if (await appConfirm(`"${c.name}" silinsin?`, { danger: true })) remove(c.id); }}
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

      {openId && <CustomerDrawer customerId={openId} onClose={() => setOpenId(null)} onUpdate={(v) => update(openId, v)} onOpenSalesOrder={onOpenSalesOrder} onOpenCredit={onOpenCredit} />}
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
    <div role="dialog" aria-modal="true" aria-label="Yeni müştəri" onClick={onClose} className="u-position-fixed u-inset-0 u-background-rgba_15_23_42_0_5 u-display-flex u-align-items-flex_start u-justify-content-center u-z-index-100 u-padding-20px_12px u-overflow-y-auto">
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        className="u-background-surface u-border-radius-16px u-width-500px u-max-width-100 u-max-height-calc_100vh_40px u-overflow-y-auto u-display-flex u-flex-direction-column u-box-shadow-0_20px_55px_rgba_15_23_42_22">
        <div className="u-position-sticky u-top-0 u-z-index-2 u-display-flex u-align-items-center u-justify-content-space_between u-gap-12px u-padding-18px_20px u-border-bottom-1px_solid_border u-background-surface">
          <div><h2 className="u-margin-0 u-font-size-20px">Yeni müştəri</h2><p className="u-margin-3px_0_0 u-color-text_secondary u-font-size-12px">Müştərinin əsas məlumatlarını daxil edin</p></div>
          <button type="button" onClick={onClose} aria-label="Pəncərəni bağla" className="u-width-34px u-height-34px u-border-1px_solid_border u-border-radius-9px u-background-surface u-cursor-pointer u-font-size-20px u-line-height-1">×</button>
        </div>
        <div className="u-display-flex u-flex-direction-column u-gap-12px u-padding-18px_20px_8px">
        {err && <div className="u-background-fef2f2 u-color-danger u-padding-8px u-border-radius-8px u-font-size-13px">{err}</div>}
        <label style={modalLabel}>Ad və soyad / şirkət adı *<input autoFocus value={form.name} onChange={e => set('name', e.target.value)} placeholder={form.segment === 'business' ? 'Şirkətin hüquqi adı' : 'Ad və soyad'} style={inp} /></label>
        <label>Telefon<input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+994..." style={inp} /></label>
        <label>E-poçt <span className="u-color-text_secondary u-font-size-12px">(məcburi deyil)</span><input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inp} /></label>
        <label>Müştəri tipi
          <select value={form.segment} onChange={e => set('segment', e.target.value)} style={inp}>
            <option value="individual">Fiziki şəxs</option>
            <option value="business">Hüquqi şəxs</option>
          </select>
        </label>
        {form.segment === 'individual' ? <>
          <label>FİN kod<input value={form.fin_code} onChange={e => set('fin_code', e.target.value.toUpperCase())} placeholder="7 simvol" maxLength={7} style={inp} /></label>
          <label>Şəxsiyyət vəsiqəsinin seriya və nömrəsi<input value={form.identity_card_no} onChange={e => set('identity_card_no', e.target.value.toUpperCase())} placeholder="Məsələn: AA1234567" style={inp} /></label>
          <label>Doğum tarixi <span className="u-color-text_secondary u-font-size-12px">(məcburi deyil)</span><BirthDateInput value={form.birth_date} onChange={value => set('birth_date', value)} /></label>
        </> : <label>VÖEN<input value={form.tax_id} onChange={e => set('tax_id', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10 rəqəm" inputMode="numeric" style={inp} /></label>}
        <label>Səviyyə
          <select value={form.customer_level_override || ''} onChange={e => set('customer_level_override', e.target.value || null)} style={inp}>
            <option value="">Avtomatik hesablansın</option><option value="standard">Adi</option><option value="silver">Gümüş</option><option value="gold">Qızıl</option><option value="platinum">Platin</option>
          </select>
        </label>
        <label>Ünvan<input value={form.address} onChange={e => set('address', e.target.value)} style={inp} /></label>
        </div>
        <div className="u-position-sticky u-bottom-0 u-z-index-2 u-display-flex u-justify-content-flex_end u-gap-8px u-margin-top-8px u-padding-14px_20px u-border-top-1px_solid_border u-background-surface">
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
  return <div onClick={onClose} className="u-position-fixed u-inset-0 u-background-rgba_15_23_42_5 u-display-grid u-place-items-center u-z-index-110"><form onClick={e => e.stopPropagation()} onSubmit={submit} className="u-background-surface u-border-radius-16px u-padding-24px u-width-430px u-max-width-92vw u-display-grid u-gap-12px">
    <h2 className="u-margin-0">Müştəri səviyyələri</h2><p className="u-margin-0 u-color-text_secondary u-font-size-13px">Kassaya daxil olmuş ümumi satış ödənişinə əsasən avtomatik hesablanır.</p>
    {[['silver','Gümüş'],['gold','Qızıl'],['platinum','Platin']].map(([key,label]) => <label key={key}>{label} üçün minimum məbləğ<input type="number" min="0" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inp} /></label>)}
    <div className="u-display-flex u-justify-content-flex_end u-gap-8px"><button type="button" onClick={onClose} style={btnGhost}>Ləğv et</button><button disabled={busy} style={btnPrimary}>Yadda saxla</button></div>
  </form></div>;
}

const inp = { width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginTop: 4 };
const btnGhost = { background: 'transparent', border: '1px solid #e2e8f0', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnPrimary = { background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 };
