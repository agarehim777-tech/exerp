import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Input, Select } from "../../../shared/ui/primitives.tsx";

export function StockIntakeModal({ warehouses, products = [], onClose, onSubmit }) {
  const [values, setValues] = useState({ warehouseId: warehouses[0]?.id || "", product: "", qty: 1, price: 0 });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head"><div><h2>İlkin mədaxil</h2><p>İlk məhsulu seçilmiş anbara daxil edin. Məhsul avtomatik ümumi stokda da görünəcək.</p></div><Button variant="ghost" className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></Button></div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }} className="modal-form">
          <label className="full"><span>Anbar</span><Select value={values.warehouseId} required onChange={(event) => updateValue("warehouseId", event.target.value)}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.city}</option>)}</Select></label>
          <label className="full"><span>Məhsul adı</span>{products.length > 0 ? (
            <Select value={values.product} required onChange={(event) => { const selected = products.find((product) => product.name === event.target.value); setValues((current) => ({ ...current, product: event.target.value, price: selected?.salePrice ?? current.price })); }}><option value="">Məhsul seçin</option>{products.filter((product) => product.status !== "Passiv").map((product) => <option key={product.id} value={product.name}>{product.sku} · {product.name}</option>)}</Select>
          ) : <Input value={values.product} required onChange={(event) => updateValue("product", event.target.value)} />}</label>
          <label><span>Miqdar</span><Input type="number" min="1" value={values.qty} required onChange={(event) => updateValue("qty", event.target.value)} /></label>
          <label><span>Satış qiyməti</span><Input type="number" min="0" step="0.01" value={values.price} required onChange={(event) => updateValue("price", event.target.value)} /></label>
          <div className="modal-actions"><Button variant="secondary" type="button"  onClick={onClose}>Ləğv et</Button><Button variant="primary" type="submit" ><Plus size={16} /> Mədaxil et</Button></div>
        </form>
      </div>
    </div>
  );
}
