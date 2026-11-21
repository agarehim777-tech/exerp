import { expect, it, vi } from 'vitest';
import { money, percent, normalize, cashAmount } from '../services/format.js';
import { formatPaymentDate } from '../services/date.js';

it('preserves native cash currency formatting, spacing, and unavailable balances', () => {
  for (const currency of ['AZN', 'USD', 'EUR', 'JPY']) {
    const formatter = new Intl.NumberFormat('az-AZ', { style: 'currency', currency });
    for (const value of [0, 40, 210, -12.345, '1000.5']) {
      expect(cashAmount(value, currency)).toBe(formatter.format(Number(value)));
    }
  }
  expect(cashAmount(null)).toBe('—');
  expect(cashAmount(undefined)).toBe('—');
  expect(() => cashAmount(1, 'INVALID')).toThrow(RangeError);
});

it('retains exact Azerbaijani formatting across repeated portfolio calculations', () => {
  const number = new Intl.NumberFormat('az-AZ');
  const ratio = new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat('az-AZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  for (const value of [0, -12.345, 1234567.89, NaN, Infinity]) {
    expect(money(value)).toBe(`${number.format(value)} ₼`);
    expect(percent(value)).toBe(`${ratio.format(value)}%`);
  }
  for (let i = 0; i < 100; i++) {
    const value = new Date(2026, i % 12, 1 + i % 28);
    expect(formatPaymentDate(value)).toBe(date.format(value));
  }
  expect(() => formatPaymentDate(new Date(NaN))).toThrow(RangeError);
});

it('reuses exact locale-sensitive short text and evicts old entries without caching long strings', () => {
  for (const text of ['I', 'İ', 'ƏĞÖÜŞÇ', 'ΟΣ', 'I\u0307', 123, null, undefined]) {
    expect(normalize(text)).toBe(String(text ?? '').toLocaleLowerCase('az-AZ'));
  }
  const spy = vi.spyOn(String.prototype, 'toLocaleLowerCase');
  try {
    for (let i = 0; i < 10000; i++) expect(normalize('QA-CACHE-I-UNIQUE')).toBe('qa-cache-ı-unıque');
    expect(spy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 2200; i++) normalize(`QA-EVICTION-${i}`);
    spy.mockClear();
    normalize('QA-CACHE-I-UNIQUE');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    normalize('I'.repeat(300)); normalize('I'.repeat(300));
    expect(spy).toHaveBeenCalledTimes(2);
  } finally { spy.mockRestore(); }
});

it('prints Azerbaijani separators without relying on the runtime having az number data', () => {
  // Chromium resolves "az-AZ" but formats it with English patterns ("20,087.18", "AZN 0.00").
  // These literals are what every browser must show.
  expect(money(20087.18)).toBe('20.087,18 ₼');
  expect(money(-1234567.891)).toBe('-1.234.567,891 ₼');
  expect(percent(67.84)).toBe('67,8%');
  expect(cashAmount(0)).toBe('0,00\u00a0₼');
  expect(cashAmount(-1234.5, 'USD')).toBe('-1.234,50\u00a0US$');
  expect(cashAmount(1234.5, 'JPY')).toBe('1.235\u00a0JP¥');
  expect(cashAmount(10, 'TRY')).toBe('10,00\u00a0TRY');
});

it('prints Azerbaijani dates and month names without relying on runtime locale data', async () => {
  // Chromium prints "2026-11-21" and "M11" for Intl "az-AZ"; these literals are what every browser must show.
  const { formatDayMonth, formatMonthShort, formatMonthYear } = await import('../services/date.js');
  const day = new Date(2026, 10, 21);
  expect(formatPaymentDate(day)).toBe('21.11.2026');
  expect(formatMonthShort(day)).toBe('noy');
  expect(formatMonthYear(day)).toBe('noyabr 2026');
  expect(formatDayMonth(new Date(2026, 0, 5))).toBe('05 yanvar');
  expect(() => formatMonthShort(new Date(NaN))).toThrow(RangeError);
});
