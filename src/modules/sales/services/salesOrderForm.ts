// Satış sifarişi formasının təmiz köməkçiləri: satıcı bonus limiti (cəmi 3%), müştəri identifikasiyası (CRM meta daxil),
// müştəri/məhsul/satıcı axtarış seçimləri və stok + kataloqdan satış məhsul siyahısı.
// SalesOrderModals.jsx bunları idxal edir; buildSalesProductOptions oradan da yenidən ixrac olunur.

type Row = Record<string, any>;

export interface SellerRow extends Row {
  id?: unknown;
  bonus?: number | string;
}

export interface SearchOption {
  value: string;
  label: string;
  subtitle?: string;
  searchText?: string;
}

export const MAX_TOTAL_BONUS_RATE = 3;

export const maxBonusForRow = (rows: SellerRow[], rowId: unknown): number => Math.max(
  0,
  MAX_TOTAL_BONUS_RATE - rows.reduce(
    (sum, row) => row.id === rowId ? sum : sum + Number(row.bonus || 0),
    0,
  ),
);

export const updateSellerRowWithLimit = (rows: SellerRow[], rowId: unknown, field: string, value: unknown): SellerRow[] => {
  if (field !== "bonus") {
    return rows.map((row) => row.id === rowId ? { ...row, [field]: value } : row);
  }
  const maximum = maxBonusForRow(rows, rowId);
  const nextValue = value === ""
    ? ""
    : Math.min(maximum, Math.max(0, Number(value) || 0));
  return rows.map((row) => row.id === rowId ? { ...row, bonus: nextValue } : row);
};

export const getCustomerIdentity = (customer: Row = {}): { value: string; fin: string; identityCard: string } => {
  let meta: Row = {};
  try {
    const prefix = "__crm_meta__:";
    if (String(customer.notes || "").startsWith(prefix)) meta = JSON.parse(String(customer.notes).slice(prefix.length));
  } catch { meta = {}; }
  return {
    value: meta.fin_code || customer.fin_code || customer.fin || customer.tax_id || customer.id || "",
    fin: meta.fin_code || customer.fin_code || customer.fin || "",
    identityCard: meta.identity_card_no || customer.identity_card_no || "",
  };
};

export const customerSearchOptions = (customers: Row[]): SearchOption[] => customers.map((customer) => {
  const identity = getCustomerIdentity(customer);
  return ({
  value: identity.value,
  label: customer.name,
  subtitle: [customer.phone, identity.fin || customer.tax_id].filter(Boolean).join(" · ") || "Əlaqə məlumatı yoxdur",
  searchText: [customer.phone, identity.fin, customer.tax_id, customer.email, identity.identityCard].filter(Boolean).join(" "),
  });
});

export const productSearchOptions = (items: Row[]): SearchOption[] => items.map((item) => ({
  value: item.product,
  label: item.product,
  subtitle: `${Number(item.total || 0) - Number(item.reserved || 0)} satış üçün${item.sku ? ` · SKU: ${item.sku}` : ""}`,
  searchText: [item.sku, item.category].filter(Boolean).join(" "),
}));

export function buildSalesProductOptions(stockRows: Row[] = [], catalogProducts: Row[] = []): Row[] {
  const productKey = (value: unknown) => String(value || "").trim().toLocaleLowerCase("az");
  const byProduct = new Map<string, Row>();

  stockRows.forEach((item) => {
    if (!item?.product) return;
    byProduct.set(productKey(item.product), { ...item });
  });

  catalogProducts
    .filter((product) => product?.name && product.status !== "Passiv")
    .forEach((product) => {
      const key = productKey(product.name);
      const stockItem = byProduct.get(key);
      byProduct.set(key, {
        ...stockItem,
        product: product.name,
        productId: stockItem?.productId || product.id,
        sku: stockItem?.sku || product.sku || "",
        category: stockItem?.category || product.category || "",
        total: Number(stockItem?.total || 0),
        reserved: Number(stockItem?.reserved || 0),
        price: Number(stockItem?.price || product.salePrice || product.price || 0),
        serialTracked: stockItem?.serialTracked ?? product.serialTracked ?? false,
      });
    });

  return [...byProduct.values()].sort((a, b) =>
    String(a.product || "").localeCompare(String(b.product || ""), "az"),
  );
}

export const sellerSearchOptions = (sellers: Row[], currentSeller = ""): SearchOption[] => {
  const options: SearchOption[] = sellers.map((seller) => ({
    value: seller.name,
    label: seller.name,
    subtitle: seller.role || seller.email || "Satıcı",
    searchText: [seller.role, seller.email].filter(Boolean).join(" "),
  }));
  if (currentSeller && !options.some((option) => option.value === currentSeller)) {
    options.push({ value: currentSeller, label: currentSeller, subtitle: "Təyin edilmiş satıcı", searchText: "" });
  }
  return options;
};
