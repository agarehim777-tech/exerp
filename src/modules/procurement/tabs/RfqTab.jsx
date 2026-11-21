import { BarChart3, CheckCircle2, ClipboardCheck, Save, ShoppingCart, XCircle } from "lucide-react";
import { DataTable, Field, IconButton, Panel, TwoLine, qty } from "../procurementShared.jsx";
import { formatDate } from "../../../services/date.js";

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
              rfq.due_at ? formatDate(rfq.due_at) : "—",
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
