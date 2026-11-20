import { Eye, PackageCheck, Pencil, Save, Trash2, Truck, X } from "lucide-react";
import { DataTable, Field, IconButton, Panel, ReceiptLineTable, TwoLine, qty, toNumber } from "../procurementShared.jsx";

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
