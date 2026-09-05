import { TriangleAlert, X } from 'lucide-react';

export default function ConfirmActionDialog({ open, title, description, confirmLabel = 'Təsdiq et', destructive = false, reason = '', onReasonChange, reasonRequired = false, busy = false, onCancel, onConfirm }) {
  if (!open) return null;
  const disabled = busy || (reasonRequired && String(reason).trim().length < 3);
  return <div className="confirm-action-backdrop" role="presentation" onMouseDown={onCancel}>
    <section className="confirm-action-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" onMouseDown={event => event.stopPropagation()}>
      <header><TriangleAlert size={20} aria-hidden="true"/><h2 id="confirm-action-title">{title}</h2><button type="button" className="icon-button" onClick={onCancel} aria-label="Bağla"><X size={18}/></button></header>
      <p>{description}</p>
      {onReasonChange && <label>Səbəb<textarea value={reason} onChange={event => onReasonChange(event.target.value)} rows={3} placeholder="Əməliyyat səbəbini yazın" /></label>}
      <footer><button type="button" className="secondary-btn" onClick={onCancel} disabled={busy}>Geri qayıt</button><button type="button" className={destructive ? 'danger-btn' : 'primary-btn'} onClick={onConfirm} disabled={disabled}>{busy ? 'İcra olunur…' : confirmLabel}</button></footer>
    </section>
  </div>;
}

