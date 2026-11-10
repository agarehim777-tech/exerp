// Safe CSV cell: quotes the value and neutralizes spreadsheet formulas
// (=, +, -, @, tab, CR at the start) so exported files cannot run formulas.
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)?$/;

export function neutralizeCsvValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  const text = String(value);
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text.trim())) return `'${text}`;
  return text;
}

export function csvCell(value) {
  return `"${neutralizeCsvValue(value).replaceAll('"', '""')}"`;
}
