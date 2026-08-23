// Adapters bridging Supabase DB shape <-> legacy App.jsx state shape.
// Non-destructive: fills in fields the 100+ report/build* functions expect.

export function dbCustomerToLegacy(c) {
  if (!c) return null;
  let customerMeta = {};
  try {
    const prefix = '__crm_meta__:';
    if (String(c.notes || '').startsWith(prefix)) customerMeta = JSON.parse(String(c.notes).slice(prefix.length));
  } catch { customerMeta = {}; }
  return {
    id: c.id,
    name: c.name,
    fin: customerMeta.fin_code || c.fin_code || c.tax_id || c.id,
    fin_code: customerMeta.fin_code || c.fin_code || (c.tax_id && !/^\d{10}$/.test(c.tax_id) ? c.tax_id : ""),
    identity_card_no: customerMeta.identity_card_no || "",
    tax_id: c.tax_id || "",
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
    reorderLevel: Number(p.minimum_stock) || 0,
    recommendedOrderQty: Number(p.recommended_order_qty) || 0,
    serialTracked: false,
    status: p.is_active ? "Aktiv" : "Passiv",
    description: p.description || "",
    imagePath: p.image_path || "",
    imageUrl: p.image_url || "",
    createdAt: p.created_at,
    _source: "db",
  };
}

const STATUS_MAP = {
  draft: "Təsdiqlənib",
  pending: "Təsdiqlənib",
  confirmed: "Təsdiqlənib",
  processing: "Təsdiqlənib",
  shipped: "Təsdiqlənib",
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
  const paid = Math.max(0, Number(o.paid_amount || 0));
  const credit = Array.isArray(o.credit) ? o.credit[0] : o.credit;
  const delivery = Array.isArray(o.delivery) ? o.delivery[0] : o.delivery;
  let acceptanceNote = delivery?.acceptance_note || "";
  let acceptanceMeta = {};
  try {
    const parsed = JSON.parse(acceptanceNote);
    if (parsed && typeof parsed === "object") {
      acceptanceMeta = parsed;
      acceptanceNote = parsed.note || "";
    }
  } catch {
    acceptanceMeta = {};
  }
  const sellerBonuses = [...(o.bonus_assignments || [])]
    .sort((a, b) => Number(a.position || 1) - Number(b.position || 1))
    .map((row) => ({
    seller: row.seller_name,
    bonus: Number(row.rate || 0),
  }));
  return {
    id: o.id,
    orderNo: o.order_no,
    customer: customerName,
    customerId: o.customer_id,
    fin: "",
    amount,
    paid,
    paid_amount: paid,
    outstanding: Math.max(0, amount - paid),
    currency: o.currency || "AZN",
    date: o.order_date,
    deliveryDate: o.order_date,
    status: STATUS_MAP[o.status] || "Yeni",
    paymentMethod: credit ? "Kredit" : "Nağd",
    paymentStatus: o.payment_status || (paid >= amount && amount > 0 ? "Ödənilib" : paid > 0 ? "Qismən ödənilib" : "Ödənilməyib"),
    payment_status: o.payment_status || (paid >= amount && amount > 0 ? "paid" : paid > 0 ? "partial" : "unpaid"),
    creditId: credit?.id || null,
    contractId: credit?.contract_no || null,
    creditMonths: Number(credit?.term_months || 0) || null,
    initialPayment: Number(credit?.required_initial || credit?.initial_payment || 0),
    initialPaid: Number(credit?.initial_payment || 0),
    requiredInitial: Number(credit?.required_initial || credit?.initial_payment || 0),
    creditBalance: credit ? Math.max(0, Number(credit.principal || amount) - Number(credit.required_initial || credit.initial_payment || 0)) : 0,
    creditStatus: credit?.status || null,
    creditStartDate: credit?.start_date || null,
    products: productLines.map((l) => l.product).filter(Boolean).join(", ") || "—",
    productLines,
    sellerBonuses,
    seller: sellerBonuses.map((row) => `${row.seller} ${row.bonus}%`).join(', ') || 'Təyin edilməyib',
    notes: o.notes || "",
    warehouseId: delivery?.warehouse_id || o.warehouse_id || "",
    deliveredAt:
      delivery?.delivered_at ||
      delivery?.accepted_at ||
      (String(o.status || "").toLowerCase() === "delivered" ? o.updated_at : null),
    deliveredBy: delivery?.warehouse_employee_name || acceptanceMeta.warehouseEmployeeName || "",
    deliveryAcceptance: {
      recipientName: delivery?.acceptance_name || delivery?.recipient_name || "",
      documentNo: delivery?.acceptance_document_no || delivery?.recipient_document || "",
      warehouseEmployeeName: delivery?.warehouse_employee_name || acceptanceMeta.warehouseEmployeeName || "",
      signatureConfirmed: Boolean(delivery?.acceptance_signature),
      note: acceptanceNote,
      acceptedAt: delivery?.accepted_at || delivery?.delivered_at || null,
    },
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
