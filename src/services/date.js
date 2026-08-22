export function formatPaymentDate(date) {
  return new Intl.DateTimeFormat("az-AZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parsePaymentDate(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "—") return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const local = text.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (local) {
    return new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateInputValue(value) {
  return formatDateInput(parsePaymentDate(value));
}

export function addMonths(dateValue, months) {
  const date = parsePaymentDate(dateValue) || new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return date;
  const day = date.getDate();
  // Move to the 1st first so setMonth can never overflow into the next month,
  // then clamp the day to the last day of the target month (31 Jan + 1 => 28/29 Feb).
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}
