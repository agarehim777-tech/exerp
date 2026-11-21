// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Chromium (Chrome, Edge, the desktop app) has no Azerbaijani number or date data, so Intl "az-AZ" prints
// "20,087.18", "AZN 0.00", "2026-11-21" and "M11" there. Format through services/format.js (money, percent,
// formatAmount, cashAmount, formatNumber) and services/date.js (formatDate, formatDateTime, formatPaymentDate,
// formatMonthShort, formatMonthYear, formatDayMonth) instead. Tests run in Node, which hides the problem.
async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'test' || entry.name === 'services' ? [] : sourceFiles(full);
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [full] : [];
  }));
  return nested.flat();
}

it('formats Azerbaijani numbers and dates only through the services helpers', async () => {
  const pattern = /toLocale(?:Date|Time)?String\(\s*['"]az|Intl\.(?:NumberFormat|DateTimeFormat)\(\s*['"]az/;
  const offenders = [];
  for (const file of await sourceFiles(join(process.cwd(), 'src'))) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => { if (pattern.test(line)) offenders.push(`${file}:${index + 1}`); });
  }
  expect(offenders).toEqual([]);
});

// 'x.toFixed(2) ₼' prints '20087.18 ₼': no thousands separator and an English decimal point. Use formatAmount or
// cashAmount (with the row currency) for money shown on screen.
it('shows money amounts through the shared formatters, not toFixed', async () => {
  const pattern = /toFixed\(\d\)\}?\s*(?:₼|AZN|\{[^}]*currency)/;
  const offenders = [];
  for (const file of await sourceFiles(join(process.cwd(), 'src'))) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => { if (pattern.test(line)) offenders.push(`${file}:${index + 1}`); });
  }
  expect(offenders).toEqual([]);
});
