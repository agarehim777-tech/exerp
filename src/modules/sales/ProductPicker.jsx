import React, { useState, useMemo } from 'react';
import { Input } from "../../shared/ui/primitives.tsx";

export default function ProductPicker({ products = [], value, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return products.filter(p =>
      !s || p.name?.toLowerCase().includes(s) || p.sku?.toLowerCase().includes(s)
    ).slice(0, 8);
  }, [products, q]);
  const selected = products.find(p => p.id === value);

  return (
    <div className="u-position-relative">
      <Input
        value={open ? q : (selected?.name || '')}
        onFocus={() => { setOpen(true); setQ(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQ(e.target.value)}
        placeholder="Məhsul seç..."
        className="sx-6d56738 sx-bffb07e sx-4fd67c1 sx-a50337b sx-3044b60"
 />
      {open && filtered.length > 0 && (
        <div className="u-position-absolute u-top-100 u-left-0 u-right-0 u-background-surface u-border-1px_solid_border u-border-radius-8px u-margin-top-2px u-max-height-240px u-overflow-auto u-z-index-50 u-box-shadow-0_8px_24px_rgba_0_0_0_0_1">
          {filtered.map(p => (
            <div key={p.id}
              onMouseDown={() => { onPick(p); setOpen(false); }}
              className="sx-675583c sx-b202c6d sx-c4ad189"
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div className="u-font-weight-600 u-font-size-13px">{p.name}</div>
              <div className="u-font-size-11px u-color-text_secondary">
                {p.sku && `${p.sku} · `}{Number(p.price || 0).toFixed(2)} ₼
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
