import { CheckCircle2, Eye, FileText, Pencil, Receipt, RefreshCw, Save, Trash2, WalletCards, X, XCircle } from "lucide-react";
import { DataTable, Field, IconButton, InvoiceDetailTable, Panel, StatusPill, TwoLine, money, qty } from "../procurementShared.jsx";

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
