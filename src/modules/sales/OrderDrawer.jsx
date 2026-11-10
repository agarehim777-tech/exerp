import React, { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import { toLocalIsoDate } from '../../services/date.js';
import { parseOrderNotes, serializeOrderNotes } from '../../shared/utils/orderNotes.js';
import { appAlert } from '../../shared/ui/dialogService.js';
import { createIdempotencyKey } from '../../services/coreOperations.js';

const priceEditOnly = import.meta.env.VITE_ENABLE_LEGACY_WRITES !== 'true';

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
    order_date: order.order_date || toLocalIsoDate(),
    currency: order.currency || 'AZN',
    expected_updated_at: order.updated_at,
    request_key: createIdempotencyKey(`sales-edit:${order.id}`),
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
      appAlert('Ən azı bir məhsul və düzgün miqdar/qiymət daxil edin.');
      return;
    }
    setBusy(true);
    try {
      await onUpdate(order.id, { ...draft, notes: serializeOrderNotes(draft.notes, draft.internalNotes) });
      setEditing(false);
    } catch (error) { appAlert(error.message || 'Satışı redaktə etmək mümkün olmadı.'); }
    finally { setBusy(false); }
  };

  const registerPayment = async () => {
    const amount = Number(paidInput);
    if (!amount) return;
    setBusy(true);
    try {
      await onPayment(amount, cashAccountId);
      setPaidInput('');
    } catch (error) { appAlert(error.message || 'Ödənişi qəbul etmək mümkün olmadı.'); }
    finally { setBusy(false); }
  };

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await onStatus(order.id, status);
    } catch (error) {
      appAlert(error?.message || 'Satış statusunu dəyişmək mümkün olmadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} className="u-position-fixed u-inset-0 u-background-rgba_15_23_42_0_5 u-z-index-100 u-display-flex u-justify-content-flex_end">
      <div role="dialog" aria-modal="true" aria-label="Sifariş kartı" onClick={e => e.stopPropagation()}
        className="u-width-820px u-max-width-100vw u-box-sizing-border_box u-background-surface u-height-100 u-overflow-y-auto u-overflow-x-hidden u-animation-slideInRight_0_25s_ease">
        <header className="u-padding-20px u-border-bottom-1px_solid_border u-position-sticky u-top-0 u-background-surface u-z-index-5">
          <div className="u-display-flex u-justify-content-space_between u-align-items-flex_start">
            <div>
              <div className="u-font-size-12px u-color-text_secondary u-font-weight-600">SİFARİŞ</div>
              <h2 className="u-margin-4px_0 u-font-size-22px">{order.order_no}</h2>
              <div className="u-display-flex u-gap-6px u-margin-top-6px">
                <StatusBadge status={salesStatus.label} size="md" />
                <StatusBadge status={order.payment_status} size="md" />
              </div>
            </div>
            <div className="u-display-flex u-gap-8px">
              {canManageOrder && <button onClick={() => setEditing(value => !value)} style={{ background: editing ? '#f1f5f9' : '#0b7a5c', color: editing ? '#334155' : '#fff', border: 0, padding: '8px 13px', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>{editing ? 'Ləğv et' : 'Redaktə et'}</button>}
              <button onClick={onClose} aria-label="Sifariş kartını bağla" className="u-background-transparent u-border-0 u-font-size-24px u-cursor-pointer u-color-text_secondary">×</button>
            </div>
          </div>
        </header>

        <div className="u-padding-20px u-display-flex u-flex-direction-column u-gap-18px">
          {!canManageOrder && <div className="u-padding-10px_12px u-border-radius-9px u-color-text_secondary u-background-surface_subtle u-border-1px_solid_border u-font-size-12px">Baxış rejimi — bu sifarişi yalnız onu yaradan satıcı və administrator redaktə və ya silə bilər.</div>}
          <Section title="Müştəri">
            {editing ? <div className="u-display-grid u-grid-template-columns-repeat_auto_fit_minmax_150px_1fr u-gap-10px">
              <select value={draft.customer_id} onChange={e => setDraft(current => ({ ...current, customer_id: e.target.value }))} style={inputStyle}><option value="">Müştəri seçin</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
              <input type="date" value={draft.order_date} onChange={e => setDraft(current => ({ ...current, order_date: e.target.value }))} style={inputStyle} />
              <select value={draft.currency} disabled={priceEditOnly} onChange={e => setDraft(current => ({ ...current, currency: e.target.value }))} style={inputStyle}><option>AZN</option><option>USD</option><option>EUR</option></select>
            </div> : <><div className="u-font-weight-600">{order.customer?.name || '—'}</div><div className="u-font-size-12px u-color-text_secondary">Tarix: {new Date(order.order_date || order.created_at).toLocaleDateString('az-AZ')}</div></>}
          </Section>

          <Section title={`Sətrlər (${items.length})`}>
            {!editing && <table className="u-width-100 u-font-size-12px u-border-collapse-collapse">
              <thead><tr className="u-background-surface_subtle">
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
            {editing ? <div className="u-display-flex u-flex-direction-column u-gap-10px">
              {draft.items.map((it, index) => {
                const net = Number(it.qty || 0) * Number(it.unit_price || 0);
                const lineTotal = net * (1 + Number(it.vat_rate || 0) / 100);
                return <div key={it.id || `draft-${index}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end', padding: 12, background: '#fff', border: '1px solid #dbe4e1', borderRadius: 10 }}>
                  <EditField label="Məhsul"><select value={it.product_id || ''} disabled={priceEditOnly} onChange={e => { const product = products.find(row => row.id === e.target.value); setDraft(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, product_id: e.target.value, description: product?.name || item.description, unit_price: product?.price ?? item.unit_price } : item) })); }} style={inputStyle}><option value="">Məhsul seçin</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></EditField>
                  <EditField label="Miqdar"><input type="number" min="0.01" step="0.01" value={it.qty} readOnly={priceEditOnly} onChange={e => changeItem(index, 'qty', e.target.value)} style={inputStyle} /></EditField>
                  <EditField label="Qiymət"><input type="number" min="0" step="0.01" value={it.unit_price} onChange={e => changeItem(index, 'unit_price', e.target.value)} style={inputStyle} /></EditField>
                  <EditField label="ƏDV"><select value={Number(it.vat_rate || 0)} onChange={e => changeItem(index, 'vat_rate', Number(e.target.value))} style={inputStyle}><option value="0">ƏDV yoxdur</option><option value="18">18% ƏDV</option></select></EditField>
                  <div className="u-min-width-78px u-text-align-right"><small className="u-display-block u-color-text_secondary u-margin-bottom-8px">{lineTotal.toFixed(2)} ₼</small>{!priceEditOnly && <button onClick={() => removeItem(index)} className="u-border-1px_solid_fecaca u-border-radius-7px u-padding-7px_10px u-background-surface u-color-danger u-cursor-pointer">Sil</button>}</div>
                </div>;
              })}
              {!priceEditOnly && <button type="button" onClick={addItem} className="u-border-1px_dashed_0b7a5c u-color-0b7a5c u-background-surface u-padding-9px_12px u-border-radius-8px u-cursor-pointer u-font-weight-700">+ Məhsul əlavə et</button>}
            </div> : <Totals order={order} />}
          </Section>

          {editing && <Section title="Qeyd"><textarea value={draft.notes} onChange={e => setDraft(current => ({ ...current, notes: e.target.value }))} rows={3} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} /><button onClick={saveChanges} disabled={busy} className="u-width-100 u-margin-top-10px u-background-0b7a5c u-color-surface u-border-0 u-padding-10px u-border-radius-8px u-cursor-pointer u-font-weight-800">{busy ? 'Yadda saxlanılır…' : 'Dəyişiklikləri yadda saxla'}</button></Section>}

          {!editing && (parsedOrderNotes.general || parsedOrderNotes.internalNotes.length > 0) && <Section title="Sifariş qeydləri">
            {parsedOrderNotes.general && <div style={{ padding: '9px 11px', marginBottom: parsedOrderNotes.internalNotes.length ? 9 : 0, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0' }}><strong className="u-display-block u-margin-bottom-4px u-font-size-11px u-color-text_secondary">ÜMUMİ QEYD</strong>{parsedOrderNotes.general}</div>}
            <div className="u-display-grid u-gap-8px">{parsedOrderNotes.internalNotes.map((item, index) => <div key={`${item.recipient}-${index}`} style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 10, alignItems: 'start', padding: '9px 11px', borderRadius: 8, background: '#fff', border: '1px solid #dbe4e1' }}><span className="u-color-0b7a5c u-font-weight-800 u-font-size-11px">{item.recipient}</span><span>{item.text}</span></div>)}</div>
          </Section>}

          {canManageOrder && <Section title="Status axını">
            <div className="u-display-flex u-align-items-center u-justify-content-space_between u-gap-14px u-flex-wrap-wrap">
              <div>
                <span className="u-display-block u-color-text_secondary u-font-size-11px u-margin-bottom-5px">Cari status</span>
                <StatusBadge status={salesStatus.label} size="md" />
              </div>
              <div className="u-display-flex u-gap-8px u-flex-wrap-wrap">
                {salesStatus.next && <button type="button" onClick={() => changeStatus(salesStatus.next)} disabled={busy} className="u-padding-9px_14px u-border-radius-8px u-border-0 u-background-0b7a5c u-color-surface u-cursor-pointer u-font-weight-700">{busy ? 'Yenilənir…' : salesStatus.nextLabel}</button>}
                {!['delivered', 'cancelled'].includes(order.status) && <button type="button" onClick={() => onDelete(order.id)} disabled={busy} className="u-padding-9px_14px u-border-radius-8px u-border-1px_solid_fecaca u-background-surface u-color-danger u-cursor-pointer u-font-weight-700">Ləğv et</button>}
                {!salesStatus.next && <span className="u-color-text_secondary u-font-size-12px">{order.status === 'delivered' ? 'Sifariş müştəriyə təhvil verilib.' : order.status === 'cancelled' ? 'Satış ləğv edilib.' : 'Sifariş təsdiqlənib və anbar təhvili gözləyir.'}</span>}
              </div>
            </div>
          </Section>}

          {canManageOrder && <Section title="Ödəniş qeydiyyatı">
            <div className="u-display-flex u-justify-content-space_between u-margin-bottom-8px u-font-size-13px">
              <span>Ödənilib: <b>{Number(order.paid_amount || 0).toFixed(2)} ₼</b></span>
              <span>Qalıq: <b className="u-color-danger">{(Number(order.total) - Number(order.paid_amount || 0)).toFixed(2)} ₼</b></span>
            </div>
            <div className="u-display-grid u-grid-template-columns-minmax_150px_1fr_minmax_120px_1fr_auto u-gap-8px">
              <select value={cashAccountId} onChange={e => setCashAccountId(e.target.value)} style={inputStyle}>
                <option value="">Kassa hesabını seçin</option>
                {cashAccounts.map(account => <option key={account.id} value={account.id}>{account.name} ({account.currency})</option>)}
              </select>
              <input type="number" step="0.01" value={paidInput} onChange={e => setPaidInput(e.target.value)}
                placeholder="Məbləğ" className="u-flex-1 u-padding-8px_10px u-border-1px_solid_border u-border-radius-8px" />
              <button onClick={registerPayment} disabled={busy || !paidInput}
                className="u-background-action u-color-surface u-border-0 u-padding-8px_16px u-border-radius-8px u-cursor-pointer u-font-weight-700">
                Qeyd et
              </button>
            </div>
            {!cashAccounts.length && <div className="u-margin-top-8px u-color-text_secondary u-font-size-12px">Hesab seçilməyibsə ödəniş zamanı “Əsas kassa” avtomatik yaradılacaq.</div>}
          </Section>}

          {canManageOrder && <button onClick={() => onDelete(order.id)} disabled={busy}
            className="u-background-surface u-color-danger u-border-1px_solid_fecaca u-padding-9px u-border-radius-8px u-cursor-pointer u-font-weight-600">
            Sifarişi sil
          </button>}
        </div>
      </div>
    </div>
  );
}

const cell = { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' };
const inputStyle = { width: '100%', padding: '8px 9px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' };
function EditField({ label, children }) { return <label className="u-display-flex u-flex-direction-column u-gap-6px u-min-width-0"><span className="u-font-size-11px u-color-text_secondary u-font-weight-700">{label}</span>{children}</label>; }
function Section({ title, children }) {
  return (
    <div>
      <h3 className="u-margin-0_0_8px u-font-size-12px u-text-transform-uppercase u-letter-spacing-0_5px u-color-text_secondary">{title}</h3>
      <div className="u-background-surface_subtle u-padding-12px u-border-radius-10px u-border-1px_solid_border">{children}</div>
    </div>
  );
}
function Totals({ order }) {
  return (
    <div className="u-margin-top-10px u-padding-top-10px u-border-top-1px_solid_border u-font-size-13px">
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

