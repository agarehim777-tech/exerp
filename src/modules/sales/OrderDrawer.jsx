import React, { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import { supabase } from '../../integrations/supabase/client';

export default function OrderDrawer({ order, onClose, onStatus, onPatch, onDelete }) {
  const [paidInput, setPaidInput] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [busy, setBusy] = useState(false);

  const items = (order.items || []).sort((a, b) => (a.line_no || 0) - (b.line_no || 0));

  const registerPayment = async () => {
    const amount = Number(paidInput);
    if (!amount) return;
    const newPaid = Number(order.paid_amount || 0) + amount;
    const status = newPaid >= Number(order.total) ? 'paid' : 'partial';
    setBusy(true);
    try {
      await onPatch(order.id, { paid_amount: newPaid, payment_status: status });
      setPaidInput('');
    } finally { setBusy(false); }
  };

  const createShipment = async () => {
    setBusy(true);
    try {
      const yr = new Date().getFullYear();
      const prefix = `SH-${yr}-`;
      const { data: existing } = await supabase.from('sales_shipments').select('shipment_no').eq('tenant_id', order.tenant_id).like('shipment_no', `${prefix}%`).order('shipment_no', { ascending: false }).limit(1);
      const last = existing?.[0]?.shipment_no;
      const n = last ? parseInt(last.split('-')[2], 10) + 1 : 1;
      const shipment_no = `${prefix}${String(n).padStart(4, '0')}`;
      const { error } = await supabase.from('sales_shipments').insert({
        tenant_id: order.tenant_id, order_id: order.id, shipment_no,
        carrier: carrier || null, tracking_no: tracking || null, status: 'packed',
      });
      if (error) throw error;
      await onPatch(order.id, { status: 'shipped' });
      alert('Çatdırılma yaradıldı ✓');
      setCarrier(''); setTracking('');
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 640, maxWidth: '96vw', background: '#fff', height: '100%', overflowY: 'auto', animation: 'slideInRight 0.25s ease' }}>
        <header style={{ padding: 20, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>SİFARİŞ</div>
              <h2 style={{ margin: '4px 0', fontSize: 22 }}>{order.order_no}</h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <StatusBadge status={order.status} size="md" />
                <StatusBadge status={order.payment_status} size="md" />
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 0, fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
          </div>
        </header>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Section title="Müştəri">
            <div style={{ fontWeight: 600 }}>{order.customer?.name || '—'}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Tarix: {new Date(order.order_date || order.created_at).toLocaleDateString('az-AZ')}</div>
          </Section>

          <Section title={`Sətrlər (${items.length})`}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                <th style={cell}>Təsvir</th><th style={{ ...cell, textAlign: 'right' }}>Miq</th><th style={{ ...cell, textAlign: 'right' }}>Qiymət</th><th style={{ ...cell, textAlign: 'right' }}>Cəm</th>
              </tr></thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id}>
                    <td style={cell}>{it.description || '—'}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{Number(it.qty).toFixed(2)}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{Number(it.unit_price).toFixed(2)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{Number(it.line_total).toFixed(2)}</td>
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={4} style={{ ...cell, textAlign: 'center', color: '#94a3b8' }}>—</td></tr>}
              </tbody>
            </table>
            <Totals order={order} />
          </Section>

          <Section title="Status axını">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['draft', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => (
                <button key={s} onClick={() => onStatus(order.id, s)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: order.status === s ? '#10b981' : '#fff', color: order.status === s ? '#fff' : '#334155', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {s}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Ödəniş qeydiyyatı">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span>Ödənilib: <b>{Number(order.paid_amount || 0).toFixed(2)} ₼</b></span>
              <span>Qalıq: <b style={{ color: '#ef4444' }}>{(Number(order.total) - Number(order.paid_amount || 0)).toFixed(2)} ₼</b></span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" step="0.01" value={paidInput} onChange={e => setPaidInput(e.target.value)}
                placeholder="Məbləğ" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
              <button onClick={registerPayment} disabled={busy || !paidInput}
                style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                Qeyd et
              </button>
            </div>
          </Section>

          <Section title="Çatdırılma yarat">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="Daşıyıcı"
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
              <input value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Tracking №"
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
            </div>
            <button onClick={createShipment} disabled={busy}
              style={{ width: '100%', background: '#0ea5e9', color: '#fff', border: 0, padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
              Çatdırılma yarat
            </button>
          </Section>

          <button onClick={() => onDelete(order.id)}
            style={{ background: '#fff', color: '#ef4444', border: '1px solid #fecaca', padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Sifarişi sil
          </button>
        </div>
      </div>
    </div>
  );
}

const cell = { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' };
function Section({ title, children }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b' }}>{title}</h3>
      <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>{children}</div>
    </div>
  );
}
function Totals({ order }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
      <Row label="Aralıq" v={order.subtotal} />
      {order.discount_total > 0 && <Row label="Endirim" v={-order.discount_total} />}
      <Row label="ƏDV" v={order.tax_total || order.vat_total} />
      <Row label="ÜMUMİ" v={order.total} bold />
    </div>
  );
}
function Row({ label, v, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontWeight: bold ? 800 : 400, fontSize: bold ? 15 : 13 }}>
      <span>{label}</span><span>{Number(v || 0).toFixed(2)} ₼</span>
    </div>
  );
}
