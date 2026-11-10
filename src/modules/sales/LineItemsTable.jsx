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
      <div className="u-overflow-x-auto u-border-1px_solid_border u-border-radius-10px">
        <table className="u-width-100 u-border-collapse-collapse u-min-width-720px">
          <thead className="u-background-surface_subtle">
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
                  <button type="button" onClick={() => remove(i)} className="u-border-0 u-background-transparent u-cursor-pointer u-color-danger u-font-size-18px">×</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} style={{ ...cell, textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sətir yoxdur — aşağıdan əlavə edin</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="u-display-flex u-justify-content-space_between u-align-items-flex_start u-margin-top-12px">
        <button type="button" onClick={add} className="u-background-surface_subtle u-border-1px_dashed_line_strong u-padding-8px_16px u-border-radius-8px u-cursor-pointer u-font-size-13px">+ Sətir əlavə et</button>
        <div className="u-min-width-260px u-background-surface_subtle u-padding-12px u-border-radius-10px u-font-size-13px">
          <Row label="Aralıq cəm" value={totals.sub} />
          <Row label="Endirim" value={-totals.disc} />
          <Row label="ƏDV" value={totals.tax} />
          <div className="u-height-1px u-background-border u-margin-6px_0" />
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
