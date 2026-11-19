import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, CreditCard, Eye, PackageCheck, Pencil, Plus, Save, ShoppingCart, Trash2, X, XCircle } from "lucide-react";
import { DataTable, Field, IconButton, LineDetailTable, Panel, ProductAutocomplete, Progress, StatusPill, TwoLine, emptyPoLine, emptyPoPayment, money, qty, today } from "../procurementShared.jsx";

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
