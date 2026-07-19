import React, { useState, useEffect } from 'react';
import LineItemsTable from './LineItemsTable.jsx';
import StatusBadge from './StatusBadge.jsx';

export default function QuoteEditor({ quote, customers, products, onClose, onCreate, onUpdate, onSetStatus, onDelete, onConvert }) {
  const isNew = !quote;
  const [form, setForm] = useState(() => ({
    customer_id: quote?.customer_id || '',
    currency: quote?.currency || 'AZN',
    valid_until: quote?.valid_until || '',
    notes: quote?.notes || '',
    status: quote?.status || 'draft',
    items: (quote?.items || []).sort((a, b) => a.sort_order - b.sort_order).map(it => ({
      product_id: it.product_id, description: it.description, qty: it.qty,
      unit_price: it.unit_price, discount_pct: it.discount_pct, tax_rate: it.tax_rate,
    })),
  }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, items: form.items.map(it => ({ ...it, qty: Number(it.qty), unit_price: Number(it.unit_price), discount_pct: Number(it.discount_pct) || 0, tax_rate: Number(it.tax_rate) || 0 })) };
      if (isNew) await onCreate(payload);
      else await onUpdate(quote.id, payload);
    } catch (err) { alert(err.message); }
    finally { setBusy(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, marginTop: 4 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ width: 780, maxWidth: '96vw', background: '#fff', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.25s ease' }}>
        <header style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{isNew ? 'YENİ KOTİROVKA' : quote.number}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{isNew ? 'Kotirovka yarat' : 'Kotirovka'}</h2>
              {!isNew && <StatusBadge status={quote.status} size="md" />}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 0, fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
        </header>

        <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Müştəri *
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} required style={inp}>
                <option value="">— Seçin —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Valyuta
              <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={inp}>
                <option>AZN</option><option>USD</option><option>EUR</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Etibarlıdır
              <input type="date" value={form.valid_until || ''} onChange={e => setForm({ ...form, valid_until: e.target.value })} style={inp} />
            </label>
          </div>

          <LineItemsTable items={form.items} onChange={items => setForm({ ...form, items })} products={products} />

          <label style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Qeydlər
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inp, resize: 'vertical' }} />
          </label>
        </div>

        <footer style={{ padding: 16, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', position: 'sticky', bottom: 0, background: '#fff' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isNew && quote.status !== 'accepted' && (
              <button type="button" onClick={() => onSetStatus(quote.id, 'sent')}
                style={btnSecondary}>Göndər</button>
            )}
            {!isNew && !quote.order_id && (
              <button type="button" onClick={() => onConvert(quote.id)}
                style={{ ...btnSecondary, background: '#dcfce7', color: '#15803d', borderColor: '#86efac' }}>Sifarişə çevir</button>
            )}
            {!isNew && (
              <button type="button" onClick={() => onDelete(quote.id)}
                style={{ ...btnSecondary, color: '#ef4444' }}>Sil</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Ləğv</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', border: 0, padding: '9px 20px', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}>
              {busy ? '...' : (isNew ? 'Yarat' : 'Yadda saxla')}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
const btnSecondary = { background: '#fff', border: '1px solid #e2e8f0', padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
