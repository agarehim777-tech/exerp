import React from "react";
import * as tokens from "./tokens.js";

/**
 * Shared presentational primitives built on the design tokens, so module pages
 * stop repeating inline style objects.
 */

const buttonVariants = {
  primary: tokens.primaryBtn,
  secondary: tokens.secondaryBtn,
  danger: tokens.delBtn,
};

export function Button({ variant = "primary", style, disabled, ...rest }) {
  const base = buttonVariants[variant] || buttonVariants.primary;
  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...base, opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer", ...style }}
      {...rest}
    />
  );
}

export function Card({ title, subtitle, actions, children, style }) {
  return (
    <section style={{ ...tokens.card, ...style }}>
      {(title || actions) && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            {title && <h3 style={{ margin: 0, fontSize: 15, color: "#123c31" }}>{title}</h3>}
            {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7a74" }}>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Input({ style, ...rest }) {
  return <input style={{ ...tokens.input, ...style }} {...rest} />;
}

export function Select({ style, children, ...rest }) {
  return (
    <select style={{ ...tokens.input, ...style }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#5a6b65" }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function DataTable({ columns = [], rows = [], renderCell, emptyText = "Məlumat tapılmadı", rowKey }) {
  if (!rows.length) {
    return <p style={{ padding: 16, textAlign: "center", color: "#6b7a74", fontSize: 13 }}>{emptyText}</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tokens.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={{ ...tokens.th, textAlign: column.align || "left" }}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : row?.id ?? index}>
              {columns.map((column) => (
                <td key={column.key} style={{ ...tokens.td, textAlign: column.align || "left" }}>
                  {renderCell ? renderCell(row, column, index) : row?.[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
