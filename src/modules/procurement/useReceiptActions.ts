// Mal qəbulu (GRN): PO seçəndə qəbul sətirlərini qurma, redaktə, yaddaşa yazma və silmə. Başlıq, sətirlər və PO
// statusu bir tranzaksiyada save_goods_receipt RPC ilə yazılır; silmədən sonra PO statusu recomputePoStatus ilə hesablanır.
// ProcurementPage.jsx səhifənin ortaq setter-lərini ötürür; GRN məntiqini burada dəyişin.
import { useState, type FormEvent } from "react";
import { supabase } from "../../integrations/supabase/client";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { emptyReceipt, getError, nextNumber, toNumber, today } from "./procurementShared.jsx";

type Row = Record<string, any>;

export function useReceiptActions({
  tenantId, user, purchaseOrders, receiptLines, linesByPo, receiptLinesByReceipt, acceptedByLine, recomputePoStatus,
  load, setError, setNotice, setSaving, setTab,
}: {
  tenantId: string | null | undefined;
  user: { id?: string } | null | undefined;
  purchaseOrders: Row[];
  receiptLines: Row[];
  linesByPo: Map<string, Row[]>;
  receiptLinesByReceipt: Map<string, Row[]>;
  acceptedByLine: Map<unknown, number>;
  recomputePoStatus: (poId: string, nextReceiptLines: Row[]) => Promise<unknown>;
  load: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
  setTab: (tab: string) => void;
}) {
  const [receiptForm, setReceiptForm] = useState<Row>({ ...emptyReceipt, grn_number: nextNumber("GRN") });
  const [receiptDraftLines, setReceiptDraftLines] = useState<Row[]>([]);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);

  function resetReceiptForm() {
    setEditingReceiptId(null);
    setReceiptForm({ ...emptyReceipt, grn_number: nextNumber("GRN") });
    setReceiptDraftLines([]);
  }

  function buildReceiptLines(poId: string, receiptId: string | null = null) {
    const sourceLines = linesByPo.get(poId) || [];
    const existing = receiptId ? receiptLinesByReceipt.get(receiptId) || [] : [];
    return sourceLines.map((line) => {
      const existingLine = existing.find((item) => item.po_line_id === line.id);
      const accepted = acceptedByLine.get(line.id) || 0;
      const editAccepted = existingLine ? Math.max(0, toNumber(existingLine.qty_received) - toNumber(existingLine.qty_rejected)) : 0;
      const outstanding = Math.max(0, toNumber(line.qty_ordered) - accepted + editAccepted);
      return {
        po_line_id: line.id,
        label: `${line.product_sku}${line.description ? ` · ${line.description}` : ""}`,
        ordered: line.qty_ordered,
        outstanding,
        qty_received: existingLine ? String(existingLine.qty_received) : String(outstanding || ""),
        qty_rejected: existingLine ? String(existingLine.qty_rejected || 0) : "0",
        unit_volume_m3: existingLine ? String(existingLine.unit_volume_m3 || 0) : "",
      };
    });
  }

  function choosePoForReceipt(poId: string) {
    const po = purchaseOrders.find((item) => item.id === poId);
    if (!po) return;
    setEditingReceiptId(null);
    setReceiptForm({ ...emptyReceipt, po_id: poId, grn_number: nextNumber("GRN") });
    setReceiptDraftLines(buildReceiptLines(poId));
    setTab("grn");
  }

  function editReceipt(receipt: Row) {
    setEditingReceiptId(receipt.id);
    setReceiptForm({
      po_id: receipt.po_id,
      grn_number: receipt.grn_number || "",
      receipt_date: receipt.receipt_date || today(),
      notes: receipt.notes || "",
    });
    setReceiptDraftLines(buildReceiptLines(receipt.po_id, receipt.id));
    setTab("grn");
  }

  async function saveReceipt(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!receiptForm.po_id || !receiptForm.grn_number.trim()) {
      setError("PO və GRN nömrəsi tələb olunur.");
      return;
    }
    const invalidLine = receiptDraftLines.find((line) => {
      const received = toNumber(line.qty_received);
      const rejected = toNumber(line.qty_rejected);
      return received < 0 || rejected < 0 || rejected > received || received > toNumber(line.outstanding) + 0.000001 || (received > rejected && toNumber(line.unit_volume_m3) <= 0);
    });
    if (invalidLine) {
      setError(`${invalidLine.label}: miqdarları yoxlayın və mədaxil edilən məhsul üçün vahid həcmi daxil edin.`);
      return;
    }
    const items = receiptDraftLines
      .filter((line) => toNumber(line.qty_received) > 0)
      .map((line) => ({
        po_line_id: line.po_line_id,
        qty_received: toNumber(line.qty_received),
        qty_rejected: toNumber(line.qty_rejected),
        unit_volume_m3: toNumber(line.unit_volume_m3),
      }));
    if (!items.length) {
      setError("Ən azı bir mədaxil sətri tələb olunur.");
      return;
    }
    setSaving(true);
    // Header, lines and the PO status in one transaction: a failed line insert no longer leaves an empty GRN.
    const { error: saveError } = await supabase.rpc("save_goods_receipt", {
      _tenant_id: tenantId!,
      _grn_id: editingReceiptId as string,
      _header: {
        po_id: receiptForm.po_id,
        grn_number: receiptForm.grn_number.trim(),
        receipt_date: receiptForm.receipt_date || today(),
        notes: receiptForm.notes.trim() || null,
      },
      _lines: items,
    });
    if (saveError) {
      setError(getError(saveError));
      setSaving(false);
      return;
    }
    setNotice(editingReceiptId ? "GRN yeniləndi və PO statusu hesablandı." : "Mədaxil qeyd edildi və PO statusu hesablandı.");
    resetReceiptForm();
    await load();
    setSaving(false);
  }

  async function deleteReceipt(receipt: Row) {
    if (!(await appConfirm(`${receipt.grn_number} GRN qeydini silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: receiptError } = await supabase.from("goods_receipts").delete().eq("id", receipt.id);
    if (receiptError) setError(getError(receiptError));
    else {
      const statusError = await recomputePoStatus(receipt.po_id, receiptLines.filter((line) => line.grn_id !== receipt.id));
      if (statusError) setError(`GRN silindi, amma PO statusu yenilənmədi: ${getError(statusError)}`);
      else setNotice("GRN silindi və PO statusu yeniləndi.");
      await load();
    }
    setSaving(false);
  }

  return {
    receiptForm, setReceiptForm, receiptDraftLines, setReceiptDraftLines, editingReceiptId,
    resetReceiptForm, buildReceiptLines, choosePoForReceipt, editReceipt, saveReceipt, deleteReceipt,
  };
}
