// Chromium has no Azerbaijani date data: Intl "az-AZ" prints "2026-11-21" and month names as "M11" there,
// while Node and Firefox print "21.11.2026" and "noyabr". These helpers build the CLDR Azerbaijani text by hand
// so every browser shows the same dates.
const AZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const AZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];
const pad2 = (value) => String(value).padStart(2, "0");

function validDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new RangeError("Invalid time value");
  return date;
}

/** 21.11.2026 */
export function formatPaymentDate(date) {
  const value = validDate(date);
  return `${pad2(value.getDate())}.${pad2(value.getMonth() + 1)}.${value.getFullYear()}`;
}

const toDate = (value) => (value instanceof Date ? value : new Date(value));

/** 21.11.2026 for a Date, ISO string or timestamp; "—" when it is not a date. */
export function formatDate(value) {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? "—" : formatPaymentDate(date);
}

/**
 * 21.11.2026, 14:05:09 (seconds: false drops ":09"; shortYear: true prints 21.11.26). "—" when it is not a date.
 * Matches Node's Intl "az-AZ" text, which Chromium cannot produce.
 * @param {Date | string | number} value
 * @param {{ seconds?: boolean, shortYear?: boolean }} [options]
 */
export function formatDateTime(value, { seconds = true, shortYear = false } = {}) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const year = shortYear ? pad2(date.getFullYear() % 100) : date.getFullYear();
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}${seconds ? `:${pad2(date.getSeconds())}` : ""}`;
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${year}, ${time}`;
}

/** noy */
export function formatMonthShort(date) {
  return AZ_MONTHS_SHORT[validDate(date).getMonth()];
}

/** noyabr 2026 */
export function formatMonthYear(date) {
  const value = validDate(date);
  return `${AZ_MONTHS[value.getMonth()]} ${value.getFullYear()}`;
}

/** 21 noyabr */
export function formatDayMonth(date) {
  const value = validDate(date);
  return `${pad2(value.getDate())} ${AZ_MONTHS[value.getMonth()]}`;
}

export function formatDateInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Calendar date (YYYY-MM-DD) in the browser's time zone. toISOString() gives the UTC date,
// which in Baku (UTC+4) is the previous day before 04:00 and for every local midnight.
export function toLocalIsoDate(date = new Date()) {
  return formatDateInput(date);
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
