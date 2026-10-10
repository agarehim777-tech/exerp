const moneyFormatter = new Intl.NumberFormat("az-AZ");
const percentFormatter = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 });
const cashFormatters = new Map();
const normalizedText = new Map();
const NORMALIZED_TEXT_LIMIT = 2048;

export function money(value) {
  return `${moneyFormatter.format(value)} ₼`;
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
