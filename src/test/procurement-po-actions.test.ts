import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  updates: [] as Array<{ table: string; payload: unknown; id: unknown }>,
  deletes: [] as Array<{ table: string; id: unknown }>,
  error: null as null | { message: string },
  confirm: vi.fn(),
}));

vi.mock("../shared/ui/dialogService.js", () => ({ appConfirm: mocks.confirm }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => ({
      update: (payload: unknown) => ({ eq: async (_column: string, id: unknown) => { mocks.updates.push({ table, payload, id }); return { error: mocks.error }; } }),
      delete: () => ({ eq: async (_column: string, id: unknown) => { mocks.deletes.push({ table, id }); return { error: mocks.error }; } }),
    }),
  },
}));

import { usePoActions } from "../modules/procurement/usePoActions.ts";
import { emptyPo, emptyPoLine } from "../modules/procurement/procurementShared.jsx";

type Row = Record<string, any>;
const linesByPo = new Map<unknown, Row[]>([["PO1", [
  { id: "L1", po_id: "PO1", product_sku: "K-1", description: "Kabel", qty_ordered: 10, unit_price: 5, tax_rate: 0 },
  { id: "L2", po_id: "PO1", product_sku: "M-1", description: "Siçan", qty_ordered: 2, unit_price: 20, tax_rate: 0 },
]]]);

function setup(overrides: Partial<{ goodsReceipts: Row[]; invoices: Row[]; receiptLines: Row[] }> = {}) {
  const shared = {
    load: vi.fn(async () => {}),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
    setTab: vi.fn(),
  };
  const view = renderHook(() => {
    const [poForm, setPoForm] = useState<Row>({ ...emptyPo, po_number: "PO-T" });
    const [poDraftLines, setPoDraftLines] = useState<Row[]>([{ ...emptyPoLine }]);
    const [editingPoId, setEditingPoId] = useState<string | null>(null);
    const actions = usePoActions({
      tenantId: "tenant-a", user: { id: "user-1" },
      products: [{ id: "P1", sku: "K-1", name: "Kabel", price: 5 }],
      goodsReceipts: overrides.goodsReceipts || [], invoices: overrides.invoices || [], receiptLines: overrides.receiptLines || [],
      linesByPo, poForm, poDraftLines, editingPoId, setPoForm, setPoDraftLines, setEditingPoId, ...shared,
    });
    return { ...actions, poForm, poDraftLines, editingPoId, setPoForm, setPoDraftLines };
  });
  return { ...shared, view };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { lines_replaced: true }, error: null });
  mocks.updates = [];
  mocks.deletes = [];
  mocks.error = null;
  mocks.confirm.mockReset();
});

describe("usePoActions", () => {
  it("fills a draft line from the product catalog", () => {
    const { view } = setup();
    act(() => view.result.current.setProductOnLine(0, "K-1"));
    expect(view.result.current.poDraftLines[0]).toMatchObject({ product_id: "P1", product_sku: "K-1", description: "Kabel", unit_price: "5" });
  });

  it("validates vendor, number and lines before saving", async () => {
    const { view, setError } = setup();
    await act(() => view.result.current.savePo(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("Vendor və PO nömrəsi tələb olunur.");
    act(() => view.result.current.setPoForm({ ...emptyPo, vendor_id: "V1", po_number: "PO-T" }));
    await act(() => view.result.current.savePo(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("PO üçün ən azı bir məhsul sətri tələb olunur.");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("saves header and valid lines in one save_purchase_order call", async () => {
    const { view, setNotice, load } = setup();
    act(() => {
      view.result.current.setPoForm({ ...emptyPo, vendor_id: "V1", po_number: " PO-9 ", notes: " təcili " });
      view.result.current.setPoDraftLines([
        { ...emptyPoLine, product_sku: " K-1 ", description: "Kabel", qty_ordered: "3", unit_price: "5" },
        { ...emptyPoLine, product_sku: "", qty_ordered: "1", unit_price: "1" },
      ]);
    });
    await act(() => view.result.current.savePo(submitEvent()));
    expect(mocks.rpc).toHaveBeenCalledOnce();
    const [name, args] = mocks.rpc.mock.calls[0];
    expect(name).toBe("save_purchase_order");
    expect(args).toMatchObject({ _tenant_id: "tenant-a", _po_id: null, _header: { vendor_id: "V1", po_number: "PO-9", notes: "təcili", created_by: "user-1" } });
    expect(args._lines).toEqual([{ line_no: 1, product_sku: "K-1", description: "Kabel", qty_ordered: 3, unit_price: 5, tax_rate: 0, product_id: null, unit: "ədəd" }]);
    expect(setNotice).toHaveBeenLastCalledWith("PO yaradıldı və qaralama statusunda saxlanıldı.");
    expect(load).toHaveBeenCalledOnce();
    expect(view.result.current.poDraftLines).toEqual([{ ...emptyPoLine }]);
  });

  it("reports that lines with receipts were kept when editing", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { lines_replaced: false }, error: null });
    const { view, setNotice, setTab } = setup();
    act(() => view.result.current.editPo({ id: "PO1", vendor_id: "V1", po_number: "PO-1", exchange_rate: 2 }));
    expect(view.result.current.editingPoId).toBe("PO1");
    expect(view.result.current.poDraftLines.map((line) => line.product_sku)).toEqual(["K-1", "M-1"]);
    expect(view.result.current.poForm).toMatchObject({ po_number: "PO-1", exchange_rate: "2" });
    expect(setTab).toHaveBeenCalledWith("po");
    await act(() => view.result.current.savePo(submitEvent()));
    expect(mocks.rpc.mock.calls[0][1]._po_id).toBe("PO1");
    expect(setNotice).toHaveBeenLastCalledWith("PO başlığı yeniləndi. Mədaxil/faktura olan PO sətirləri qorundu.");
  });

  it("recomputes PO status from accepted receipt quantities", async () => {
    const { view } = setup();
    await act(() => view.result.current.recomputePoStatus("PO1", [{ po_line_id: "L1", qty_received: 4, qty_rejected: 1 }]));
    await act(() => view.result.current.recomputePoStatus("PO1", [{ po_line_id: "L1", qty_received: 10, qty_rejected: 0 }, { po_line_id: "L2", qty_received: 2, qty_rejected: 0 }]));
    await act(() => view.result.current.recomputePoStatus("PO1", []));
    await act(() => view.result.current.recomputePoStatus("PO-EMPTY", []));
    expect(mocks.updates.map((update) => (update.payload as Row).status)).toEqual(["partial", "received", "approved"]);
  });

  it("updates status with its label and refuses to delete a PO that has receipts", async () => {
    const { view, setNotice, setError } = setup({ goodsReceipts: [{ id: "G1", po_id: "PO1" }] });
    await act(() => view.result.current.updatePoStatus("PO1", "approved"));
    expect(mocks.updates[0]).toEqual({ table: "purchase_orders", payload: { status: "approved" }, id: "PO1" });
    expect(setNotice.mock.calls.at(-1)?.[0]).toMatch(/^PO statusu dəyişdi: /);
    await act(() => view.result.current.deletePo({ id: "PO1", po_number: "PO-1" }));
    expect(setError).toHaveBeenLastCalledWith("Bu PO üzrə mədaxil və ya faktura var. Silmək əvəzinə ləğv edin/bağlayın.");
    expect(mocks.deletes).toEqual([]);
  });

  it("deletes a PO only after confirmation", async () => {
    const { view, setNotice } = setup();
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deletePo({ id: "PO2", po_number: "PO-2" }));
    expect(mocks.deletes).toEqual([{ table: "purchase_orders", id: "PO2" }]);
    expect(setNotice).toHaveBeenLastCalledWith("PO silindi.");
  });
});
