import { describe, expect, it } from "vitest";
import { dbOrderToLegacy } from "../shared/adapters/erpShape.js";

describe("delivery history mapping", () => {
  it("keeps the delivery date and warehouse employee on refreshed orders", () => {
    const mapped = dbOrderToLegacy({
      id: "order-1",
      order_no: "SF-1005",
      status: "delivered",
      total: 500,
      paid_amount: 500,
      customer: { name: "Test müştəri" },
      items: [],
      delivery: {
        warehouse_id: "warehouse-1",
        delivered_at: "2026-08-23T12:15:00.000Z",
        acceptance_name: "Təhvil alan şəxs",
        warehouse_employee_name: "Anbar əməkdaşı",
      },
    });

    expect(mapped.deliveredAt).toBe("2026-08-23T12:15:00.000Z");
    expect(mapped.warehouseId).toBe("warehouse-1");
    expect(mapped.deliveredBy).toBe("Anbar əməkdaşı");
    expect(mapped.deliveryAcceptance.warehouseEmployeeName).toBe("Anbar əməkdaşı");
  });

  it("uses the order update time for older delivered rows without a delivery document", () => {
    const mapped = dbOrderToLegacy({
      id: "legacy-order",
      order_no: "SF-1001",
      status: "delivered",
      updated_at: "2026-08-16T10:00:00.000Z",
      total: 100,
      customer: { name: "Köhnə müştəri" },
      items: [],
    });

    expect(mapped.deliveredAt).toBe("2026-08-16T10:00:00.000Z");
  });
});
