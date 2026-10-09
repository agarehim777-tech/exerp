import { expect, it } from 'vitest';
import { money, percent } from '../services/format.js';
import { formatPaymentDate } from '../services/date.js';

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
