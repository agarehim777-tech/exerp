import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: any }>,
  rpcError: null as null | { message: string },
  tables: {} as Record<string, { data: unknown[]; error: null | { message: string } }>,
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
}));

vi.mock("../integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => {
      mocks.rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: name === "ensure_inventory_accounts" ? null : mocks.rpcError });
    },
    from: (table: string) => {
      const result = mocks.tables[table] || { data: [], error: null };
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => { mocks.filters.push({ table, column, value }); return chain; },
        order: () => chain,
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    },
  },
}));

import { useInvoicePayment } from "../modules/procurement/useInvoicePayment.ts";

const cash = { id: "CASH1", name: "Əsas kassa", currency: "AZN", gl_account_id: "GL-CASH" };
const coa = [
  { id: "GL-CASH", code: "1010", name: "Kassa" },
  { id: "GL-1400", code: "1400", name: "Əvəzləşdirilən ƏDV" },
  { id: "GL-1300", code: "1300", name: "Avans" },
  { id: "GL-1200", code: "1200", name: "Debitor" },
];

function setup({ taxed = false, current = true } = {}) {
  const deps = {
    tenantId: "tenant-a",
    begin: vi.fn(() => () => current),
    saving: false,
    invoiceLinesByInvoice: new Map([["I1", [{ invoice_id: "I1", tax_rate: taxed ? 18 : 0 }]]]),
    load: vi.fn(async () => {}),
    setError: vi.fn(),
    setNotice: vi.fn(),
    setSaving: vi.fn(),
  };
  return { ...deps, view: renderHook((props: typeof deps) => useInvoicePayment(props), { initialProps: deps }) };
}
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as import("react").FormEvent;
const invoice = { id: "I1", invoice_number: "INV-7", currency: "AZN" };

beforeEach(() => {
  mocks.rpcCalls = [];
  mocks.rpcError = null;
  mocks.filters = [];
  mocks.tables = { cash_accounts: { data: [cash], error: null }, chart_of_accounts: { data: coa, error: null } };
});

describe("useInvoicePayment", () => {
  it("opens an untaxed invoice with the first active cash account in its currency", async () => {
    const { view } = setup();
    await act(() => view.result.current.openInvoicePayment(invoice));
    expect(mocks.rpcCalls).toEqual([]);
    expect(mocks.filters).toEqual([
      { table: "cash_accounts", column: "tenant_id", value: "tenant-a" },
      { table: "cash_accounts", column: "is_active", value: true },
      { table: "cash_accounts", column: "currency", value: "AZN" },
    ]);
    expect(view.result.current.payingInvoice).toEqual({ ...invoice, hasTax: false });
    expect(view.result.current.invoiceAccountId).toBe("CASH1");
    expect(view.result.current.taxAccounts).toEqual([]);
  });

  it("seeds and preselects the 1400 VAT account for a taxed invoice, excluding cash and system accounts", async () => {
    const { view } = setup({ taxed: true });
    await act(() => view.result.current.openInvoicePayment(invoice));
    expect(mocks.rpcCalls).toEqual([{ name: "ensure_inventory_accounts", args: { _tenant: "tenant-a" } }]);
    expect(view.result.current.taxAccounts.map((row) => row.code)).toEqual(["1400", "1300"]);
    expect(view.result.current.invoiceTaxAccountId).toBe("GL-1400");
    expect(view.result.current.recoverableTax).toBe(false);
    expect(view.result.current.payingInvoice).toMatchObject({ hasTax: true });
  });

  it("ignores a stale dialog load and reports account errors", async () => {
    const stale = setup({ current: false });
    await act(() => stale.view.result.current.openInvoicePayment(invoice));
    expect(stale.view.result.current.payingInvoice).toBeNull();
    const failing = setup();
    mocks.tables.cash_accounts = { data: [], error: { message: "icazə yoxdur" } };
    await act(() => failing.view.result.current.openInvoicePayment(invoice));
    expect(failing.setError).toHaveBeenLastCalledWith("icazə yoxdur");
    expect(failing.view.result.current.payingInvoice).toBeNull();
  });

  it("pays a taxed invoice through the tax command only after recoverable VAT is confirmed", async () => {
    const { view, setNotice, load } = setup({ taxed: true });
    await act(() => view.result.current.openInvoicePayment(invoice));
    await act(() => view.result.current.payInvoice(submitEvent()));
    expect(mocks.rpcCalls.map((call) => call.name)).toEqual(["ensure_inventory_accounts"]);
    act(() => view.result.current.setRecoverableTax(true));
    await act(() => view.result.current.payInvoice(submitEvent()));
    expect(mocks.rpcCalls[1]).toEqual({
      name: "pay_vendor_invoice_with_tax_atomic",
      args: {
        _tenant_id: "tenant-a", _request_key: "invoice-payment:I1",
        _payload: expect.objectContaining({ invoice_id: "I1", account_id: "CASH1", tax_account_id: "GL-1400", tax_treatment: "recoverable" }),
      },
    });
    expect(setNotice).toHaveBeenLastCalledWith("Faktura ödənişi kassaya və mühasibat jurnalına yazıldı.");
    expect(view.result.current.payingInvoice).toBeNull();
    expect(load).toHaveBeenCalledOnce();
  });

  it("reuses the same payload when a failed payment is retried", async () => {
    const { view, setError } = setup();
    await act(() => view.result.current.openInvoicePayment(invoice));
    mocks.rpcError = { message: "şəbəkə xətası" };
    await act(() => view.result.current.payInvoice(submitEvent()));
    expect(setError).toHaveBeenLastCalledWith("şəbəkə xətası");
    mocks.rpcError = null;
    await act(() => view.result.current.payInvoice(submitEvent()));
    expect(mocks.rpcCalls.map((call) => call.name)).toEqual(["pay_vendor_invoice_atomic", "pay_vendor_invoice_atomic"]);
    expect(mocks.rpcCalls[1].args._payload).toBe(mocks.rpcCalls[0].args._payload);
  });

  it("resets the dialog with a stable callback", async () => {
    const { view } = setup({ taxed: true });
    const reset = view.result.current.resetInvoicePayment;
    await act(() => view.result.current.openInvoicePayment(invoice));
    act(() => view.result.current.resetInvoicePayment());
    expect(view.result.current.resetInvoicePayment).toBe(reset);
    expect(view.result.current).toMatchObject({
      payingInvoice: null, paymentAccounts: [], invoiceAccountId: "", taxAccounts: [], invoiceTaxAccountId: "", recoverableTax: false,
    });
  });
});
