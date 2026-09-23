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
