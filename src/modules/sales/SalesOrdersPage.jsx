import React, { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, CreditCard, Download, PackageCheck, ReceiptText, X } from 'lucide-react';
import { downloadReportCsv } from '../../shared/lib/reportDownload.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import { useCashbook } from '../../shared/hooks/useCashbook.js';
import StatusBadge from './StatusBadge.jsx';
import OrderDrawer from './OrderDrawer.jsx';
import LoadMoreBar from '../../components/LoadMoreBar.jsx';
import { DataTable, Tabs } from '../../shared/ui/primitives.jsx';
import ModuleLink from '../../shared/ui/ModuleLink.jsx';
import { pathForRecord } from '../../config/routes.js';
import { usePageQuery } from '../../shared/hooks/usePageQuery.jsx';
import { cashAmount } from '../../services/format.js';
import './sales-reversal.css';

const KANBAN_STATUSES = ['confirmed', 'delivered', 'cancelled'];
const STATUS_LABELS = { draft: 'Təsdiqləndi', pending: 'Təsdiqləndi', confirmed: 'Təsdiqləndi', processing: 'Təsdiqləndi', shipped: 'Təsdiqləndi', delivered: 'Təhvil verildi', cancelled: 'Ləğv edildi' };
const canonicalStatus = status => ['draft', 'pending', 'processing', 'shipped'].includes(status) ? 'confirmed' : status;

export default function SalesOrdersPage({ repository, customers = [], products = [], selectedOrderId = '', onSelectedOrderHandled }) {
  const { activeTenantId, user, activeMembership, isPlatformAdmin } = useAuth();
  const { orders, update, updateStatus, updateHeader, registerPayment, remove, previewRemoval, hasMore, loadMore, loading: ordersLoading, error: ordersError } = repository;
  const { accounts: cashAccounts } = useCashbook(activeTenantId);
  const [pageQuery, setPageQuery] = usePageQuery({ order: '', view: 'table', q: '', from: '', to: '', page: '1' });
  const view = pageQuery.view === 'kanban' ? 'kanban' : 'table';
  const { q, from: fromDate, to: toDate } = pageQuery;
  const setFilter = patch => setPageQuery({ ...patch, page: '1' }, { replace: true });
  const setQ = value => setFilter({ q: value });
  const setFromDate = value => setFilter({ from: value });
  const setToDate = value => setFilter({ to: value });
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState('');
  const [reversal, setReversal] = useState(null);
  const [deleteReason, setDeleteReason] = useState('Müştərinin müraciəti ilə satış ləğv edildi');
  const [deleting, setDeleting] = useState(false);
  const page = Math.max(0, (Number.parseInt(pageQuery.page, 10) || 1) - 1);
  const setPage = value => setPageQuery({ page: String(value + 1) });
  const [detailLoading, setDetailLoading] = useState(false);
  const requestedId = pageQuery.order || selectedOrderId;
  const openOrder = order => { setActionError(''); setSelected(order); setPageQuery({ order: order.id }); };
  const closeOrder = () => { setSelected(null); setPageQuery({ order: '' }); };

  const filtered = useMemo(() => orders.filter(o =>
    o.status !== 'cancelled'
    && (!fromDate || String(o.order_date || '').slice(0, 10) >= fromDate)
    && (!toDate || String(o.order_date || '').slice(0, 10) <= toDate)
    && (!q || o.order_no?.toLowerCase().includes(q.toLowerCase()) || o.customer?.name?.toLowerCase().includes(q.toLowerCase()))
  ), [orders, q, fromDate, toDate]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * 50, (currentPage + 1) * 50);

  const exportRegistry = () => downloadReportCsv({
    title: 'Satis reyestri',
    columns: ['Sifariş', 'Müştəri', 'Müqavilə', 'Məbləğ', 'Ödənilib', 'Qalıq', 'Valyuta', 'Tarix', 'Status'],
    rows: filtered.map(o => [o.order_no, o.customer?.name || '', o.credit?.contract_no || '',
      Number(o.total), Number(o.paid_amount || 0), Math.max(0, Number(o.total) - Number(o.paid_amount || 0)),
      o.currency, o.order_date, o.status].map(value => typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value)),
  });

  useEffect(() => {
    let current = true;
    setSelected(null);
    setDetailLoading(false);
    if (!requestedId) return;
    const target = orders.find(order => order.status !== 'cancelled' && (String(order.id) === String(requestedId) || String(order.order_no) === String(requestedId)));
    if (target) {
      setSelected(target);
      if (selectedOrderId) onSelectedOrderHandled?.();
    } else if (!ordersLoading && repository.getById) {
      setDetailLoading(true);
      repository.getById(requestedId).then(order => {
        if (!current) return;
        setSelected(order);
        setActionError(order ? '' : 'Bağlı sifariş tapılmadı və ya bu şirkətdə əlçatan deyil.');
      }).catch(error => { if (current) setActionError(error.message || 'Sifariş oxunmadı.'); })
        .finally(() => { if (current) setDetailLoading(false); });
    }
    return () => { current = false; };
  }, [requestedId, orders, ordersLoading, repository.getById, activeTenantId]);

  return (
    <div className="ui-page-stack sales-registry">
      {detailLoading && <p role="status">Sifariş yüklənir...</p>}
      {ordersError && <div role="alert" className="form-error">{ordersError.message || 'Satış məlumatları oxunmadı.'}</div>}
      {actionError && <div role="alert" style={{ padding: '10px 14px', border: '1px solid #fecaca', borderRadius: 10, background: '#fff1f2', color: '#b91c1c', fontSize: 13 }}>{actionError}</div>}
      <div className="ui-toolbar sales-registry-toolbar">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Axtar..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }} />
        <input aria-label="Başlanğıc tarixi" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ height: 38, border: '1px solid #e2e8f0', borderRadius: 8, padding: '0 8px' }} />
        <input aria-label="Son tarix" type="date" min={fromDate || undefined} value={toDate} onChange={e => setToDate(e.target.value)} style={{ height: 38, border: '1px solid #e2e8f0', borderRadius: 8, padding: '0 8px' }} />
        <button type="button" onClick={exportRegistry} disabled={!filtered.length || ordersLoading} className="secondary-btn" title="Görünən satışları CSV formatında ixrac et"><Download size={16} /> CSV ixrac</button>
        <Tabs items={[["table", "Cədvəl"], ["kanban", "Kanban"]]} value={view} onChange={value => setPageQuery({ view: value })} />
      </div>

      {view === 'table' ? (
        <div>
          <DataTable label="Satış reyestri" rows={pageRows} onRowClick={openOrder}
            emptyText={ordersLoading ? 'Yüklənir...' : ordersError ? 'Məlumat alınmadı' : 'Sifariş yoxdur'}
            columns={[
              { key: 'order_no', label: '№', sticky: true, nowrap: true },
              { key: 'customer', label: 'Müştəri' },
              { key: 'total', label: 'Ümumi məbləğ', align: 'right', mobileHidden: true },
              { key: 'paid', label: 'Ödənilib', align: 'right', mobileHidden: true },
              { key: 'balance', label: 'Qalıq borc', align: 'right' },
              { key: 'status', label: 'Status', mobileHidden: true },
              { key: 'payment', label: 'Ödəniş statusu', mobileHidden: true },
              { key: 'date', label: 'Tarix', nowrap: true, mobileHidden: true },
            ]}
            renderCell={(order, column) => {
              const balance = Math.max(0, Number(order.total) - Number(order.paid_amount || 0));
              switch (column.key) {
                case 'order_no': return <ModuleLink className="record-link" to={pathForRecord('sales', order.id)} onSelect={() => openOrder(order)}>{order.order_no}</ModuleLink>;
                case 'customer': return order.customer?.name || '—';
                case 'total': return <b className="money-value">{cashAmount(order.total, order.currency || 'AZN')}</b>;
                case 'paid': return <b className="money-value amount-positive">{cashAmount(Math.max(0, Number(order.paid_amount || 0)), order.currency || 'AZN')}</b>;
                case 'balance': return <b className={`money-value ${balance > 0 ? 'amount-due' : 'amount-positive'}`}>{cashAmount(balance, order.currency || 'AZN')}</b>;
                case 'status': return <StatusBadge status={STATUS_LABELS[order.status] || order.status} />;
                case 'payment': return <StatusBadge status={order.payment_status} />;
                case 'date': return new Date(order.order_date || order.created_at).toLocaleDateString('az-AZ');
                default: return null;
              }
            }} />
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
                  {col.filter(o => pageRows.includes(o)).map(o => (
                    <div key={o.id}
                      style={{ background: '#fff', padding: 10, borderRadius: 10, cursor: 'pointer', border: '1px solid #e2e8f0' }}>
                      <ModuleLink className="record-link" to={pathForRecord('sales', o.id)} onSelect={() => openOrder(o)}>{o.order_no}</ModuleLink>
                      <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0' }}>{o.customer?.name || '—'}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                        <b className="money-value amount-positive">{cashAmount(o.total, o.currency || 'AZN')}</b>
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

      <nav aria-label="Satış reyestri səhifələri" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>{filtered.length} sifariş · {currentPage + 1} / {pageCount}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="icon-btn" title="Əvvəlki səhifə" aria-label="Əvvəlki səhifə" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button>
          <button type="button" className="icon-btn" title="Növbəti səhifə" aria-label="Növbəti səhifə" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button>
        </div>
      </nav>

      {selected && (
        <OrderDrawer
          order={selected} customers={customers} products={products}
          cashAccounts={cashAccounts.filter(account => account.is_active !== false)}
          canManageOrder={Boolean(isPlatformAdmin || ['owner', 'admin'].includes(activeMembership?.role) || (selected.created_by && selected.created_by === user?.id))}
          onClose={closeOrder}
          onStatus={(id, s) => updateStatus(id, s)}
          onPatch={(id, p) => updateHeader(id, p)}
          onPayment={(amount, accountId) => registerPayment(selected, amount, accountId)}
          onUpdate={async (id, values) => {
            await update(id, values);
            closeOrder();
          }}
          onDelete={async (id) => {
            setActionError('');
            try {
              setReversal({ loading: true, orderId: id });
              const preview = await previewRemoval(id);
              setReversal({ loading: false, orderId: id, preview });
            } catch (error) {
              const message = error?.message || error?.details || error?.hint || String(error || '');
              setActionError(message && message !== '[object Object]' ? message : 'Sifariş silinmədi. Əlaqəli əməliyyatları və istifadəçi icazəsini yoxlayın.');
              setReversal(null);
            }
          }}
        />
      )}
      {reversal && <ReversalPreview
        state={reversal}
        reason={deleteReason}
        setReason={setDeleteReason}
        deleting={deleting}
        onClose={() => !deleting && setReversal(null)}
        onConfirm={async () => {
          if (deleteReason.trim().length < 3) return setActionError('Ləğv səbəbini yazın.');
          setDeleting(true); setActionError('');
          try {
            await remove(reversal.orderId, deleteReason.trim());
            closeOrder(); setReversal(null);
          } catch (error) {
            setActionError(error?.message || 'Satış ləğv edilmədi.');
          } finally { setDeleting(false); }
        }}
      />}
    </div>
  );
}

function ReversalPreview({ state, reason, setReason, deleting, onClose, onConfirm }) {
  const p = state.preview || {};
  return <div className="reversal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="reversal-dialog" role="dialog" aria-modal="true" aria-labelledby="reversal-title">
      <header><div><span className="reversal-warning"><AlertTriangle size={18} /></span><div><h2 id="reversal-title">Satışın ləğv təsiri</h2><p>{state.loading ? 'Əlaqələr yoxlanılır…' : `${p.order_no} üzrə dəyişəcək qeydlər`}</p></div></div><button type="button" onClick={onClose} aria-label="Bağla"><X size={19} /></button></header>
      {!state.loading && <>
        <div className="reversal-impact-grid">
          <Impact icon={CreditCard} label="Bağlanacaq kredit" value={p.credit_count || 0} />
          <Impact icon={ReceiptText} label="Geri çevriləcək ödəniş" value={`${Number(p.payment_amount || 0).toFixed(2)} ₼`} />
          <Impact icon={PackageCheck} label="Buraxılacaq rezerv" value={p.reservation_count || 0} />
          <Impact icon={PackageCheck} label="Anbara qaytarılacaq" value={p.stock_return_count || 0} />
        </div>
        {p.warning && <div className="reversal-note">{p.warning}</div>}
        <label className="reversal-reason"><span>Ləğv səbəbi</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
        <footer><button type="button" className="secondary-btn" onClick={onClose}>İmtina</button><button type="button" className="danger-btn" onClick={onConfirm} disabled={deleting}>{deleting ? 'Ləğv edilir…' : 'Satışı ləğv et'}</button></footer>
      </>}
    </section>
  </div>;
}

function Impact({ icon: Icon, label, value }) {
  return <div><Icon size={18} /><span>{label}</span><strong>{value}</strong></div>;
}

