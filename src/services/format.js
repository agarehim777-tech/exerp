const moneyFormatter = new Intl.NumberFormat("az-AZ");
const percentFormatter = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 });
const cashFormatters = new Map();
const normalizedText = new Map();
const NORMALIZED_TEXT_LIMIT = 2048;

export function money(value) {
  return `${moneyFormatter.format(value)} ₼`;
}

const fixedFormatters = new Map();
// Single money formatter for fixed-decimal display; symbol defaults to ₼, pass a currency code
// (e.g. "AZN") for documents. Keep per-page money helpers out of modules.
export function formatAmount(value, { currency = "₼", decimals = 2 } = {}) {
  if (!fixedFormatters.has(decimals)) {
    fixedFormatters.set(decimals, new Intl.NumberFormat("az-AZ", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return `${fixedFormatters.get(decimals).format(Number(value) || 0)} ${currency}`;
}

export function percent(value) {
  return `${percentFormatter.format(value)}%`;
}

export function cashAmount(value, currency = "AZN") {
  if (value == null) return "—";
  if (!cashFormatters.has(currency)) {
    if (cashFormatters.size >= 32) cashFormatters.delete(cashFormatters.keys().next().value);
    cashFormatters.set(currency, new Intl.NumberFormat("az-AZ", { style: "currency", currency }));
  }
  return cashFormatters.get(currency).format(Number(value));
}

export function normalize(value) {
  const text = String(value ?? "");
  // Portfolio joins repeatedly normalize the same short names and statuses.
  // Keep the cache bounded and never retain large search/snapshot strings.
  if (text.length > 256) return text.toLocaleLowerCase("az-AZ");
  if (normalizedText.has(text)) return normalizedText.get(text);
  const result = text.toLocaleLowerCase("az-AZ");
  if (normalizedText.size >= NORMALIZED_TEXT_LIMIT) normalizedText.delete(normalizedText.keys().next().value);
  normalizedText.set(text, result);
  return result;
}
