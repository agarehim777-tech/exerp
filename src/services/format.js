export function money(value) {
  return `${new Intl.NumberFormat("az-AZ").format(value)} ₼`;
}

export function percent(value) {
  return `${new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("az-AZ");
}
