// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/migrate-staging.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const step = (name) => workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - ')[0];
// The gate's shell script, de-indented, exactly as the runner executes it.
const gate = step('Staging-only safety gate').split('run: |\n')[1].split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');
const runGate = (env) => spawnSync('bash', ['-c', gate], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' }).status;

const STAGING = 'cvjctwgdyzhijhzhhjqd';

it('lets a dry run through and gates apply behind the explicit confirmation', () => {
  expect(runGate({ STAGING_PROJECT_REF: STAGING, MODE: 'plan', MIGRATION_CONFIRMATION: '' })).toBe(0);
  expect(runGate({ STAGING_PROJECT_REF: STAGING, MODE: 'apply', MIGRATION_CONFIRMATION: '' })).not.toBe(0);
  expect(runGate({ STAGING_PROJECT_REF: STAGING, MODE: 'apply', MIGRATION_CONFIRMATION: 'MIGRATE' })).not.toBe(0);
  expect(runGate({ STAGING_PROJECT_REF: STAGING, MODE: 'apply', MIGRATION_CONFIRMATION: 'MIGRATE STAGING' })).toBe(0);
});

it('refuses the production project and a missing staging ref even with confirmation', () => {
  const confirmed = { MODE: 'apply', MIGRATION_CONFIRMATION: 'MIGRATE STAGING' };
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: 'tcqdhwtnjrwpfdxoijmv' })).not.toBe(0);
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: '' })).not.toBe(0);
});

it('always lists pending migrations and only pushes them in apply mode, after the audit queue', () => {
  expect(step('List pending migrations (dry run)')).toContain('--dry-run');
  expect(step('List pending migrations (dry run)')).not.toContain('if:');
  expect(step('Apply ordered migrations')).toContain("if: ${{ inputs.mode == 'apply' }}");
  expect(step('Apply ordered migrations')).not.toContain('--dry-run');
  expect(workflow).toContain('environment: staging');
  expect(workflow).toContain('group: staging-audit-tenant');
  expect(workflow).not.toContain('--project-ref tcqdhwtnjrwpfdxoijmv');
});
