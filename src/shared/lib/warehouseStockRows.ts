// Anbar üzrə qruplaşdırılmış stok sətirlərini (warehouseId -> sətirlər) tək siyahıya açır.
export function flattenWarehouseStock<T extends object>(warehouseStock: Record<string, T[] | null | undefined> = {}): Array<T & { warehouseId: string }> {
  return Object.entries(warehouseStock || {}).flatMap(([warehouseId, rows]) =>
    (rows || []).map((row) => ({ ...row, warehouseId })),
  );
}
