// @vitest-environment node
import { expect, it } from 'vitest';
import { protectedProjects, validateRestoreTarget } from '../../scripts/restore-target-guard.mjs';

const ref = 'abcdefghijklmnopqrst';
const valid = { RESTORE_CONFIRMATION: 'RESTORE', RESTORE_PROJECT_REF: ref,
  RESTORE_DATABASE_URL: `postgresql://postgres.${ref}:test@pooler.supabase.com:5432/postgres` };

it('requires an explicit manual confirmation', () => {
  expect(() => validateRestoreTarget({ ...valid, RESTORE_CONFIRMATION: '' })).toThrow('confirmation');
});
it.each(protectedProjects)('rejects protected project %s even with a different password', (id) => {
  expect(() => validateRestoreTarget({ ...valid, RESTORE_PROJECT_REF: id })).toThrow('separate');
  expect(() => validateRestoreTarget({ ...valid, RESTORE_DATABASE_URL:
    `postgresql://postgres.${id}:different@pooler.supabase.com/postgres` })).toThrow('Protected');
});
it('checks the actual connection target, not just an environment label', () => {
  expect(() => validateRestoreTarget({ ...valid, RESTORE_DATABASE_URL: 'postgres://postgres:password@other-host/postgres' })).toThrow('Unexpected');
  expect(validateRestoreTarget(valid)).toBe(ref);
});
