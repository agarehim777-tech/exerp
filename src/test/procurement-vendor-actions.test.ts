import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; payload?: unknown; eq?: [string, unknown] }>,
  error: null as null | { message: string },
  confirm: vi.fn(),
}));

vi.mock("../shared/ui/dialogService.js", () => ({ appConfirm: mocks.confirm }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const record = (op: string, payload?: unknown) => {
        const call: (typeof mocks.calls)[number] = { table, op, payload };
        mocks.calls.push(call);
        const result = Promise.resolve({ error: mocks.error });
        return Object.assign(result, {
          eq: (column: string, value: unknown) => { call.eq = [column, value]; return Promise.resolve({ error: mocks.error }); },
        });
      };
      return {
        insert: (payload: unknown) => record("insert", payload),
        update: (payload: unknown) => record("update", payload),
        delete: () => record("delete"),
      };
    },
  },
}));

import { useVendorActions } from "../modules/procurement/useVendorActions.ts";
import { emptyVendor } from "../modules/procurement/procurementShared.jsx";

function setup(purchaseOrders: Array<Record<string, unknown>> = []) {
  const deps = {
    tenantId: "tenant-a",
    purchaseOrders,
    load: vi.fn(async () => {}),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
    setTab: vi.fn(),
  };
  const view = renderHook(() => useVendorActions(deps));
  return { ...deps, view };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;

beforeEach(() => {
  mocks.calls = [];
  mocks.error = null;
  mocks.confirm.mockReset();
});

describe("useVendorActions", () => {
  it("requires a vendor name before saving", async () => {
    const { view, setError, load } = setup();
    await act(() => view.result.current.saveVendor(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("Vendor adı tələb olunur.");
    expect(mocks.calls).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it("creates a vendor for the tenant with trimmed fields and resets the form", async () => {
    const { view, setNotice, load, setSaving } = setup();
    act(() => view.result.current.setVendorForm({ ...emptyVendor, name: "  Alfa MMC ", tax_id: " 123 ", email: "" }));
    await act(() => view.result.current.saveVendor(submitEvent()));
    expect(mocks.calls).toEqual([{
      table: "vendors", op: "insert",
      payload: { name: "Alfa MMC", tax_id: "123", email: null, phone: null, address: null, is_active: true, tenant_id: "tenant-a" },
    }]);
    expect(setNotice).toHaveBeenLastCalledWith("Vendor yaradıldı.");
    expect(load).toHaveBeenCalledOnce();
    expect(view.result.current.vendorForm).toEqual(emptyVendor);
    expect(setSaving.mock.calls).toEqual([[true], [false]]);
  });

  it("opens a vendor for editing and updates it by id", async () => {
    const { view, setTab, setNotice } = setup();
    act(() => view.result.current.editVendor({ id: "V1", name: "Beta", tax_id: null, is_active: false }));
    expect(view.result.current.editingVendorId).toBe("V1");
    expect(view.result.current.vendorForm).toEqual({ name: "Beta", tax_id: "", email: "", phone: "", address: "", is_active: false });
    expect(setTab).toHaveBeenCalledWith("vendors");
    await act(() => view.result.current.saveVendor(submitEvent()));
    expect(mocks.calls[0]).toMatchObject({ op: "update", eq: ["id", "V1"], payload: { name: "Beta", is_active: false } });
    expect(setNotice).toHaveBeenLastCalledWith("Vendor məlumatları yeniləndi.");
    expect(view.result.current.editingVendorId).toBeNull();
  });

  it("toggles active status and reports errors", async () => {
    const { view, setNotice, setError } = setup();
    await act(() => view.result.current.toggleVendor({ id: "V1", name: "Alfa", is_active: true }));
    expect(mocks.calls[0]).toMatchObject({ op: "update", payload: { is_active: false }, eq: ["id", "V1"] });
    expect(setNotice).toHaveBeenLastCalledWith("Alfa passiv edildi.");
    mocks.error = { message: "icazə yoxdur" };
    await act(() => view.result.current.toggleVendor({ id: "V1", name: "Alfa", is_active: false }));
    expect(setError).toHaveBeenLastCalledWith("icazə yoxdur");
  });

  it("deactivates instead of deleting a vendor with purchase orders", async () => {
    const { view, setNotice, load } = setup([{ id: "PO1", vendor_id: "V1" }]);
    await act(() => view.result.current.deleteVendor({ id: "V1", name: "Alfa" }));
    expect(mocks.calls).toEqual([{ table: "vendors", op: "update", payload: { is_active: false }, eq: ["id", "V1"] }]);
    expect(setNotice).toHaveBeenLastCalledWith("Bu vendor üzrə PO tarixi var. Silmək əvəzinə passiv statusa keçirildi.");
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledOnce();
  });

  it("deletes a vendor only after confirmation", async () => {
    const { view, setNotice } = setup();
    mocks.confirm.mockResolvedValueOnce(false);
    await act(() => view.result.current.deleteVendor({ id: "V2", name: "Gamma" }));
    expect(mocks.calls).toEqual([]);
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deleteVendor({ id: "V2", name: "Gamma" }));
    expect(mocks.calls).toEqual([{ table: "vendors", op: "delete", payload: undefined, eq: ["id", "V2"] }]);
    expect(setNotice).toHaveBeenLastCalledWith("Vendor silindi.");
  });
});
