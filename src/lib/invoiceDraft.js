// Faktura kəsimi ön baxışı üçün təmiz (DB-yə toxunmayan) sənəd qurucuları.

export function computeDraftTotals(lines) {
  let subtotal = 0;
  let vatTotal = 0;
  const rows = lines.map((line, index) => {
    const qty = Number(line.qty) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const discount = Number(line.discount_pct) || 0;
    const vatRate = Number(line.vat_rate) || 0;
    const net = qty * unitPrice * (1 - discount / 100);
    const vat = net * (vatRate / 100);
    subtotal += net;
    vatTotal += vat;
    return {
      ...line,
      line_no: index + 1,
      net: Number(net.toFixed(2)),
      vat: Number(vat.toFixed(2)),
      line_total: Number((net + vat).toFixed(2)),
    };
  });
  return {
    rows,
    subtotal: Number(subtotal.toFixed(2)),
    vat_total: Number(vatTotal.toFixed(2)),
    total: Number((subtotal + vatTotal).toFixed(2)),
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function buildOrderInvoiceDraft(order, { invoice_no, payment_terms_days = 14 } = {}) {
  const lines = (order.items || []).map((item) => ({
    product_id: item.product_id || null,
    description: item.description || item.product?.name || null,
    qty: Number(item.qty) || 0,
    unit_price: Number(item.unit_price) || 0,
    discount_pct: Number(item.discount_pct) || 0,
    vat_rate: Number(item.vat_rate ?? item.tax_rate ?? 0),
  }));
  const totals = computeDraftTotals(lines);
  return {
    source: 'order',
    title: `Sifariş ${order.order_no} üzrə faktura`,
    invoice_no: invoice_no || 'avtomatik (INV-…)',
    customer_name: order.customer?.name || '—',
    invoice_date: today(),
    due_date: addDays(payment_terms_days),
    currency: order.currency || 'AZN',
    notes: `Sifariş ${order.order_no} əsasında avtomatik yaradılıb.`,
    warnings: lines.length ? [] : ['Sifarişdə sətir yoxdur — faktura kəsilə bilməz.'],
    ...totals,
  };
}

export function buildProjectInvoiceDraft(project, { invoice_no, customer_name, percent = 100, vat_rate = 18, payment_terms_days = 14 } = {}) {
  const amount = Number(((Number(project.budget) || 0) * (Number(percent) || 0)) / 100);
  const lines = [{
    product_id: null,
    description: `${project.name} — ${percent}% mərhələ`,
    qty: 1,
    unit_price: Number(amount.toFixed(2)),
    discount_pct: 0,
    vat_rate,
  }];
  const totals = computeDraftTotals(lines);
  const warnings = [];
  if (!(amount > 0)) warnings.push('Layihə məbləği sıfırdır — faktura kəsilə bilməz.');
  if (!customer_name) warnings.push('Müştəri seçilməyib.');
  return {
    source: 'project',
    title: `Layihə "${project.name}" üzrə mərhələ fakturası`,
    invoice_no: invoice_no || 'avtomatik (INV-…)',
    customer_name: customer_name || '—',
    invoice_date: today(),
    due_date: addDays(payment_terms_days),
    currency: 'AZN',
    notes: `Layihə "${project.name}" üzrə ${percent}% mərhələ fakturası.`,
    warnings,
    ...totals,
  };
}
