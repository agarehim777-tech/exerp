import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; payload?: unknown; id?: unknown }>,
  error: null as null | { message: string },
  confirm: vi.fn(),
}));

vi.mock("../shared/ui/dialogService.js", () => ({ appConfirm: mocks.confirm }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (!["goods_receipts", "goods_receipt_lines"].includes(table)) throw new Error(`unexpected table ${table}`);
      const record = (op: string, payload?: unknown, id?: unknown) => mocks.calls.push({ table, op, payload, id });
      return {
        insert: (payload: unknown) => {
          record("insert", payload);
          const result = { error: mocks.error };
          return Object.assign(Promise.resolve(result), {
            select: () => ({ single: async () => ({ data: { id: "GRN-NEW" }, error: mocks.error }) }),
          });
        },
        update: (payload: unknown) => ({ eq: async (_c: string, id: unknown) => { record("update", payload, id); return { error: mocks.error }; } }),
        delete: () => ({ eq: async (_c: string, id: unknown) => { record("delete", undefined, id); return { error: mocks.error }; } }),
      };
    },
  },
}));

import { useReceiptActions } from "../modules/procurement/useReceiptActions.ts";

const poLines = [
  { id: "L1", po_id: "PO1", product_sku: "SKU-1", description: "Stul", qty_ordered: 10 },
  { id: "L2", po_id: "PO1", product_sku: "SKU-2", description: "", qty_ordered: 4 },
];

function setup({ receiptLines = [] as Array<Record<string, any>>, accepted = new Map<string, number>() } = {}) {
  const deps = {
    tenantId: "tenant-a",
    user: { id: "user-1" },
    purchaseOrders: [{ id: "PO1", po_number: "PO-1" }],
    receiptLines,
    linesByPo: new Map([["PO1", poLines]]),
    receiptLinesByReceipt: new Map<string, Array<Record<string, any>>>(
      receiptLines.length ? [[receiptLines[0].grn_id, receiptLines]] : [],
    ),
    acceptedByLine: accepted,
    recomputePoStatus: vi.fn(async () => {}),
    load: vi.fn(async () => {}),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
    setTab: vi.fn(),
  };
  return { ...deps, view: renderHook(() => useReceiptActions(deps)) };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;

beforeEach(() => {
  mocks.calls = [];
  mocks.error = null;
  mocks.confirm.mockReset();
});

describe("useReceiptActions", () => {
  it("builds draft lines with the outstanding quantity when a PO is chosen", () => {
    const { view, setTab } = setup({ accepted: new Map([["L1", 3]]) });
    act(() => view.result.current.choosePoForReceipt("PO1"));
    expect(view.result.current.receiptForm.po_id).toBe("PO1");
    expect(view.result.current.receiptForm.grn_number).toMatch(/^GRN-/);
    expect(view.result.current.receiptDraftLines).toEqual([
      expect.objectContaining({ po_line_id: "L1", label: "SKU-1 · Stul", outstanding: 7, qty_received: "7", qty_rejected: "0" }),
      expect.objectContaining({ po_line_id: "L2", label: "SKU-2", outstanding: 4, qty_received: "4" }),
    ]);
    expect(setTab).toHaveBeenCalledWith("grn");
  });

  it("ignores an unknown PO", () => {
    const { view, setTab } = setup();
    act(() => view.result.current.choosePoForReceipt("NOPE"));
    expect(view.result.current.receiptForm.po_id).toBe("");
    expect(setTab).not.toHaveBeenCalled();
  });

  it("validates quantities and volume before saving", async () => {
    const { view, setError } = setup();
    await act(() => view.result.current.saveReceipt(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("PO və GRN nömrəsi tələb olunur.");
    act(() => view.result.current.choosePoForReceipt("PO1"));
    await act(() => view.result.current.saveReceipt(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("SKU-1 · Stul: miqdarları yoxlayın və mədaxil edilən məhsul üçün vahid həcmi daxil edin.");
    act(() => view.result.current.setReceiptDraftLines(view.result.current.receiptDraftLines.map((line) => ({ ...line, qty_received: "0" }))));
    await act(() => view.result.current.saveReceipt(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("Ən azı bir mədaxil sətri tələb olunur.");
    expect(mocks.calls).toEqual([]);
  });

  it("creates a receipt with its lines and recomputes the PO status", async () => {
    const { view, recomputePoStatus, setNotice, load } = setup();
    act(() => view.result.current.choosePoForReceipt("PO1"));
    act(() => view.result.current.setReceiptDraftLines(view.result.current.receiptDraftLines.map((line, index) => (
      index === 0 ? { ...line, qty_received: "5", qty_rejected: "1", unit_volume_m3: "0.2" } : { ...line, qty_received: "0" }
    ))));
    await act(() => view.result.current.saveReceipt(submitEvent()));
    expect(mocks.calls[0]).toMatchObject({ table: "goods_receipts", op: "insert", payload: { tenant_id: "tenant-a", po_id: "PO1", received_by: "user-1", notes: null } });
    expect(mocks.calls[1]).toEqual({
      table: "goods_receipt_lines", op: "insert", id: undefined,
      payload: [{ po_line_id: "L1", qty_received: 5, qty_rejected: 1, unit_volume_m3: 0.2, grn_id: "GRN-NEW" }],
    });
    expect(recomputePoStatus).toHaveBeenCalledWith("PO1", [{ po_line_id: "L1", qty_received: 5, qty_rejected: 1, unit_volume_m3: 0.2, grn_id: "GRN-NEW" }]);
    expect(setNotice).toHaveBeenLastCalledWith("Mədaxil qeyd edildi və PO statusu hesablandı.");
    expect(load).toHaveBeenCalledOnce();
    expect(view.result.current.receiptDraftLines).toEqual([]);
    expect(view.result.current.editingReceiptId).toBeNull();
  });

  it("edits a receipt by replacing its lines", async () => {
    const receiptLines = [{ grn_id: "G1", po_line_id: "L1", qty_received: 6, qty_rejected: 1, unit_volume_m3: 0.3 }];
    const { view, setNotice } = setup({ receiptLines, accepted: new Map([["L1", 5]]) });
    act(() => view.result.current.editReceipt({ id: "G1", po_id: "PO1", grn_number: "GRN-7", receipt_date: "2026-11-10", notes: "" }));
    expect(view.result.current.editingReceiptId).toBe("G1");
    expect(view.result.current.receiptDraftLines[0]).toMatchObject({ outstanding: 10, qty_received: "6", qty_rejected: "1", unit_volume_m3: "0.3" });
    act(() => view.result.current.setReceiptDraftLines(view.result.current.receiptDraftLines.map((line, index) => (index === 0 ? line : { ...line, qty_received: "0" }))));
    await act(() => view.result.current.saveReceipt(submitEvent()));
    expect(mocks.calls.map((call) => `${call.table}:${call.op}:${call.id ?? ""}`)).toEqual([
      "goods_receipts:update:G1", "goods_receipt_lines:delete:G1", "goods_receipt_lines:insert:",
    ]);
    expect(setNotice).toHaveBeenLastCalledWith("GRN yeniləndi və PO statusu hesablandı.");
  });

  it("deletes a receipt only after confirmation and reports errors", async () => {
    const receiptLines = [{ grn_id: "G1", po_line_id: "L1", qty_received: 2, qty_rejected: 0 }];
    const { view, recomputePoStatus, setNotice, setError } = setup({ receiptLines });
    mocks.confirm.mockResolvedValueOnce(false);
    await act(() => view.result.current.deleteReceipt({ id: "G1", po_id: "PO1", grn_number: "GRN-7" }));
    expect(mocks.calls).toEqual([]);
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deleteReceipt({ id: "G1", po_id: "PO1", grn_number: "GRN-7" }));
    expect(mocks.calls).toEqual([{ table: "goods_receipts", op: "delete", payload: undefined, id: "G1" }]);
    expect(recomputePoStatus).toHaveBeenCalledWith("PO1", []);
    expect(setNotice).toHaveBeenLastCalledWith("GRN silindi və PO statusu yeniləndi.");
    mocks.error = { message: "icazə yoxdur" };
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deleteReceipt({ id: "G2", po_id: "PO1", grn_number: "GRN-8" }));
    expect(setError).toHaveBeenLastCalledWith("icazə yoxdur");
  });
});
