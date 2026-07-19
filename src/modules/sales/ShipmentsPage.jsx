import React from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useShipments } from '../../shared/hooks/useShipments.js';
import StatusBadge from './StatusBadge.jsx';

const NEXT = { pending: 'packed', packed: 'shipped', shipped: 'delivered' };

export default function ShipmentsPage() {
  const { activeTenantId } = useAuth();
  const { shipments, setStatus, remove } = useShipments(activeTenantId);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <Th>№</Th><Th>Sifariş</Th><Th>Müştəri</Th><Th>Daşıyıcı</Th><Th>Tracking</Th><Th>Status</Th><Th>Göndərilmə</Th><Th align="right">Əməliyyat</Th>
            </tr>
          </thead>
          <tbody>
            {shipments.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <Td><b>{s.shipment_no}</b></Td>
                <Td>{s.order?.order_no || '—'}</Td>
                <Td>{s.order?.customer?.name || '—'}</Td>
                <Td>{s.carrier || '—'}</Td>
                <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.tracking_no || '—'}</Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td>{s.shipped_at ? new Date(s.shipped_at).toLocaleDateString('az-AZ') : '—'}</Td>
                <Td align="right">
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {NEXT[s.status] && (
                      <button onClick={() => setStatus(s.id, NEXT[s.status])}
                        style={{ background: '#10b981', color: '#fff', border: 0, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        → {NEXT[s.status]}
                      </button>
                    )}
                    <button onClick={() => confirm('Sil?') && remove(s.id)}
                      style={{ background: '#fff', color: '#ef4444', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>×</button>
                  </div>
                </Td>
              </tr>
            ))}
            {shipments.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Çatdırılma yoxdur — sifarişdən yaradın</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const Th = ({ children, align }) => <th style={{ padding: '10px 12px', textAlign: align || 'left', color: '#64748b', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</th>;
const Td = ({ children, align, style }) => <td style={{ padding: '10px 12px', textAlign: align || 'left', ...(style || {}) }}>{children}</td>;
