import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; payload?: unknown; id?: unknown }>,
  error: null as null | { message: string },
  rpcError: null as null | { message: string },
  confirm: vi.fn(),
}));

vi.mock("../shared/ui/dialogService.js", () => ({ appConfirm: mocks.confirm }));
vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: any) => {
      mocks.calls.push({ table: "rpc", op: name, payload: args });
      if (name === "save_vendor_invoice") return { data: { invoice_id: args._invoice_id || "INV-NEW" }, error: mocks.error };
      return { data: name === "evaluate_invoice_match" ? [{ po_line_id: "L1", status: "ok" }] : null, error: mocks.rpcError };
    },
    from: (table: string) => {
      if (!["vendor_invoices", "vendor_invoice_lines"].includes(table)) throw new Error(`unexpected table ${table}`);
      const record = (op: string, payload?: unknown, id?: unknown) => mocks.calls.push({ table, op, payload, id });
      return {
        insert: (payload: unknown) => {
          record("insert", payload);
          return Object.assign(Promise.resolve({ error: mocks.error }), {
            select: () => ({ single: async () => ({ data: { id: "INV-NEW" }, error: mocks.error }) }),
          });
        },
        update: (payload: unknown) => ({ eq: async (_c: string, id: unknown) => { record("update", payload, id); return { error: mocks.error }; } }),
        delete: () => ({ eq: async (_c: string, id: unknown) => { record("delete", undefined, id); return { error: mocks.error }; } }),
      };
    },
  },
}));

import { useInvoiceActions } from "../modules/procurement/useInvoiceActions.ts";

const poLines = [
  { id: "L1", po_id: "PO1", product_sku: "SKU-1", description: "Stul", qty_ordered: 10, unit_price: 25, tax_rate: 18 },
  { id: "L2", po_id: "PO1", product_sku: "SKU-2", description: "", qty_ordered: 4, unit_price: 0, tax_rate: 0 },
];

function setup(invoiceLines: Array<Record<string, any>> = []) {
  const deps = {
    tenantId: "tenant-a",
    user: { id: "user-1" },
    purchaseOrders: [{ id: "PO1", vendor_id: "V1", currency: "USD" }],
    linesByPo: new Map([["PO1", poLines]]),
    invoiceLinesByInvoice: new Map<string, Array<Record<string, any>>>(invoiceLines.length ? [[invoiceLines[0].invoice_id, invoiceLines]] : []),
    acceptedByLine: new Map<unknown, number>([["L1", 6]]),
    load: vi.fn(async () => {}),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
    setTab: vi.fn(),
  };
  return { ...deps, view: renderHook(() => useInvoiceActions(deps)) };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;

beforeEach(() => {
  mocks.calls = [];
  mocks.error = null;
  mocks.rpcError = null;
  mocks.confirm.mockReset();
});

describe("useInvoiceActions", () => {
  it("builds invoice lines from accepted quantities and the PO currency", () => {
    const { view, setTab } = setup();
    act(() => view.result.current.choosePoForInvoice("PO1"));
    expect(view.result.current.invoiceForm).toMatchObject({ po_id: "PO1", currency: "USD" });
    expect(view.result.current.invoiceForm.invoice_number).toMatch(/^INV-/);
    expect(view.result.current.invoiceDraftLines).toEqual([
      { po_line_id: "L1", label: "SKU-1 · Stul", ordered: 10, accepted: 6, qty_invoiced: "6", unit_price: "25", tax_rate: "18" },
      { po_line_id: "L2", label: "SKU-2", ordered: 4, accepted: 0, qty_invoiced: "4", unit_price: "0", tax_rate: "0" },
    ]);
    expect(setTab).toHaveBeenCalledWith("invoices");
  });

  it("validates the form before saving", async () => {
    const { view, setError } = setup();
    await act(() => view.result.current.saveInvoice(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("PO və faktura nömrəsi tələb olunur.");
    act(() => view.result.current.setInvoiceForm({ ...view.result.current.invoiceForm, po_id: "NOPE" }));
    await act(() => view.result.current.saveInvoice(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("PO tapılmadı.");
    act(() => view.result.current.choosePoForInvoice("PO1"));
    act(() => view.result.current.setInvoiceDraftLines(view.result.current.invoiceDraftLines.map((line) => ({ ...line, qty_invoiced: "0" }))));
    await act(() => view.result.current.saveInvoice(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("Faktura üçün ən azı bir sətir tələb olunur.");
    expect(mocks.calls).toEqual([]);
  });

  // Header and lines go to save_vendor_invoice in one call, so a failed line insert cannot leave an
  // invoice without lines.
  it("creates a draft invoice with its lines in one server call and runs the 3-way match", async () => {
    const { view, setNotice, load } = setup();
    act(() => view.result.current.choosePoForInvoice("PO1"));
    act(() => view.result.current.setInvoiceDraftLines(view.result.current.invoiceDraftLines.slice(0, 1)));
    await act(() => view.result.current.saveInvoice(submitEvent()));
    expect(mocks.calls[0]).toMatchObject({
      table: "rpc", op: "save_vendor_invoice",
      payload: {
        _tenant_id: "tenant-a", _invoice_id: null,
        _header: { vendor_id: "V1", po_id: "PO1", currency: "USD", match_notes: null, due_date: null },
        _lines: [{ po_line_id: "L1", qty_invoiced: 6, unit_price: 25, tax_rate: 18 }],
      },
    });
    expect(mocks.calls.slice(1).map((call) => call.op).sort()).toEqual(["apply_invoice_match", "evaluate_invoice_match"]);
    expect(view.result.current.matchRows).toEqual({ "INV-NEW": [{ po_line_id: "L1", status: "ok" }] });
    expect(setNotice).toHaveBeenLastCalledWith("Faktura yaradıldı və 3-way match hesablandı.");
    expect(load).toHaveBeenCalledOnce();
    expect(view.result.current.invoiceDraftLines).toEqual([]);
  });

  it("keeps the invoice in edit mode when the match fails after saving", async () => {
    const { view, setError, setNotice } = setup();
    act(() => view.result.current.choosePoForInvoice("PO1"));
    mocks.rpcError = { message: "match uğursuz" };
    await act(() => view.result.current.saveInvoice(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("match uğursuz");
    expect(setNotice).not.toHaveBeenCalledWith(expect.stringContaining("Faktura yaradıldı"));
    expect(view.result.current.editingInvoiceId).toBe("INV-NEW");
  });

  it("edits an invoice by replacing its lines", async () => {
    const invoiceLines = [{ invoice_id: "I1", po_line_id: "L1", qty_invoiced: 3, unit_price: 20, tax_rate: 0 }];
    const { view, setNotice } = setup(invoiceLines);
    act(() => view.result.current.editInvoice({ id: "I1", po_id: "PO1", invoice_number: "INV-7", currency: "USD" }));
    expect(view.result.current.invoiceDraftLines[0]).toMatchObject({ qty_invoiced: "3", unit_price: "20", tax_rate: "18" });
    await act(() => view.result.current.saveInvoice(submitEvent()));
    expect(mocks.calls[0]).toMatchObject({ table: "rpc", op: "save_vendor_invoice",
      payload: { _invoice_id: "I1", _header: { invoice_number: "INV-7" } } });
    expect(setNotice).toHaveBeenLastCalledWith("Faktura yeniləndi və 3-way match hesablandı.");
  });

  it("changes status, refuses direct payment and deletes only unpaid invoices after confirmation", async () => {
    const { view, setNotice, setError } = setup();
    await act(() => view.result.current.updateInvoiceStatus("I1", "approved"));
    expect(mocks.calls[0]).toMatchObject({ table: "vendor_invoices", op: "update", payload: { status: "approved" }, id: "I1" });
    expect(setNotice).toHaveBeenLastCalledWith("Faktura statusu dəyişdi: Təsdiqli.");
    await expect(view.result.current.updateInvoiceStatus("I1", "paid")).rejects.toThrow("Invoice payment requires the server command");

    mocks.calls = [];
    await act(() => view.result.current.deleteInvoice({ id: "I1", status: "paid", invoice_number: "INV-7" }));
    expect(setError).toHaveBeenLastCalledWith("Ödənilmiş fakturanı silmək olmaz. Lazımdırsa əvvəl ödəniş düzəlişi aparılmalıdır.");
    expect(mocks.confirm).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(false);
    await act(() => view.result.current.deleteInvoice({ id: "I1", status: "draft", invoice_number: "INV-7" }));
    expect(mocks.calls).toEqual([]);
    mocks.confirm.mockResolvedValueOnce(true);
    await act(() => view.result.current.deleteInvoice({ id: "I1", status: "draft", invoice_number: "INV-7" }));
    expect(mocks.calls).toEqual([{ table: "vendor_invoices", op: "delete", payload: undefined, id: "I1" }]);
    expect(setNotice).toHaveBeenLastCalledWith("Faktura silindi.");
  });
});
