import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { ProgressRow, TwoLine } from "../../../components/ui.jsx";
import { formatDateInput } from "../../../services/date.js";
import { money } from "../../../services/format.js";
import { addDays } from "../../../shared/lib/credit.js";
import {
  currentBusinessDate,
  normalizeVendor,
} from "../../../shared/lib/appDomain.jsx";
import { getProductProcurementSnapshot } from "../services/procurementCalculations.js";

export function VendorFormModal({ vendor, onClose, onSubmit, onDelete }) {
  const normalizedVendor = normalizeVendor(vendor || {});
  const [values, setValues] = useState({
    name: vendor?.name || "", country: vendor?.country || "", sku: vendor?.sku ?? 0,
    quota: vendor?.quota ?? 0, sold: vendor?.sold ?? 0, status: vendor?.status || "Aktiv",
    contact: vendor?.contact || "", phone: vendor?.phone || "", email: vendor?.email || "",
    leadTimeDays: vendor?.leadTimeDays ?? 14, paymentTerms: vendor?.paymentTerms || "30 gün", note: vendor?.note || "",
  });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true"><div className="modal-card vendor-form-modal">
      <div className="modal-head"><div><h2>{vendor ? "Vendoru redaktə et" : "Yeni vendor"}</h2><p>Vendor məlumatları, kontakt, kvota və təchizat şərtlərini bir yerdə idarə edin.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
      {vendor && <div className="vendor-form-summary"><TwoLine title={normalizedVendor.name} subtitle={`${normalizedVendor.country} · ${normalizedVendor.sku} SKU`} /><ProgressRow value={normalizedVendor.quota > 0 ? (normalizedVendor.sold / normalizedVendor.quota) * 100 : 0} caption={`${normalizedVendor.sold}/${normalizedVendor.quota} kvota`} compact /></div>}
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }} className="modal-form">
        <label><span>Vendor adı</span><input value={values.name} required autoFocus onChange={(event) => updateValue("name", event.target.value)} /></label>
        <label><span>Ölkə</span><input value={values.country} required onChange={(event) => updateValue("country", event.target.value)} /></label>
        <label><span>SKU sayı</span><input type="number" min="0" value={values.sku} required onChange={(event) => updateValue("sku", event.target.value)} /></label>
        <label><span>Kvota</span><input type="number" min="0" value={values.quota} required onChange={(event) => updateValue("quota", event.target.value)} /></label>
        <label><span>Satılıb</span><input type="number" min="0" value={values.sold} onChange={(event) => updateValue("sold", event.target.value)} /></label>
        <label><span>Status</span><select value={values.status} onChange={(event) => updateValue("status", event.target.value)}><option>Aktiv</option><option>Nəzarət</option><option>Risk</option><option>Passiv</option></select></label>
        <label><span>Kontakt şəxs</span><input value={values.contact} onChange={(event) => updateValue("contact", event.target.value)} /></label>
        <label><span>Telefon</span><input value={values.phone} onChange={(event) => updateValue("phone", event.target.value)} /></label>
        <label><span>Email</span><input type="email" value={values.email} onChange={(event) => updateValue("email", event.target.value)} /></label>
        <label><span>Lead time, gün</span><input type="number" min="0" value={values.leadTimeDays} onChange={(event) => updateValue("leadTimeDays", event.target.value)} /></label>
        <label className="full"><span>Ödəniş şərti</span><input value={values.paymentTerms} onChange={(event) => updateValue("paymentTerms", event.target.value)} /></label>
        <label className="full"><span>Qeyd</span><input value={values.note} placeholder="Müqavilə, servis, çatdırılma və ya keyfiyyət qeydi" onChange={(event) => updateValue("note", event.target.value)} /></label>
        <div className="modal-actions vendor-modal-actions">{onDelete && <button type="button" className="secondary-btn danger-outline" onClick={onDelete}><Trash2 size={16} /> Sil</button>}<button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Check size={16} /> Yadda saxla</button></div>
      </form>
    </div></div>
  );
}

export function FactoryPurchaseOrderModal({ vendors = [], warehouses = [], products = [], warehouseStock = {}, purchaseOrders = [], onClose, onSubmit }) {
  const productOptions = products.filter((product) => product.status !== "Passiv");
  const firstProduct = productOptions[0] || null;
  const initialSnapshot = getProductProcurementSnapshot(firstProduct?.name || "", warehouseStock, products, purchaseOrders);
  const [values, setValues] = useState({
    product: firstProduct?.name || "", vendor: vendors[0]?.name || "", supplierSource: vendors[0]?.name || "",
    warehouseId: warehouses[0]?.id || "", qty: Math.max(1, initialSnapshot.orderGap || initialSnapshot.suggestedQty || 1),
    unitCost: Number(firstProduct?.costPrice || 0), salePrice: Number(firstProduct?.salePrice || firstProduct?.costPrice || 0),
    expectedAt: formatDateInput(addDays(currentBusinessDate, 14)), note: "",
  });
  const snapshot = getProductProcurementSnapshot(values.product, warehouseStock, products, purchaseOrders);
  const amount = Math.max(0, Math.round(Number(values.qty || 0) * Number(values.unitCost || 0)));
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  function selectProduct(productName) {
    const nextProduct = products.find((product) => product.name === productName);
    const nextSnapshot = getProductProcurementSnapshot(productName, warehouseStock, products, purchaseOrders);
    setValues((current) => ({ ...current, product: productName, qty: Math.max(1, nextSnapshot.orderGap || nextSnapshot.suggestedQty || current.qty || 1), unitCost: Number(nextProduct?.costPrice || current.unitCost || 0), salePrice: Number(nextProduct?.salePrice || current.salePrice || nextProduct?.costPrice || 0) }));
  }

  function submit(event) {
    event.preventDefault();
    const saved = onSubmit({ ...values, qty: Number(values.qty || 0), unitCost: Number(values.unitCost || 0), salePrice: Number(values.salePrice || 0), amount, available: snapshot.available, reorderPoint: snapshot.reorderPoint, orderGap: snapshot.orderGap || Number(values.qty || 0), procurementType: "Zavod sifarişi" });
    if (saved !== false) onClose();
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true"><div className="modal-card factory-order-modal">
      <div className="modal-head"><div><h2>Zavod sifarişi yarat</h2><p>Məhsulun haradan alındığını, sayını, alış qiymətini və gözlənən mədaxil tarixini qeyd edin.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
      <form onSubmit={submit} className="modal-form">
        <label className="full"><span>Məhsul</span><select value={values.product} required onChange={(event) => selectProduct(event.target.value)}><option value="">Məhsul seçin</option>{productOptions.map((product) => <option key={product.id} value={product.name}>{product.sku} · {product.name}</option>)}</select></label>
        <div className="factory-order-snapshot full"><div><span>Satış üçün</span><strong>{snapshot.available}</strong></div><div><span>Minimum</span><strong>{snapshot.reorderPoint || "—"}</strong></div><div><span>Açıq sifariş</span><strong>{snapshot.orderedQty}</strong></div><div><span>Təklif</span><strong>{snapshot.orderGap || snapshot.suggestedQty || 1}</strong></div></div>
        <label><span>Haradan alınır</span><input list="factory-vendors" value={values.supplierSource} required onChange={(event) => setValues((current) => ({ ...current, supplierSource: event.target.value, vendor: event.target.value }))} /><datalist id="factory-vendors">{vendors.map((vendor) => <option key={vendor.name} value={vendor.name} />)}</datalist></label>
        <label><span>Anbar</span><select value={values.warehouseId} required onChange={(event) => updateValue("warehouseId", event.target.value)}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.city}</option>)}</select></label>
        <label><span>Miqdar</span><input type="number" min="1" value={values.qty} required onChange={(event) => updateValue("qty", event.target.value)} /></label>
        <label><span>Alış qiyməti</span><input type="number" min="0" step="0.01" value={values.unitCost} required onChange={(event) => updateValue("unitCost", event.target.value)} /></label>
        <label><span>Stok/satış qiyməti</span><input type="number" min="0" step="0.01" value={values.salePrice} required onChange={(event) => updateValue("salePrice", event.target.value)} /></label>
        <label><span>Gözlənən tarix</span><input type="date" value={values.expectedAt} onChange={(event) => updateValue("expectedAt", event.target.value)} /></label>
        <label className="full"><span>Qeyd</span><input value={values.note} placeholder="Zavod partiyası, invoice və ya çatdırılma qeydi" onChange={(event) => updateValue("note", event.target.value)} /></label>
        <div className="factory-order-total full"><span>Toplam alış məbləği</span><strong>{money(amount)}</strong></div>
        <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Plus size={16} /> PO yarat</button></div>
      </form>
    </div></div>
  );
}
