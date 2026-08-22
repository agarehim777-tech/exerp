const IN_TYPES = new Set(["in", "receipt", "customer_return", "return_in"]);
const OUT_TYPES = new Set(["out", "delivery", "vendor_return", "write_off"]);

export function movementKind(item) {
  const type = String(item?.movement_type || item?.move_type || "").toLowerCase();
  if (type === "reservation") return "Rezerv";
  if (type === "release") return "Rezerv açıldı";
  if (type.includes("transfer")) return "Transfer";
  if (type === "customer_return" || type === "return_in") return "Müştəri qaytarması";
  if (type === "vendor_return") return "Vendor qaytarması";
  if (type === "return_quarantine") return "Karantin / zədəli";
  if (type === "adjust" || type === "adjustment") return "Stok düzəlişi";
  if (IN_TYPES.has(type)) return "Mədaxil";
  if (OUT_TYPES.has(type)) return "Satış / məxaric";
  return type || "Hərəkət";
}

export function buildAverageCostHistory(movements = [], salePrice = 0) {
  let quantity = 0;
  let averageCost = 0;
  return [...movements]
    .sort((a, b) => String(a.moved_at || a.created_at || "").localeCompare(String(b.moved_at || b.created_at || "")))
    .reduce((rows, item) => {
      const type = String(item?.movement_type || item?.move_type || "").toLowerCase();
      const rawQty = Math.abs(Number(item?.quantity ?? item?.qty ?? 0) || 0);
      if (!rawQty || type.includes("transfer") || type === "reservation" || type === "release") return rows;
      const previousCost = averageCost;
      if (IN_TYPES.has(type)) {
        const unitCost = Number(item?.unit_cost || 0);
        averageCost = quantity + rawQty > 0 ? ((quantity * averageCost) + (rawQty * unitCost)) / (quantity + rawQty) : unitCost;
        quantity += rawQty;
      } else if (OUT_TYPES.has(type)) {
        quantity = Math.max(0, quantity - rawQty);
      } else return rows;
      const margin = Number(salePrice) > 0 ? Number(salePrice) - averageCost : 0;
      rows.push({ item, type: movementKind(item), quantity, previousCost, averageCost, margin, marginPct: Number(salePrice) > 0 ? margin / Number(salePrice) * 100 : 0 });
      return rows;
    }, []);
}
