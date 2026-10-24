import React from "react";
export { default as DataTable } from './DataTable.jsx';

const join = (...values) => values.filter(Boolean).join(" ");

export function Button({ variant = "primary", size, className, type = "button", ...rest }) {
  return <button type={type} className={join("ui-button", `ui-button-${variant}`, size && `ui-button-${size}`, className)} {...rest} />;
}

export function Card({ title, subtitle, actions, children, className, as: Tag = "section", ...rest }) {
  return (
    <Tag className={join("ui-card", className)} {...rest}>
      {(title || subtitle || actions) && <header className="ui-card-header">
        <div>{title && <h3>{title}</h3>}{subtitle && <p>{subtitle}</p>}</div>
        {actions && <div className="ui-card-actions">{actions}</div>}
      </header>}
      {children}
    </Tag>
  );
}

export function Input({ className, ...rest }) {
  return <input className={join("ui-input", className)} {...rest} />;
}

export function Select({ className, children, ...rest }) {
  return <select className={join("ui-input", className)} {...rest}>{children}</select>;
}

export function Field({ label, children, className }) {
  return <label className={join("ui-field", className)}><span>{label}</span>{children}</label>;
}

export function PageStack({ children, className }) {
  return <div className={join("ui-page-stack", className)}>{children}</div>;
}

export function Toolbar({ children, className }) {
  return <div className={join("ui-toolbar", className)}>{children}</div>;
}

export function FormGrid({ children, className, as: Tag = "div", ...rest }) {
  return <Tag className={join("ui-form-grid", className)} {...rest}>{children}</Tag>;
}

export function StatGrid({ children, className }) {
  return <section className={join("ui-stat-grid", className)}>{children}</section>;
}

export function StatCard({ label, value, tone = "default" }) {
  return <article className={join("ui-stat-card", `ui-tone-${tone}`)}><span>{label}</span><strong>{value}</strong></article>;
}

export function Tabs({ items, value, onChange, className }) {
  const move = (event, index) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + delta + items.length) % items.length;
    if (!delta && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.currentTarget.parentElement.children[next]?.focus();
    onChange(items[next][0]);
  };
  return <div className={join("ui-tabs", className)} role="tablist">{items.map(([key, label], index) => (
    <Button key={key} variant="tab" className={value === key ? "active" : ""} role="tab" aria-selected={value === key} tabIndex={value === key ? 0 : -1} onKeyDown={event => move(event, index)} onClick={() => onChange(key)}>{label}</Button>
  ))}</div>;
}

export function Notice({ children, tone = "info", className }) {
  return <div className={join("ui-notice", `ui-notice-${tone}`, className)} role={tone === "danger" ? "alert" : undefined}>{children}</div>;
}

export function Badge({ children, tone = "neutral", className }) {
  return <span className={join("ui-badge", `ui-badge-${tone}`, className)}>{children}</span>;
}

export function TableActions({ children }) {
  return <div className="ui-table-actions">{children}</div>;
}
