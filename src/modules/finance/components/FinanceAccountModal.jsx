import { useState } from "react";
import { Check, X } from "lucide-react";

export function FinanceAccountModal({ account, onClose, onSubmit }) {
  const [values, setValues] = useState({
    name: account?.name || "",
    code: account?.code || "",
    type: account?.type || "Kassa",
    currency: account?.currency || "AZN",
    openingBalance: account?.openingBalance || 0,
    status: account?.status || "Aktiv",
  });
  const updateValue = (field, value) => setValues((current) => ({ ...current, [field]: value }));

  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head"><div><h2>{account ? "Hesabı redaktə et" : "Yeni maliyyə hesabı"}</h2><p>Kassa və bank açılış balansını düzgün qeyd edin; bu dəyər maliyyə hesabatlarına daxil olur.</p></div><button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></button></div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }} className="modal-form">
          <label><span>Hesab adı</span><input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} /></label>
          <label><span>Hesab kodu</span><input value={values.code} required onChange={(event) => updateValue("code", event.target.value)} /></label>
          <label><span>Tip</span><select value={values.type} onChange={(event) => updateValue("type", event.target.value)}><option>Kassa</option><option>Bank</option><option>POS</option></select></label>
          <label><span>Valyuta</span><select value={values.currency} onChange={(event) => updateValue("currency", event.target.value)}><option>AZN</option><option>USD</option><option>EUR</option></select></label>
          <label><span>Açılış balansı</span><input type="number" min="0" step="0.01" value={values.openingBalance} onChange={(event) => updateValue("openingBalance", event.target.value)} /></label>
          <label><span>Status</span><select value={values.status} onChange={(event) => updateValue("status", event.target.value)}><option>Aktiv</option><option>Passiv</option></select></label>
          <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button><button type="submit" className="primary-btn"><Check size={16} /> Yadda saxla</button></div>
        </form>
      </div>
    </div>
  );
}
