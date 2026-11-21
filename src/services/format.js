// Chromium (Chrome, Edge, the desktop app) ships no Azerbaijani number data: Intl "az-AZ" falls back to English
// patterns there ("20,087.18", "AZN 0.00") while Node and Firefox print "20.087,18" and "0,00 ₼". Format with the
// en-US engine, which every runtime has, and swap in the Azerbaijani separators so all browsers show the CLDR
// Azerbaijani text.
const azSeparators = (text) => text.replace(/[,.]/g, (ch) => (ch === "," ? "." : ","));
const AZ_CURRENCY_SYMBOLS = { AZN: "₼", USD: "US$", EUR: "€", GBP: "£", JPY: "JP¥", CNY: "CN¥" };
const moneyFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const cashFormatters = new Map();
const normalizedText = new Map();
const NORMALIZED_TEXT_LIMIT = 2048;

export function money(value) {
  return `${azSeparators(moneyFormatter.format(value))} ₼`;
}

const fixedFormatters = new Map();
// Single money formatter for fixed-decimal display; symbol defaults to ₼, pass a currency code
// (e.g. "AZN") for documents. Keep per-page money helpers out of modules.
export function formatAmount(value, { currency = "₼", decimals = 2 } = {}) {
  if (!fixedFormatters.has(decimals)) {
    fixedFormatters.set(decimals, new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  }
  return `${azSeparators(fixedFormatters.get(decimals).format(Number(value) || 0))} ${currency}`;
}

export function percent(value) {
  return `${azSeparators(percentFormatter.format(value))}%`;
}

export function cashAmount(value, currency = "AZN") {
  if (value == null) return "—";
  if (!cashFormatters.has(currency)) {
    if (cashFormatters.size >= 32) cashFormatters.delete(cashFormatters.keys().next().value);
    // The en-US currency formatter validates the code (RangeError) and knows its minor units (JPY has none).
    const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    cashFormatters.set(currency, new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  }
  const code = String(currency).toUpperCase();
  return `${azSeparators(cashFormatters.get(currency).format(Number(value)))}\u00a0${AZ_CURRENCY_SYMBOLS[code] || code}`;
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
