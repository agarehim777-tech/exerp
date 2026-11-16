import { describe, expect, it } from "vitest";
import { SalesOperationModal } from "../modules/sales/components/SalesOperationModal.jsx";
import { SalesOrderModal } from "../modules/sales/components/SalesOrderModal.jsx";
import { buildSalesProductOptions } from "../modules/sales/services/salesOrderForm.ts";

describe("SalesOrderModals.jsx bridge", () => {
  it("re-exports both modals and the product option builder for existing importers", async () => {
    // Same dynamic import AppWidgets.jsx uses for its lazy() modals.
    const bridge = await import("../modules/sales/components/SalesOrderModals.jsx");
    expect(bridge.SalesOperationModal).toBe(SalesOperationModal);
    expect(bridge.SalesOrderModal).toBe(SalesOrderModal);
    expect(bridge.buildSalesProductOptions).toBe(buildSalesProductOptions);
    expect(typeof SalesOperationModal).toBe("function");
    expect(typeof SalesOrderModal).toBe("function");
  });
});
