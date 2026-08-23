/**
 * Anbar dəyərləməsi: FIFO və çəkili orta maya (weighted average) + COGS.
 * Bütün funksiyalar saf (pure) — React/Supabase asılılığı yoxdur.
 */

export type MoveType = "in" | "out" | "adjust" | "transfer";

export interface StockMovementLike {
  id?: string;
  product_id?: string | null;
  warehouse_id?: string | null;
  move_type?: MoveType | string;
  type?: MoveType | string;
  qty?: number | string | null;
  unit_cost?: number | string | null;
  moved_at?: string | null;
  created_at?: string | null;
  /** ignore = rezerv/daxili transfer, inventory = COGS olmayan stok azalması */
  valuation_effect?: "cogs" | "inventory" | "ignore" | string | null;
}

export interface CostLayer {
  qty: number;
  unitCost: number;
  movedAt: string;
}

export interface ValuationResult {
  productId: string | null;
  qtyOnHand: number;
  /** Qalıq dəyəri (FIFO və ya orta maya metoduna görə) */
  inventoryValue: number;
  /** Satılmış malın maya dəyəri */
  cogs: number;
  /** Cari vahid maya (qalıq dəyəri / qalıq miqdar) */
  unitCost: number;
  /** Anbarda olandan artıq çıxış edilib (backorder / mənfi qalıq) */
  shortageQty: number;
  layers: CostLayer[];
}

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function getMoveType(movement: StockMovementLike): MoveType {
  const raw = String(movement.move_type ?? movement.type ?? "").toLowerCase();
  if (raw === "in" || raw === "out" || raw === "adjust" || raw === "transfer") return raw;
  return num(movement.qty) >= 0 ? "in" : "out";
}

export function getMoveDate(movement: StockMovementLike): string {
  return String(movement.moved_at || movement.created_at || "");
}

export function sortMovements(movements: StockMovementLike[]): StockMovementLike[] {
  return [...movements].sort((a, b) => getMoveDate(a).localeCompare(getMoveDate(b)));
}

/** Hərəkətin miqdara təsiri: müsbət = giriş, mənfi = çıxış. */
export function signedQty(movement: StockMovementLike): number {
  if (movement.valuation_effect === "ignore") return 0;
  const qty = num(movement.qty);
  const type = getMoveType(movement);
  if (type === "in") return Math.abs(qty);
  if (type === "out") return -Math.abs(qty);
  // adjust / transfer: işarə olduğu kimi saxlanılır
  return qty;
}

/**
 * FIFO metodu ilə qalıq dəyəri və COGS hesablayır.
 * Anbarda olmayan mal satılırsa (backorder), COGS son məlum maya ilə hesablanır
 * və `shortageQty` artırılır.
 */
export function valuateFifo(movements: StockMovementLike[], productId: string | null = null): ValuationResult {
  const layers: CostLayer[] = [];
  let cogs = 0;
  let shortageQty = 0;
  let lastCost = 0;

  for (const movement of sortMovements(movements)) {
    const delta = signedQty(movement);
    if (delta === 0) continue;
    if (delta > 0) {
      const unitCost = num(movement.unit_cost) || lastCost;
      lastCost = unitCost || lastCost;
      layers.push({ qty: delta, unitCost, movedAt: getMoveDate(movement) });
      continue;
    }
    let remaining = Math.abs(delta);
    while (remaining > 0 && layers.length > 0) {
      const layer = layers[0];
      const taken = Math.min(layer.qty, remaining);
      if (movement.valuation_effect !== "inventory") cogs += taken * layer.unitCost;
      layer.qty -= taken;
      remaining -= taken;
      if (layer.qty <= 0) layers.shift();
    }
    if (remaining > 0) {
      // qalıq yoxdur — backorder çıxışı, son maya ilə qiymətləndirilir
      const fallbackCost = num(movement.unit_cost) || lastCost;
      if (movement.valuation_effect !== "inventory") cogs += remaining * fallbackCost;
      shortageQty += remaining;
    }
  }

  const qtyOnHand = layers.reduce((sum, layer) => sum + layer.qty, 0) - shortageQty;
  const inventoryValue = layers.reduce((sum, layer) => sum + layer.qty * layer.unitCost, 0);

  return {
    productId,
    qtyOnHand: round2(qtyOnHand),
    inventoryValue: round2(inventoryValue),
    cogs: round2(cogs),
    unitCost: qtyOnHand > 0 ? round2(inventoryValue / qtyOnHand) : round2(lastCost),
    shortageQty: round2(shortageQty),
    layers,
  };
}

/** Çəkili orta maya (moving weighted average) metodu. */
export function valuateAverage(movements: StockMovementLike[], productId: string | null = null): ValuationResult {
  let qty = 0;
  let value = 0;
  let cogs = 0;
  let shortageQty = 0;

  for (const movement of sortMovements(movements)) {
    const delta = signedQty(movement);
    if (delta === 0) continue;
    const avgCost = qty > 0 ? value / qty : 0;
    if (delta > 0) {
      const unitCost = num(movement.unit_cost) || avgCost;
      qty += delta;
      value += delta * unitCost;
      continue;
    }
    const out = Math.abs(delta);
    const unitCost = avgCost || num(movement.unit_cost);
    if (movement.valuation_effect !== "inventory") cogs += out * unitCost;
    if (out > qty) shortageQty += out - Math.max(0, qty);
    qty -= out;
    value = qty > 0 ? qty * unitCost : 0;
  }

  return {
    productId,
    qtyOnHand: round2(qty),
    inventoryValue: round2(Math.max(0, value)),
    cogs: round2(cogs),
    unitCost: qty > 0 ? round2(value / qty) : 0,
    shortageQty: round2(shortageQty),
    layers: [],
  };
}

export type ValuationMethod = "fifo" | "average";

export function valuate(
  movements: StockMovementLike[],
  method: ValuationMethod = "fifo",
  productId: string | null = null,
): ValuationResult {
  return method === "average" ? valuateAverage(movements, productId) : valuateFifo(movements, productId);
}

/** Məhsul üzrə qruplaşdırıb hər biri üçün dəyərləmə qaytarır. */
export function valuateByProduct(
  movements: StockMovementLike[],
  method: ValuationMethod = "fifo",
): ValuationResult[] {
  const groups = new Map<string, StockMovementLike[]>();
  for (const movement of movements) {
    const key = String(movement.product_id ?? "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(movement);
  }
  return [...groups.entries()].map(([productId, rows]) => valuate(rows, method, productId || null));
}

/** Bütün portfel üzrə yekun: qalıq dəyəri, COGS və çatışmazlıq. */
export function summarizeValuation(results: ValuationResult[]) {
  return results.reduce(
    (acc, row) => ({
      inventoryValue: round2(acc.inventoryValue + row.inventoryValue),
      cogs: round2(acc.cogs + row.cogs),
      shortageQty: round2(acc.shortageQty + row.shortageQty),
      productCount: acc.productCount + 1,
    }),
    { inventoryValue: 0, cogs: 0, shortageQty: 0, productCount: 0 },
  );
}

/** Ümumi mənfəət: satış gəliri − COGS. */
export function grossMargin(revenue: number, cogs: number) {
  const value = round2(num(revenue) - num(cogs));
  const ratio = num(revenue) > 0 ? round2((value / num(revenue)) * 100) : 0;
  return { value, ratio };
}
