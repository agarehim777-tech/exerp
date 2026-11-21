import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Pencil, Plus, Save, Trash2, X, XCircle } from "lucide-react";
import { DataTable, Field, IconButton, Panel, TwoLine } from "../procurementShared.jsx";

export function VendorsTab({ vendors, form, setForm, editingId, onSubmit, onCancel, onEdit, onToggle, onDelete, purchaseOrders, saving }) {
  const [showForm, setShowForm] = useState(false);
  useEffect(() => { if (editingId) setShowForm(true); }, [editingId]);
  return (
    <section className="procurement-page-styles-stack">
      <div className="procurement-page-styles-section-actions">
        <IconButton icon={showForm ? X : Plus} label={showForm ? "Formanı bağla" : "Yeni təchizatçı"} tone={showForm ? "ghost" : "primary"} onClick={() => {
          if (showForm && editingId) onCancel();
          setShowForm((value) => !value);
        }} />
      </div>
      {showForm && (
      <Panel title={editingId ? "Təchizatçını redaktə et" : "Yeni təchizatçı"} icon={Building2}>
        <form onSubmit={onSubmit} className="procurement-page-styles-form">
          <Field label="Ad" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
          <Field label="VÖEN" value={form.tax_id} onChange={(value) => setForm({ ...form, tax_id: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Telefon" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Ünvan" value={form.address} onChange={(value) => setForm({ ...form, address: value })} wide />
          <label className="procurement-page-styles-check-line">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Aktiv təchizatçı kimi saxla
          </label>
          <div className="procurement-page-styles-form-actions">
            <IconButton icon={Save} label={editingId ? "Yadda saxla" : "Əlavə et"} tone="primary" disabled={saving} submit />
            {editingId && <IconButton icon={X} label="Ləğv et" onClick={onCancel} />}
          </div>
        </form>
      </Panel>
      )}

      <Panel title="Təchizatçı reyestri" icon={Building2}>
        <DataTable
          columns={["Təchizatçı", "Əlaqə", "PO sayı", "Status", "Əməl"]}
          empty="Təchizatçı yoxdur. Sol tərəfdən ilk təchizatçını yaradın."
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
                <IconButton icon={Pencil} label="Düzəliş" onClick={() => { setShowForm(true); onEdit(vendor); }} />
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
