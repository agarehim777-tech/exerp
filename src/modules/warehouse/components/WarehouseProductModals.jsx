import { useState } from "react";
import { Check, Trash2, X } from "lucide-react";

export function WarehouseFormModal({ mode, warehouse, onClose, onSubmit }) {
  const [values, setValues] = useState({
    code: warehouse?.code || "",
    name: warehouse?.name || "",
    city: warehouse?.city || "",
    address: warehouse?.address || "",
    manager: warehouse?.manager || "",
    type: warehouse?.type || "Regional",
    capacity: warehouse?.capacity || 100,
    status: warehouse?.status || "Aktiv",
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{mode === "edit" ? "Anbarı redaktə et" : "Yeni anbar yarat"}</h2>
            <p>Anbar adı, kodu, ünvanı, məsul şəxsi və tutum məlumatlarını daxil edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>Anbar kodu</span>
            <input value={values.code} required onChange={(event) => updateValue("code", event.target.value)} />
          </label>
          <label>
            <span>Anbar adı</span>
            <input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} />
          </label>
          <label>
            <span>Şəhər</span>
            <input value={values.city} required onChange={(event) => updateValue("city", event.target.value)} />
          </label>
          <label>
            <span>Məsul şəxs</span>
            <input value={values.manager} required onChange={(event) => updateValue("manager", event.target.value)} />
          </label>
          <label>
            <span>Növ</span>
            <select value={values.type} onChange={(event) => updateValue("type", event.target.value)}>
              <option>Mərkəzi</option>
              <option>Regional</option>
              <option>Təhvil</option>
              <option>Servis</option>
            </select>
          </label>
          <label>
            <span>Tutum</span>
            <input type="number" min="0" value={values.capacity} required onChange={(event) => updateValue("capacity", event.target.value)} />
          </label>
          <label>
            <span>Status</span>
            <select value={values.status} onChange={(event) => updateValue("status", event.target.value)}>
              <option>Aktiv</option>
              <option>Passiv</option>
              <option>Təmir</option>
            </select>
          </label>
          <label className="full">
            <span>Ünvan</span>
            <input value={values.address} required onChange={(event) => updateValue("address", event.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn">{mode === "edit" ? "Yadda saxla" : "Anbar yarat"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProductFormModal({ product, onClose, onSubmit, onDelete }) {
  const [values, setValues] = useState({
    name: product?.name || "",
    sku: product?.sku || "",
    category: product?.category || "Elektronika",
    unit: product?.unit || "ədəd",
    costPrice: product?.costPrice || 0,
    salePrice: product?.salePrice || 0,
    reorderLevel: product?.reorderLevel || 0,
    serialTracked: product?.serialTracked ? "Bəli" : "Xeyr",
  });

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head">
          <div>
            <h2>{product ? "Məhsulu redaktə et" : "Yeni məhsul"}</h2>
            <p>SKU, qiymət, minimum stok və serial izləmə qaydasını təyin edin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label>
            <span>Məhsul adı</span>
            <input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} />
          </label>
          <label>
            <span>SKU</span>
            <input value={values.sku} required onChange={(event) => updateValue("sku", event.target.value)} />
          </label>
          <label>
            <span>Kateqoriya</span>
            <select value={values.category} onChange={(event) => updateValue("category", event.target.value)}>
              <option>Elektronika</option>
              <option>Məişət texnikası</option>
              <option>Aksesuar</option>
              <option>Xidmət</option>
              <option>Digər</option>
            </select>
          </label>
          <label>
            <span>Ölçü vahidi</span>
            <select value={values.unit} onChange={(event) => updateValue("unit", event.target.value)}>
              <option>ədəd</option>
              <option>qutu</option>
              <option>kg</option>
              <option>metr</option>
              <option>litr</option>
            </select>
          </label>
          <label>
            <span>Minimum stok</span>
            <input type="number" min="0" value={values.reorderLevel} onChange={(event) => updateValue("reorderLevel", event.target.value)} />
          </label>
          <label>
            <span>Alış qiyməti</span>
            <input type="number" min="0" step="0.01" value={values.costPrice} onChange={(event) => updateValue("costPrice", event.target.value)} />
          </label>
          <label>
            <span>Satış qiyməti</span>
            <input type="number" min="0" step="0.01" value={values.salePrice} onChange={(event) => updateValue("salePrice", event.target.value)} />
          </label>
          <label className="full">
            <span>IMEI / serial izləmə</span>
            <select value={values.serialTracked} onChange={(event) => updateValue("serialTracked", event.target.value)}>
              <option>Bəli</option>
              <option>Xeyr</option>
            </select>
          </label>
          <div className="modal-actions">
            {onDelete && (
              <button type="button" className="secondary-btn danger-outline" onClick={onDelete}>
                <Trash2 size={16} /> Sil
              </button>
            )}
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn">
              <Check size={16} />
              {product ? "Yadda saxla" : "Məhsul yarat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
