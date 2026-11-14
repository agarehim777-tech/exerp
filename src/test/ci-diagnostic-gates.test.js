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

// Production migrations default to a dry run; only mode=apply with MIGRATE changes the database, and
// the plan uses the same push flags so its output is exactly what apply will do.
it('plans production migrations by default and applies only on explicit confirmation', () => {
  const wf = read('migrate-production.yml');
  expect(wf).toMatch(/mode:\s+description:[^\n]*\n\s+type: choice\n\s+options: \[plan, apply\]\n\s+default: plan/);
  const steps = wf.split('\n      - name: ').slice(1);
  const step = (name) => steps.find((s) => s.startsWith(name)) || '';
  expect(step('Explicit production safety gate')).toContain("if: inputs.mode == 'apply'");
  expect(step('Explicit production safety gate')).toContain('test "$MIGRATION_CONFIRMATION" = "MIGRATE"');
  const plan = step('Plan');
  const apply = step('Apply ordered migrations');
  expect(plan).not.toContain('if:');
  expect(plan).toContain('db push --db-url "$PRODUCTION_DB_URL" --include-all --dry-run');
  expect(apply).toContain("if: inputs.mode == 'apply'");
  expect(apply).toContain('db push --db-url "$PRODUCTION_DB_URL" --include-all --yes');
  expect(apply).not.toContain('--dry-run');
  expect(wf.match(/db push(?![^\n]*--dry-run)/g)).toHaveLength(1);
});

// A function that writes a dropped column passes every migration and only fails when called, so CI
// lints the local database's functions and fails on errors.
it('fails CI on database function lint errors', () => {
  const job = ci.slice(ci.indexOf('\n  local-database:'));
  expect(job).toContain('supabase db lint --local --level error --fail-on error');
});

// Production drifted from the repo twice unnoticed; the daily health run now fails on broken
// production functions and on merged migrations that were never applied. It must stay read-only.
it('checks production schema drift daily without changing it', () => {
  const wf = read('operational-health.yml');
  const job = wf.slice(wf.indexOf('\n  schema-drift:'));
  expect(job).toContain('node scripts/production-db-url.mjs');
  expect(job).toContain('db lint --db-url "$PRODUCTION_DB_URL" --level error --fail-on error');
  expect(job).toContain('db push --db-url "$PRODUCTION_DB_URL" --include-all --dry-run');
  expect(job).toContain('Remote database is up to date');
  expect(job.match(/db push(?![^\n]*--dry-run)/g)).toBeNull();
});

// GitHub runners have no IPv6: the CLI's direct `link` connection failed there (run 43562616809), so
// production commands go through the IPv4 session pooler URL instead.
it('reaches production through the IPv4 pooler, not the IPv6-only direct link', () => {
  const wf = read('migrate-production.yml');
  expect(wf).not.toMatch(/supabase@[\d.]+ link\b/);
  expect(wf).not.toContain('--linked');
  expect(wf).toContain('node scripts/production-db-url.mjs');
});
