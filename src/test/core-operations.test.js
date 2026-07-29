import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import {
  completeDelivery,
  createCreditContract,
  postCreditPayment,
  reserveStock,
} from "../services/coreOperations";

describe("normalized core operations", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: "operation-id", error: null });
  });

  it("keeps every sale credit linked to its own order", async () => {
    await createCreditContract({
      tenantId: "tenant-1",
      contractNo: "KR-1001",
      customerId: "customer-1",
      orderId: "order-77",
      principal: 1200,
      initialPayment: 100,
      termMonths: 12,
      startDate: "2026-07-29",
    });

    expect(rpc).toHaveBeenCalledWith("create_credit_contract", {
      _tenant_id: "tenant-1",
      _contract_no: "KR-1001",
      _customer_id: "customer-1",
      _order_id: "order-77",
      _principal: 1200,
      _initial_payment: 100,
      _term_months: 12,
      _start_date: "2026-07-29",
    });
  });

  it("posts principal and penalty as separate amounts", async () => {
    await postCreditPayment({
      tenantId: "tenant-1",
      creditId: "credit-1",
      receiptNo: "Q-001",
      amount: 205,
      penaltyAmount: 5,
      cashAccountId: "cash-1",
    });

    expect(rpc).toHaveBeenCalledWith(
      "post_credit_payment",
      expect.objectContaining({ _amount: 205, _penalty_amount: 5 }),
    );
  });

  it("requires tenant identity before a stock mutation", () => {
    expect(() =>
      reserveStock({
        warehouseId: "warehouse-1",
        productId: "product-1",
        orderId: "order-1",
        quantity: 1,
      }),
    ).toThrow("tenantId tələb olunur");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the atomic delivery RPC", async () => {
    await completeDelivery({
      tenantId: "tenant-1",
      deliveryId: "delivery-1",
      recipientName: "Aysel Məmmədova",
    });

    expect(rpc).toHaveBeenCalledWith("complete_delivery", {
      _tenant_id: "tenant-1",
      _delivery_id: "delivery-1",
      _recipient_name: "Aysel Məmmədova",
      _recipient_document: null,
    });
  });

  it("propagates backend conflicts instead of hiding them", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "insufficient_available_stock" },
    });

    await expect(
      reserveStock({
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        productId: "product-1",
        orderId: "order-1",
        quantity: 2,
      }),
    ).rejects.toMatchObject({
      code: "P0001",
      message: "insufficient_available_stock",
    });
  });
});
