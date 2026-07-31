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

const ALLOWED_VAT_RATES = [0, 2, 18];
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Sətir-sətir riyazi və ƏDV qaydaları üzrə avtomatik validasiya.
export function validateDraft(draft) {
  const lines = draft?.lines || [];
  const totals = computeDraftTotals(lines);
  const lineIssues = lines.map(() => []);
  const docIssues = [];

  const addLine = (i, field, level, message) => lineIssues[i].push({ field, level, message });
  const addDoc = (level, message) => docIssues.push({ level, message });

  lines.forEach((line, i) => {
    const qty = Number(line.qty);
    const price = Number(line.unit_price);
    const discount = Number(line.discount_pct);
    const vat = Number(line.vat_rate);
    const row = totals.rows[i];

    if (line.qty === "" || Number.isNaN(qty)) addLine(i, "qty", "error", "Say rəqəm olmalıdır.");
    else if (qty <= 0) addLine(i, "qty", "error", "Say sıfırdan böyük olmalıdır.");

    if (line.unit_price === "" || Number.isNaN(price)) addLine(i, "unit_price", "error", "Qiymət rəqəm olmalıdır.");
    else if (price < 0) addLine(i, "unit_price", "error", "Qiymət mənfi ola bilməz.");

    if (Number.isNaN(discount)) addLine(i, "discount_pct", "error", "Endirim rəqəm olmalıdır.");
    else if (discount < 0) addLine(i, "discount_pct", "error", "Endirim mənfi ola bilməz.");
    else if (discount > 100) addLine(i, "discount_pct", "error", "Endirim 100%-i keçə bilməz.");
    else if (discount === 100) addLine(i, "discount_pct", "warning", "100% endirim — sətir məbləği sıfırdır.");

    if (Number.isNaN(vat)) addLine(i, "vat_rate", "error", "ƏDV dərəcəsi rəqəm olmalıdır.");
    else if (vat < 0 || vat > 100) addLine(i, "vat_rate", "error", "ƏDV dərəcəsi 0–100 aralığında olmalıdır.");
    else if (!ALLOWED_VAT_RATES.includes(vat)) addLine(i, "vat_rate", "warning", `Qeyri-standart ƏDV dərəcəsi (${vat}%). AZ üzrə: 0%, 2%, 18%.`);

    if (!String(line.description || "").trim() && !line.product_id) addLine(i, "description", "warning", "Təsvir boşdur.");

    if (row) {
      if (row.net < 0) addLine(i, "unit_price", "error", "Sətir netto məbləği mənfidir.");
      const expectedVat = round2(row.net * ((Number(vat) || 0) / 100));
      if (Math.abs(expectedVat - row.vat) > 0.011) addLine(i, "vat_rate", "error", "ƏDV məbləği dərəcəyə uyğun deyil.");
      if (Math.abs(round2(row.net + row.vat) - row.line_total) > 0.011) addLine(i, "qty", "error", "Sətir cəmi (netto + ƏDV) uyğun gəlmir.");
    }
  });

  if (!lines.length) addDoc("error", "Ən azı bir sətir olmalıdır.");
  if (!draft?.customer_id) addDoc("error", "Müştəri seçilməyib.");
  if (!draft?.invoice_date) addDoc("error", "Faktura tarixi boşdur.");
  if (draft?.due_date && draft?.invoice_date && new Date(draft.due_date) < new Date(draft.invoice_date))
    addDoc("error", "Son ödəniş tarixi faktura tarixindən əvvəl ola bilməz.");
  if (lines.length && !(totals.total > 0)) addDoc("error", "Faktura məbləği sıfırdır — faktura kəsilə bilməz.");
  if (totals.total < 0) addDoc("error", "Faktura yekunu mənfidir.");

  // Balans yoxlaması: ara cəm + ƏDV = yekun
  if (Math.abs(round2(totals.subtotal + totals.vat_total) - totals.total) > 0.005)
    addDoc("error", "Balans xətası: ara cəm + ƏDV yekuna bərabər deyil.");

  // Yuvarlaqlaşdırma fərqi: sətir cəmlərinin toplusu ilə yekun arasında
  const rowsSum = round2(totals.rows.reduce((s, r) => s + r.line_total, 0));
  const roundingDiff = round2(rowsSum - totals.total);
  if (Math.abs(roundingDiff) > 0.005)
    addDoc("error", `Yuvarlaqlaşdırma fərqi ${roundingDiff.toFixed(2)} ₼ — sətir cəmləri yekunla uyğun gəlmir.`);
  else if (Math.abs(roundingDiff) > 0)
    addDoc("warning", `Yuvarlaqlaşdırma fərqi ${roundingDiff.toFixed(2)} ₼ (icazə verilən hədd daxilində).`);

  const vatSum = round2(totals.vat_breakdown.reduce((s, g) => s + g.vat, 0));
  if (Math.abs(vatSum - totals.vat_total) > 0.005)
    addDoc("error", "ƏDV bölgüsünün cəmi ümumi ƏDV ilə uyğun gəlmir.");

  const errors = docIssues.filter((i) => i.level === "error").length
    + lineIssues.reduce((s, l) => s + l.filter((i) => i.level === "error").length, 0);
  const warnings = docIssues.filter((i) => i.level === "warning").length
    + lineIssues.reduce((s, l) => s + l.filter((i) => i.level === "warning").length, 0);

  return { lineIssues, docIssues, totals, roundingDiff, errorCount: errors, warningCount: warnings, hasErrors: errors > 0 };
}

export function draftWarnings(draft) {
  const { docIssues, lineIssues } = validateDraft(draft);
  return [
    ...docIssues.filter((i) => i.level === "error").map((i) => i.message),
    ...lineIssues.flatMap((issues, index) =>
      issues.filter((i) => i.level === "error").map((i) => `Sətir ${index + 1}: ${i.message}`)),
  ];
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
