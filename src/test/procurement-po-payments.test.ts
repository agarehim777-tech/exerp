import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ op: string; payload?: unknown; id?: unknown }>,
  error: null as null | { message: string },
  confirm: vi.fn(),
}));

vi.mock("../shared/ui/dialogService.js", () => ({ appConfirm: mocks.confirm }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "po_payments") throw new Error(`unexpected table ${table}`);
      return {
        insert: async (payload: unknown) => { mocks.calls.push({ op: "insert", payload }); return { error: mocks.error }; },
        update: (payload: unknown) => ({ eq: async (_c: string, id: unknown) => { mocks.calls.push({ op: "update", payload, id }); return { error: mocks.error }; } }),
        delete: () => ({ eq: async (_c: string, id: unknown) => { mocks.calls.push({ op: "delete", id }); return { error: mocks.error }; } }),
      };
    },
  },
}));

import { usePoPaymentActions } from "../modules/procurement/usePoPaymentActions.ts";
import { emptyPoPayment } from "../modules/procurement/procurementShared.jsx";

function setup(poPaymentsAvailable = true) {
  const deps = {
    tenantId: "tenant-a",
    user: { id: "user-1" },
    poPaymentsAvailable,
    setExpandedPo: vi.fn(),
    load: vi.fn(async () => {}),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
  };
  return { ...deps, view: renderHook(() => usePoPaymentActions(deps)) };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;

beforeEach(() => {
  mocks.calls = [];
  mocks.error = null;
  mocks.confirm.mockReset();
});

describe("usePoPaymentActions", () => {
  it("does nothing while the legacy payments table is unavailable", async () => {
    const { view, setExpandedPo, setError } = setup(false);
    act(() => view.result.current.openPaymentForm({ id: "PO1" }));
    expect(view.result.current.paymentPoId).toBeNull();
    expect(setExpandedPo).not.toHaveBeenCalled();
    await act(() => view.result.current.savePoPayment(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("Satınalma ödənişləri bağlıdır. Server ledger ödəniş komandası tətbiq edilməlidir.");
    await act(() => view.result.current.deletePayment({ id: "PAY1" }));
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.calls).toEqual([]);
  });

  it("opens a new payment for a PO and expands its card", () => {
    const { view, setExpandedPo } = setup();
    act(() => view.result.current.openPaymentForm({ id: "PO1" }));
    expect(view.result.current.paymentPoId).toBe("PO1");
    expect(view.result.current.editingPaymentId).toBeNull();
    expect(view.result.current.paymentForm.po_id).toBe("PO1");
    expect(setExpandedPo).toHaveBeenCalledWith("PO1");
  });

  it("requires an amount and records a payment for the tenant", async () => {
    const { view, setError, setNotice, load } = setup();
    act(() => view.result.current.openPaymentForm({ id: "PO1" }));
    await act(() => view.result.current.savePoPayment(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("PO və ödəniş məbləği tələb olunur.");
    act(() => view.result.current.setPaymentForm({ ...view.result.current.paymentForm, amount: "150", reference_no: " TR-1 ", payment_method: "" }));
    await act(() => view.result.current.savePoPayment(submitEvent()));
    expect(mocks.calls).toEqual([{
      op: "insert",
      payload: expect.objectContaining({ po_id: "PO1", amount: 150, payment_method: "bank", reference_no: "TR-1", notes: null, tenant_id: "tenant-a", created_by: "user-1" }),
    }]);
    expect(setNotice).toHaveBeenLastCalledWith("PO ödənişi qeyd edildi.");
    expect(load).toHaveBeenCalledOnce();
    expect(view.result.current.paymentForm).toEqual(emptyPoPayment);
    expect(view.result.current.paymentPoId).toBeNull();
  });

  it("edits an existing payment by id", async () => {
    const { view, setNotice, setExpandedPo } = setup();
    act(() => view.result.current.editPayment({ id: "PAY1", po_id: "PO1", amount: 80, payment_date: "2026-11-10", payment_method: "cash" }));
    expect(view.result.current.editingPaymentId).toBe("PAY1");
    expect(view.result.current.paymentForm).toMatchObject({ amount: "80", payment_method: "cash" });
    expect(setExpandedPo).toHaveBeenCalledWith("PO1");
    await act(() => view.result.current.savePoPayment(submitEvent()));
    expect(mocks.calls[0]).toMatchObject({ op: "update", id: "PAY1", payload: { amount: 80, payment_date: "2026-11-10" } });
    expect(setNotice).toHaveBeenLastCalledWith("Ödəniş yeniləndi.");
  });

  it("deletes a payment only after confirmation and reports errors", async () => {
    const { view, setNotice, setError } = setup();
    mocks.confirm.mockResolvedValueOnce(false);
    await act(() => view.result.current.deletePayment({ id: "PAY1" }));
    expect(mocks.calls).toEqual([]);
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deletePayment({ id: "PAY1" }));
    expect(mocks.calls).toEqual([{ op: "delete", id: "PAY1" }]);
    expect(setNotice).toHaveBeenLastCalledWith("Ödəniş silindi.");
    mocks.error = { message: "icazə yoxdur" };
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deletePayment({ id: "PAY2" }));
    expect(setError).toHaveBeenLastCalledWith("icazə yoxdur");
  });
});
