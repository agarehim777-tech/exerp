import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  failTable: null as string | null,
  gate: null as Promise<void> | null,
  tenantFilters: [] as Array<{ table: string; column: string; value: unknown }>,
}));

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let start = 0;
      let end = 499;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (column: string, value: unknown) => { mocks.tenantFilters.push({ table, column, value }); return chain; },
        order: () => chain,
        range: (from: number, to: number) => { start = from; end = to; return chain; },
        then: (resolve: (value: unknown) => unknown) =>
          (mocks.gate || Promise.resolve()).then(() =>
            resolve(mocks.failTable === table
              ? { data: null, error: { message: `${table} oxunmadı` } }
              : { data: (mocks.rows[table] || []).slice(start, end + 1), error: null })),
      };
      return chain;
    },
  },
}));

import { useProcurementRegistry } from "../modules/procurement/useProcurementRegistry.ts";

const alwaysCurrent = () => () => true;

beforeEach(() => {
  mocks.failTable = null;
  mocks.gate = null;
  mocks.tenantFilters = [];
  mocks.rows = {
    vendors: [{ id: "V1", name: "Alfa" }],
    products: [{ id: "P1", name: "Kabel" }],
    purchase_orders: [{ id: "PO1" }],
    purchase_order_lines: [{ id: "L1", po_id: "PO1" }],
    goods_receipts: [{ id: "G1" }],
    goods_receipt_lines: [{ id: "GL1" }],
    vendor_invoices: [{ id: "I1" }],
    vendor_invoice_lines: [{ id: "IL1" }],
  };
});

describe("useProcurementRegistry", () => {
  it("does not read anything without a tenant and stops loading", async () => {
    const { result } = renderHook(() => useProcurementRegistry({ tenantId: null, begin: alwaysCurrent, setError: vi.fn() }));
    await act(() => result.current.load());
    expect(result.current.loading).toBe(false);
    expect(result.current.registryLoaded).toBe(false);
    expect(mocks.tenantFilters).toEqual([]);
  });

  it("loads every procurement collection for the tenant", async () => {
    const setError = vi.fn();
    const { result } = renderHook(() => useProcurementRegistry({ tenantId: "tenant-a", begin: alwaysCurrent, setError }));
    await act(() => result.current.load());
    expect(result.current).toMatchObject({
      loading: false,
      registryLoaded: true,
      vendors: [{ id: "V1", name: "Alfa" }],
      purchaseOrders: [{ id: "PO1" }],
      poLines: [{ id: "L1", po_id: "PO1" }],
      invoiceLines: [{ id: "IL1" }],
      poPayments: [],
      poPaymentsAvailable: false,
    });
    expect(setError).toHaveBeenCalledWith("");
    // Child lines are scoped through their tenant-owned parent.
    expect(mocks.tenantFilters).toContainEqual({ table: "purchase_order_lines", column: "purchase_orders.tenant_id", value: "tenant-a" });
    expect(mocks.tenantFilters.every((filter) => filter.value === "tenant-a")).toBe(true);
  });

  it("reports a read error and leaves the registry unloaded", async () => {
    mocks.failTable = "vendor_invoices";
    const setError = vi.fn();
    const { result } = renderHook(() => useProcurementRegistry({ tenantId: "tenant-a", begin: alwaysCurrent, setError }));
    await act(() => result.current.load());
    expect(setError).toHaveBeenLastCalledWith("vendor_invoices oxunmadı");
    expect(result.current).toMatchObject({ loading: false, registryLoaded: false, vendors: [] });
  });

  it("drops a late response once the request is no longer current", async () => {
    let current = true;
    let release!: () => void;
    mocks.gate = new Promise<void>((resolve) => { release = resolve; });
    const setError = vi.fn();
    const { result } = renderHook(() => useProcurementRegistry({ tenantId: "tenant-a", begin: () => () => current, setError }));
    let pending!: Promise<void>;
    act(() => { pending = result.current.load(); });
    await waitFor(() => expect(result.current.loading).toBe(true));
    current = false;
    release();
    await act(() => pending);
    expect(result.current.registryLoaded).toBe(false);
    expect(result.current.vendors).toEqual([]);
    // The stale request also must not clear the spinner: a newer request owns it.
    expect(result.current.loading).toBe(true);
  });
});
