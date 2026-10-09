const moneyFormatter = new Intl.NumberFormat("az-AZ");
const percentFormatter = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 });

export function money(value) {
  return `${moneyFormatter.format(value)} ₼`;
}

export function percent(value) {
  return `${percentFormatter.format(value)}%`;
}

export function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("az-AZ");
}
