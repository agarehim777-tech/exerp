// Maliyyə hesabatları üçün saf funksiyalar (UI-dan asılı deyil, test olunur).
// Giriş: trial_balance RPC sətirləri, satış fakturaları, kassa əməliyyatları.

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

/**
 * Mənfəət və zərər hesabatı (P&L) — trial balance sətirlərindən.
 * Gəlir hesabları kredit qalıqlı olduğu üçün işarə tərsinə çevrilir.
 */
export function buildProfitAndLoss(trialRows = []) {
  const revenue = [];
  const expenses = [];
  trialRows.forEach((row) => {
    const amount = num(row.debit) - num(row.credit);
    if (row.type === 'revenue') {
      revenue.push({ code: row.code, name: row.name, amount: round2(-amount) });
    } else if (row.type === 'expense') {
      expenses.push({ code: row.code, name: row.name, amount: round2(amount) });
    }
  });
  const totalRevenue = round2(revenue.reduce((sum, r) => sum + r.amount, 0));
  const totalExpense = round2(expenses.reduce((sum, r) => sum + r.amount, 0));
  const netProfit = round2(totalRevenue - totalExpense);
  return {
    revenue,
    expenses,
    totalRevenue,
    totalExpense,
    netProfit,
    margin: totalRevenue ? round2((netProfit / totalRevenue) * 100) : 0,
  };
}

/**
 * Balans hesabatı — aktiv / öhdəlik / kapital.
 * Dövrün mənfəəti kapitala əlavə olunur ki, balans bərabərləşsin.
 */
export function buildBalanceSheet(trialRows = [], netProfit = 0) {
  const assets = [];
  const liabilities = [];
  const equity = [];
  trialRows.forEach((row) => {
    const balance = num(row.debit) - num(row.credit);
    if (row.type === 'asset') {
      assets.push({ code: row.code, name: row.name, amount: round2(balance) });
    } else if (row.type === 'liability') {
      liabilities.push({ code: row.code, name: row.name, amount: round2(-balance) });
    } else if (row.type === 'equity') {
      equity.push({ code: row.code, name: row.name, amount: round2(-balance) });
    }
  });
  const totalAssets = round2(assets.reduce((sum, r) => sum + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, r) => sum + r.amount, 0));
  const baseEquity = round2(equity.reduce((sum, r) => sum + r.amount, 0));
  const totalEquity = round2(baseEquity + num(netProfit));
  const difference = round2(totalAssets - (totalLiabilities + totalEquity));
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    baseEquity,
    netProfit: round2(netProfit),
    totalEquity,
    difference,
    balanced: Math.abs(difference) < 0.01,
  };
}

export const AGING_BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];

export const AGING_LABELS = {
  current: 'Vaxtı çatmayıb',
  d1_30: '1-30 gün',
  d31_60: '31-60 gün',
  d61_90: '61-90 gün',
  d90_plus: '90+ gün',
};

function bucketFor(daysLate) {
  if (daysLate <= 0) return 'current';
  if (daysLate <= 30) return 'd1_30';
  if (daysLate <= 60) return 'd31_60';
  if (daysLate <= 90) return 'd61_90';
  return 'd90_plus';
}

function daysBetween(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b - a) / 86400000);
}

/**
 * Debitor borclarının yaşlanması (AR aging).
 * Ödənilməmiş qalıq = total - paid_amount; ləğv edilmiş fakturalar nəzərə alınmır.
 */
export function buildReceivablesAging(invoices = [], asOf = new Date()) {
  const asOfDate = typeof asOf === 'string' ? asOf : asOf.toISOString().slice(0, 10);
  const byCustomer = new Map();
  const totals = Object.fromEntries(AGING_BUCKETS.map((key) => [key, 0]));

  invoices.forEach((inv) => {
    if (inv.status === 'cancelled' || inv.status === 'draft') return;
    const open = round2(num(inv.total) - num(inv.paid_amount));
    if (open <= 0.009) return;
    const dueDate = inv.due_date || inv.invoice_date || asOfDate;
    const bucket = bucketFor(daysBetween(dueDate, asOfDate));
    totals[bucket] = round2(totals[bucket] + open);

    const customerId = inv.customer_id || inv.customer?.id || 'unknown';
    if (!byCustomer.has(customerId)) {
      byCustomer.set(customerId, {
        customerId,
        customerName: inv.customer?.name || 'Naməlum müştəri',
        total: 0,
        ...Object.fromEntries(AGING_BUCKETS.map((key) => [key, 0])),
      });
    }
    const row = byCustomer.get(customerId);
    row[bucket] = round2(row[bucket] + open);
    row.total = round2(row.total + open);
  });

  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const grandTotal = round2(rows.reduce((sum, r) => sum + r.total, 0));
  const overdue = round2(grandTotal - totals.current);
  return { rows, totals, grandTotal, overdue, asOf: asOfDate };
}

/**
 * Pul axını — kassa/bank əməliyyatları üzrə aylıq mədaxil/məxaric.
 */
export function buildCashFlow(transactions = []) {
  const months = new Map();
  let inflow = 0;
  let outflow = 0;

  transactions.forEach((tx) => {
    const date = tx.occurred_at || tx.created_at;
    if (!date) return;
    const key = String(date).slice(0, 7);
    if (!months.has(key)) months.set(key, { month: key, inflow: 0, outflow: 0, net: 0 });
    const row = months.get(key);
    const amount = Math.abs(num(tx.amount));
    if (tx.direction === 'out') {
      row.outflow = round2(row.outflow + amount);
      outflow = round2(outflow + amount);
    } else {
      row.inflow = round2(row.inflow + amount);
      inflow = round2(inflow + amount);
    }
    row.net = round2(row.inflow - row.outflow);
  });

  const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  rows.forEach((row) => {
    running = round2(running + row.net);
    row.cumulative = running;
  });

  return { rows, inflow, outflow, net: round2(inflow - outflow) };
}
