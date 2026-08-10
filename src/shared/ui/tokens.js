// Shared inline-style tokens for DB-backed module pages (matches AccountingPage look).
export const card = {
  background: "#fff",
  border: "1px solid #e6dfc9",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 4px 18px rgba(6,78,59,0.06)",
};
export const table = { width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.4 };
export const th = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#f0e6c8",
  color: "#5a4a1e",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  borderBottom: "1px solid #e6dfc9",
};
export const td = { padding: "9px 11px", borderBottom: "1px solid #f0ecdb", color: "#33443e" };
export const input = {
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid #d4c9a3",
  fontSize: 13,
  background: "#fff",
};
export const primaryBtn = {
  background: "#064e3b",
  color: "#fbe89a",
  border: 0,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};
export const secondaryBtn = {
  background: "#f0e6c8",
  color: "#5a4a1e",
  border: 0,
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 12,
};
export const delBtn = {
  background: "none",
  color: "#b23a3a",
  border: "1px solid #e6c8c8",
  padding: "4px 10px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
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
  background: active ? "#064e3b" : "transparent",
  color: active ? "#fbe89a" : "#064e3b",
  border: 0,
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
});
export const tabBar = {
  display: "flex",
  gap: 8,
  borderBottom: "1px solid #e6dfc9",
  paddingBottom: 8,
  flexWrap: "wrap",
};
export const statTile = {
  background: "#fff",
  border: "1px solid #e6dfc9",
  borderRadius: 12,
  padding: 16,
  minWidth: 160,
  flex: "1 1 160px",
};
export const statLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#8a7a4a",
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
  return `${new Intl.NumberFormat("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} ₼`;
}
