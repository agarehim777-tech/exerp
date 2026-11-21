// Focused domain commands; dependencies are explicit and supplied by App.
export function createVendorRegistryActions({ auditCurrentState, getVendorKey, isPurchaseOrderOpen, normalize, normalizeVendor, notify, requirePermission, setModal, setState, state }) {
function updateVendor(vendorKey, values) {
    if (!requirePermission("vendors.manage", "təchizatçını redaktə etmək")) return;

    const currentVendor = (state.vendors || []).find((vendor) => getVendorKey(vendor) === vendorKey);
    const nextVendor = normalizeVendor(values, currentVendor);
    if (!currentVendor || !nextVendor.name || !nextVendor.country) {
      notify("Təchizatçı adı və ölkə daxil edin.", "warning");
      return;
    }
    if ((state.vendors || []).some((vendor) => getVendorKey(vendor) !== vendorKey && normalize(vendor.name) === normalize(nextVendor.name))) {
      notify("Bu adda təchizatçı artıq mövcuddur.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          vendors: (current.vendors || []).map((vendor) => (getVendorKey(vendor) === vendorKey ? nextVendor : vendor)),
          purchaseOrders: (current.purchaseOrders || []).map((po) =>
            po.vendor === currentVendor.name
              ? {
                  ...po,
                  vendor: nextVendor.name,
                  supplierSource: po.supplierSource === currentVendor.name ? nextVendor.name : po.supplierSource,
                }
              : po,
          ),
        },
        {
          module: "Vendor",
          action: "Vendor redaktə edildi",
          detail: `${currentVendor.name} → ${nextVendor.name}`,
        },
      ),
    );
    setModal(null);
    notify(`${nextVendor.name} təchizatçı məlumatları yeniləndi.`);
  }

function deleteVendor(vendorKey) {
    if (!requirePermission("vendors.manage", "təchizatçını silmək")) return;

    const targetVendor = (state.vendors || []).find((vendor) => getVendorKey(vendor) === vendorKey);
    if (!targetVendor) return;
    const openPoCount = (state.purchaseOrders || []).filter((po) => po.vendor === targetVendor.name && isPurchaseOrderOpen(po)).length;
    if (openPoCount > 0) {
      notify("Bu təchizatçı üzrə açıq PO var. Əvvəl PO-nu təsdiqləyin və ya təchizatçını Passiv edin.", "warning");
      return;
    }

    setState((current) =>
      auditCurrentState(
        {
          ...current,
          vendors: (current.vendors || []).filter((vendor) => getVendorKey(vendor) !== vendorKey),
        },
        {
          module: "Vendor",
          action: "Vendor silindi",
          detail: targetVendor.name,
          status: "Tamamlandı",
        },
      ),
    );
    setModal(null);
    notify(`${targetVendor.name} təchizatçı reyestrindən silindi.`);
  }
return { updateVendor, deleteVendor };
}
