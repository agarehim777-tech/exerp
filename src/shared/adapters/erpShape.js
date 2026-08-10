// Adapters bridging Supabase DB shape <-> legacy App.jsx state shape.
// Non-destructive: fills in fields the 100+ report/build* functions expect.

export function dbCustomerToLegacy(c) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    fin: c.tax_id || "",
    phone: c.phone || "",
    email: c.email || "",
    address: c.address || "",
    segment: "Standart",
    notes: c.notes || "",
    createdAt: c.created_at,
    _source: "db",
  };
}

export function dbProductToLegacy(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: Number(p.price) || 0,
    salePrice: Number(p.price) || 0,
    costPrice: 0,
    currency: p.currency || "AZN",
    vatRate: Number(p.vat_rate) || 0,
    unit: p.unit || "pcs",
    category: p.description || "Digər",
    reorderLevel: 0,
    serialTracked: false,
    status: p.is_active ? "Aktiv" : "Passiv",
    description: p.description || "",
    createdAt: p.created_at,
    _source: "db",
  };
}

const STATUS_MAP = {
  draft: "Yeni",
  confirmed: "Təsdiqlənib",
  shipped: "Yolda",
  delivered: "Təhvil verilib",
  cancelled: "Ləğv edilib",
};

export function dbOrderToLegacy(o) {
  if (!o) return null;
  const customerName = o.customer?.name || "Naməlum müştəri";
  const items = Array.isArray(o.items) ? o.items : [];
  const productLines = items.map((it) => ({
    id: it.id,
    product: it.description || "",
    qty: Number(it.qty) || 0,
    unitPrice: Number(it.unit_price) || 0,
    total: Number(it.line_total) || 0,
  }));
  const amount = Number(o.total) || 0;
  return {
    id: o.id,
    orderNo: o.order_no,
    customer: customerName,
    customerId: o.customer_id,
    fin: "",
    amount,
    paid: 0,
    outstanding: amount,
    currency: o.currency || "AZN",
    date: o.order_date,
    deliveryDate: o.order_date,
    status: STATUS_MAP[o.status] || "Yeni",
    products: productLines.map((l) => l.product).filter(Boolean).join(", ") || "—",
    productLines,
    notes: o.notes || "",
    _source: "db",
  };
}

// Reverse: legacy new-order payload -> DB insert payload
export function legacyOrderToDb(o, { tenantId, customersByName = new Map() } = {}) {
  const customerId = o.customerId || customersByName.get((o.customer || "").toLowerCase())?.id || null;
  const items = (o.productLines || []).map((l, idx) => ({
    line_no: idx + 1,
    description: l.product || "",
    qty: Number(l.qty) || 0,
    unit_price: Number(l.unitPrice) || 0,
    discount_pct: 0,
    vat_rate: 18,
  }));
  return {
    tenant_id: tenantId,
    order_no: o.orderNo || `SO-${Date.now()}`,
    customer_id: customerId,
    order_date: o.date || new Date().toISOString().slice(0, 10),
    currency: o.currency || "AZN",
    notes: o.notes || null,
    items,
  };
}
