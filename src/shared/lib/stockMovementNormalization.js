const IN_TYPES = new Set(["in", "receipt", "transfer_in"]);
const OUT_TYPES = new Set(["out", "delivery", "transfer_out", "write_off"]);
const NEUTRAL_TYPES = new Set(["reservation", "release"]);

const number = (value) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isInternalTransfer = (row, movementType) => {
  if (movementType === "transfer_in" || movementType === "transfer_out") return true;
  const reference = String(row?.reference || row?.doc_no || row?.reference_type || "").toLowerCase();
  const note = String(row?.note || "").toLocaleLowerCase("az-AZ");
  return reference.startsWith("tr-") || note.includes("daxili anbar transferi");
};

/**
 * stock_movements cədvəlinin köhnə (move_type/qty) və yeni
 * (movement_type/quantity) sütunlarını vahid formaya gətirir.
 * Yeni sütunlar doludursa onlar əsas mənbədir; köhnə sütunlardakı adjust/0
 * uyğunluq dəyərləri real hərəkəti əvəz etməməlidir.
 */
export function normalizeStockMovement(row) {
  const movementType = String(row?.movement_type || "").toLowerCase();
  const legacyType = String(row?.move_type || "").toLowerCase();
  const hasModernMovement = Boolean(movementType) && row?.quantity !== null && row?.quantity !== undefined;
  const rawQty = hasModernMovement ? number(row.quantity) : number(row?.qty);
  const transfer = isInternalTransfer(row, movementType);

  let moveType = legacyType || "adjust";
  if (IN_TYPES.has(movementType)) moveType = "in";
  else if (OUT_TYPES.has(movementType)) moveType = "out";
  else if (movementType === "adjustment" || movementType === "adjust") moveType = "adjust";

  let valuationEffect = "cogs";
  if (transfer || NEUTRAL_TYPES.has(movementType)) valuationEffect = "ignore";
  else if (movementType === "write_off" || movementType === "adjustment" || movementType === "adjust") {
    valuationEffect = "inventory";
  }

  const qty = moveType === "in" || moveType === "out" ? Math.abs(rawQty) : rawQty;

  return {
    ...row,
    move_type: moveType,
    qty,
    moved_at: row?.moved_at || row?.created_at || null,
    reference: row?.reference || row?.reference_id || null,
    doc_no: row?.doc_no || row?.reference_type || null,
    valuation_effect: valuationEffect,
  };
}
