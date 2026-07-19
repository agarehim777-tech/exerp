import React from 'react';
import ProductPicker from './ProductPicker.jsx';

function lineNet(it) {
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  const disc = Number(it.discount_pct) || 0;
  return qty * price * (1 - disc / 100);
}
function lineTotal(it) {
  const rate = Number(it.tax_rate) || 0;
  return lineNet(it) * (1 + rate / 100);
}

export default function LineItemsTable({ items, onChange, products = [] }) {
  const set = (i, patch) => {
    const next = items.map((it, idx) => idx === i ? { ...it, ...patch } : it);
    onChange(next);
  };
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { description: '', qty: 1, unit_price: 0, discount_pct: 0, tax_rate: 18 }]);

  const totals = items.reduce((acc, it) => {
    const net = lineNet(it);
    acc.sub += it.qty * it.unit_price;
    acc.disc += (it.qty * it.unit_price) * ((it.discount_pct || 0) / 100);
    acc.tax += net * ((it.tax_rate || 0) / 100);
    return acc;
  }, { sub: 0, disc: 0, tax: 0 });
  const grand = totals.sub - totals.disc + totals.tax;

  const cell = { padding: '6px 8px', border: '1px solid #e2e8f0', fontSize: 13 };
  const inp = { width: '100%', border: 0, outline: 0, padding: 4, background: 'transparent', fontSize: 13 };

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={{ ...cell, width: 200, textAlign: 'left' }}>Məhsul</th>
              <th style={{ ...cell, textAlign: 'left' }}>Təsvir</th>
              <th style={{ ...cell, width: 70 }}>Miqdar</th>
              <th style={{ ...cell, width: 100 }}>Qiymət</th>
              <th style={{ ...cell, width: 70 }}>End %</th>
              <th style={{ ...cell, width: 70 }}>ƏDV %</th>
              <th style={{ ...cell, width: 110, textAlign: 'right' }}>Cəm</th>
              <th style={{ ...cell, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={cell}>
                  <ProductPicker products={products} value={it.product_id} onPick={p => set(i, {
                    product_id: p.id, description: it.description || p.name, unit_price: Number(p.price) || 0,
                  })} />
                </td>
                <td style={cell}><input style={inp} value={it.description} onChange={e => set(i, { description: e.target.value })} /></td>
                <td style={cell}><input type="number" step="0.01" style={{ ...inp, textAlign: 'right' }} value={it.qty} onChange={e => set(i, { qty: e.target.value })} /></td>
                <td style={cell}><input type="number" step="0.01" style={{ ...inp, textAlign: 'right' }} value={it.unit_price} onChange={e => set(i, { unit_price: e.target.value })} /></td>
                <td style={cell}><input type="number" step="0.01" style={{ ...inp, textAlign: 'right' }} value={it.discount_pct} onChange={e => set(i, { discount_pct: e.target.value })} /></td>
                <td style={cell}><input type="number" step="0.01" style={{ ...inp, textAlign: 'right' }} value={it.tax_rate} onChange={e => set(i, { tax_rate: e.target.value })} /></td>
                <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{lineTotal(it).toFixed(2)} ₼</td>
                <td style={cell}>
                  <button type="button" onClick={() => remove(i)} style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#ef4444', fontSize: 18 }}>×</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} style={{ ...cell, textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sətir yoxdur — aşağıdan əlavə edin</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 }}>
        <button type="button" onClick={add} style={{ background: '#f1f5f9', border: '1px dashed #cbd5e1', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>+ Sətir əlavə et</button>
        <div style={{ minWidth: 260, background: '#f8fafc', padding: 12, borderRadius: 10, fontSize: 13 }}>
          <Row label="Aralıq cəm" value={totals.sub} />
          <Row label="Endirim" value={-totals.disc} />
          <Row label="ƏDV" value={totals.tax} />
          <div style={{ height: 1, background: '#e2e8f0', margin: '6px 0' }} />
          <Row label="ÜMUMİ" value={grand} bold />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: bold ? 800 : 400, fontSize: bold ? 15 : 13, color: bold ? '#0f172a' : '#475569' }}>
      <span>{label}</span><span>{value.toFixed(2)} ₼</span>
    </div>
  );
}
