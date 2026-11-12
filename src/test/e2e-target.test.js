import { expect, it } from 'vitest';
import { assertE2eTarget } from '../../tests/e2e-target.mjs';

const valid = {
  E2E_SUPABASE_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd',
  VITE_SUPABASE_URL: 'https://cvjctwgdyzhijhzhhjqd.supabase.co',
  E2E_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  E2E_OTHER_TENANT_ID: '00000000-0000-0000-0000-000000000002',
};
it('accepts explicitly configured staging and distinct tenants', () => {
  expect(assertE2eTarget(valid)).toBe(valid.E2E_TENANT_ID);
});
it('never allows lifecycle tests to target production', () => {
  expect(() => assertE2eTarget({ ...valid, E2E_SUPABASE_PROJECT_REF: 'tcqdhwtnjrwpfdxoijmv', VITE_SUPABASE_URL: 'https://tcqdhwtnjrwpfdxoijmv.supabase.co' })).toThrow();
});
it('rejects missing configuration, mismatched hosts, and identical tenants', () => {
  expect(() => assertE2eTarget({})).toThrow();
  expect(() => assertE2eTarget({ ...valid, VITE_SUPABASE_URL: 'https://example.com' })).toThrow();
  expect(() => assertE2eTarget({ ...valid, E2E_OTHER_TENANT_ID: valid.E2E_TENANT_ID })).toThrow();
});

const local = {
  E2E_LOCAL: '1',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  E2E_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  E2E_OTHER_TENANT_ID: '00000000-0000-0000-0000-000000000002',
};
it('accepts the CI-local Supabase only with E2E_LOCAL=1 and a loopback URL', () => {
  expect(assertE2eTarget(local)).toBe(local.E2E_TENANT_ID);
  expect(assertE2eTarget({ ...local, VITE_SUPABASE_URL: 'http://localhost:54321' })).toBe(local.E2E_TENANT_ID);
  // Without the explicit flag a local URL is rejected like any other non-staging target.
  expect(() => assertE2eTarget({ ...local, E2E_LOCAL: undefined })).toThrow();
});
it('never lets local mode reach a hosted project, production included', () => {
  for (const url of ['https://tcqdhwtnjrwpfdxoijmv.supabase.co', 'https://cvjctwgdyzhijhzhhjqd.supabase.co', 'http://example.com', 'https://127.0.0.1:54321']) {
    expect(() => assertE2eTarget({ ...local, VITE_SUPABASE_URL: url })).toThrow('E2E_LOCAL requires a local Supabase URL');
  }
  expect(() => assertE2eTarget({ ...local, E2E_OTHER_TENANT_ID: local.E2E_TENANT_ID })).toThrow();
});
