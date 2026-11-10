import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button, Input, Select } from "../../../shared/ui/primitives.tsx";

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
        <div className="modal-head"><div><h2>{account ? "Hesabı redaktə et" : "Yeni maliyyə hesabı"}</h2><p>Kassa və bank açılış balansını düzgün qeyd edin; bu dəyər maliyyə hesabatlarına daxil olur.</p></div><Button variant="ghost" className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla"><X size={18} /></Button></div>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(values); }} className="modal-form">
          <label><span>Hesab adı</span><Input value={values.name} required onChange={(event) => updateValue("name", event.target.value)} /></label>
          <label><span>Hesab kodu</span><Input value={values.code} required onChange={(event) => updateValue("code", event.target.value)} /></label>
          <label><span>Tip</span><Select value={values.type} onChange={(event) => updateValue("type", event.target.value)}><option>Kassa</option><option>Bank</option><option>POS</option></Select></label>
          <label><span>Valyuta</span><Select value={values.currency} onChange={(event) => updateValue("currency", event.target.value)}><option>AZN</option><option>USD</option><option>EUR</option></Select></label>
          <label><span>Açılış balansı</span><Input type="number" min="0" step="0.01" value={values.openingBalance} onChange={(event) => updateValue("openingBalance", event.target.value)} /></label>
          <label><span>Status</span><Select value={values.status} onChange={(event) => updateValue("status", event.target.value)}><option>Aktiv</option><option>Passiv</option></Select></label>
          <div className="modal-actions"><Button variant="secondary" type="button"  onClick={onClose}>Ləğv et</Button><Button variant="primary" type="submit" ><Check size={16} /> Yadda saxla</Button></div>
        </form>
      </div>
    </div>
  );
}
