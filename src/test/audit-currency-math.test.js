// @vitest-environment node
import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { round2 } from '../shared/utils/invoiceMath.js';

it('compares server payment decimals at cent precision rather than binary float artifacts', async () => {
  expect(83.33 + 50).not.toBe(133.33);
  const principal = round2(83.33 + 50);
  expect(principal).toBe(133.33);
  expect(round2(200 + principal)).toBe(333.33);
  expect(round2(1000 - principal)).toBe(866.67);
  expect(round2(83.33 - 50)).toBe(33.33);
  expect(round2(1000 - principal)).not.toBe(866.66);
  const audit = await readFile(new URL('../../scripts/business-flow-audit.mjs', import.meta.url), 'utf8');
  expect(audit).toContain('const principalPayment = round2(currentDue + 50)');
  expect(audit).toContain('previousCredit.installments.length === Number(previousCredit.months)');
});
