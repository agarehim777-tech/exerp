import React, { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import { parseOrderNotes, serializeOrderNotes } from '../../shared/utils/orderNotes.js';

const SALES_STATUS = {
  draft: { label: 'Təsdiqləndi' },
  pending: { label: 'Təsdiqləndi' },
  confirmed: { label: 'Təsdiqləndi' },
  processing: { label: 'Təsdiqləndi' },
  shipped: { label: 'Təsdiqləndi' },
  delivered: { label: 'Təhvil verildi' },
  cancelled: { label: 'Ləğv edildi' },
};

export default function OrderDrawer({ order, customers = [], products = [], cashAccounts = [], canManageOrder = false, onClose, onStatus, onPatch, onPayment, onUpdate, onDelete }) {
  const parsedOrderNotes = parseOrderNotes(order.notes || order.note);
  const [paidInput, setPaidInput] = useState('');
  const [cashAccountId, setCashAccountId] = useState(() => cashAccounts.find(account => account.currency === (order.currency || 'AZN'))?.id || cashAccounts[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    customer_id: order.customer_id || order.customer?.id || '',
    order_date: order.order_date || new Date().toISOString().slice(0, 10),
    currency: order.currency || 'AZN',
    notes: parsedOrderNotes.general,
    internalNotes: parsedOrderNotes.internalNotes,
    items: (order.items || []).sort((a, b) => (a.line_no || 0) - (b.line_no || 0)).map(item => ({ ...item })),
  }));

  const items = (order.items || []).sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
  const salesStatus = SALES_STATUS[order.status] || SALES_STATUS.draft;

  const changeItem = (index, key, value) => setDraft(current => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
  }));

  const addItem = () => setDraft(current => ({ ...current, items: [...current.items, { product_id: products[0]?.id || '', description: products[0]?.name || '', qty: 1, unit_price: products[0]?.price || 0, discount_pct: 0, vat_rate: 0 }] }));
  const removeItem = (index) => setDraft(current => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));

  const saveChanges = async () => {
    if (!draft.items.length || draft.items.some(item => Number(item.qty) <= 0 || Number(item.unit_price) < 0)) {
      alert('Ən azı bir məhsul və düzgün miqdar/qiymət daxil edin.');
      return;
    }
    setBusy(true);
    try {
      await onUpdate(order.id, { ...draft, notes: serializeOrderNotes(draft.notes, draft.internalNotes) });
      setEditing(false);
    } catch (error) { alert(error.message || 'Satışı redaktə etmək mümkün olmadı.'); }
    finally { setBusy(false); }
  };

  const registerPayment = async () => {
    const amount = Number(paidInput);
    if (!amount) return;
    setBusy(true);
    try {
      await onPayment(amount, cashAccountId);
      setPaidInput('');
    } catch (error) { alert(error.message || 'Ödənişi qəbul etmək mümkün olmadı.'); }
    finally { setBusy(false); }
  };

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await onStatus(order.id, status);
    } catch (error) {
      alert(error?.message || 'Satış statusunu dəyişmək mümkün olmadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 820, maxWidth: '100vw', boxSizing: 'border-box', background: '#fff', height: '100%', overflowY: 'auto', overflowX: 'hidden', animation: 'slideInRight 0.25s ease' }}>
        <header style={{ padding: 20, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>SİFARİŞ</div>
              <h2 style={{ margin: '4px 0', fontSize: 22 }}>{order.order_no}</h2>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <StatusBadge status={salesStatus.label} size="md" />
                <StatusBadge status={order.payment_status} size="md" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {canManageOrder && <button onClick={() => setEditing(value => !value)} style={{ background: editing ? '#f1f5f9' : '#0b7a5c', color: editing ? '#334155' : '#fff', border: 0, padding: '8px 13px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>{editing ? 'Ləğv et' : 'Redaktə et'}</button>}
              <button onClick={onClose} style={{ background: 'transparent', border: 0, fontSize: 24, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
          </div>
        </header>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!canManageOrder && <div style={{ padding: '10px 12px', borderRadius: 9, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12 }}>Baxış rejimi — bu sifarişi yalnız onu yaradan satıcı və administrator redaktə və ya silə bilər.</div>}
          <Section title="Müştəri">
            {editing ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <select value={draft.customer_id} onChange={e => setDraft(current => ({ ...current, customer_id: e.target.value }))} style={inputStyle}><option value="">Müştəri seçin</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
              <input type="date" value={draft.order_date} onChange={e => setDraft(current => ({ ...current, order_date: e.target.value }))} style={inputStyle} />
              <select value={draft.currency} onChange={e => setDraft(current => ({ ...current, currency: e.target.value }))} style={inputStyle}><option>AZN</option><option>USD</option><option>EUR</option></select>
            </div> : <><div style={{ fontWeight: 600 }}>{order.customer?.name || '—'}</div><div style={{ fontSize: 12, color: '#64748b' }}>Tarix: {new Date(order.order_date || order.created_at).toLocaleDateString('az-AZ')}</div></>}
          </Section>

          <Section title={`Sətrlər (${items.length})`}>
            {!editing && <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                <th style={cell}>Təsvir</th><th style={{ ...cell, textAlign: 'right' }}>Miq</th><th style={{ ...cell, textAlign: 'right' }}>Qiymət</th><th style={{ ...cell, textAlign: 'right' }}>Cəm</th>
              </tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td style={cell}>{it.description || '—'}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{Number(it.qty).toFixed(2)}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{Number(it.unit_price).toFixed(2)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{Number(it.line_total).toFixed(2)}</td>
                  </tr>
                ))}
                {!items.length && <tr><td colSpan={4} style={{ ...cell, textAlign: 'center', color: '#94a3b8' }}>—</td></tr>}
              </tbody>
            </table>}
            {editing ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {draft.items.map((it, index) => {
                const net = Number(it.qty || 0) * Number(it.unit_price || 0);
                const lineTotal = net * (1 + Number(it.vat_rate || 0) / 100);
                return <div key={it.id || `draft-${index}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end', padding: 12, background: '#fff', border: '1px solid #dbe4e1', borderRadius: 10 }}>
                  <EditField label="Məhsul"><select value={it.product_id || ''} onChange={e => { const product = products.find(row => row.id === e.target.value); setDraft(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, product_id: e.target.value, description: product?.name || item.description, unit_price: product?.price ?? item.unit_price } : item) })); }} style={inputStyle}><option value="">Məhsul seçin</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></EditField>
                  <EditField label="Miqdar"><input type="number" min="0.01" step="0.01" value={it.qty} onChange={e => changeItem(index, 'qty', e.target.value)} style={inputStyle} /></EditField>
                  <EditField label="Qiymət"><input type="number" min="0" step="0.01" value={it.unit_price} onChange={e => changeItem(index, 'unit_price', e.target.value)} style={inputStyle} /></EditField>
                  <EditField label="ƏDV"><select value={Number(it.vat_rate || 0)} onChange={e => changeItem(index, 'vat_rate', Number(e.target.value))} style={inputStyle}><option value="0">ƏDV yoxdur</option><option value="18">18% ƏDV</option></select></EditField>
                  <div style={{ minWidth: 78, textAlign: 'right' }}><small style={{ display: 'block', color: '#64748b', marginBottom: 8 }}>{lineTotal.toFixed(2)} ₼</small><button onClick={() => removeItem(index)} style={{ border: '1px solid #fecaca', borderRadius: 7, padding: '7px 10px', background: '#fff', color: '#dc2626', cursor: 'pointer' }}>Sil</button></div>
                </div>;
              })}
              <button type="button" onClick={addItem} style={{ border: '1px dashed #0b7a5c', color: '#0b7a5c', background: '#fff', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>+ Məhsul əlavə et</button>
            </div> : <Totals order={order} />}
          </Section>

          {editing && <Section title="Qeyd"><textarea value={draft.notes} onChange={e => setDraft(current => ({ ...current, notes: e.target.value }))} rows={3} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} /><button onClick={saveChanges} disabled={busy} style={{ width: '100%', marginTop: 10, background: '#0b7a5c', color: '#fff', border: 0, padding: 10, borderRadius: 8, cursor: 'pointer', fontWeight: 800 }}>{busy ? 'Yadda saxlanılır…' : 'Dəyişiklikləri yadda saxla'}</button></Section>}

          {!editing && (parsedOrderNotes.general || parsedOrderNotes.internalNotes.length > 0) && <Section title="Sifariş qeydləri">
            {parsedOrderNotes.general && <div style={{ padding: '9px 11px', marginBottom: parsedOrderNotes.internalNotes.length ? 9 : 0, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}><strong style={{ display: 'block', marginBottom: 4, fontSize: 11, color: '#64748b' }}>ÜMUMİ QEYD</strong>{parsedOrderNotes.general}</div>}
            <div style={{ display: 'grid', gap: 8 }}>{parsedOrderNotes.internalNotes.map((item, index) => <div key={`${item.recipient}-${index}`} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '9px 11px', borderRadius: 8, background: '#fff', border: '1px solid #dbe4e1' }}><span style={{ color: '#0b7a5c', fontWeight: 800, fontSize: 11 }}>{item.recipient}</span><span>{item.text}</span></div>)}</div>
          </Section>}

          {canManageOrder && <Section title="Status axını">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <span style={{ display: 'block', color: '#64748b', fontSize: 11, marginBottom: 5 }}>Cari status</span>
                <StatusBadge status={salesStatus.label} size="md" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {salesStatus.next && <button type="button" onClick={() => changeStatus(salesStatus.next)} disabled={busy} style={{ padding: '9px 14px', borderRadius: 8, border: 0, background: '#0b7a5c', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>{busy ? 'Yenilənir…' : salesStatus.nextLabel}</button>}
                {!['delivered', 'cancelled'].includes(order.status) && <button type="button" onClick={() => { if (confirm('Bu satışı ləğv etmək istəyirsiniz?')) changeStatus('cancelled'); }} disabled={busy} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>Ləğv et</button>}
                {!salesStatus.next && <span style={{ color: '#64748b', fontSize: 12 }}>{order.status === 'delivered' ? 'Sifariş müştəriyə təhvil verilib.' : order.status === 'cancelled' ? 'Satış ləğv edilib.' : 'Sifariş təsdiqlənib və anbar təhvili gözləyir.'}</span>}
              </div>
            </div>
          </Section>}

          {canManageOrder && <Section title="Ödəniş qeydiyyatı">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span>Ödənilib: <b>{Number(order.paid_amount || 0).toFixed(2)} ₼</b></span>
              <span>Qalıq: <b style={{ color: '#ef4444' }}>{(Number(order.total) - Number(order.paid_amount || 0)).toFixed(2)} ₼</b></span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(120px, 1fr) auto', gap: 8 }}>
              <select value={cashAccountId} onChange={e => setCashAccountId(e.target.value)} style={inputStyle}>
                <option value="">Kassa hesabını seçin</option>
                {cashAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
              </select>
              <input type="number" step="0.01" value={paidInput} onChange={e => setPaidInput(e.target.value)}
                placeholder="Məbləğ" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
              <button onClick={registerPayment} disabled={busy || !paidInput}
                style={{ background: '#10b981', color: '#fff', border: 0, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
                Qeyd et
              </button>
            </div>
            {!cashAccounts.length && <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>Hesab seçilməyibsə ödəniş zamanı “Əsas kassa” avtomatik yaradılacaq.</div>}
          </Section>}

          {canManageOrder && <button onClick={() => onDelete(order.id)} disabled={busy}
            style={{ background: '#fff', color: '#ef4444', border: '1px solid #fecaca', padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Sifarişi sil
          </button>}
        </div>
      </div>
    </div>
  );
}

const cell = { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' };
const inputStyle = { width: '100%', padding: '8px 9px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' };
function EditField({ label, children }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}><span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{label}</span>{children}</label>; }
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
