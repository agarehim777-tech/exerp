import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Building2, CheckCircle2, ClipboardCheck, CreditCard, Eye, FileText, PackageCheck, Pencil, Plus, Receipt, RefreshCw, Save, ShoppingCart, Trash2, Truck, WalletCards, X, XCircle } from "lucide-react";
import { DataTable, Empty, Field, IconButton, InvoiceDetailTable, LineDetailTable, Panel, ProductAutocomplete, Progress, ReceiptLineTable, StatusPill, TwoLine, emptyPoLine, emptyPoPayment, money, qty, toNumber, today } from "./procurementShared.jsx";

export function RfqTab({ rfqs, vendors, form, setForm, onSubmit, onApprove, onReject, onConvert, saving }) {
  const vendorName = (id) => vendors.find((vendor) => vendor.id === id)?.name || "Vendor";
  const toggleVendor = (vendorId) => setForm({
    ...form,
    vendor_ids: form.vendor_ids.includes(vendorId)
      ? form.vendor_ids.filter((id) => id !== vendorId)
      : [...form.vendor_ids, vendorId],
  });

  return (
    <div className="procurement-page-styles-split-grid">
      <Panel title="Yeni təklif sorğusu" icon={ClipboardCheck}>
        <form className="procurement-page-styles-form sx-d7614df" onSubmit={onSubmit}>
          <Field label="Sorğunun adı" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required wide />
          <Field label="Məhsul / xidmət" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required wide />
          <Field label="Miqdar" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} required />
          <Field label="Təklif üçün son tarix" type="date" value={form.due_at} onChange={(value) => setForm({ ...form, due_at: value })} />
          <div className="procurement-page-styles-lines-block">
            <strong>Vendorlar</strong>
            {vendors.map((vendor) => (
              <label key={vendor.id} className="u-display-flex u-align-items-center u-gap-8px u-font-size-13px">
                <input type="checkbox" checked={form.vendor_ids.includes(vendor.id)} onChange={() => toggleVendor(vendor.id)} />
                {vendor.name}
              </label>
            ))}
            {!vendors.length && <small>Əvvəl aktiv vendor yaradın.</small>}
          </div>
          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label="RFQ yarat" tone="primary" submit disabled={saving || !vendors.length} />
          </div>
        </form>
      </Panel>

      <Panel title="RFQ və vendor müqayisəsi" icon={BarChart3}>
        <DataTable
          columns={["RFQ", "Məhsul", "Vendorlar", "Son tarix", "Status", "Əməl"]}
          empty="Təklif sorğusu yoxdur."
          rows={rfqs.map((rfq) => {
            const line = rfq.workflow_lines?.[0];
            const invited = rfq.payload?.vendor_ids || [];
            return [
              <TwoLine title={rfq.record_no} subtitle={rfq.title} />,
              <TwoLine title={line?.description || "—"} subtitle={`${qty(line?.quantity)} vahid`} />,
              <TwoLine title={`${invited.length} vendor`} subtitle={invited.map(vendorName).join(", ") || "—"} />,
              rfq.due_at ? new Date(rfq.due_at).toLocaleDateString("az-AZ") : "—",
              <span className={`procurement-page-styles-badge procurement-page-styles-badge-${rfq.status === "approved" ? "success" : rfq.status === "rejected" ? "danger" : "info"}`}>{rfq.status}</span>,
              <div className="procurement-page-styles-row-actions">
                {rfq.status === "sent" && <IconButton icon={CheckCircle2} label="Təsdiq" tone="success" onClick={() => onApprove(rfq)} />}
                {rfq.status === "sent" && <IconButton icon={XCircle} label="Rədd" tone="danger" onClick={() => onReject(rfq)} />}
                {rfq.status === "approved" && <IconButton icon={ShoppingCart} label="PO yarat" tone="primary" onClick={() => onConvert(rfq)} />}
              </div>,
            ];
          })}
 />
      </Panel>
    </div>
  );
}

export function Metric({ icon: Icon, label, value, hint, tone }) {
  return (
    <article className="procurement-page-styles-metric-card">
      <div className={`procurement-page-styles-metric-icon procurement-page-styles-metric-${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <span className="procurement-page-styles-metric-label">{label}</span>
        <strong className="procurement-page-styles-metric-value">{value}</strong>
        <small className="procurement-page-styles-metric-hint">{hint}</small>
      </div>
    </article>
  );
}

export function DashboardTab({ purchaseOrders, poMetrics, onCreatePo, onReceive }) {
  const latePo = purchaseOrders.filter((po) => po.expected_date && po.expected_date < today() && ["draft", "approved", "partial"].includes(po.status));
  const actionPo = purchaseOrders.filter((po) => ["approved", "partial"].includes(po.status)).slice(0, 6);

  return (
    <section className="procurement-dashboard-grid procurement-page-styles-dashboard-grid">
      <Panel title="Təhvil/mədaxil gözləyən PO-lar" icon={Truck}>
        {actionPo.length === 0 ? (
          <Empty title="Mədaxil gözləyən PO yoxdur." />
        ) : (
          actionPo.map((po) => (
            <div key={po.id} className="procurement-page-styles-compact-row">
              <div>
                <strong>{po.po_number}</strong>
                <small>{po.vendors?.name || "Vendor yoxdur"} · {money(poMetrics.get(po.id)?.total || 0, po.currency)}</small>
              </div>
              <div className="procurement-page-styles-row-actions">
                <IconButton icon={PackageCheck} label="Mədaxil" onClick={() => onReceive(po.id)} />
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title="Risk və istisnalar" icon={AlertTriangle}>
        {latePo.length === 0 ? (
          <Empty title="Gecikən PO yoxdur." />
        ) : (
          <>
            {latePo.map((po) => (
              <div key={po.id} className="procurement-page-styles-warning-row">
                <AlertTriangle size={16} />
                <div>
                  <strong>{po.po_number}</strong>
                  <small>Gözlənilən tarix keçib: {po.expected_date}</small>
                </div>
              </div>
            ))}
          </>
        )}
      </Panel>
    </section>
  );
}

export function VendorsTab({ vendors, form, setForm, editingId, onSubmit, onCancel, onEdit, onToggle, onDelete, purchaseOrders, saving }) {
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { if (editingId) setShowForm(true); }, [editingId]);
  return (
    <section className="procurement-page-styles-stack">
      <div className="procurement-page-styles-section-actions">
        <IconButton icon={showForm ? X : Plus} label={showForm ? "Formanı bağla" : "Yeni vendor"} tone={showForm ? "ghost" : "primary"} onClick={() => {
          if (showForm && editingId) onCancel();
          setShowForm((value) => !value);
        }} />
      </div>
      {showForm && (
      <Panel title={editingId ? "Vendoru redaktə et" : "Yeni vendor"} icon={Building2}>
        <form onSubmit={onSubmit} className="procurement-page-styles-form">
          <Field label="Ad" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <Field label="VÖEN" value={form.tax_id} onChange={(value) => setForm({ ...form, tax_id: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Telefon" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Ünvan" value={form.address} onChange={(value) => setForm({ ...form, address: value })} wide />
          <label className="procurement-page-styles-check-line">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Aktiv vendor kimi saxla
          </label>
          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label={editingId ? "Yadda saxla" : "Əlavə et"} tone="primary" disabled={saving} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>
      )}

      <Panel title="Vendor reyestri" icon={Building2}>
        <DataTable
          columns={["Vendor", "Əlaqə", "PO sayı", "Status", "Əməl"]}
          empty="Vendor yoxdur. Sol tərəfdən ilk vendoru yaradın."
          rows={vendors.map((vendor) => {
            const vendorPo = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
            return [
              <TwoLine key="vendor" title={vendor.name} subtitle={vendor.tax_id || vendor.address || "VÖEN/ünvan qeyd edilməyib"} />,
              <TwoLine key="contact" title={vendor.phone || "Telefon yoxdur"} subtitle={vendor.email || "Email yoxdur"} />,
              vendorPo.length,
              <span key="status" className={`procurement-page-styles-badge ${vendor.is_active ? "procurement-page-styles-badge-success" : "procurement-page-styles-badge-neutral"}`}>
                {vendor.is_active ? "Aktiv" : "Passiv"}
              </span>,
              <div key="actions" className="procurement-page-styles-row-actions">
                <IconButton icon={Pencil} label="Edit" onClick={() => { setShowForm(true); onEdit(vendor); }} />
                <IconButton icon={vendor.is_active ? XCircle : CheckCircle2} label={vendor.is_active ? "Passiv" : "Aktiv"} onClick={() => onToggle(vendor)} />
                <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(vendor)} tone="danger" />
              </div>,
            ];
          })}
 />
      </Panel>
    </section>
  );
}

export function PurchaseOrdersTab({
  vendors,
  products,
  purchaseOrders,
  allPurchaseOrders,
  linesByPo,
  poMetrics,
  paymentByPo,
  poPayments,
  poPaymentsAvailable,
  acceptedByLine,
  invoicedByLine,
  expandedPo,
  setExpandedPo,
  form,
  setForm,
  draftLines,
  setDraftLines,
  setProductOnLine,
  editingPoId,
  paymentPoId,
  paymentForm,
  setPaymentForm,
  editingPaymentId,
  onPaymentOpen,
  onPaymentEdit,
  onPaymentSubmit,
  onPaymentDelete,
  onSubmit,
  onCancel,
  onEdit,
  onDelete,
  onApprove,
  onCancelPo,
  onClose,
  onReceive,
  onInvoice,
  saving,
}) {
  const activeVendors = vendors.filter((vendor) => vendor.is_active);
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { if (editingPoId) setShowForm(true); }, [editingPoId]);
  return (
    <section className="procurement-page-styles-stack">
      <div className="procurement-page-styles-section-actions">
        <IconButton icon={showForm ? X : Plus} label={showForm ? "Formanı bağla" : "Yeni PO yarat"} tone={showForm ? "ghost" : "primary"} onClick={() => {
          if (showForm && editingPoId) onCancel();
          setShowForm((value) => !value);
        }} />
      </div>
      {showForm && (
      <Panel title={editingPoId ? "PO redaktəsi" : "Yeni satınalma sifarişi"} icon={ShoppingCart}>
        <form onSubmit={onSubmit} className="procurement-page-styles-form">
          <label className="procurement-page-styles-field">
            <span>Vendor</span>
            <select value={form.vendor_id} onChange={(event) => setForm({ ...form, vendor_id: event.target.value })} required>
              <option value="">Vendor seçin</option>
              {activeVendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </label>
          <Field label="Zavod" value={form.factory_name} onChange={(value) => setForm({ ...form, factory_name: value })} />
          <Field label="PO nömrəsi" value={form.po_number} onChange={(value) => setForm({ ...form, po_number: value })} required />
          <Field label="Sifariş tarixi" type="date" value={form.order_date} onChange={(value) => setForm({ ...form, order_date: value })} />
          <Field label="Gözlənilən tarix" type="date" value={form.expected_date} onChange={(value) => setForm({ ...form, expected_date: value })} />
          <label className="procurement-page-styles-field">
            <span>Valyuta</span>
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              <option value="AZN">AZN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <Field label="Məzənnə" type="number" value={form.exchange_rate} onChange={(value) => setForm({ ...form, exchange_rate: value })} />
          <Field label="Ödəniş şərti" value={form.payment_terms} onChange={(value) => setForm({ ...form, payment_terms: value })} />
          <Field label="Qeyd" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} wide />

          <div className="procurement-page-styles-lines-block">
            <div className="procurement-page-styles-lines-header">
              <strong>Məhsul sətirləri</strong>
              <IconButton icon={Plus} label="Sətir" onClick={() => setDraftLines([...draftLines, { ...emptyPoLine }])} />
            </div>
            <datalist id="procurement-products">
              {products.map((product) => (
                <option key={product.id} value={product.sku}>{product.name}</option>
              ))}
            </datalist>
            {draftLines.map((line, index) => (
              <div key={index} className="po-line-card">
                <div className="po-line-card__header">
                  <strong>Məhsul {index + 1}</strong>
                  <IconButton icon={Trash2} label="Sil" tone="danger" disabled={draftLines.length === 1} onClick={() => setDraftLines(draftLines.filter((_, itemIndex) => itemIndex !== index))} />
                </div>
                <div className="po-line-grid po-line-grid--main">
                  <label><span>SKU / məhsul kodu</span><input list="procurement-products" placeholder="Məsələn: SN-G5" value={line.product_sku} onChange={(event) => setProductOnLine(index, event.target.value)} /></label>
                  <label>
                    <span>Məhsul seçin</span>
                    <ProductAutocomplete products={products} value={line.product_id} onSelect={(product) => setProductOnLine(index, product.sku)} />
                  </label>
                  <label><span>Miqdar</span><input type="number" min="0" step="0.001" value={line.qty_ordered} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, qty_ordered: event.target.value } : item)))} /></label>
                  <label><span>Ölçü vahidi</span><input placeholder="ədəd" value={line.unit} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => itemIndex === index ? { ...item, unit:event.target.value } : item))} /></label>
                  <label><span>Vahid invoice qiyməti</span><input type="number" min="0" step="0.0001" value={line.unit_price} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, unit_price: event.target.value } : item)))} /></label>
                </div>
              </div>
            ))}
          </div>

          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label={editingPoId ? "PO yenilə" : "PO yarat"} tone="primary" disabled={saving || activeVendors.length === 0} submit />
            {editingPoId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
          {activeVendors.length === 0 && <p className="procurement-page-styles-helper-text">PO yaratmaq üçün əvvəl aktiv vendor yaradın.</p>}
        </form>
      </Panel>
      )}

      <Panel title="PO reyestri" icon={ClipboardCheck}>
        <DataTable
          columns={["PO", "Vendor", "Dəyər", "Ödənilib", "Qalıq ödəniş", "Status", "Mədaxil", "Əməl"]}
          empty={allPurchaseOrders.length ? "Filterə uyğun PO yoxdur." : "PO yoxdur. Yuxarıdakı formadan ilk sifarişi yaradın."}
          rows={purchaseOrders.map((po) => {
            const metrics = poMetrics.get(po.id) || {};
            const payment = (paymentByPo && paymentByPo.get(po.id)) || { billed: 0, paid: 0 };
            const total = metrics.total || 0;
            const paid = payment.paid || 0;
            const due = Math.max(0, total - paid);
            const isExpanded = expandedPo === po.id;
            return [
              <button key="po" type="button" className="procurement-page-styles-link-cell" onClick={() => setExpandedPo(isExpanded ? null : po.id)}>
                <TwoLine title={po.po_number} subtitle={`${po.order_date || "tarixsiz"} → ${po.expected_date || "plan yoxdur"}`} />
              </button>,
              po.vendors?.name || "Vendor yoxdur",
              <TwoLine key="amount" title={money(total, po.currency)} subtitle={`${metrics.lineCount || 0} sətir`} />,
              <TwoLine key="paid" title={money(paid, po.currency)} subtitle={`Fakturalanıb: ${money(payment.billed || 0, po.currency)}`} />,
              <TwoLine key="due" title={money(due, po.currency)} subtitle={due <= 0 && total > 0 ? "Tam ödənilib" : `${total > 0 ? Math.round((paid / total) * 100) : 0}% ödənilib`} />,
              <StatusPill key="status" status={po.status} />,

              <Progress key="progress" value={metrics.progress || 0} label={`${qty(metrics.received)} / ${qty(metrics.ordered)} ədəd`} />,
              <div key="actions" className="procurement-page-styles-row-actions">
                <IconButton icon={Pencil} label="Redaktə et" onClick={() => { setShowForm(true); onEdit(po); }} />
                <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(po)} tone="danger" />
                <IconButton icon={Eye} label={isExpanded ? "Bağla" : "Bax"} onClick={() => setExpandedPo(isExpanded ? null : po.id)} />
                {poPaymentsAvailable && <IconButton icon={CreditCard} label="Ödəniş" onClick={() => { setExpandedPo(po.id); onPaymentOpen(po); }} />}
                {po.status === "draft" && <IconButton icon={CheckCircle2} label="Təsdiq" onClick={() => onApprove(po)} tone="success" />}
                {["approved", "partial"].includes(po.status) && <IconButton icon={PackageCheck} label="Mədaxil" onClick={() => onReceive(po.id)} tone="success" />}
                {po.status === "received" && <IconButton icon={CheckCircle2} label="Bağla" onClick={() => onClose(po)} />}
                {!["closed", "cancelled"].includes(po.status) && <IconButton icon={XCircle} label="Ləğv" onClick={() => onCancelPo(po)} tone="danger" />}
              </div>,
            ];
          })}
          detail={(po) =>
            expandedPo === po.id && (
              <div className="u-display-grid u-gap-16px">
                <LineDetailTable lines={linesByPo.get(po.id) || []} acceptedByLine={acceptedByLine} invoicedByLine={invoicedByLine} currency={po.currency} />
                {poPaymentsAvailable && <PoPaymentPanel
                  po={po}
                  poPayments={poPayments}
                  paymentForm={paymentForm}
                  setPaymentForm={setPaymentForm}
                  paymentPoId={paymentPoId}
                  editingPaymentId={editingPaymentId}
                  onPaymentEdit={onPaymentEdit}
                  onPaymentSubmit={onPaymentSubmit}
                  onPaymentDelete={onPaymentDelete}
                  saving={saving}
                  paymentByPo={paymentByPo}
                  poMetrics={poMetrics}
 />}
              </div>
            )
          }
          sourceRows={purchaseOrders}
 />
      </Panel>
    </section>
  );
}

function PoPaymentPanel({ po, poPayments, paymentForm, setPaymentForm, paymentPoId, editingPaymentId, onPaymentEdit, onPaymentSubmit, onPaymentDelete, saving, paymentByPo, poMetrics }) {
  const payments = poPayments.filter((payment) => payment.po_id === po.id);
  const payment = paymentByPo.get(po.id) || { billed: 0, paid: 0 };
  const poValue = poMetrics.get(po.id)?.total || 0;
  const paid = payment.paid || 0;
  const due = Math.max(0, poValue - paid);
  const isOpen = paymentPoId === po.id;

  return (
    <div className="u-border-1px_solid_border u-border-radius-10px u-padding-14px u-background-surface_subtle u-display-grid u-gap-12px">
      <div className="u-display-flex u-align-items-center u-gap-8px u-justify-content-space_between u-flex-wrap-wrap">
        <strong className="u-display-flex u-align-items-center u-gap-8px">
          <CreditCard size={18} /> PO ödənişləri
        </strong>
        <div className="u-display-flex u-gap-10px u-font-size-13px">
          <span>PO dəyəri: <strong>{money(poValue, po.currency)}</strong></span>
          <span>Ödənilib: <strong>{money(paid, po.currency)}</strong></span>
          <span>Qalıq ödəniş: <strong>{money(due, po.currency)}</strong></span>
        </div>
      </div>

      {payments.length > 0 ? (
        <table className="procurement-page-styles-table sx-0695ff9 sx-a50337b sx-3e3b3e7">
          <thead>
            <tr className="u-background-surface_subtle u-text-align-left">
              <th className="u-padding-8px_10px">Tarix</th>
              <th className="u-padding-8px_10px">Məbləğ</th>
              <th className="u-padding-8px_10px">Üsul</th>
              <th className="u-padding-8px_10px">Referans</th>
              <th className="u-padding-8px_10px">Qeyd</th>
              <th className="u-padding-8px_10px u-text-align-right">Əməl</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="u-border-top-1px_solid_border">
                <td className="u-padding-8px_10px">{payment.payment_date}</td>
                <td className="u-padding-8px_10px u-font-weight-700">{money(payment.amount, po.currency)}</td>
                <td className="u-padding-8px_10px">{payment.payment_method || "bank"}</td>
                <td className="u-padding-8px_10px">{payment.reference_no || "—"}</td>
                <td className="u-padding-8px_10px">{payment.notes || "—"}</td>
                <td className="u-padding-8px_10px u-text-align-right">
                  <div className="procurement-page-styles-row-actions">
                    <IconButton icon={Pencil} label="Edit" onClick={() => onPaymentEdit(payment)} />
                    <IconButton icon={Trash2} label="Sil" onClick={() => onPaymentDelete(payment)} tone="danger" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="procurement-page-styles-helper-text">Bu PO üzrə hələ ödəniş qeyd edilməyib.</p>
      )}

      {isOpen && (
        <form onSubmit={onPaymentSubmit} className="procurement-page-styles-form sx-0d541a3 sx-176884a sx-0695ff9 sx-a50337b sx-4fd67c1">
          <Field label="Məbləğ" type="number" value={paymentForm.amount} onChange={(value) => setPaymentForm({ ...paymentForm, amount: value })} required />
          <Field label="Tarix" type="date" value={paymentForm.payment_date} onChange={(value) => setPaymentForm({ ...paymentForm, payment_date: value })} required />
          <label className="procurement-page-styles-field">
            <span>Üsul</span>
            <select value={paymentForm.payment_method} onChange={(event) => setPaymentForm({ ...paymentForm, payment_method: event.target.value })}>
              <option value="bank">Bank köçürməsi</option>
              <option value="cash">Nağd</option>
              <option value="card">Kart</option>
              <option value="other">Digər</option>
            </select>
          </label>
          <Field label="Referans №" value={paymentForm.reference_no} onChange={(value) => setPaymentForm({ ...paymentForm, reference_no: value })} />
          <Field label="Qeyd" value={paymentForm.notes} onChange={(value) => setPaymentForm({ ...paymentForm, notes: value })} wide />
          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label={editingPaymentId ? "Yenilə" : "Ödəniş qeyd et"} tone="primary" disabled={saving} submit />
            {editingPaymentId && (
              <IconButton icon={X} label="Ləğv et" onClick={() => {
                setPaymentForm({ ...emptyPoPayment, po_id: po.id, payment_date: today() });
                onPaymentEdit({ id: null, po_id: po.id });
              }} />
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export function ReceiptsTab({
  form,
  setForm,
  draftLines,
  setDraftLines,
  editingId,
  poOptions,
  goodsReceipts,
  receiptLinesByReceipt,
  poLines,
  expandedReceipt,
  setExpandedReceipt,
  onSubmit,
  onCancel,
  onEdit,
  onDelete,
  saving,
}) {
  return (
    <section className="procurement-page-styles-stack">
      <Panel title={editingId ? "Mədaxili redaktə et" : "Yeni mədaxil (GRN)"} icon={PackageCheck}>
        <form onSubmit={onSubmit} className="procurement-page-styles-form">
          <label className="procurement-page-styles-field">
            <span>PO</span>
            <select aria-label="PO" className="procurement-page-styles-input" value={form.po_id} onChange={(event) => setForm({ ...form, po_id: event.target.value })} required disabled={!!editingId}>
              <option value="">PO seçin</option>
              {poOptions.map((po) => (
                <option key={po.id} value={po.id}>{po.po_number} · {po.vendors?.name || "Vendor"}</option>
              ))}
            </select>
          </label>
          <Field label="GRN nömrəsi" value={form.grn_number} onChange={(value) => setForm({ ...form, grn_number: value })} required />
          <Field label="Mədaxil tarixi" type="date" value={form.receipt_date} onChange={(value) => setForm({ ...form, receipt_date: value })} />
          <Field label="Qeyd" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} wide />

          <div className="procurement-page-styles-lines-block">
            <div className="procurement-page-styles-lines-header">
              <strong>Qəbul sətirləri</strong>
              <small>{draftLines.length ? "Qəbul/rədd miqdarlarını təsdiqləyin." : "PO seçdikdə sətirlər açılacaq."}</small>
            </div>
            {draftLines.map((line, index) => (
              <div key={line.po_line_id} className="procurement-page-styles-receipt-line-grid">
                <TwoLine title={line.label} subtitle={`Sifariş: ${qty(line.ordered)} · Qalıq: ${qty(line.outstanding)}`} />
                <input type="number" min="0" max={line.outstanding} step="0.001" placeholder="Qəbul edildi" value={line.qty_received} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => {
                  if (itemIndex !== index) return item;
                  const raw = event.target.value;
                  if (raw === "") return { ...item, qty_received: "" };
                  const received = Math.min(Math.max(0, toNumber(raw)), toNumber(item.outstanding));
                  return { ...item, qty_received: String(received), qty_rejected: String(Math.min(toNumber(item.qty_rejected), received)) };
                }))} className="procurement-page-styles-input" />
                <input type="number" min="0.000001" step="0.000001" placeholder="Vahid həcm, m³" value={line.unit_volume_m3} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => itemIndex === index ? { ...item, unit_volume_m3: event.target.value } : item))} className="procurement-page-styles-input" />
                <input type="number" min="0" max={line.qty_received || 0} step="0.001" placeholder="Rədd edildi" value={line.qty_rejected} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => {
                  if (itemIndex !== index) return item;
                  const raw = event.target.value;
                  if (raw === "") return { ...item, qty_rejected: "" };
                  return { ...item, qty_rejected: String(Math.min(Math.max(0, toNumber(raw)), toNumber(item.qty_received))) };
                }))} className="procurement-page-styles-input" />
              </div>
            ))}
          </div>

          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label={editingId ? "GRN yenilə" : "Mədaxil et"} tone="primary" disabled={saving || !draftLines.length} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>

      <Panel title="Mədaxil reyestri" icon={Truck}>
        <DataTable
          columns={["GRN", "PO", "Tarix", "Sətir", "Əməl"]}
          empty="Mədaxil qeydi yoxdur."
          rows={goodsReceipts.map((receipt) => {
            const lines = receiptLinesByReceipt.get(receipt.id) || [];
            const isExpanded = expandedReceipt === receipt.id;
            return [
              <button key="grn" type="button" className="procurement-page-styles-link-cell" onClick={() => setExpandedReceipt(isExpanded ? null : receipt.id)}>
                <TwoLine title={receipt.grn_number} subtitle={receipt.notes || "Qeyd yoxdur"} />
              </button>,
              receipt.purchase_orders?.po_number || "PO yoxdur",
              receipt.receipt_date,
              lines.length,
              <div key="actions" className="procurement-page-styles-row-actions">
                <IconButton icon={Eye} label={isExpanded ? "Bağla" : "Bax"} onClick={() => setExpandedReceipt(isExpanded ? null : receipt.id)} />
                <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(receipt)} />
                <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(receipt)} tone="danger" />
              </div>,
            ];
          })}
          sourceRows={goodsReceipts}
          detail={(receipt) => expandedReceipt === receipt.id && <ReceiptLineTable lines={receiptLinesByReceipt.get(receipt.id) || []} poLines={poLines} />}
 />
      </Panel>
    </section>
  );
}

export function InvoicesTab({
  form,
  setForm,
  draftLines,
  setDraftLines,
  editingId,
  poOptions,
  invoices,
  invoiceLinesByInvoice,
  poLines,
  invoiceTotals,
  matchRows,
  expandedInvoice,
  setExpandedInvoice,
  onSubmit,
  onCancel,
  onEdit,
  onDelete,
  onMatch,
  onApprove,
  onPaid,
  onCancelInvoice,
  saving,
}) {
  return (
    <section className="procurement-page-styles-stack">
      <Panel title={editingId ? "Fakturanı redaktə et" : "Yeni vendor fakturası"} icon={Receipt}>
        <form onSubmit={onSubmit} className="procurement-page-styles-form">
          <label className="procurement-page-styles-field">
            <span>PO</span>
            <select aria-label="PO" className="procurement-page-styles-input" value={form.po_id} onChange={(event) => setForm({ ...form, po_id: event.target.value })} required disabled={!!editingId}>
              <option value="">PO seçin</option>
              {poOptions.map((po) => (
                <option key={po.id} value={po.id}>{po.po_number} · {po.vendors?.name || "Vendor"}</option>
              ))}
            </select>
          </label>
          <Field label="Faktura nömrəsi" value={form.invoice_number} onChange={(value) => setForm({ ...form, invoice_number: value })} required />
          <Field label="Faktura tarixi" type="date" value={form.invoice_date} onChange={(value) => setForm({ ...form, invoice_date: value })} />
          <Field label="Ödəniş tarixi" type="date" value={form.due_date} onChange={(value) => setForm({ ...form, due_date: value })} />
          <label className="procurement-page-styles-field">
            <span>Valyuta</span>
            <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
              <option value="AZN">AZN</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <Field label="Match qeydi" value={form.match_notes} onChange={(value) => setForm({ ...form, match_notes: value })} wide />

          <div className="procurement-page-styles-lines-block">
            <div className="procurement-page-styles-lines-header">
              <strong>Faktura sətirləri</strong>
              <small>{draftLines.length ? "Qəbul və PO qiyməti ilə müqayisə olunacaq." : "PO seçdikdə sətirlər açılacaq."}</small>
            </div>
            {draftLines.map((line, index) => (
              <div key={line.po_line_id} className="procurement-page-styles-invoice-line-grid">
                <TwoLine title={line.label} subtitle={`Sifariş: ${qty(line.ordered)} · Qəbul: ${qty(line.accepted)}`} />
                <input type="number" min="0" step="0.001" placeholder="Faktura miqdarı" value={line.qty_invoiced} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, qty_invoiced: event.target.value } : item)))} className="procurement-page-styles-input" />
                <input type="number" min="0" step="0.0001" placeholder="Faktura qiyməti" value={line.unit_price} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, unit_price: event.target.value } : item)))} className="procurement-page-styles-input" />
                <input type="number" min="0" step="0.01" placeholder="ƏDV %" value={line.tax_rate} onChange={(event) => setDraftLines(draftLines.map((item, itemIndex) => (itemIndex === index ? { ...item, tax_rate: event.target.value } : item)))} className="procurement-page-styles-input" />
              </div>
            ))}
          </div>

          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label={editingId ? "Faktura yenilə" : "Faktura yarat"} tone="primary" disabled={saving || !draftLines.length} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>

      <Panel title="Faktura və 3-way match" icon={FileText}>
        <DataTable
          columns={["Faktura", "Vendor / PO", "Məbləğ", "Status", "Əməl"]}
          empty="Faktura yoxdur."
          rows={invoices.map((invoice) => {
            const isExpanded = expandedInvoice === invoice.id;
            return [
              <button key="invoice" type="button" className="procurement-page-styles-link-cell" onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)}>
                <TwoLine title={invoice.invoice_number} subtitle={`${invoice.invoice_date || "tarixsiz"} · son ödəniş ${invoice.due_date || "qeyd yoxdur"}`} />
              </button>,
              <TwoLine key="vendor" title={invoice.vendors?.name || "Vendor yoxdur"} subtitle={`PO ${invoice.purchase_orders?.po_number || "yoxdur"}`} />,
              money(invoiceTotals.get(invoice.id) || 0, invoice.currency),
              <StatusPill key="status" status={invoice.status} type="invoice" />,
              <div key="actions" className="procurement-page-styles-row-actions">
                <IconButton icon={Eye} label={isExpanded ? "Bağla" : "Bax"} onClick={() => setExpandedInvoice(isExpanded ? null : invoice.id)} />
                <IconButton icon={RefreshCw} label="Match" onClick={() => onMatch(invoice)} />
                <IconButton icon={Pencil} label="Edit" onClick={() => onEdit(invoice)} disabled={invoice.status === "paid"} />
                {invoice.status === "matched" && <IconButton icon={CheckCircle2} label="Təsdiq" onClick={() => onApprove(invoice)} tone="success" />}
                {["matched", "approved"].includes(invoice.status) && <IconButton icon={WalletCards} label="Ödəniş et" onClick={() => onPaid(invoice)} tone="success" />}
                {!["paid", "cancelled"].includes(invoice.status) && <IconButton icon={XCircle} label="Ləğv" onClick={() => onCancelInvoice(invoice)} tone="danger" />}
                {invoice.status !== "paid" && <IconButton icon={Trash2} label="Sil" onClick={() => onDelete(invoice)} tone="danger" />}
              </div>,
            ];
          })}
          sourceRows={invoices}
          detail={(invoice) =>
            expandedInvoice === invoice.id && (
              <InvoiceDetailTable lines={invoiceLinesByInvoice.get(invoice.id) || []} poLines={poLines} matchRows={matchRows[invoice.id]} currency={invoice.currency} />
            )
          }
 />
      </Panel>
    </section>
  );
}
