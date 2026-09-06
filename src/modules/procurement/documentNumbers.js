export function shortProcurementDocumentNo(value) {
  const raw = String(value || "").trim();
  return raw || "—";
}

export function procurementNumberPrefix(prefix) {
  return `${String(prefix || "").trim().toUpperCase()}-`;
}

export function nextDailyProcurementNo(prefix, existing = []) {
  const numberPrefix = procurementNumberPrefix(prefix);
  const last = existing.reduce((max, value) => {
    const match = String(value || "").match(new RegExp(`^${numberPrefix}(\\d{4,6})$`, "i"));
    return match ? Math.max(max, Number(match[1]) || 1000) : max;
  }, 1000);
  return `${numberPrefix}${String(last + 1).padStart(4, "0")}`;
}
