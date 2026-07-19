import React from 'react';

export default function TagChip({ name, color = '#10b981', onRemove }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
    }}>
      {name}
      {onRemove && <button onClick={onRemove} style={{ background: 'none', border: 0, color, cursor: 'pointer', fontSize: 12 }}>×</button>}
    </span>
  );
}
