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
const PRODUCTION = 'tcqdhwtnjrwpfdxoijmv';
const pooler = (ref) => `postgresql://postgres.${ref}:test-only@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
const staging = { STAGING_PROJECT_REF: STAGING, STAGING_DB_URL: pooler(STAGING) };

it('lets a dry run through and gates apply behind the explicit confirmation', () => {
  expect(runGate({ ...staging, MODE: 'plan', MIGRATION_CONFIRMATION: '' })).toBe(0);
  expect(runGate({ ...staging, MODE: 'apply', MIGRATION_CONFIRMATION: '' })).not.toBe(0);
  expect(runGate({ ...staging, MODE: 'apply', MIGRATION_CONFIRMATION: 'MIGRATE' })).not.toBe(0);
  expect(runGate({ ...staging, MODE: 'apply', MIGRATION_CONFIRMATION: 'MIGRATE STAGING' })).toBe(0);
});

it('refuses production, a missing ref and a database URL for another project even with confirmation', () => {
  const confirmed = { MODE: 'apply', MIGRATION_CONFIRMATION: 'MIGRATE STAGING' };
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: PRODUCTION, STAGING_DB_URL: pooler(PRODUCTION) })).not.toBe(0);
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: '', STAGING_DB_URL: pooler(STAGING) })).not.toBe(0);
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: STAGING, STAGING_DB_URL: '' })).not.toBe(0);
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: STAGING, STAGING_DB_URL: pooler(PRODUCTION) })).not.toBe(0);
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: STAGING, STAGING_DB_URL: pooler('abcdefghijklmnopqrst') })).not.toBe(0);
  expect(runGate({ ...confirmed, STAGING_PROJECT_REF: STAGING,
    STAGING_DB_URL: `${pooler(STAGING)}?options=${PRODUCTION}` })).not.toBe(0);
});

it('always lists pending migrations over the database URL and only pushes them in apply mode', () => {
  expect(step('List pending migrations (dry run)')).toContain('--db-url "$STAGING_DB_URL" --include-all --dry-run');
  expect(step('List pending migrations (dry run)')).not.toContain('if:');
  expect(step('Apply ordered migrations')).toContain("if: ${{ inputs.mode == 'apply' }}");
  expect(step('Apply ordered migrations')).not.toContain('--dry-run');
  expect(workflow).not.toContain('supabase@2.39.2 link');
  expect(workflow).not.toContain('secrets.STAGING_DB_URL');
  expect(step('Build staging database URL')).toContain('node scripts/staging-db-url.mjs');
  expect(step('Build staging database URL')).toContain('secrets.SUPABASE_DB_PASSWORD');
  expect(workflow.indexOf('- name: Build staging database URL')).toBeLessThan(workflow.indexOf('- name: Staging-only safety gate'));
  expect(workflow).toContain('environment: staging');
  expect(workflow).toContain('group: staging-audit-tenant');
});
