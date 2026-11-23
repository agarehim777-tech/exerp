// Vendor əməliyyatları: forma state-i, yaratma/yeniləmə, redaktəyə açma, aktiv/passiv etmə və silmə.
// PO tarixi olan vendor silinmir, passiv edilir. ProcurementPage.jsx səhifənin ortaq state-ini (xəta, bildiriş,
// saving, tab, reyestr və load) parametr kimi ötürür; vendor məntiqini burada dəyişin.
import { useState, type FormEvent } from "react";
import { supabase } from "../../integrations/supabase/client";
import { appConfirm } from "../../shared/ui/dialogService.js";
import { emptyVendor, getError } from "./procurementShared.jsx";

type Row = Record<string, any>;

export function useVendorActions({ tenantId, purchaseOrders, load, setError, setNotice, setSaving, setTab }: {
  tenantId: string | null | undefined;
  purchaseOrders: Row[];
  load: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
  setSaving: (saving: boolean) => void;
  setTab: (tab: string) => void;
}) {
  const [vendorForm, setVendorForm] = useState<Row>(emptyVendor);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);

  async function saveVendor(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!vendorForm.name.trim()) {
      setError("Təchizatçı adı tələb olunur.");
      return;
    }
    setSaving(true);
    const payload = {
      name: vendorForm.name.trim(),
      tax_id: vendorForm.tax_id.trim() || null,
      email: vendorForm.email.trim() || null,
      phone: vendorForm.phone.trim() || null,
      address: vendorForm.address.trim() || null,
      is_active: !!vendorForm.is_active,
    };
    const { error: vendorError } = editingVendorId
      ? await supabase.from("vendors").update(payload).eq("id", editingVendorId)
      : await supabase.from("vendors").insert({ ...payload, tenant_id: tenantId! });

    if (vendorError) setError(getError(vendorError));
    else {
      setNotice(editingVendorId ? "Təchizatçı məlumatları yeniləndi." : "Təchizatçı yaradıldı.");
      setVendorForm(emptyVendor);
      setEditingVendorId(null);
      await load();
    }
    setSaving(false);
  }

  function editVendor(vendor: Row) {
    setEditingVendorId(vendor.id);
    setVendorForm({
      name: vendor.name || "",
      tax_id: vendor.tax_id || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      address: vendor.address || "",
      is_active: vendor.is_active,
    });
    setTab("vendors");
  }

  async function toggleVendor(vendor: Row) {
    setSaving(true);
    const { error: vendorError } = await supabase.from("vendors").update({ is_active: !vendor.is_active }).eq("id", vendor.id);
    if (vendorError) setError(getError(vendorError));
    else {
      setNotice(`${vendor.name} ${vendor.is_active ? "passiv edildi" : "aktiv edildi"}.`);
      await load();
    }
    setSaving(false);
  }

  async function deleteVendor(vendor: Row) {
    const linkedPo = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
    if (linkedPo.length) {
      // The notice used to be shown before the update and regardless of its result.
      const { error: deactivateError } = await supabase.from("vendors").update({ is_active: false }).eq("id", vendor.id);
      if (deactivateError) {
        setNotice("");
        setError(getError(deactivateError));
        return;
      }
      setError("");
      setNotice("Bu təchizatçı üzrə PO tarixi var. Silmək əvəzinə passiv statusa keçirildi.");
      await load();
      return;
    }
    if (!(await appConfirm(`${vendor.name} təchizatçısını silmək istəyirsiniz?`, { danger: true }))) return;
    setSaving(true);
    const { error: vendorError } = await supabase.from("vendors").delete().eq("id", vendor.id);
    if (vendorError) setError(getError(vendorError));
    else {
      setNotice("Vendor silindi.");
      await load();
    }
    setSaving(false);
  }

  return { vendorForm, setVendorForm, editingVendorId, setEditingVendorId, saveVendor, editVendor, toggleVendor, deleteVendor };
}
