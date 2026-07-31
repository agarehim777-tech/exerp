// Maliyyə hesablamalarının təmiz (pure) funksiyaları — unit testlərlə örtülür.

export function round2(value) {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineNet(line) {
  const qty = Number(line?.qty) || 0;
  const unitPrice = Number(line?.unit_price) || 0;
  const discount = Number(line?.discount_pct) || 0;
  return round2(qty * unitPrice * (1 - discount / 100));
}

export function lineVat(line) {
  const rate = Number(line?.vat_rate) || 0;
  return round2(lineNet(line) * (rate / 100));
}

export function lineGross(line) {
  return round2(lineNet(line) + lineVat(line));
}

export function invoiceTotals(lines = []) {
  const subtotal = round2(lines.reduce((sum, line) => sum + lineNet(line), 0));
  const vatTotal = round2(lines.reduce((sum, line) => sum + lineVat(line), 0));
  return { subtotal, vat_total: vatTotal, total: round2(subtotal + vatTotal) };
}

export function outstanding(invoice) {
  return round2((Number(invoice?.total) || 0) - (Number(invoice?.paid_amount) || 0));
}

export function paymentStatus(invoice, today = new Date()) {
  if (invoice?.status === 'cancelled') return 'cancelled';
  const total = Number(invoice?.total) || 0;
  const paid = Number(invoice?.paid_amount) || 0;
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  if (invoice?.due_date && new Date(invoice.due_date) < today) return 'overdue';
  return invoice?.status || 'draft';
}

// Jurnal yazılışı balansı: debet cəmi = kredit cəmi və sıfır olmamalıdır.
export function journalBalance(lines = []) {
  const debit = round2(lines.reduce((sum, l) => sum + (Number(l?.debit) || 0), 0));
  const credit = round2(lines.reduce((sum, l) => sum + (Number(l?.credit) || 0), 0));
  return { debit, credit, balanced: debit === credit && debit > 0, difference: round2(debit - credit) };
}

// Satış fakturasının ikili yazılış sətirləri (1200 / 4000 / 2100).
export function invoiceJournalLines(invoice) {
  const total = round2(invoice?.total);
  const vat = round2(invoice?.vat_total);
  return [
    { account: '1200', debit: total, credit: 0, memo: 'Debitor borcu' },
    { account: '4000', debit: 0, credit: round2(total - vat), memo: 'Satış gəliri' },
    { account: '2100', debit: 0, credit: vat, memo: 'ƏDV öhdəliyi' },
  ];
}

// Tarix bağlı dövrə düşürmü?
export function isDateLocked(periods = [], date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return periods.some((p) => {
    if (!p || !['locked', 'closed'].includes(p.status)) return false;
    return new Date(p.start_date) <= d && d <= new Date(p.end_date);
  });
}
