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


  return (
    <div>
      <div className="u-overflow-x-auto u-border-1px_solid_border u-border-radius-10px">
        <table className="u-width-100 u-border-collapse-collapse u-min-width-720px">
          <thead className="u-background-surface_subtle">
            <tr>
              <th className="line-items-table-cell sx-8f77872 sx-200a92a">Məhsul</th>
              <th className="line-items-table-cell sx-200a92a">Təsvir</th>
              <th className="line-items-table-cell sx-f95ebd2">Miqdar</th>
              <th className="line-items-table-cell sx-ee0435f">Qiymət</th>
              <th className="line-items-table-cell sx-f95ebd2">End %</th>
              <th className="line-items-table-cell sx-f95ebd2">ƏDV %</th>
              <th className="line-items-table-cell sx-1a30558 sx-f6e3d7f">Cəm</th>
              <th className="line-items-table-cell sx-93de2d4"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="line-items-table-cell">
                  <ProductPicker products={products} value={it.product_id} onPick={p => set(i, {
                    product_id: p.id, description: it.description || p.name, unit_price: Number(p.price) || 0,
                  })} />
                </td>
                <td className="line-items-table-cell"><input className="line-items-table-inp" value={it.description} onChange={e => set(i, { description: e.target.value })} /></td>
                <td className="line-items-table-cell"><input type="number" step="0.01" className="line-items-table-inp sx-f6e3d7f" value={it.qty} onChange={e => set(i, { qty: e.target.value })} /></td>
                <td className="line-items-table-cell"><input type="number" step="0.01" className="line-items-table-inp sx-f6e3d7f" value={it.unit_price} onChange={e => set(i, { unit_price: e.target.value })} /></td>
                <td className="line-items-table-cell"><input type="number" step="0.01" className="line-items-table-inp sx-f6e3d7f" value={it.discount_pct} onChange={e => set(i, { discount_pct: e.target.value })} /></td>
                <td className="line-items-table-cell"><input type="number" step="0.01" className="line-items-table-inp sx-f6e3d7f" value={it.tax_rate} onChange={e => set(i, { tax_rate: e.target.value })} /></td>
                <td className="line-items-table-cell sx-f6e3d7f sx-e634e6d">{lineTotal(it).toFixed(2)} ₼</td>
                <td className="line-items-table-cell">
                  <button type="button" onClick={() => remove(i)} className="u-border-0 u-background-transparent u-cursor-pointer u-color-danger u-font-size-18px">×</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="line-items-table-cell sx-13076d9 sx-8cd4ae7 sx-7fa5638">Sətir yoxdur — aşağıdan əlavə edin</td></tr>
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
    <div className={`sx-f7dbba7 sx-daae847 sx-2dab903 ${bold ? "sx-f2ee35f" : "sx-f1bde2c"} ${bold ? "sx-3dd9b4c" : "sx-3044b60"} ${bold ? "sx-5cfb91b" : "sx-53deb6e"}`}>
      <span>{label}</span><span>{value.toFixed(2)} ₼</span>
    </div>
  );
}
