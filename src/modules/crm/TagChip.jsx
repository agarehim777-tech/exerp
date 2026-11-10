import React from 'react';
import { Button } from "../../shared/ui/primitives.tsx";

export default function TagChip({ name, color = '#10b981', onRemove }) {
  return (
    <span className="sx-16cc484 sx-1e2cc36 sx-e5491b8 sx-1e18ab4 sx-1eb7905 sx-8b68521 sx-e634e6d" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
      {name}
      {onRemove && <Button variant="ghost" onClick={onRemove} className="sx-785252b sx-012333e sx-b202c6d sx-6b9c179" style={{ color }}>×</Button>}
    </span>
  );
}
