import { expect, it } from 'vitest';
import { creditReportBalance } from '../shared/lib/creditReportBalance.ts';

it('preserves settled zero balances instead of exporting the original principal', () => {
  expect(creditReportBalance({ balance: 0, remaining: 500, principal: 20000 })).toBe(0);
  expect(creditReportBalance({ balance: '0', principal: 20000 })).toBe(0);
  expect(creditReportBalance({ remaining: 0, principal: 20000 })).toBe(0);
});

it('falls back only for missing balances and rejects invalid money', () => {
  expect(creditReportBalance({ balance: null, remaining: '125.25' })).toBe(125.25);
  expect(creditReportBalance({ principal: 200 })).toBe(200);
  expect(creditReportBalance({})).toBe(0);
  expect(() => creditReportBalance({ balance: 'broken' })).toThrow('Invalid credit report balance');
  expect(() => creditReportBalance({ balance: Infinity })).toThrow();
});
