import React, { useState, useMemo } from 'react';

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
    <div style={{ position: 'relative' }}>
      <input
        value={open ? q : (selected?.name || '')}
        onFocus={() => { setOpen(true); setQ(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQ(e.target.value)}
        placeholder="Məhsul seç..."
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 2, maxHeight: 240, overflow: 'auto',
          zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        }}>
          {filtered.map(p => (
            <div key={p.id}
              onMouseDown={() => { onPick(p); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {p.sku && `${p.sku} · `}{Number(p.price || 0).toFixed(2)} ₼
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
