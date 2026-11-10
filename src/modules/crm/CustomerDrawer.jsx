import React, { useState } from 'react';
import { ArrowUpRight, Plus, X } from 'lucide-react';
import { useCustomer360 } from '../../shared/hooks/useCustomer360.js';
import { useActivities } from '../../shared/hooks/useActivities.js';
import { useAuth } from '../../auth/AuthProvider.jsx';
import Avatar from './Avatar.jsx';
import BirthDateInput from './BirthDateInput.jsx';
import { appConfirm } from '../../shared/ui/dialogService.js';
import { Badge, Button, Card, DataTable, Input, Select, Tabs } from '../../shared/ui/primitives.tsx';

export default function CustomerDrawer({ customerId, onClose, onUpdate, onOpenSalesOrder, onOpenCredit }) {
  const { activeTenantId } = useAuth();
  const { data, loading, error, refresh, uploadDocument, downloadDocument, removeDocument } = useCustomer360(customerId);
  const { create: createActivity } = useActivities(activeTenantId, { customerId });
  const [tab, setTab] = useState('overview');
  const [activityType, setActivityType] = useState('note');
  const [activityText, setActivityText] = useState('');

  const c = data?.customer;

  const addActivity = async () => {
    if (!activityText.trim()) return;
    await createActivity({ type: activityType, subject: activityText, customer_id: customerId });
    setActivityText('');
    refresh();
  };

  return (
    <div className="u-position-fixed u-inset-0 u-z-index-90">
      <div onClick={onClose} className="u-position-absolute u-inset-0 u-background-rgba_15_23_42_0_45" />
      <aside role="dialog" aria-modal="true" aria-label="Müştəri kartı" className="u-position-absolute u-top-0 u-right-0 u-bottom-0 u-width-520px u-max-width-95vw u-background-surface u-box-shadow-8px_0_32px_rgba_0_0_0_0_15 u-display-flex u-flex-direction-column u-animation-slideIn_0_25s_ease_out">
        <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {loading ? (
          <div className="u-padding-40px u-text-align-center">Yüklənir...</div>
        ) : error || !c ? (
          <div className="u-padding-40px u-text-align-center">
            <div className="u-color-danger u-font-weight-700 u-margin-bottom-8px">Müştəri məlumatları yüklənmədi</div>
            <div className="u-color-text_secondary u-font-size-13px u-margin-bottom-16px">{error?.message || 'Müştəri tapılmadı.'}</div>
            <Button onClick={refresh}>Yenidən yoxla</Button>
          </div>
        ) : (
          <>
            <header className="u-padding-20px u-border-bottom-1px_solid_border u-display-flex u-align-items-center u-gap-14px">
              <Avatar name={c.name} size={56} />
              <div className="u-flex-1">
                <h2 className="u-margin-0 u-font-size-20px">{c.name}</h2>
                <div className="u-font-size-13px u-color-text_secondary">{c.email || c.phone || '—'}</div>
              </div>
              <Button onClick={onClose} variant="ghost" className="ui-icon-button" aria-label="Müştəri kartını bağla"><X size={20} /></Button>
            </header>

            <div className="u-padding-12px_20px u-display-grid u-grid-template-columns-repeat_3_1fr u-gap-8px u-background-surface_subtle u-border-bottom-1px_solid_border">
              <Stat label="LTV (Sifariş)" value={`${Number(data.orders_total || 0).toFixed(0)} ₼`} />
              <Stat label="Ödənilib" value={`${Number(data.orders_paid || 0).toFixed(0)} ₼`} />
              <Stat label="Qalıq borc" value={`${Number(data.orders_outstanding || 0).toFixed(0)} ₼`} />
              <Stat label="Qazanıldı" value={`${Number(data.won_amount || 0).toFixed(0)} ₼`} />
              <Stat label="Açıq deal" value={data.open_deals?.length || 0} />
              <Stat label="Müştəri skoru" value={`${data.analytics?.customerScore || 0}/100`} />
              <Stat label="Risk" value={data.analytics?.riskLabel || '—'} />
            </div>

            <Tabs value={tab} onChange={setTab} items={[
              ['overview', 'Ümumi'], ['deals', 'Sövdələşmələr'], ['timeline', 'Timeline'],
              ['credits', 'Kreditlər'], ['devices', 'Cihazlar'], ['documents', 'Sənədlər'],
              ['activity', 'Əlaqə'], ['orders', 'Sifarişlər'],
            ]} />

            <div className="u-flex-1 u-overflow-y-auto u-padding-20px">
              {tab === 'overview' && <OverviewTab c={c} tags={data.tags} onUpdate={onUpdate} />}
              {tab === 'deals' && <DealsTab deals={data.open_deals || []} />}
              {tab === 'timeline' && <CustomerTimeline items={data.timeline || []} />}
              {tab === 'credits' && <CreditsTab credits={data.credits || []} onOpenSalesOrder={onOpenSalesOrder} onOpenCredit={onOpenCredit} />}
              {tab === 'devices' && <DevicesTab orders={data.orders || []} serviceCases={data.serviceCases || []} />}
              {tab === 'documents' && <DocumentsTab documents={data.documents || []} onUpload={uploadDocument} onDownload={downloadDocument} onRemove={removeDocument} />}
              {tab === 'activity' && (
                <div>
                  <div className="ui-form-grid ui-spacer-bottom">
                    <Select value={activityType} onChange={e => setActivityType(e.target.value)}>
                      <option value="note">📝 Qeyd</option>
                      <option value="call">📞 Zəng</option>
                      <option value="meeting">🤝 Görüş</option>
                      <option value="email">✉️ E-poçt</option>
                      <option value="sms">💬 SMS</option>
                    </Select>
                    <Input value={activityText} onChange={e => setActivityText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addActivity()}
                      placeholder="Nə baş verdi?" className="u-flex-1" />
                    <Button onClick={addActivity} aria-label="Əlaqə əlavə et" title="Əlaqə əlavə et" className="ui-icon-button"><Plus size={18} /></Button>
                  </div>
                  <Timeline items={data.activities || []} />
                </div>
              )}
              {tab === 'tasks' && <TasksTab tasks={data.tasks || []} />}
              {tab === 'orders' && (
                <OrdersTab orders={data.orders || []} count={data.orders_count} total={data.orders_total} onOpen={onOpenSalesOrder} />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function CustomerTimeline({ items }) {
  if (!items.length) return <div className="ui-empty-box">Timeline məlumatı yoxdur.</div>;
  return <div className="u-display-grid u-gap-0">{items.map(item => <div key={item.id} className="u-display-grid u-grid-template-columns-86px_12px_minmax_0_1fr u-gap-10px u-min-height-66px">
    <small className="u-color-text_secondary u-padding-top-2px">{item.at ? new Date(item.at).toLocaleDateString('az-AZ') : '—'}</small>
    <span className="u-width-10px u-height-10px u-border-radius-50 u-background-0b7a5c u-margin-top-3px u-box-shadow-0_0_0_4px_dcfce7" />
    <div className="u-border-bottom-1px_solid_border u-padding-bottom-12px"><b className="u-display-block">{item.type} · {item.title}</b><span className="u-color-text_secondary u-font-size-13px">{item.detail || '—'}</span></div>
  </div>)}</div>;
}

export function CreditsTab({ credits, onOpenSalesOrder, onOpenCredit }) {
  if (!credits.length) return <div className="ui-empty-box">Kredit müqaviləsi yoxdur.</div>;
  return <div className="u-display-grid u-gap-10px">{credits.map(credit => {
    const paid = (credit.payments || []).filter(row => !row.reversed_at).reduce((sum, row) => sum + Number(row.principal_amount || 0), 0) + Number(credit.initial_payment || 0);
    const balance = Math.max(0, Number(credit.principal || 0) - paid);
    const overdue = (credit.installments || []).filter(row => row.status === 'overdue').length;
    return <Card as="article" key={credit.id} aria-label={credit.contract_no} className="ui-card-compact">
      <div className="u-display-flex u-justify-content-space_between u-gap-12px"><b>{credit.contract_no}</b><Badge tone={overdue ? 'danger' : 'success'}>{overdue ? `${overdue} gecikmə` : credit.status}</Badge></div>
      <div className="ui-detail-grid"><Stat label="Məbləğ" value={`${Number(credit.principal || 0).toFixed(2)} ₼`} /><Stat label="Ödənilib" value={`${paid.toFixed(2)} ₼`} /><Stat label="Qalıq" value={`${balance.toFixed(2)} ₼`} /></div>
      <small className="u-color-text_secondary">Risk {credit.risk_score || 0}/100 · Kolleksiya: {credit.collection_stage || 'current'} · {credit.term_months} ay</small>
      <div className="u-display-flex u-flex-wrap-wrap u-gap-8px u-margin-top-10px">
        {onOpenCredit && <Button type="button" onClick={() => onOpenCredit(credit.id)} variant="secondary" size="compact"><ArrowUpRight size={14} aria-hidden="true" /> Kreditə bax</Button>}
        {credit.order_id && onOpenSalesOrder && <Button type="button" onClick={() => onOpenSalesOrder(credit.order_id)} variant="secondary" size="compact"><ArrowUpRight size={14} aria-hidden="true" /> Sifarişə bax</Button>}
      </div>
      <details className="u-margin-top-12px">
        <summary className="u-cursor-pointer u-font-weight-600">Ödəniş cədvəli</summary>
        {credit.installments?.length ? <DataTable label="Kredit ödəniş cədvəli" className="ui-spacer-top"
          columns={[{ key: 'due_date', label: 'Tarix' }, { key: 'plan', label: 'Plan', align: 'right' }, { key: 'balance', label: 'Qalıq', align: 'right' }]}
          rows={[...credit.installments].sort((a, b) => a.installment_no - b.installment_no)} rowKey={row => row.id ?? row.installment_no}
          renderCell={(row, column) => column.key === 'due_date' ? row.due_date : `${(column.key === 'plan' ? Number(row.principal_due || 0) : Math.max(0, Number(row.principal_due || 0) - Number(row.principal_paid || 0))).toFixed(2)} ₼`} /> : <p className="u-color-text_secondary u-font-size-12px">Kreditin ödəniş cədvəli hələ aktivləşdirilməyib.</p>}
      </details>
    </Card>;
  })}</div>;
}

function DevicesTab({ orders, serviceCases }) {
  const devices = orders.flatMap(order => (order.items || []).map(item => ({ ...item, order })));
  if (!devices.length) return <div className="ui-empty-box">Alınmış cihaz və məhsul yoxdur.</div>;
  return <div className="u-display-grid u-gap-10px">{devices.map(item => {
    const cases = serviceCases.filter(row => row.product_id && row.product_id === item.product_id);
    return <Card as="article" key={item.id} className="ui-card-compact"><b>{item.product?.name || item.description || 'Məhsul'}</b><small className="u-display-block u-color-text_secondary u-margin-top-4px">{item.product?.sku || 'SKU yoxdur'} · {item.qty} ədəd · {item.order.order_no}</small><div className={cases.length ? 'ui-spacer-top ui-validation-warning' : 'ui-spacer-top amount-positive'}>{cases.length ? `${cases.length} servis müraciəti` : 'Servis müraciəti yoxdur'}</div>{cases.map(row => <div key={row.id} className="u-margin-top-6px u-padding-8px u-background-fff7ed u-border-radius-6px u-font-size-12px">{row.case_no} · {row.subject} · {row.status}</div>)}</Card>;
  })}</div>;
}

function DocumentsTab({ documents, onUpload, onDownload, onRemove }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('Şəxsiyyət sənədi');
  const [message, setMessage] = useState('');
  const submit = async event => { const form = event.currentTarget; event.preventDefault(); setMessage(''); try { await onUpload({ file, title, documentType: type }); setFile(null); setTitle(''); setMessage('Sənəd saxlanıldı.'); form.reset(); } catch (nextError) { setMessage(nextError.message); } };
  return <div className="u-display-grid u-gap-12px"><form onSubmit={submit} className="ui-form-surface ui-detail-stack">
    <b>Yeni sənəd</b><Input required value={title} onChange={event => setTitle(event.target.value)} placeholder="Sənədin adı"  />
    <Select value={type} onChange={event => setType(event.target.value)} ><option>Şəxsiyyət sənədi</option><option>Müqavilə</option><option>Ödəniş sənədi</option><option>Servis sənədi</option><option>Digər</option></Select>
    <Input required type="file" onChange={event => setFile(event.target.files?.[0] || null)}  />
    <Button type="submit" >Sənədi yüklə</Button>{message && <small>{message}</small>}
  </form>{documents.map(document => <Card key={document.id} className="ui-card-compact ui-document-row"><div><b>{document.title}</b><small className="u-display-block u-color-text_secondary">{document.document_type} · {(Number(document.file_size || 0) / 1024).toFixed(1)} KB</small></div><div className="u-display-flex u-gap-6px"><Button type="button" onClick={() => onDownload(document)} variant="secondary" size="compact">Aç</Button><Button type="button" onClick={async () => (await appConfirm('Sənəd silinsin?', { danger: true })) && onRemove(document)} variant="danger" size="compact">Sil</Button></div></Card>)}{!documents.length && <div className="ui-empty-box">Sənəd əlavə edilməyib.</div>}</div>;
}

const Stat = ({ label, value }) => (
  <div className="u-text-align-center">
    <div className="u-font-size-11px u-color-text_secondary u-font-weight-600 u-text-transform-uppercase">{label}</div>
    <div className="u-font-size-16px u-font-weight-700 u-color-text_primary u-margin-top-2px">{value}</div>
  </div>
);

const orderStatusLabels = { draft: 'Yeni', pending: 'Yeni', confirmed: 'Təsdiqləndi', processing: 'Hazırlanır', shipped: 'Hazırlanır', delivered: 'Təhvil verildi', cancelled: 'Ləğv edildi' };
function OrdersTab({ orders, count, total, onOpen }) {
  return <div className="u-display-grid u-gap-10px">
    <div className="u-display-flex u-justify-content-space_between u-gap-12px u-color-text_secondary u-font-size-12px"><span><b>Sifariş sayı:</b> {count ?? orders.length}</span><span><b>Ümumi:</b> {Number(total || 0).toFixed(2)} ₼</span></div>
    {orders.length === 0 ? <div className="u-padding-28px u-text-align-center u-color-text_secondary u-border-1px_dashed_line_strong u-border-radius-10px">Bu müştəri üzrə sifariş yoxdur.</div> : orders.map(order => <Button variant="secondary" className="ui-record-action" key={order.id} type="button" onClick={() => onOpen?.(order.id)}>
      <span className="u-min-width-0"><strong className="u-display-block u-color-text_primary">{order.order_no || order.id}</strong><small className="u-color-text_secondary">{order.order_date ? new Date(order.order_date).toLocaleDateString('az-AZ') : 'Tarix yoxdur'} · {orderStatusLabels[order.status] || order.status}</small></span>
      <span className="u-text-align-right"><strong className="u-display-block u-color-0b7a5c">{Number(order.total || 0).toFixed(2)} {order.currency === 'AZN' ? '₼' : order.currency}</strong><small className="u-color-info">Sifarişə bax →</small></span>
    </Button>)}
  </div>;
}

function OverviewTab({ c, tags, onUpdate }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(c);
  const fieldLabels = {
    name: 'Ad və soyad / şirkət adı',
    phone: 'Telefon',
    email: 'E-poçt',
    tax_id: 'VÖEN',
    fin_code: 'FİN kod',
    identity_card_no: 'Şəxsiyyət vəsiqəsi',
    address: 'Ünvan',
  };
  React.useEffect(() => setForm(c), [c]);

  if (!edit) return (
    <div className="u-display-flex u-flex-direction-column u-gap-10px">
      <Row label="Telefon" value={c.phone} />
      <Row label="E-poçt" value={c.email} />
      {c.segment === 'business' ? <Row label="VÖEN" value={c.tax_id} /> : <>
        <Row label="FİN kod" value={c.fin_code} />
        <Row label="Şəxsiyyət vəsiqəsinin seriya və nömrəsi" value={c.identity_card_no} />
      </>}
      <Row label="Ünvan" value={c.address} />
      <Row label="Doğum tarixi" value={c.birth_date ? new Date(`${c.birth_date}T00:00:00`).toLocaleDateString('az-AZ') : null} />
      <Row label="Müştəri tipi" value={c.segment === 'business' ? 'Hüquqi şəxs' : 'Fiziki şəxs'} />
      <Row label="Müştəri səviyyəsi" value={c.customer_level_override ? `${c.customer_level_override} (manual)` : (c.customer_level || 'standard')} />
      <div>
        <div className="u-font-size-11px u-color-text_secondary u-font-weight-600 u-text-transform-uppercase u-margin-bottom-4px">Teqlər</div>
        <div className="u-display-flex u-flex-wrap-wrap u-gap-4px">
          {(tags || []).length === 0 ? <span className="u-color-text_secondary">—</span> : tags.map(t => (
            <Badge key={t.id} accentColor={t.color}>{t.name}</Badge>
          ))}
        </div>
      </div>
      <Button variant="secondary" onClick={() => setEdit(true)} className="u-margin-top-8px">Düzəliş et</Button>
    </div>
  );

  return (
    <div className="u-display-flex u-flex-direction-column u-gap-10px">
      {['name', 'phone', 'email', 'address'].map(k => (
        <label key={k}>{fieldLabels[k]}<Input value={form[k] || ''} onChange={e => setForm({ ...form, [k]: e.target.value })} className="u-margin-top-4px" /></label>
      ))}
      <label>Müştəri tipi
        <Select value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })} className="u-margin-top-4px">
          <option value="individual">Fiziki şəxs</option><option value="business">Hüquqi şəxs</option>
        </Select>
      </label>
      {form.segment === 'business' ? <label>VÖEN<Input value={form.tax_id || ''} onChange={e => setForm({ ...form, tax_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
        inputMode="numeric" placeholder="10 rəqəm" className="u-margin-top-4px" /></label> : <>
        <label>FİN kod<Input value={form.fin_code || ''} maxLength={7} onChange={e => setForm({ ...form, fin_code: e.target.value.toUpperCase() })} className="u-margin-top-4px" /></label>
        <label>Şəxsiyyət vəsiqəsinin seriya və nömrəsi<Input value={form.identity_card_no || ''} onChange={e => setForm({ ...form, identity_card_no: e.target.value.toUpperCase() })} className="u-margin-top-4px" /></label>
        <label>Doğum tarixi (məcburi deyil)<BirthDateInput value={form.birth_date || ''} onChange={value => setForm({ ...form, birth_date: value })} /></label>
      </>}
      <label>Müştəri səviyyəsi
        <Select value={form.customer_level_override || ''} onChange={e => setForm({ ...form, customer_level_override: e.target.value || null })} className="u-margin-top-4px">
          <option value="">Avtomatik hesablansın</option><option value="standard">Adi</option><option value="silver">Gümüş</option><option value="gold">Qızıl</option><option value="platinum">Platin</option>
        </Select>
      </label>
      <div className="u-display-flex u-gap-8px u-justify-content-flex_end">
        <Button variant="secondary" onClick={() => setEdit(false)}>Ləğv</Button>
        <Button onClick={async () => { await onUpdate({ name: form.name, phone: form.phone, email: form.email, tax_id: form.segment === 'business' ? form.tax_id : (form.fin_code || ''), fin_code: form.segment === 'individual' ? form.fin_code : '', identity_card_no: form.segment === 'individual' ? form.identity_card_no : '', address: form.address, birth_date: form.segment === 'individual' ? (form.birth_date || null) : null, segment: form.segment, customer_level_override: form.customer_level_override || null }); setEdit(false); }}
          >Yadda saxla</Button>
      </div>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div>
    <div className="u-font-size-11px u-color-text_secondary u-font-weight-600 u-text-transform-uppercase">{label}</div>
    <div className="u-font-size-14px u-color-text_primary">{value || '—'}</div>
  </div>
);

function DealsTab({ deals }) {
  if (deals.length === 0) return <div className="u-color-text_secondary u-text-align-center u-padding-30px">Açıq sövdələşmə yoxdur</div>;
  return (
    <div className="u-display-flex u-flex-direction-column u-gap-8px">
      {deals.map(d => (
        <Card key={d.id} className="ui-card-compact">
          <div className="u-font-weight-600">{d.title}</div>
          <div className="u-font-size-12px u-color-text_secondary u-margin-top-4px">{Number(d.amount).toFixed(2)} {d.currency}</div>
        </Card>
      ))}
    </div>
  );
}

function TasksTab({ tasks }) {
  if (tasks.length === 0) return <div className="u-color-text_secondary u-text-align-center u-padding-30px">Açıq tapşırıq yoxdur</div>;
  return (
    <div className="u-display-flex u-flex-direction-column u-gap-8px">
      {tasks.map(t => (
        <div key={t.id} className="u-padding-10px u-border-1px_solid_border u-border-radius-10px u-display-flex u-gap-8px u-align-items-center">
          <Input type="checkbox" className="ui-checkbox" checked={t.done} readOnly />
          <span className="u-flex-1">{t.title}</span>
          {t.due_at && <span className="u-font-size-11px u-color-text_secondary">{new Date(t.due_at).toLocaleDateString()}</span>}
        </div>
      ))}
    </div>
  );
}

const activityIcon = { call: '📞', meeting: '🤝', email: '✉️', note: '📝', sms: '💬' };
function Timeline({ items }) {
  if (items.length === 0) return <div className="u-color-text_secondary u-text-align-center u-padding-20px">Hələ aktivlik yoxdur</div>;
  return (
    <div className="u-display-flex u-flex-direction-column u-gap-10px">
      {items.map(a => (
        <div key={a.id} className="u-display-flex u-gap-10px u-padding-10px u-background-surface_subtle u-border-radius-10px">
          <span className="u-font-size-18px">{activityIcon[a.type] || '•'}</span>
          <div className="u-flex-1">
            <div className="u-font-weight-600 u-font-size-13px">{a.subject}</div>
            {a.body && <div className="u-font-size-12px u-color-text_secondary u-margin-top-2px">{a.body}</div>}
            <div className="u-font-size-11px u-color-text_secondary u-margin-top-4px">{new Date(a.occurred_at).toLocaleString('az-AZ')}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
