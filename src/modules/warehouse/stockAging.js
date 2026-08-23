const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnlyUtc(value) {
  if (!value) return null;
  const datePart = String(value).slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

export function isMissingAgingView(error) {
  if (!error) return false;
  const message = String(error.message || error.details || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    (message.includes("inventory_aging_v") &&
      (message.includes("schema cache") ||
        message.includes("could not find") ||
        message.includes("does not exist")))
  );
}

export function getAgingBucket(ageDays) {
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 90) return "31-90";
  if (ageDays <= 180) return "91-180";
  return "180+";
}

export function buildAgingRows(layers, today = new Date()) {
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return (layers || [])
    .filter((layer) => Number(layer.remaining_qty || 0) > 0)
    .map((layer) => {
      const receivedUtc = dateOnlyUtc(layer.received_at);
      const ageDays = receivedUtc === null
        ? 0
        : Math.max(0, Math.floor((todayUtc - receivedUtc) / DAY_MS));
      const product = Array.isArray(layer.product)
        ? layer.product[0]
        : layer.product;
      const remainingQty = Number(layer.remaining_qty || 0);
      const unitCost = Number(layer.unit_cost || 0);

      return {
        ...layer,
        product_name: product?.name || "Məhsul",
        sku: product?.sku || "",
        age_days: ageDays,
        aging_bucket: getAgingBucket(ageDays),
        stock_value: Math.round(remainingQty * unitCost * 100) / 100,
      };
    })
    .sort((left, right) => right.age_days - left.age_days);
}
