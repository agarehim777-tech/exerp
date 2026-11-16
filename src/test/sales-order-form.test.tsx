import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as modals from "../modules/sales/components/SalesOrderModals.jsx";
import {
  buildSalesProductOptions,
  customerSearchOptions,
  getCustomerIdentity,
  maxBonusForRow,
  MAX_TOTAL_BONUS_RATE,
  productSearchOptions,
  sellerSearchOptions,
  updateSellerRowWithLimit,
} from "../modules/sales/services/salesOrderForm.ts";
import { SearchableOrderSelect } from "../modules/sales/components/SearchableOrderSelect.tsx";

afterEach(cleanup);

describe("sales order form helpers", () => {
  it("keeps buildSalesProductOptions importable from SalesOrderModals.jsx", () => {
    expect((modals as Record<string, unknown>).buildSalesProductOptions).toBe(buildSalesProductOptions);
  });

  it("caps seller bonuses at 3% in total", () => {
    const rows = [{ id: 1, seller: "Ali", bonus: 2 }, { id: 2, seller: "Vali", bonus: 0 }];
    expect(MAX_TOTAL_BONUS_RATE).toBe(3);
    expect(maxBonusForRow(rows, 2)).toBe(1);
    expect(updateSellerRowWithLimit(rows, 2, "bonus", "5")[1].bonus).toBe(1);
    expect(updateSellerRowWithLimit(rows, 2, "bonus", "-1")[1].bonus).toBe(0);
    expect(updateSellerRowWithLimit(rows, 2, "bonus", "")[1].bonus).toBe("");
    expect(updateSellerRowWithLimit(rows, 1, "seller", "Rəna")[0]).toEqual({ id: 1, seller: "Rəna", bonus: 2 });
  });

  it("reads customer identity from CRM meta first", () => {
    const meta = `__crm_meta__:${JSON.stringify({ fin_code: "7ABC123", identity_card_no: "AA1234567" })}`;
    expect(getCustomerIdentity({ notes: meta, fin: "OLD" })).toEqual({ value: "7ABC123", fin: "7ABC123", identityCard: "AA1234567" });
    expect(getCustomerIdentity({ notes: "__crm_meta__:{broken", tax_id: "VOEN-1" })).toEqual({ value: "VOEN-1", fin: "", identityCard: "" });
    expect(customerSearchOptions([{ name: "Ali", phone: "050" }])).toEqual([
      { value: "", label: "Ali", subtitle: "050", searchText: "050" },
    ]);
  });

  it("builds product and seller search options", () => {
    expect(productSearchOptions([{ product: "Kabel", total: 5, reserved: 2, sku: "K-1", category: "Aksesuar" }])).toEqual([
      { value: "Kabel", label: "Kabel", subtitle: "3 satış üçün · SKU: K-1", searchText: "K-1 Aksesuar" },
    ]);
    const sellers = sellerSearchOptions([{ name: "Orxan", role: "Satıcı" }], "Keçmiş satıcı");
    expect(sellers.map((option) => [option.value, option.subtitle])).toEqual([["Orxan", "Satıcı"], ["Keçmiş satıcı", "Təyin edilmiş satıcı"]]);
    expect(sellerSearchOptions([{ name: "Orxan" }], "Orxan")).toHaveLength(1);
  });

  it("merges stock and active catalog products into one sorted list", () => {
    const rows = buildSalesProductOptions(
      [{ product: "Telefon", total: 3, reserved: 1, price: 900 }],
      [{ id: "P1", name: "kabel", salePrice: 10 }, { id: "P2", name: "Telefon", sku: "T-1" }, { id: "P3", name: "Köhnə", status: "Passiv" }],
    );
    expect(rows.map((row) => [row.product, row.total, row.price, row.sku])).toEqual([["kabel", 0, 10, ""], ["Telefon", 3, 900, "T-1"]]);
  });
});

describe("SearchableOrderSelect", () => {
  const options = [
    { value: "a", label: "Alma", searchText: "meyvə" },
    { value: "b", label: "Banan", subtitle: "Sarı" },
  ];

  it("filters by label or search text and picks the first match with Enter", () => {
    const onChange = vi.fn();
    const { getByRole, queryByText } = render(<SearchableOrderSelect value="" options={options} onChange={onChange} ariaLabel="Məhsul" />);
    const input = getByRole("combobox");
    fireEvent.change(input, { target: { value: "meyv" } });
    expect(queryByText("Banan")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("a");
    expect((input as HTMLInputElement).value).toBe("Alma");
  });

  it("shows an empty message and restores the selected label on Escape", () => {
    const { getByRole, getByText } = render(<SearchableOrderSelect value="b" options={options} onChange={vi.fn()} />);
    const input = getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("Banan");
    fireEvent.change(input, { target: { value: "xyz" } });
    expect(getByText("Uyğun nəticə tapılmadı")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("Banan");
  });
});
