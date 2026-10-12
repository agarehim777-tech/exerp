import { expect, it } from 'vitest';
import { isLastCollectionPage } from '../../tests/collection-readiness.mjs';

it('requires the last exact-count page, including empty collections', () => {
  for (const value of ['0-99/340', '100-199/340', '200-100/101', '0-199/100', '0-0/0', null, '', '*/*']) expect(isLastCollectionPage(value)).toBe(false);
  for (const value of ['300-339/340', '0-99/100', '*/0']) expect(isLastCollectionPage(value)).toBe(true);
});
