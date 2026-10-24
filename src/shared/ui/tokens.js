import { cashAmount } from '../../services/format.js';

// Compatibility styles resolve the same CSS tokens as the shared components.
export const card = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-panel)",
  padding: "var(--panel-padding)",
  minWidth: 0,
};
export const table = { width: "100%", minWidth: 0, borderCollapse: "collapse", fontSize: "var(--font-size-md)", lineHeight: 1.4 };
export const th = {
  textAlign: "left",
  padding: "10px 12px",
  background: "var(--table-head)",
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-xs)",
  textTransform: "uppercase",
  letterSpacing: 0,
  height: "var(--table-row-height)",
  borderBottom: "1px solid var(--border)",
};
export const td = { padding: "9px 12px", height: "var(--table-row-height)", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", verticalAlign: "middle" };
export const input = {
  padding: "9px 11px",
  borderRadius: "var(--radius-control)",
  border: "1px solid var(--border)",
  fontSize: "var(--font-size-md)",
  minHeight: "var(--control-height)",
  background: "var(--surface)",
};
export const primaryBtn = {
  background: "var(--action)",
  color: "#fff",
  border: 0,
  padding: "0 14px",
  minHeight: "var(--control-height)",
  borderRadius: "var(--radius-control)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "var(--font-size-md)",
};
export const secondaryBtn = {
  background: "var(--surface)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  padding: "0 12px",
  minHeight: "var(--control-height)",
  borderRadius: "var(--radius-control)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "var(--font-size-md)",
};
export const delBtn = {
  background: "none",
  color: "#b23a3a",
  border: "1px solid #e6c8c8",
  padding: "0 10px",
  minHeight: "var(--control-height)",
  borderRadius: "var(--radius-control)",
  cursor: "pointer",
  fontSize: "var(--font-size-sm)",
  marginLeft: 4,
};
export const msgBox = {
  background: "#faf5e2",
  color: "#5a4a1e",
  padding: 8,
  borderRadius: 6,
  fontSize: 12,
  marginBottom: 10,
};
export const tabBtn = (active) => ({
  background: active ? "var(--surface)" : "transparent",
  color: active ? "var(--action)" : "var(--text-secondary)",
  border: 0,
  padding: "0 14px",
  minHeight: "var(--control-height)",
  borderRadius: "var(--radius-control)",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "var(--font-size-md)",
});
export const tabBar = {
  display: "flex",
  gap: 8,
  borderBottom: "1px solid #e6dfc9",
  paddingBottom: 8,
  flexWrap: "wrap",
};
export const statTile = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-panel)",
  padding: "var(--panel-padding)",
  minWidth: 160,
  flex: "1 1 160px",
};
export const statLabel = {
  fontSize: "var(--font-size-sm)",
  textTransform: "uppercase",
  letterSpacing: 0,
  color: "var(--text-secondary)",
  marginBottom: 6,
};
export const statValue = { fontSize: 20, lineHeight: 1.2, fontWeight: 700, color: "#064e3b" };

export function badge(tone = "gray") {
  const tones = {
    green: { background: "#064e3b", color: "#fbe89a" },
    gray: { background: "#e6dfc9", color: "#5a4a1e" },
    red: { background: "#fbe4e4", color: "#b23a3a" },
    amber: { background: "#fbe89a", color: "#5a4a1e" },
  };
  return { ...tones[tone], padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 };
}

export function azn(value) {
  return cashAmount(Number(value) || 0);
}
