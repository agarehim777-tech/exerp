import { useState } from "react";
import { Plus, X } from "lucide-react";

export function StockIntakeModal({ warehouses, products = [], onClose, onSubmit }) {
  const [values, setValues] = useState({ warehouseId: warehouses[0]?.id || "", product: "", qty: 1, price: 0 });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head"><div><h2>İlkin mədaxil</h2><p>İlk məhsulu seçilmiş anbara daxil edin. Məhsul avtomatik ümumi stokda da görünəcək.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }} className="modal-form">
          <label className="full"><span>Anbar</span><select value={values.warehouseId} required onChange={(event) => updateValue("warehouseId", event.target.value)}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.city}</option>)}</select></label>
          <label className="full"><span>Məhsul adı</span>{products.length > 0 ? (
            <select value={values.product} required onChange={(event) => { const selected = products.find((product) => product.name === event.target.value); setValues((current) => ({ ...current, product: event.target.value, price: selected?.salePrice ?? current.price })); }}><option value="">Məhsul seçin</option>{products.filter((product) => product.status !== "Passiv").map((product) => <option key={product.id} value={product.name}>{product.sku} · {product.name}</option>)}</select>
          ) : <input value={values.product} required onChange={(event) => updateValue("product", event.target.value)} />}</label>
          <label><span>Miqdar</span><input type="number" min="1" value={values.qty} required onChange={(event) => updateValue("qty", event.target.value)} /></label>
          <label><span>Satış qiyməti</span><input type="number" min="0" step="0.01" value={values.price} required onChange={(event) => updateValue("price", event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Plus size={16} /> Mədaxil et</button></div>
        </form>
      </div>
    </div>
  );
}
