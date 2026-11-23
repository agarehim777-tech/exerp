// Satıcı fakturaları: PO seçəndə faktura sətirlərini qurma, redaktə, yaddaşa yazma (yazandan sonra 3-way match),
// match-i yenidən hesablama, status dəyişmə və silmə. Faktura ödənişi (payingInvoice, hesablar) hələ səhifədədir.
// ProcurementPage.jsx səhifənin ortaq setter-lərini ötürür; faktura məntiqini burada dəyişin.
import { useState, type FormEvent } from "react";
import { supabase } from "../../integrations/supabase/client";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { INVOICE_STATUS, emptyInvoice, getError, nextNumber, toNumber, today } from "./procurementShared.jsx";

type Row = Record<string, any>;

export function useInvoiceActions({
  tenantId, user, purchaseOrders, linesByPo, invoiceLinesByInvoice, acceptedByLine,
  load, setError, setNotice, setSaving, setTab,
}: {
  tenantId: string | null | undefined;
  user: { id?: string } | null | undefined;
  purchaseOrders: Row[];
  linesByPo: Map<string, Row[]>;
  invoiceLinesByInvoice: Map<string, Row[]>;
  acceptedByLine: Map<unknown, number>;
  load: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
  setTab: (tab: string) => void;
}) {
  const [matchRows, setMatchRows] = useState<Record<string, Row[]>>({});
  const [invoiceForm, setInvoiceForm] = useState<Row>({ ...emptyInvoice, invoice_number: nextNumber("INV") });
  const [invoiceDraftLines, setInvoiceDraftLines] = useState<Row[]>([]);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  function resetInvoiceForm() {
    setEditingInvoiceId(null);
    setInvoiceForm({ ...emptyInvoice, invoice_number: nextNumber("INV") });
    setInvoiceDraftLines([]);
  }

  function buildInvoiceLines(poId: string, invoiceId: string | null = null) {
    const sourceLines = linesByPo.get(poId) || [];
    const existing = invoiceId ? invoiceLinesByInvoice.get(invoiceId) || [] : [];
    return sourceLines.map((line) => {
      const existingLine = existing.find((item) => item.po_line_id === line.id);
      const accepted = acceptedByLine.get(line.id) || 0;
      const ordered = toNumber(line.qty_ordered);
      return {
        po_line_id: line.id,
        label: `${line.product_sku}${line.description ? ` · ${line.description}` : ""}`,
        ordered,
        accepted,
        qty_invoiced: existingLine ? String(existingLine.qty_invoiced) : String(accepted || ordered || ""),
        unit_price: existingLine ? String(existingLine.unit_price) : String(line.unit_price || 0),
        tax_rate: existingLine ? String(existingLine.tax_rate || line.tax_rate || 0) : String(line.tax_rate || 0),
      };
    });
  }

  function choosePoForInvoice(poId: string) {
    setEditingInvoiceId(null);
    const po = purchaseOrders.find((item) => item.id === poId);
    setInvoiceForm({
      ...emptyInvoice,
      po_id: poId,
      invoice_number: nextNumber("INV"),
      currency: po?.currency || "AZN",
    });
    setInvoiceDraftLines(buildInvoiceLines(poId));
    setTab("invoices");
  }

  function editInvoice(invoice: Row) {
    setEditingInvoiceId(invoice.id);
    setInvoiceForm({
      po_id: invoice.po_id || "",
      invoice_number: invoice.invoice_number || "",
      invoice_date: invoice.invoice_date || today(),
      due_date: invoice.due_date || "",
      currency: invoice.currency || "AZN",
      match_notes: invoice.match_notes || "",
    });
    setInvoiceDraftLines(invoice.po_id ? buildInvoiceLines(invoice.po_id, invoice.id) : []);
    setTab("invoices");
  }

  async function saveInvoice(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!invoiceForm.po_id || !invoiceForm.invoice_number.trim()) {
      setError("PO və faktura nömrəsi tələb olunur.");
      return;
    }
    const po = purchaseOrders.find((item) => item.id === invoiceForm.po_id);
    if (!po) {
      setError("PO tapılmadı.");
      return;
    }
    const items = invoiceDraftLines
      .filter((line) => toNumber(line.qty_invoiced) > 0 && toNumber(line.unit_price) >= 0)
      .map((line) => ({
        po_line_id: line.po_line_id,
        qty_invoiced: toNumber(line.qty_invoiced),
        unit_price: toNumber(line.unit_price),
        tax_rate: toNumber(line.tax_rate),
      }));
    if (!items.length) {
      setError("Faktura üçün ən azı bir sətir tələb olunur.");
      return;
    }
    setSaving(true);
    // Header and lines in one transaction (save_vendor_invoice): a failed line insert no longer leaves an
    // invoice without lines. created_by is set on insert only.
    const { data: saved, error: saveError } = await supabase.rpc("save_vendor_invoice", {
      _tenant_id: tenantId!,
      _invoice_id: editingInvoiceId as string,
      _header: {
        vendor_id: po.vendor_id,
        po_id: po.id,
        invoice_number: invoiceForm.invoice_number.trim(),
        invoice_date: invoiceForm.invoice_date || today(),
        due_date: invoiceForm.due_date || null,
        currency: invoiceForm.currency || po.currency || "AZN",
        match_notes: invoiceForm.match_notes.trim() || null,
      },
      _lines: items,
    });
    if (saveError) {
      setError(getError(saveError));
      setSaving(false);
      return;
    }
    const invoiceId = (saved as { invoice_id?: string } | null)?.invoice_id || editingInvoiceId;
    if (!await runMatch(invoiceId!, false)) {
      setEditingInvoiceId(invoiceId);
      setSaving(false);
      return;
    }
    setNotice(editingInvoiceId ? "Faktura yeniləndi və 3-way match hesablandı." : "Faktura yaradıldı və 3-way match hesablandı.");
    resetInvoiceForm();
    setSaving(false);
  }

  async function runMatch(invoiceId: string, withNotice = true) {
    const [{ data: rows, error: evalError }, { error: applyError }] = await Promise.all([
      supabase.rpc("evaluate_invoice_match", { _invoice_id: invoiceId }),
      supabase.rpc("apply_invoice_match", { _invoice_id: invoiceId }),
    ]);
    if (evalError || applyError) {
      setError(getError(evalError || applyError));
      return false;
    }
    setMatchRows((current) => ({ ...current, [invoiceId]: rows || [] }));
    if (withNotice) setNotice("3-way match yeniləndi.");
    await load();
    return true;
  }

  async function updateInvoiceStatus(invoiceId: string, status: keyof typeof INVOICE_STATUS) {
    if (status === "paid") throw new Error("Invoice payment requires the server command");
    setSaving(true);
    const { error: invoiceError } = await supabase.from("vendor_invoices").update({ status }).eq("id", invoiceId);
    if (invoiceError) setError(getError(invoiceError));
    else {
      setNotice(`Faktura statusu dəyişdi: ${INVOICE_STATUS[status]?.label || status}.`);
      await load();
    }
    setSaving(false);
  }

  async function deleteInvoice(invoice: Row) {
    if (invoice.status === "paid") {
      setError("Ödənilmiş fakturanı silmək olmaz. Lazımdırsa əvvəl ödəniş düzəlişi aparılmalıdır.");
      return;
    }
    if (!(await appConfirm(`${invoice.invoice_number} fakturasını silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: invoiceError } = await supabase.from("vendor_invoices").delete().eq("id", invoice.id);
    if (invoiceError) setError(getError(invoiceError));
    else {
      setNotice("Faktura silindi.");
      await load();
    }
    setSaving(false);
  }

  return {
    invoiceForm, setInvoiceForm, invoiceDraftLines, setInvoiceDraftLines, editingInvoiceId, matchRows,
    resetInvoiceForm, buildInvoiceLines, choosePoForInvoice, editInvoice, saveInvoice, runMatch, updateInvoiceStatus, deleteInvoice,
  };
}
