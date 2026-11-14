// @vitest-environment node
import { expect, it } from 'vitest';
import { buildProductionDbUrl, PRODUCTION_POOLER_HOST, PRODUCTION_REF } from '../../scripts/production-db-url.mjs';

it('builds the IPv4 session pooler URL for production with the password encoded', () => {
  const url = new URL(buildProductionDbUrl({ password: 'p@ss:w/rd#?' }));
  expect(url.hostname).toBe(PRODUCTION_POOLER_HOST);
  expect(url.port).toBe('5432');
  expect(url.username).toBe(`postgres.${PRODUCTION_REF}`);
  expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd#?');
  expect(url.searchParams.get('sslmode')).toBe('require');
});

it('refuses to build a URL without the database password', () => {
  expect(() => buildProductionDbUrl({ password: '' })).toThrow('PRODUCTION_DB_URL_PASSWORD_REQUIRED');
});
