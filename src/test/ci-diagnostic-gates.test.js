// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// CI must never reach a Supabase project: production must not receive test data, and the other
// project (cvjctwgdyzhijhzhhjqd) is the backup database, not a test database.
const workflowsDir = new URL('../../.github/workflows/', import.meta.url);
const read = name => readFileSync(new URL(name, workflowsDir), 'utf8').replace(/\r\n/g, '\n');
const ci = read('ci.yml');
const BACKUP_REF = 'cvjctwgdyzhijhzhhjqd';

it('runs CI fully offline, without a database environment or credentials', () => {
  expect(ci).not.toMatch(/environment:/);
  expect(ci).not.toMatch(/secrets\./);
  expect(ci).not.toMatch(/staging-audit-tenant/);
  expect(ci).toContain('npm run verify:release:offline');
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  expect(pkg.scripts['verify:release:offline']).not.toContain('verify:core-backend');
  expect(pkg.scripts['verify:release:offline']).toContain('npm test');
});

it('has no workflow that writes to the backup project except the manual restore drill', () => {
  const writers = readdirSync(workflowsDir).filter(name => name.endsWith('.yml'))
    .filter(name => /environment:\s*staging/.test(read(name)) || read(name).includes(BACKUP_REF));
  expect(writers).toEqual([]);
  const restore = read('restore-drill.yml');
  expect(restore).toContain('workflow_dispatch');
  expect(restore).not.toContain('schedule:');
});

it('still deploys only after successful CI', () => {
  const deploy = read('deploy-pages.yml');
  expect(deploy).toContain("github.event.workflow_run.conclusion == 'success'");
});

// The local Supabase E2E job (browser, lifecycle and 20 business flows) gates merges; a failure
// there must fail CI rather than be reported and ignored.
it('makes the local Supabase E2E job blocking', () => {
  const job = ci.slice(ci.indexOf('  local-database:'));
  expect(job).toContain('npm run audit:flows');
  expect(ci).not.toMatch(/continue-on-error/);
});

// The local E2E job builds its database with the same Supabase CLI that applies migrations to
// production; 2.39.2 mis-split a plpgsql body, so a version gap lets CI pass what production breaks.
it('uses one Supabase CLI version for CI and production migrations', () => {
  const ciVersion = ci.match(/setup-cli@v\d+\s+with:\s+(?:#[^\n]*\s+)*version: ([\d.]+)/)?.[1];
  const prodVersions = [...read('migrate-production.yml').matchAll(/supabase@([\d.]+)/g)].map(m => m[1]);
  expect(ciVersion).toMatch(/^\d+\.\d+\.\d+$/);
  expect(prodVersions.length).toBeGreaterThan(0);
  expect(new Set(prodVersions)).toEqual(new Set([ciVersion]));
});
