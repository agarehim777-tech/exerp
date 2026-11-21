// PO əməliyyatları: formanın sıfırlanması, sətirdə məhsul seçimi, PO-nun atomik yaddaşa yazılması (save_purchase_order RPC:
// başlıq və sətirlər bir tranzaksiyada, mədaxil/faktura olan sətirlər qorunur), redaktəyə açma, status dəyişikliyi,
// qəbullara görə statusun yenidən hesablanması və silinmə. PO forma state-i səhifədə qalır (RFQ-dan PO-ya çevirmə də onu
// doldurur), ona görə state və setter-lər parametr kimi gəlir. ProcurementPage.jsx PO məntiqini buradan alır.
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { supabase } from "../../integrations/supabase/client";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { PO_STATUS as PO_STATUS_LABELS, emptyPo, emptyPoLine, getError, nextNumber, toNumber, today } from "./procurementShared.jsx";

type Row = Record<string, any>;

const PO_STATUS = PO_STATUS_LABELS as Record<string, { label: string; tone: string } | undefined>;

export function usePoActions({
  tenantId, user, products, goodsReceipts, invoices, receiptLines, linesByPo,
  poForm, poDraftLines, editingPoId, setPoForm, setPoDraftLines, setEditingPoId,
  load, setError, setNotice, setSaving, setTab,
}: {
  tenantId: string | null | undefined;
  user: { id?: string } | null | undefined;
  products: Row[];
  goodsReceipts: Row[];
  invoices: Row[];
  receiptLines: Row[];
  linesByPo: Map<unknown, Row[]>;
  poForm: Row;
  poDraftLines: Row[];
  editingPoId: string | null;
  setPoForm: (form: Row) => void;
  setPoDraftLines: Dispatch<SetStateAction<Row[]>>;
  setEditingPoId: (id: string | null) => void;
  load: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
  setTab: (tab: string) => void;
}) {
  function resetPoForm() {
    setEditingPoId(null);
    setPoForm({ ...emptyPo, po_number: nextNumber("PO") });
    setPoDraftLines([{ ...emptyPoLine }]);
  }

  function setProductOnLine(index: number, sku: string) {
    const product = products.find((item) => item.sku === sku);
    setPoDraftLines((lines: Row[]) =>
      lines.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              product_id: product?.id || line.product_id || "",
              product_sku: sku,
              description: product?.name || line.description,
              unit_price: product ? String(product.price || 0) : line.unit_price,
            }
          : line,
      ),
    );
  }

  async function savePo(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!poForm.vendor_id || !poForm.po_number.trim()) {
      setError("Təchizatçı və PO nömrəsi tələb olunur.");
      return;
    }
    const validLines = poDraftLines
      .filter((line) => line.product_sku.trim() && toNumber(line.qty_ordered) > 0 && toNumber(line.unit_price) >= 0)
      .map((line, index) => ({
        line_no: index + 1,
        product_sku: line.product_sku.trim(),
        description: line.description.trim() || null,
        qty_ordered: toNumber(line.qty_ordered),
        unit_price: toNumber(line.unit_price),
        tax_rate: 0,
        product_id: line.product_id || null,
        unit: line.unit || "ədəd",
      }));
    if (!validLines.length) {
      setError("PO üçün ən azı bir məhsul sətri tələb olunur.");
      return;
    }

    setSaving(true);
    const payload = {
      vendor_id: poForm.vendor_id,
      po_number: poForm.po_number.trim(),
      order_date: poForm.order_date || today(),
      expected_date: poForm.expected_date || null,
      currency: poForm.currency || "AZN",
      factory_name: poForm.factory_name?.trim() || null,
      exchange_rate: toNumber(poForm.exchange_rate) || 1,
      payment_terms: poForm.payment_terms?.trim() || null,
      notes: poForm.notes.trim() || null,
      created_by: user?.id || null,
    };

    // Header and lines are saved in one transaction (save_purchase_order); lines that already have
    // receipts or vendor invoices are kept and only the header changes.
    const { data: saved, error: saveError } = await supabase.rpc("save_purchase_order", {
      _tenant_id: tenantId!,
      // NULL creates a new PO; generated types declare every uuid argument as non-null.
      _po_id: (editingPoId || null) as string,
      _header: payload,
      _lines: validLines,
    });
    if (saveError) {
      setError(getError(saveError));
      setSaving(false);
      return;
    }
    if (editingPoId) {
      setNotice((saved as { lines_replaced?: boolean } | null)?.lines_replaced === false ? "PO başlığı yeniləndi. Mədaxil/faktura olan PO sətirləri qorundu." : "PO yeniləndi.");
    } else {
      setNotice("PO yaradıldı və qaralama statusunda saxlanıldı.");
    }

    resetPoForm();
    await load();
    setSaving(false);
  }

  function editPo(po: Row) {
    const lines = linesByPo.get(po.id) || [];
    setEditingPoId(po.id);
    setPoForm({
      vendor_id: po.vendor_id,
      po_number: po.po_number || "",
      order_date: po.order_date || today(),
      expected_date: po.expected_date || "",
      currency: po.currency || "AZN",
      factory_name: po.factory_name || "",
      exchange_rate: String(po.exchange_rate || 1),
      payment_terms: po.payment_terms || "",
      notes: po.notes || "",
    });
    setPoDraftLines(
      lines.length
        ? lines.map((line) => ({
            product_sku: line.product_sku || "",
            description: line.description || "",
            qty_ordered: String(line.qty_ordered || ""),
            unit_price: String(line.unit_price || ""),
            tax_rate: String(line.tax_rate || 0),
            product_id: line.product_id || "",
            unit: line.unit || "ədəd",
            unit_volume_m3: String(line.unit_volume_m3 || 0),
            unit_net_weight_kg: String(line.unit_net_weight_kg || 0),
            unit_gross_weight_kg: String(line.unit_gross_weight_kg || 0),
            hs_code: line.hs_code || "",
            duty_rate: String(line.duty_rate || 0),
          }))
        : [{ ...emptyPoLine }],
    );
    setTab("po");
  }

  async function updatePoStatus(poId: string, status: any) {
    setSaving(true);
    const { error: statusError } = await supabase.from("purchase_orders").update({ status }).eq("id", poId);
    if (statusError) setError(getError(statusError));
    else {
      setNotice(`PO statusu dəyişdi: ${PO_STATUS[status]?.label || status}.`);
      await load();
    }
    setSaving(false);
  }

  async function recomputePoStatus(poId: string, sourceReceiptLines: Row[] = receiptLines) {
    const lines = linesByPo.get(poId) || [];
    if (!lines.length) return;
    const map = new Map<unknown, number>();
    sourceReceiptLines.forEach((line) => {
      const accepted = Math.max(0, toNumber(line.qty_received) - toNumber(line.qty_rejected));
      map.set(line.po_line_id, (map.get(line.po_line_id) || 0) + accepted);
    });
    const anyReceived = lines.some((line) => (map.get(line.id) || 0) > 0);
    const allReceived = lines.every((line) => (map.get(line.id) || 0) >= toNumber(line.qty_ordered));
    const nextStatus = allReceived ? "received" : anyReceived ? "partial" : "approved";
    await supabase.from("purchase_orders").update({ status: nextStatus }).eq("id", poId);
  }

  async function deletePo(po: Row) {
    const hasReceipts = goodsReceipts.some((receipt) => receipt.po_id === po.id);
    const hasInvoices = invoices.some((invoice) => invoice.po_id === po.id);
    if (hasReceipts || hasInvoices) {
      setError("Bu PO üzrə mədaxil və ya faktura var. Silmək əvəzinə ləğv edin/bağlayın.");
      return;
    }
    if (!(await appConfirm(`${po.po_number} PO-sunu silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: poError } = await supabase.from("purchase_orders").delete().eq("id", po.id);
    if (poError) setError(getError(poError));
    else {
      setNotice("PO silindi.");
      await load();
    }
    setSaving(false);
  }

  return { resetPoForm, setProductOnLine, savePo, editPo, updatePoStatus, recomputePoStatus, deletePo };
}
