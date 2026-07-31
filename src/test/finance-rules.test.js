import { describe, expect, it } from 'vitest';
import {
  invoiceJournalLines,
  invoiceTotals,
  isDateLocked,
  journalBalance,
  lineGross,
  lineNet,
  lineVat,
  outstanding,
  paymentStatus,
  round2,
} from '../shared/utils/invoiceMath.js';

describe('round2', () => {
  it('iki onluğa yuvarlaqlaşdırır', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2('12.3456')).toBe(12.35);
    expect(round2(undefined)).toBe(0);
  });
});

describe('sətir hesablamaları', () => {
  const line = { qty: 3, unit_price: 100, discount_pct: 10, vat_rate: 18 };

  it('endirimli net məbləği hesablayır', () => {
    expect(lineNet(line)).toBe(270);
  });

  it('ƏDV-ni net üzərindən hesablayır', () => {
    expect(lineVat(line)).toBe(48.6);
  });

  it('brutto = net + ƏDV', () => {
    expect(lineGross(line)).toBe(318.6);
  });

  it('boş/yanlış sətirdə sıfır qaytarır', () => {
    expect(lineNet({})).toBe(0);
    expect(lineVat({ qty: 'x', unit_price: null })).toBe(0);
  });

  it('100% endirimdə net sıfırdır', () => {
    expect(lineNet({ qty: 5, unit_price: 50, discount_pct: 100, vat_rate: 18 })).toBe(0);
  });
});

describe('invoiceTotals', () => {
  it('çoxsətirli fakturanın cəmini düzgün toplayır', () => {
    const totals = invoiceTotals([
      { qty: 2, unit_price: 150, discount_pct: 0, vat_rate: 18 },
      { qty: 1, unit_price: 99.99, discount_pct: 5, vat_rate: 18 },
      { qty: 4, unit_price: 25, discount_pct: 0, vat_rate: 0 },
    ]);
    expect(totals.subtotal).toBe(494.99);
    expect(totals.vat_total).toBe(71.1);
    expect(totals.total).toBe(566.09);
  });

  it('sətir yoxdursa sıfırdır', () => {
    expect(invoiceTotals([])).toEqual({ subtotal: 0, vat_total: 0, total: 0 });
  });
});

describe('ödəniş vəziyyəti', () => {
  it('qalıq borcu hesablayır', () => {
    expect(outstanding({ total: 1000, paid_amount: 250.5 })).toBe(749.5);
  });

  it('tam ödəniş = paid', () => {
    expect(paymentStatus({ total: 100, paid_amount: 100 })).toBe('paid');
  });

  it('qismən ödəniş = partial', () => {
    expect(paymentStatus({ total: 100, paid_amount: 40 })).toBe('partial');
  });

  it('vaxtı keçmiş ödənilməmiş faktura = overdue', () => {
    const today = new Date('2026-07-31');
    expect(paymentStatus({ total: 100, paid_amount: 0, due_date: '2026-06-01', status: 'issued' }, today)).toBe('overdue');
  });

  it('ləğv edilmiş faktura statusu dəyişmir', () => {
    expect(paymentStatus({ total: 100, paid_amount: 0, status: 'cancelled' })).toBe('cancelled');
  });
});

describe('ikili yazılış (double-entry)', () => {
  it('faktura yazılışı balanslıdır', () => {
    const invoice = { total: 1180, vat_total: 180 };
    const lines = invoiceJournalLines(invoice);
    const balance = journalBalance(lines);
    expect(balance.debit).toBe(1180);
    expect(balance.credit).toBe(1180);
    expect(balance.balanced).toBe(true);
    expect(balance.difference).toBe(0);
  });

  it('gəlir sətri ƏDV-siz məbləğdir', () => {
    const [, revenue, vat] = invoiceJournalLines({ total: 1180, vat_total: 180 });
    expect(revenue.credit).toBe(1000);
    expect(vat.credit).toBe(180);
  });

  it('balanssız yazılışı aşkarlayır', () => {
    const balance = journalBalance([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 90 },
    ]);
    expect(balance.balanced).toBe(false);
    expect(balance.difference).toBe(10);
  });

  it('sıfır məbləğli yazılış balanslı sayılmır', () => {
    expect(journalBalance([{ debit: 0, credit: 0 }]).balanced).toBe(false);
  });
});

describe('dövr kilidi', () => {
  const periods = [
    { status: 'locked', start_date: '2026-01-01', end_date: '2026-06-30' },
    { status: 'open', start_date: '2026-07-01', end_date: '2026-07-31' },
  ];

  it('bağlı dövrə düşən tarixi tutur', () => {
    expect(isDateLocked(periods, '2026-03-15')).toBe(true);
    expect(isDateLocked(periods, '2026-06-30')).toBe(true);
  });

  it('açıq dövrə icazə verir', () => {
    expect(isDateLocked(periods, '2026-07-15')).toBe(false);
  });

  it('yanlış tarixdə false qaytarır', () => {
    expect(isDateLocked(periods, 'xxx')).toBe(false);
    expect(isDateLocked([], '2026-01-01')).toBe(false);
  });
});
