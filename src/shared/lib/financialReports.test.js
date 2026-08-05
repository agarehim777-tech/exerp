import { describe, expect, it } from 'vitest';
import {
  buildProfitAndLoss,
  buildBalanceSheet,
  buildReceivablesAging,
  buildCashFlow,
} from './financialReports.js';

const trial = [
  { code: '1000', name: 'Kassa', type: 'asset', debit: 5000, credit: 1000 },
  { code: '1200', name: 'Debitor', type: 'asset', debit: 3000, credit: 0 },
  { code: '2000', name: 'Kreditor', type: 'liability', debit: 0, credit: 2000 },
  { code: '3000', name: 'Kapital', type: 'equity', debit: 0, credit: 3000 },
  { code: '4000', name: 'Satış', type: 'revenue', debit: 0, credit: 6000 },
  { code: '5000', name: 'Maya', type: 'expense', debit: 2000, credit: 0 },
];

describe('buildProfitAndLoss', () => {
  it('gəlir və xərci düzgün toplayır', () => {
    const pl = buildProfitAndLoss(trial);
    expect(pl.totalRevenue).toBe(6000);
    expect(pl.totalExpense).toBe(2000);
    expect(pl.netProfit).toBe(4000);
    expect(pl.margin).toBeCloseTo(66.67, 1);
  });

  it('boş girişdə sıfır qaytarır', () => {
    expect(buildProfitAndLoss([]).netProfit).toBe(0);
  });
});

describe('buildBalanceSheet', () => {
  it('aktiv = öhdəlik + kapital (mənfəətlə birlikdə)', () => {
    const pl = buildProfitAndLoss(trial);
    const bs = buildBalanceSheet(trial, pl.netProfit);
    expect(bs.totalAssets).toBe(7000);
    expect(bs.totalLiabilities).toBe(2000);
    expect(bs.totalEquity).toBe(7000);
    expect(bs.balanced).toBe(false);
    expect(bs.difference).toBe(-2000);
  });

  it('balanslı halda balanced=true olur', () => {
    const rows = [
      { code: '1000', name: 'Kassa', type: 'asset', debit: 1000, credit: 0 },
      { code: '3000', name: 'Kapital', type: 'equity', debit: 0, credit: 1000 },
    ];
    expect(buildBalanceSheet(rows, 0).balanced).toBe(true);
  });
});

describe('buildReceivablesAging', () => {
  const invoices = [
    { id: '1', status: 'issued', total: 100, paid_amount: 0, due_date: '2026-01-10', customer_id: 'c1', customer: { id: 'c1', name: 'A' } },
    { id: '2', status: 'partial', total: 200, paid_amount: 50, due_date: '2025-12-01', customer_id: 'c1', customer: { id: 'c1', name: 'A' } },
    { id: '3', status: 'paid', total: 300, paid_amount: 300, due_date: '2025-11-01', customer_id: 'c2', customer: { id: 'c2', name: 'B' } },
    { id: '4', status: 'cancelled', total: 400, paid_amount: 0, due_date: '2025-01-01', customer_id: 'c2', customer: { id: 'c2', name: 'B' } },
    { id: '5', status: 'issued', total: 500, paid_amount: 0, due_date: '2026-02-20', customer_id: 'c3', customer: { id: 'c3', name: 'C' } },
  ];

  it('açıq qalıqları düzgün bucket-lərə bölür', () => {
    const aging = buildReceivablesAging(invoices, '2026-01-15');
    expect(aging.grandTotal).toBe(750);
    expect(aging.totals.d1_30).toBe(100);
    expect(aging.totals.d31_60).toBe(150);
    expect(aging.totals.current).toBe(500);
    expect(aging.overdue).toBe(250);
  });

  it('ödənilmiş və ləğv olunmuş fakturaları çıxarır', () => {
    const aging = buildReceivablesAging(invoices, '2026-01-15');
    expect(aging.rows.find((r) => r.customerId === 'c2')).toBeUndefined();
  });

  it('90+ gün bucket-i işləyir', () => {
    const aging = buildReceivablesAging(
      [{ status: 'issued', total: 90, paid_amount: 0, due_date: '2025-01-01', customer_id: 'x' }],
      '2026-01-01',
    );
    expect(aging.totals.d90_plus).toBe(90);
  });
});

describe('buildCashFlow', () => {
  const tx = [
    { occurred_at: '2026-01-05', direction: 'in', amount: 1000 },
    { occurred_at: '2026-01-20', direction: 'out', amount: 400 },
    { occurred_at: '2026-02-02', direction: 'out', amount: 300 },
    { occurred_at: '2026-02-10', direction: 'in', amount: 800 },
  ];

  it('aylıq mədaxil/məxaric və kumulyativ qalıq hesablayır', () => {
    const cf = buildCashFlow(tx);
    expect(cf.rows).toHaveLength(2);
    expect(cf.rows[0]).toMatchObject({ month: '2026-01', inflow: 1000, outflow: 400, net: 600, cumulative: 600 });
    expect(cf.rows[1].cumulative).toBe(1100);
    expect(cf.net).toBe(1100);
  });

  it('tarixi olmayan sətirləri atır', () => {
    expect(buildCashFlow([{ direction: 'in', amount: 50 }]).rows).toHaveLength(0);
  });
});
