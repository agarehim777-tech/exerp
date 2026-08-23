import { describe, expect, it } from "vitest";
import { buildAgingRows, getAgingBucket, isMissingAgingView } from "../modules/warehouse/stockAging.js";

describe("stock aging fallback", () => {
  it("uses the same bucket boundaries as the database view", () => {
    expect(getAgingBucket(30)).toBe("0-30");
    expect(getAgingBucket(31)).toBe("31-90");
    expect(getAgingBucket(90)).toBe("31-90");
    expect(getAgingBucket(91)).toBe("91-180");
    expect(getAgingBucket(180)).toBe("91-180");
    expect(getAgingBucket(181)).toBe("180+");
  });

  it("builds product aging and stock value from FIFO cost layers", () => {
    const rows = buildAgingRows([
      {
        tenant_id: "tenant-1",
        warehouse_id: "warehouse-1",
        product_id: "product-1",
        received_at: "2026-04-01T10:00:00Z",
        remaining_qty: "2.5",
        unit_cost: "12.345",
        product: { name: "Sonia G5", sku: "SN-G5" },
      },
    ], new Date("2026-08-23T12:00:00Z"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      product_name: "Sonia G5",
      sku: "SN-G5",
      age_days: 144,
      aging_bucket: "91-180",
      stock_value: 30.86,
    });
  });

  it("recognizes the missing schema-cache view error", () => {
    expect(isMissingAgingView({
      code: "PGRST205",
      message: "Could not find the table 'public.inventory_aging_v' in the schema cache",
    })).toBe(true);
    expect(isMissingAgingView({ message: "permission denied" })).toBe(false);
  });
});
