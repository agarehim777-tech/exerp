export function shortProcurementDocumentNo(value) {
  const raw = String(value || "").trim();
  const timestamp = raw.match(/^(GRN|SHP)-(\d{4})(\d{2})(\d{2})-?(\d{3,})$/i);
  if (!timestamp) return raw || "—";
  const [, prefix, year, month, day, serial] = timestamp;
  return `${prefix.toUpperCase()}-${year.slice(-2)}${month}${day}-${serial.slice(-4)}`;
}

export function procurementDayPrefix(prefix, date = new Date()) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${prefix.toUpperCase()}-${year}${month}${day}-`;
}

export function nextDailyProcurementNo(prefix, existing = [], date = new Date()) {
  const dayPrefix = procurementDayPrefix(prefix, date);
  const last = existing.reduce((max, value) => {
    const match = String(value || "").match(new RegExp(`^${dayPrefix}(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return `${dayPrefix}${String(last + 1).padStart(3, "0")}`;
}
