import { useState } from "react";
import { CircleAlert, Trash2, X } from "lucide-react";
import { currentBusinessDate } from "../../shared/lib/appDomain.jsx";

export function ExpenseOperationModal({ expense, onClose, onSubmit }) {
  const [values, setValues] = useState({
    description: expense.description || "",
    category: expense.category || "",
    date: expense.date || currentBusinessDate,
    amount: expense.amount || 0,
    status: expense.status || "Təsdiq gözləyir",
    note: expense.note || "",
  });

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
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
            <h2>Xərc əməliyyatını redaktə et</h2>
            <p>{expense.id} üzrə məbləğ, kateqoriya və statusu yeniləyin.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <label className="full">
            <span>Təsvir</span>
            <input value={values.description} onChange={(event) => updateValue("description", event.target.value)} required />
          </label>
          <label>
            <span>Kateqoriya</span>
            <input value={values.category} onChange={(event) => updateValue("category", event.target.value)} required />
          </label>
          <label>
            <span>Tarix</span>
            <input type="date" value={values.date} onChange={(event) => updateValue("date", event.target.value)} />
          </label>
          <label>
            <span>Məbləğ</span>
            <input type="number" min="0" value={values.amount} onChange={(event) => updateValue("amount", event.target.value)} required />
          </label>
          <label>
            <span>Status</span>
            <select value={values.status} onChange={(event) => updateValue("status", event.target.value)}>
              <option>Təsdiq gözləyir</option>
              <option>Təsdiq edildi</option>
              <option>İmtina edildi</option>
            </select>
          </label>
          <label className="full">
            <span>Qeyd</span>
            <textarea value={values.note} onChange={(event) => updateValue("note", event.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
            <button type="submit" className="primary-btn">Yadda saxla</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OperationDeleteModal({ title, description, warning, confirmDisabled = false, confirmLabel = "Sil", onClose, onConfirm }) {
  return (
    <div className="modal-shell" role="dialog" aria-modal="true">
      <div className="modal-card operation-delete-modal">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Pəncərəni bağla">
            <X size={18} />
          </button>
        </div>
        <div className="operation-delete-warning">
          <CircleAlert size={18} />
          <span>{warning}</span>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>Ləğv et</button>
          <button type="button" className="secondary-btn danger-outline" disabled={confirmDisabled} onClick={onConfirm}>
            <Trash2 size={16} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
