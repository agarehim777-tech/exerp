// Faktura kəsimi ön baxışı üçün təmiz (DB-yə toxunmayan) sənəd qurucuları.

export function computeDraftTotals(lines) {
  let subtotal = 0;
  let vatTotal = 0;
  const vatGroups = new Map();
  const rows = lines.map((line, index) => {
    const qty = Number(line.qty) || 0;
    const unitPrice = Number(line.unit_price) || 0;
    const discount = Number(line.discount_pct) || 0;
    const vatRate = Number(line.vat_rate) || 0;
    const net = qty * unitPrice * (1 - discount / 100);
    const vat = net * (vatRate / 100);
    subtotal += net;
    vatTotal += vat;
    const group = vatGroups.get(vatRate) || { rate: vatRate, net: 0, vat: 0 };
    group.net += net;
    group.vat += vat;
    vatGroups.set(vatRate, group);
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
    vat_breakdown: [...vatGroups.values()]
      .sort((a, b) => a.rate - b.rate)
      .map((g) => ({ rate: g.rate, net: Number(g.net.toFixed(2)), vat: Number(g.vat.toFixed(2)) })),
    subtotal: Number(subtotal.toFixed(2)),
    vat_total: Number(vatTotal.toFixed(2)),
    total: Number((subtotal + vatTotal).toFixed(2)),
  };
}

export function draftWarnings(draft) {
  const warnings = [];
  const totals = computeDraftTotals(draft.lines || []);
  if (!(draft.lines || []).length) warnings.push('Ən azı bir sətir olmalıdır.');
  if (!(totals.total > 0)) warnings.push('Faktura məbləği sıfırdır — faktura kəsilə bilməz.');
  if (!draft.customer_id) warnings.push('Müştəri seçilməyib.');
  if ((draft.lines || []).some((l) => Number(l.qty) <= 0)) warnings.push('Sətirlərdə say sıfır və ya mənfi ola bilməz.');
  return warnings;
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
  return {
    source: 'order',
    title: `Sifariş ${order.order_no} üzrə faktura`,
    invoice_no: invoice_no || '',
    customer_id: order.customer_id || null,
    customer_name: order.customer?.name || '—',
    order_id: order.id,
    invoice_date: today(),
    due_date: addDays(payment_terms_days),
    currency: order.currency || 'AZN',
    notes: `Sifariş ${order.order_no} əsasında avtomatik yaradılıb.`,
    lines,
  };
}

export function buildProjectInvoiceDraft(project, { invoice_no, customer_id, customer_name, percent = 100, vat_rate = 18, payment_terms_days = 14 } = {}) {
  const amount = Number(((Number(project.budget) || 0) * (Number(percent) || 0)) / 100);
  return {
    source: 'project',
    title: `Layihə "${project.name}" üzrə mərhələ fakturası`,
    invoice_no: invoice_no || '',
    customer_id: customer_id || null,
    customer_name: customer_name || '—',
    invoice_date: today(),
    due_date: addDays(payment_terms_days),
    currency: 'AZN',
    notes: `Layihə "${project.name}" üzrə ${percent}% mərhələ fakturası. [project:${project.id}]`,
    lines: [{
      product_id: null,
      description: `${project.name} — ${percent}% mərhələ`,
      qty: 1,
      unit_price: Number(amount.toFixed(2)),
      discount_pct: 0,
      vat_rate,
    }],
  };
}
