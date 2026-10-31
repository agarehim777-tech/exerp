// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { buildStagingDbUrl } from '../../scripts/staging-db-url.mjs';

it('masks the URL and hands it to later steps through GITHUB_ENV', () => {
  const githubEnv = join(mkdtempSync(join(tmpdir(), 'staging-url-')), 'env');
  const script = fileURLToPath(new URL('../../scripts/staging-db-url.mjs', import.meta.url));
  const run = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { PATH: process.env.PATH, GITHUB_ENV: githubEnv,
    STAGING_PROJECT_REF: 'cvjctwgdyzhijhzhhjqd', SUPABASE_DB_PASSWORD: 'p@ss#1', STAGING_DB_POOLER_HOST: 'aws-0-ap-northeast-1.pooler.supabase.com' } });
  expect(run.status).toBe(0);
  const url = 'postgresql://postgres.cvjctwgdyzhijhzhhjqd:p%40ss%231@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';
  expect(run.stdout).toBe(`::add-mask::${url}\n`);
  expect(readFileSync(githubEnv, 'utf8')).toBe(`STAGING_DB_URL=${url}\n`);
});

const parts = { ref: 'cvjctwgdyzhijhzhhjqd', password: 'plain', host: 'aws-0-ap-northeast-1.pooler.supabase.com' };

it('builds the session pooler URL and encodes URL-reserved password characters', () => {
  expect(buildStagingDbUrl(parts))
    .toBe('postgresql://postgres.cvjctwgdyzhijhzhhjqd:plain@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres');
  const tricky = 'a@b:c/d#e?f%g[h] i';
  const url = new URL(buildStagingDbUrl({ ...parts, password: tricky }));
  expect(decodeURIComponent(url.password)).toBe(tricky);
  expect(url.username).toBe('postgres.cvjctwgdyzhijhzhhjqd');
  expect(url.hostname).toBe(parts.host);
});

it('refuses production, a missing password and a host outside the Supabase pooler', () => {
  expect(() => buildStagingDbUrl({ ...parts, ref: 'tcqdhwtnjrwpfdxoijmv' })).toThrow('PRODUCTION_REFUSED');
  expect(() => buildStagingDbUrl({ ...parts, ref: 'short' })).toThrow('REF_INVALID');
  expect(() => buildStagingDbUrl({ ...parts, password: '' })).toThrow('PASSWORD_REQUIRED');
  expect(() => buildStagingDbUrl({ ...parts, host: 'evil.example.com' })).toThrow('HOST_INVALID');
  expect(() => buildStagingDbUrl({ ...parts, host: 'db.cvjctwgdyzhijhzhhjqd.supabase.co' })).toThrow('HOST_INVALID');
});
