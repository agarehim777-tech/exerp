import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("../integrations/supabase/client", () => ({
  supabase: { rpc },
}));

import {
  completeDelivery,
  createIdempotencyKey,
  createSalesOrderAtomic,
  createCreditContract,
  lockAccountingPeriod,
  reopenAccountingPeriod,
  postCreditPayment,
  reserveStock,
  startCreditContract,
} from "../services/coreOperations";

describe("normalized core operations", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: "operation-id", error: null });
  });

  it("creates an idempotent atomic sales request", async () => {
    await createSalesOrderAtomic({
      tenantId: "tenant-1",
      requestKey: "sales-order:req-1",
      orderNo: "SF-1002",
      customerId: "customer-1",
      orderDate: "2026-08-12",
      items: [{ product_id: "product-1", qty: 1, unit_price: 500 }],
      credit: { contract_no: "IN-1002", principal: 500, term_months: 12 },
    });

    expect(rpc).toHaveBeenCalledWith("create_sales_order_atomic", expect.objectContaining({
      _tenant_id: "tenant-1",
      _request_key: "sales-order:req-1",
      _order_no: "SF-1002",
      _credit: expect.objectContaining({ contract_no: "IN-1002" }),
    }));
  });

  it("generates a unique client request key", () => {
    const first = createIdempotencyKey("payment");
    const second = createIdempotencyKey("payment");
    expect(first).toMatch(/^payment:/);
    expect(second).not.toBe(first);
  });

  it("locks accounting periods through an admin RPC", async () => {
    await lockAccountingPeriod({
      tenantId: "tenant-1",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      reason: "Month close",
    });
    expect(rpc).toHaveBeenCalledWith("lock_accounting_period", {
      _tenant_id: "tenant-1",
      _period_start: "2026-07-01",
      _period_end: "2026-07-31",
      _reason: "Month close",
    });
  });

  it("reopens an accounting period with an audited reason", async () => {
    await reopenAccountingPeriod({
      tenantId: "tenant-1",
      periodLockId: "period-1",
      reason: "Audit correction",
    });
    expect(rpc).toHaveBeenCalledWith("reopen_accounting_period", {
      _tenant_id: "tenant-1",
      _period_lock_id: "period-1",
      _reason: "Audit correction",
    });
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

  it("starts a draft credit on an explicit date", async () => {
    await startCreditContract({ tenantId: "tenant-1", creditId: "credit-1", startDate: "2026-08-13" });

    expect(rpc).toHaveBeenCalledWith("start_credit_contract", {
      _tenant_id: "tenant-1",
      _credit_id: "credit-1",
      _start_date: "2026-08-13",
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
