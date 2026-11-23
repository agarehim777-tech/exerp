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

// Anbar hərəkəti və transfer əmrlərinin xətaları.
const STOCK_COMMAND_MESSAGES = {
  insufficient_stock: "Seçilmiş anbarda kifayət qədər sərbəst qalıq yoxdur.",
  invalid_stock_quantity: "Miqdar düzgün deyil: məxaric üçün müsbət, düzəliş üçün sıfırdan fərqli ədəd daxil edin.",
  invalid_stock_receipt: "Mədaxil üçün müsbət miqdar və mənfi olmayan maya dəyəri daxil edin.",
  invalid_stock_transfer: "Fərqli mənbə və hədəf anbar seçin.",
  invalid_stock_scope: "Məhsul və ya anbar bu şirkətə aid deyil, ya da anbar passivdir.",
  permission_denied: "Anbar əməliyyatı üçün icazəniz yoxdur.",
  accounting_period_locked: "Bu tarix üçün mühasibat dövrü bağlıdır.",
};

export function describeStockCommandError(error) {
  const raw = collectErrorText(error);
  const match = Object.keys(STOCK_COMMAND_MESSAGES).find((key) => raw.includes(key));
  return match ? STOCK_COMMAND_MESSAGES[match] : (error?.message || "Anbar əməliyyatı alınmadı.");
}

// Postgres/PostgREST xəta kodunu message, details, hint və code sahələrinin
// hər birində saxlaya bilər — hamısını birlikdə yoxlayırıq.
function collectErrorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return [error.message, error.details, error.hint, error.code, error.error_description]
    .filter(Boolean)
    .join(" | ");
}

export function isStockShortageError(error) {
  const raw = collectErrorText(error).toLowerCase();
  return raw.includes("insufficient_available_stock") || raw.includes("insufficient_stock");
}

export function describeStockError(error, fallbackPrefix = "Əməliyyat tamamlanmadı") {
  const raw = collectErrorText(error);
  const match = Object.keys(STOCK_ERROR_MESSAGES).find((key) => raw.includes(key));
  if (match) return STOCK_ERROR_MESSAGES[match];
  return `${fallbackPrefix}: ${error?.message || raw || "naməlum xəta"}`;
}
