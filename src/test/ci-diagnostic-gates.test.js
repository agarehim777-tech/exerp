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
