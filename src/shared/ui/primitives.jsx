import React from "react";

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
  return <div className={join("ui-tabs", className)} role="tablist">{items.map(([key, label]) => (
    <Button key={key} variant="tab" className={value === key ? "active" : ""} role="tab" aria-selected={value === key} onClick={() => onChange(key)}>{label}</Button>
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

export function DataTable({ columns = [], rows = [], renderCell, emptyText = "Məlumat tapılmadı", rowKey, footer, className }) {
  if (!rows.length) {
    return <div className="ui-table-empty">{emptyText}</div>;
  }
  return (
    <div className={join("ui-table-wrap", className)}>
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align === "right" ? "is-numeric" : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : row?.id ?? index}>
              {columns.map((column) => (
                <td key={column.key} className={column.align === "right" ? "is-numeric" : undefined}>
                  {renderCell ? renderCell(row, column, index) : row?.[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer}
      </table>
    </div>
  );
}
