// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { toLocalIsoDate } from '../services/date.js';

// Baku is UTC+4, so toISOString() returned the previous day for every local midnight
// (month, quarter and year starts, accounting periods) and for anything entered before 04:00.
const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'Asia/Baku'; });
afterAll(() => { process.env.TZ = originalTz; });

it('keeps the local calendar day in a time zone ahead of UTC', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-240);
  expect(toLocalIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  expect(toLocalIsoDate(new Date(2026, 9, 1))).toBe('2026-10-01');
  expect(toLocalIsoDate(new Date(2026, 10, 0))).toBe('2026-10-31');
  expect(toLocalIsoDate(new Date('2026-11-01T02:30:00+04:00'))).toBe('2026-11-01');
  expect(toLocalIsoDate(new Date('invalid'))).toBe('');
});

it('defaults to today', () => {
  const now = new Date();
  expect(toLocalIsoDate()).toBe(toLocalIsoDate(now));
});

it('no application code derives a calendar date or month from toISOString()', () => {
  const grep = () => execFileSync('git', ['grep', '-nE', 'toISOString\\(\\)\\.(slice|substring|substr)\\(0, *(7|10)\\)',
    '--', 'src', ':!src/test'], { encoding: 'utf8' });
  let hits = '';
  try { hits = grep().trim(); } catch (error) { if (error.status !== 1) throw error; } // 1 = no match
  expect(hits).toBe('');
});
