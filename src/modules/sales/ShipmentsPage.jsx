import React from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useShipments } from '../../shared/hooks/useShipments.js';
import StatusBadge from './StatusBadge.jsx';
import { appConfirm } from '../../shared/ui/dialogService.js';

const NEXT = { pending: 'packed', packed: 'shipped', shipped: 'delivered' };

export default function ShipmentsPage() {
  const { activeTenantId } = useAuth();
  const { shipments, setStatus, remove } = useShipments(activeTenantId);

  return (
    <div className="u-padding-24px u-display-flex u-flex-direction-column u-gap-16px">
      <div className="u-background-surface u-border-radius-14px u-border-1px_solid_border u-overflow-hidden">
        <table className="u-width-100 u-border-collapse-collapse u-font-size-13px">
          <thead className="u-background-surface_subtle">
            <tr>
              <Th>№</Th><Th>Sifariş</Th><Th>Müştəri</Th><Th>Daşıyıcı</Th><Th>Tracking</Th><Th>Status</Th><Th>Göndərilmə</Th><Th align="right">Əməliyyat</Th>
            </tr>
          </thead>
          <tbody>
            {shipments.map(s => (
              <tr key={s.id} className="u-border-top-1px_solid_surface_subtle">
                <Td><b>{s.shipment_no}</b></Td>
                <Td>{s.order?.order_no || '—'}</Td>
                <Td>{s.order?.customer?.name || '—'}</Td>
                <Td>{s.carrier || '—'}</Td>
                <Td className="u-font-family-monospace u-font-size-12px">{s.tracking_no || '—'}</Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td>{s.shipped_at ? new Date(s.shipped_at).toLocaleDateString('az-AZ') : '—'}</Td>
                <Td align="right">
                  <div className="u-display-inline_flex u-gap-6px">
                    {NEXT[s.status] && (
                      <button onClick={() => setStatus(s.id, NEXT[s.status])}
                        className="u-background-action u-color-surface u-border-0 u-padding-4px_10px u-border-radius-6px u-cursor-pointer u-font-size-12px u-font-weight-600">
                        → {NEXT[s.status]}
                      </button>
                    )}
                    <button onClick={async () => (await appConfirm('Göndəriş silinsin?', { danger: true })) && remove(s.id)}
                      style={{ background: '#fff', color: '#ef4444', border: '1px solid #fecaca', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>×</button>
                  </div>
                </Td>
              </tr>
            ))}
            {shipments.length === 0 && <tr><td colSpan={8} className="u-padding-40px u-text-align-center u-color-text_secondary">Çatdırılma yoxdur — sifarişdən yaradın</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const Th = ({ children, align }) => <th style={{ padding: '10px 12px', textAlign: align || 'left', color: '#64748b', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</th>;
const Td = ({ children, align, style }) => <td style={{ padding: '10px 12px', textAlign: align || 'left', ...(style || {}) }}>{children}</td>;
