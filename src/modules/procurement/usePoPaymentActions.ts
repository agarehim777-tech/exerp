// PO ödənişləri (köhnə po_payments cədvəli, yalnız poPaymentsAvailable olanda): ödəniş formasını açma, redaktə,
// yaddaşa yazma və silmə. Ödəniş açılanda/redaktə olunanda PO kartı da açılır (setExpandedPo səhifədən gəlir).
// ProcurementPage.jsx səhifənin ortaq setter-lərini ötürür; ödəniş məntiqini burada dəyişin.
import { useState, type FormEvent } from "react";
import { supabase } from "../../integrations/supabase/client";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { emptyPoPayment, getError, toNumber, today } from "./procurementShared.jsx";

type Row = Record<string, any>;

export function usePoPaymentActions({ tenantId, user, poPaymentsAvailable, setExpandedPo, load, setError, setNotice, setSaving }: {
  tenantId: string | null | undefined;
  user: { id?: string } | null | undefined;
  poPaymentsAvailable: boolean;
  setExpandedPo: (poId: string | null) => void;
  load: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
}) {
  const [paymentPoId, setPaymentPoId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<Row>(emptyPoPayment);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  function openPaymentForm(po: Row) {
    if (!poPaymentsAvailable) return;
    setPaymentPoId(po.id);
    setEditingPaymentId(null);
    setPaymentForm({ ...emptyPoPayment, po_id: po.id, payment_date: today() });
    setExpandedPo(po.id);
  }

  function editPayment(payment: Row) {
    setPaymentPoId(payment.po_id);
    setEditingPaymentId(payment.id);
    setPaymentForm({
      po_id: payment.po_id,
      amount: String(payment.amount || ""),
      payment_date: payment.payment_date || today(),
      payment_method: payment.payment_method || "bank",
      reference_no: payment.reference_no || "",
      notes: payment.notes || "",
    });
    setExpandedPo(payment.po_id);
  }

  async function savePoPayment(event: FormEvent) {
    event.preventDefault();
    if (!poPaymentsAvailable) {
      setError("Satınalma ödənişləri bağlıdır. Server ledger ödəniş komandası tətbiq edilməlidir.");
      return;
    }
    if (!paymentForm.po_id || toNumber(paymentForm.amount) <= 0) {
      setError("PO və ödəniş məbləği tələb olunur.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      po_id: paymentForm.po_id,
      amount: toNumber(paymentForm.amount),
      payment_date: paymentForm.payment_date || today(),
      payment_method: paymentForm.payment_method?.trim() || "bank",
      reference_no: paymentForm.reference_no?.trim() || null,
      notes: paymentForm.notes?.trim() || null,
    };
    const { error: paymentError } = editingPaymentId
      ? await supabase.from("po_payments").update(payload).eq("id", editingPaymentId)
      : await supabase.from("po_payments").insert({ ...payload, tenant_id: tenantId!, created_by: user?.id || null });
    if (paymentError) setError(getError(paymentError));
    else {
      setNotice(editingPaymentId ? "Ödəniş yeniləndi." : "PO ödənişi qeyd edildi.");
      setPaymentForm(emptyPoPayment);
      setEditingPaymentId(null);
      setPaymentPoId(null);
      await load();
    }
    setSaving(false);
  }

  async function deletePayment(payment: Row) {
    if (!poPaymentsAvailable) return;
    if (!(await appConfirm("Bu ödənişi silmək istəyirsiniz?", { danger: true }))) return;
    setSaving(true);
    const { error: paymentError } = await supabase.from("po_payments").delete().eq("id", payment.id);
    if (paymentError) setError(getError(paymentError));
    else {
      setNotice("Ödəniş silindi.");
      await load();
    }
    setSaving(false);
  }

  return { paymentPoId, paymentForm, setPaymentForm, editingPaymentId, openPaymentForm, editPayment, savePoPayment, deletePayment };
}
