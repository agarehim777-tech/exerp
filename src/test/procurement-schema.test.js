import { describe, expect, it, vi } from "vitest";
import { isMissingPoPaymentsTable, readLegacyPoPayments } from "../modules/procurement/procurementSchema.js";

describe("procurement optional schema", () => {
  it("recognizes a missing po_payments schema-cache error", () => {
    expect(isMissingPoPaymentsTable({
      code: "PGRST205",
      message: "Could not find the table 'public.po_payments' in the schema cache",
    })).toBe(true);
  });

  it("does not hide unrelated database errors", () => {
    expect(isMissingPoPaymentsTable({ message: "permission denied for purchase_orders" })).toBe(false);
    expect(isMissingPoPaymentsTable({ code: 'PGRST205', message: "Could not find public.purchase_orders in the schema cache" })).toBe(false);
  });

  it("never probes or writes the legacy payment table by default", async () => {
    const client = { from: vi.fn() };
    expect(await readLegacyPoPayments(client, 'tenant-a')).toEqual({ data: [], error: null, disabled: true });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("scopes explicit legacy reads and preserves permission errors", async () => {
    const result = { data: null, error: { code: '42501', message: 'permission denied' } };
    const order = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const client = { from: vi.fn().mockReturnValue({ select }) };
    expect(await readLegacyPoPayments(client, 'tenant-a', true)).toBe(result);
    expect(client.from).toHaveBeenCalledWith('po_payments');
    expect(eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
  });
});
