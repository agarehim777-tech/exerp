import React from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useShipments } from '../../shared/hooks/useShipments.js';
import StatusBadge from './StatusBadge.jsx';
import { appConfirm } from '../../shared/ui/dialogService.js';
import { Button, Table } from "../../shared/ui/primitives.tsx";

const NEXT = { pending: 'packed', packed: 'shipped', shipped: 'delivered' };

export default function ShipmentsPage() {
  const { activeTenantId } = useAuth();
  const { shipments, setStatus, remove } = useShipments(activeTenantId);

  return (
    <div className="u-padding-24px u-display-flex u-flex-direction-column u-gap-16px">
      <div className="u-background-surface u-border-radius-14px u-border-1px_solid_border u-overflow-hidden">
        <Table className="u-width-100 u-border-collapse-collapse u-font-size-13px">
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
                      <Button variant="ghost" onClick={() => setStatus(s.id, NEXT[s.status])}
 className="u-background-action u-color-surface u-border-0 u-padding-4px_10px u-border-radius-6px u-cursor-pointer u-font-size-12px u-font-weight-600">
                        → {NEXT[s.status]}
                      </Button>
                    )}
                    <Button variant="ghost" onClick={async () => (await appConfirm('Göndəriş silinsin?', { danger: true })) && remove(s.id)}
                      className="sx-0695ff9 sx-c9e3486 sx-2388b5c sx-cd22087 sx-9aae82e sx-b202c6d sx-6b9c179">×</Button>
                  </div>
                </Td>
              </tr>
            ))}
            {shipments.length === 0 && <tr><td colSpan={8} className="u-padding-40px u-text-align-center u-color-text_secondary">Çatdırılma yoxdur — sifarişdən yaradın</td></tr>}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
const Th = ({ children, align }) => <th className={`sx-f5c04ae sx-d2abea5 sx-83e4487 sx-6b9c179 sx-5f7abeb sx-03c5603 shipments-align-${align || 'left'}`}>{children}</th>;
const Td = ({ children, align }) => <td className={`shipments-td shipments-align-${align || 'left'}`}>{children}</td>;
