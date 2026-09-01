import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useOrders } from '../../shared/hooks/useOrders.js';
import { useCustomers } from '../../shared/hooks/useCustomers.js';
import { useProducts } from '../../shared/hooks/useProducts.js';
import { useCashbook } from '../../shared/hooks/useCashbook.js';
import StatusBadge from './StatusBadge.jsx';
import OrderDrawer from './OrderDrawer.jsx';
import LoadMoreBar from '../../components/LoadMoreBar.jsx';

const KANBAN_STATUSES = ['confirmed', 'delivered', 'cancelled'];
const STATUS_LABELS = { draft: 'Təsdiqləndi', pending: 'Təsdiqləndi', confirmed: 'Təsdiqləndi', processing: 'Təsdiqləndi', shipped: 'Təsdiqləndi', delivered: 'Təhvil verildi', cancelled: 'Ləğv edildi' };
const canonicalStatus = status => ['draft', 'pending', 'processing', 'shipped'].includes(status) ? 'confirmed' : status;

export default function SalesOrdersPage({ selectedOrderId = '', onSelectedOrderHandled }) {
  const { activeTenantId, user, activeMembership, isPlatformAdmin } = useAuth();
  const { orders, update, updateStatus, updateHeader, registerPayment, remove, hasMore, loadMore, loading: ordersLoading } = useOrders(activeTenantId);
  const { accounts: cashAccounts } = useCashbook(activeTenantId);
  const { customers } = useCustomers(activeTenantId);
  const { products } = useProducts(activeTenantId);
  const [view, setView] = useState('table');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState('');

  const filtered = useMemo(() => orders.filter(o =>
    o.status !== 'cancelled'
    && (!q || o.order_no?.toLowerCase().includes(q.toLowerCase()) || o.customer?.name?.toLowerCase().includes(q.toLowerCase()))
  ), [orders, q]);

  useEffect(() => {
    if (!selectedOrderId || !orders.length) return;
    const target = orders.find(order => String(order.id) === String(selectedOrderId) || String(order.order_no) === String(selectedOrderId));
    if (target) {
      setSelected(target);
      onSelectedOrderHandled?.();
    }
  }, [selectedOrderId, orders, onSelectedOrderHandled]);

  useEffect(() => {
    if (!selected?.id) return;
    const current = orders.find(order => order.id === selected.id);
    if (!current) setSelected(null);
    else if (current !== selected) setSelected(current);
  }, [orders, selected]);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {actionError && <div role="alert" style={{ padding: '10px 14px', border: '1px solid #fecaca', borderRadius: 10, background: '#fff1f2', color: '#b91c1c', fontSize: 13 }}>{actionError}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 10 }}>
          {['table', 'kanban'].map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 14px', border: 0, background: view === v ? '#fff' : 'transparent', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {v === 'table' ? 'Cədvəl' : 'Kanban'}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <Th>№</Th><Th>Müştəri</Th><Th align="right">Ümumi məbləğ</Th><Th align="right">Ödənilib</Th><Th align="right">Qalıq borc</Th><Th>Status</Th><Th>Ödəniş statusu</Th><Th>Tarix</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} onClick={() => setSelected(o)}
                  style={{ cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Td><b>{o.order_no}</b></Td>
                  <Td>{o.customer?.name || '—'}</Td>
                  <Td align="right"><b>{Number(o.total).toFixed(2)} {o.currency}</b></Td>
                  <Td align="right"><b style={{ color: '#047857' }}>{Math.max(0, Number(o.paid_amount || 0)).toFixed(2)} {o.currency}</b></Td>
                  <Td align="right">
                    <b style={{ color: Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0)) > 0 ? '#dc2626' : '#047857' }}>
                      {Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0)).toFixed(2)} {o.currency}
                    </b>
                  </Td>
                  <Td><StatusBadge status={STATUS_LABELS[o.status] || o.status} /></Td>
                  <Td><StatusBadge status={o.payment_status} /></Td>
                  <Td>{new Date(o.order_date || o.created_at).toLocaleDateString('az-AZ')}</Td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Sifariş yoxdur</td></tr>}
            </tbody>
          </table>
          <LoadMoreBar hasMore={hasMore} onLoadMore={loadMore} loading={ordersLoading} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
          {KANBAN_STATUSES.map(st => {
            const col = filtered.filter(o => canonicalStatus(o.status) === st);
            const sum = col.reduce((s, o) => s + Number(o.total || 0), 0);
            return (
              <div key={st} style={{ minWidth: 260, background: '#f8fafc', borderRadius: 12, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <StatusBadge status={STATUS_LABELS[st]} />
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{col.length} · {sum.toFixed(0)} ₼</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {col.map(o => (
                    <div key={o.id} onClick={() => setSelected(o)}
                      style={{ background: '#fff', padding: 10, borderRadius: 10, cursor: 'pointer', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{o.order_no}</div>
                      <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0' }}>{o.customer?.name || '—'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <b style={{ color: '#10b981', fontSize: 13 }}>{Number(o.total).toFixed(0)} ₼</b>
                        <StatusBadge status={o.payment_status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <OrderDrawer
          order={selected} customers={customers} products={products}
          cashAccounts={cashAccounts.filter(account => account.is_active !== false)}
          canManageOrder={Boolean(isPlatformAdmin || ['owner', 'admin'].includes(activeMembership?.role) || (selected.created_by && selected.created_by === user?.id))}
          onClose={() => setSelected(null)}
          onStatus={(id, s) => updateStatus(id, s)}
          onPatch={(id, p) => updateHeader(id, p)}
          onPayment={(amount, accountId) => registerPayment(selected, amount, accountId)}
          onUpdate={async (id, values) => {
            await update(id, values);
            setSelected(null);
          }}
          onDelete={async (id) => {
            if (!confirm('Sifariş silinsin?')) return;
            setActionError('');
            try {
              await remove(id);
              setSelected(null);
            } catch (error) {
              const message = error?.message || error?.details || error?.hint || String(error || '');
              setActionError(message && message !== '[object Object]' ? message : 'Sifariş silinmədi. Əlaqəli əməliyyatları və istifadəçi icazəsini yoxlayın.');
            }
          }}
        />
      )}
    </div>
  );
}
const Th = ({ children, align }) => <th style={{ padding: '10px 12px', textAlign: align || 'left', color: '#64748b', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</th>;
const Td = ({ children, align }) => <td style={{ padding: '10px 12px', textAlign: align || 'left' }}>{children}</td>;

