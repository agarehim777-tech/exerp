// Backend rezervasiya xətalarını istifadəçi üçün anlaşılan mesajlara çevirir.
const STOCK_ERROR_MESSAGES = {
  insufficient_available_stock:
    "Rezervasiya bloklandı: seçilmiş anbarda kifayət qədər sərbəst qalıq yoxdur. Əvvəlcə mədaxil edin və ya sayı azaldın.",
  insufficient_stock:
    "Rezervasiya bloklandı: anbarda kifayət qədər qalıq yoxdur.",
  stock_balance_not_found:
    "Rezervasiya bloklandı: bu məhsul seçilmiş anbarda qeydə alınmayıb.",
  reservation_not_found: "Rezervasiya tapılmadı və ya artıq bağlanıb.",
};

export function isStockShortageError(error) {
  const raw = String(error?.message || error || "").toLowerCase();
  return raw.includes("insufficient_available_stock") || raw.includes("insufficient_stock");
}

export function describeStockError(error, fallbackPrefix = "Əməliyyat tamamlanmadı") {
  const raw = String(error?.message || error || "");
  const match = Object.keys(STOCK_ERROR_MESSAGES).find((key) => raw.includes(key));
  if (match) return STOCK_ERROR_MESSAGES[match];
  return `${fallbackPrefix}: ${raw || "naməlum xəta"}`;
}
