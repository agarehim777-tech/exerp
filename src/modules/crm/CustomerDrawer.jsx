import React, { useState } from 'react';
import { useCustomer360 } from '../../shared/hooks/useCustomer360.js';
import { useActivities } from '../../shared/hooks/useActivities.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import Avatar from './Avatar.jsx';

export default function CustomerDrawer({ customerId, onClose, onUpdate, onOpenSalesOrder }) {
  const { activeTenantId } = useAuth();
  const { data, loading, error, refresh } = useCustomer360(customerId);
  const { create: createActivity } = useActivities(activeTenantId, { customerId });
  const [tab, setTab] = useState('overview');
  const [activityType, setActivityType] = useState('note');
  const [activityText, setActivityText] = useState('');

  const c = data?.customer;

  const addActivity = async () => {
    if (!activityText.trim()) return;
    await createActivity({ type: activityType, subject: activityText, customer_id: customerId });
    setActivityText('');
    refresh();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
      <aside style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '95vw',
        background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', animation: 'slideIn 0.25s ease-out',
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>Yüklənir...</div>
        ) : error || !c ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 8 }}>Müştəri məlumatları yüklənmədi</div>
            <div style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{error?.message || 'Müştəri tapılmadı.'}</div>
            <button onClick={refresh} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Yenidən yoxla</button>
          </div>
        ) : (
          <>
            <header style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar name={c.name} size={56} />
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{c.name}</h2>
                <div style={{ fontSize: 13, color: '#64748b' }}>{c.email || c.phone || '—'}</div>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 0, fontSize: 24, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </header>

            <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <Stat label="LTV (Sifariş)" value={`${Number(data.orders_total || 0).toFixed(0)} ₼`} />
              <Stat label="Ödənilib" value={`${Number(data.orders_paid || 0).toFixed(0)} ₼`} />
              <Stat label="Qalıq borc" value={`${Number(data.orders_outstanding || 0).toFixed(0)} ₼`} />
              <Stat label="Qazanıldı" value={`${Number(data.won_amount || 0).toFixed(0)} ₼`} />
              <Stat label="Açıq deal" value={data.open_deals?.length || 0} />
            </div>

            <nav style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 20px' }}>
              {[
                ['overview', 'Ümumi'], ['deals', 'Sövdələşmələr'],
                ['activity', 'Aktivlik'], ['tasks', 'Tapşırıqlar'], ['orders', 'Sifarişlər'],
              ].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{
                    background: 'none', border: 0, padding: '12px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                    color: tab === k ? '#10b981' : '#64748b',
                    borderBottom: `2px solid ${tab === k ? '#10b981' : 'transparent'}`,
                  }}>{l}</button>
              ))}
            </nav>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {tab === 'overview' && <OverviewTab c={c} tags={data.tags} onUpdate={onUpdate} />}
              {tab === 'deals' && <DealsTab deals={data.open_deals || []} />}
              {tab === 'activity' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <select value={activityType} onChange={e => setActivityType(e.target.value)}
                      style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
                      <option value="note">📝 Qeyd</option>
                      <option value="call">📞 Zəng</option>
                      <option value="meeting">🤝 Görüş</option>
                      <option value="email">✉️ E-poçt</option>
                      <option value="sms">💬 SMS</option>
                    </select>
                    <input value={activityText} onChange={e => setActivityText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addActivity()}
                      placeholder="Nə baş verdi?"
                      style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }} />
                    <button onClick={addActivity} style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>+</button>
                  </div>
                  <Timeline items={data.activities || []} />
                </div>
              )}
              {tab === 'tasks' && <TasksTab tasks={data.tasks || []} />}
              {tab === 'orders' && (
                <OrdersTab orders={data.orders || []} count={data.orders_count} total={data.orders_total} onOpen={onOpenSalesOrder} />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

const Stat = ({ label, value }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{value}</div>
  </div>
);

const orderStatusLabels = { draft: 'Yeni', pending: 'Yeni', confirmed: 'Təsdiqləndi', processing: 'Hazırlanır', shipped: 'Hazırlanır', delivered: 'Təhvil verildi', cancelled: 'Ləğv edildi' };
function OrdersTab({ orders, count, total, onOpen }) {
  return <div style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#64748b', fontSize: 12 }}><span><b>Sifariş sayı:</b> {count ?? orders.length}</span><span><b>Ümumi:</b> {Number(total || 0).toFixed(2)} ₼</span></div>
    {orders.length === 0 ? <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 10 }}>Bu müştəri üzrə sifariş yoxdur.</div> : orders.map(order => <button key={order.id} type="button" onClick={() => onOpen?.(order.id)} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: 12, textAlign: 'left', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer' }}>
      <span style={{ minWidth: 0 }}><strong style={{ display: 'block', color: '#0f172a' }}>{order.order_no || order.id}</strong><small style={{ color: '#64748b' }}>{order.order_date ? new Date(order.order_date).toLocaleDateString('az-AZ') : 'Tarix yoxdur'} · {orderStatusLabels[order.status] || order.status}</small></span>
      <span style={{ textAlign: 'right' }}><strong style={{ display: 'block', color: '#0b7a5c' }}>{Number(order.total || 0).toFixed(2)} {order.currency === 'AZN' ? '₼' : order.currency}</strong><small style={{ color: '#2563eb' }}>Sifarişə bax →</small></span>
    </button>)}
  </div>;
}

function OverviewTab({ c, tags, onUpdate }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(c);
  const fieldLabels = {
    name: 'Ad və soyad / şirkət adı',
    phone: 'Telefon',
    email: 'E-poçt',
    tax_id: 'VÖEN / FİN',
    address: 'Ünvan',
  };
  React.useEffect(() => setForm(c), [c]);

  if (!edit) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Row label="Telefon" value={c.phone} />
      <Row label="E-poçt" value={c.email} />
      <Row label="VÖEN" value={c.tax_id} />
      <Row label="Ünvan" value={c.address} />
      <Row label="Seqment" value={c.segment} />
      <div>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Teqlər</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(tags || []).length === 0 ? <span style={{ color: '#94a3b8' }}>—</span> : tags.map(t => (
            <span key={t.id} style={{ background: `${t.color}22`, color: t.color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{t.name}</span>
          ))}
        </div>
      </div>
      <button onClick={() => setEdit(true)} style={{ marginTop: 8, background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Düzəliş et</button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {['name', 'phone', 'email', 'tax_id', 'address'].map(k => (
        <label key={k}>{fieldLabels[k]}<input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginTop: 4 }} /></label>
      ))}
      <label>Müştəri tipi
        <select value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, marginTop: 4 }}>
          <option value="individual">Fiziki şəxs</option><option value="business">Hüquqi şəxs</option><option value="vip">VIP müştəri</option>
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setEdit(false)} style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>Ləğv</button>
        <button onClick={async () => { await onUpdate({ name: form.name, phone: form.phone, email: form.email, tax_id: form.tax_id, address: form.address, segment: form.segment }); setEdit(false); }}
          style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Yadda saxla</button>
      </div>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
    <div style={{ fontSize: 14, color: '#0f172a' }}>{value || '—'}</div>
  </div>
);

function DealsTab({ deals }) {
  if (deals.length === 0) return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 30 }}>Açıq sövdələşmə yoxdur</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {deals.map(d => (
        <div key={d.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <div style={{ fontWeight: 600 }}>{d.title}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{Number(d.amount).toFixed(2)} {d.currency}</div>
        </div>
      ))}
    </div>
  );
}

function TasksTab({ tasks }) {
  if (tasks.length === 0) return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 30 }}>Açıq tapşırıq yoxdur</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tasks.map(t => (
        <div key={t.id} style={{ padding: 10, border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={t.done} readOnly />
          <span style={{ flex: 1 }}>{t.title}</span>
          {t.due_at && <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(t.due_at).toLocaleDateString()}</span>}
        </div>
      ))}
    </div>
  );
}

const activityIcon = { call: '📞', meeting: '🤝', email: '✉️', note: '📝', sms: '💬' };
function Timeline({ items }) {
  if (items.length === 0) return <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Hələ aktivlik yoxdur</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(a => (
        <div key={a.id} style={{ display: 'flex', gap: 10, padding: 10, background: '#f8fafc', borderRadius: 10 }}>
          <span style={{ fontSize: 18 }}>{activityIcon[a.type] || '•'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{a.subject}</div>
            {a.body && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{a.body}</div>}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{new Date(a.occurred_at).toLocaleString('az-AZ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
