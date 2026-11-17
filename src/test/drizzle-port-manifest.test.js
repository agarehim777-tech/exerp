// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// Lovable writes schema changes to drizzle/migrations and applies them to its own database only.
// Every database built from this repo (local Supabase E2E, PGlite replay tests, migrate-production)
// uses supabase/migrations, so a drizzle-only change silently never reaches them. This gate makes
// each drizzle file an explicit decision recorded in drizzle/migrations/PORTED.json.

const MANIFEST = 'drizzle/migrations/PORTED.json';
const STATUSES = ['ported', 'notPorted', 'pending'];

const fromRoot = (path) => new URL(`../../${path}`, import.meta.url);
const sqlFiles = (dir) => readdirSync(fromRoot(`${dir}/`)).filter((name) => name.endsWith('.sql')).sort();
const manifest = JSON.parse(readFileSync(fromRoot(MANIFEST), 'utf8'));
const entries = manifest.files || {};
const supabaseVersions = new Set(sqlFiles('supabase/migrations').map((name) => name.split('_')[0]));

const howToFix = (file) => [
  `drizzle/migrations/${file} has no entry in ${MANIFEST}.`,
  'Lovable applied this schema change to its own database only; supabase/migrations (local E2E, PGlite tests,',
  'migrate-production) does not have it. To fix:',
  `  1. Port the SQL of ${file} into a new supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`,
  '     (timestamp later than the newest existing file; skip statements the repo schema already has).',
  `  2. Add "${file}": { "status": "ported", "supabase": ["<YYYYMMDDHHMMSS>"], "reason": "..." } to ${MANIFEST}.`,
  `  If it must not be ported, add { "status": "notPorted", "reason": "<why>" } instead.`,
].join('\n');

it('records every drizzle migration in drizzle/migrations/PORTED.json', () => {
  const missing = sqlFiles('drizzle/migrations').filter((file) => !(file in entries));
  expect(missing, missing.map(howToFix).join('\n\n')).toEqual([]);
});

it('has no manifest entries for drizzle files that do not exist', () => {
  const files = new Set(sqlFiles('drizzle/migrations'));
  const stale = Object.keys(entries).filter((file) => !files.has(file));
  expect(stale, `Remove these entries from ${MANIFEST} (or restore the files)`).toEqual([]);
});

it('gives every entry a known status, a reason and existing supabase versions', () => {
  const problems = Object.entries(entries).flatMap(([file, entry]) => {
    const issues = [];
    if (!STATUSES.includes(entry.status)) issues.push(`status must be one of ${STATUSES.join(', ')}`);
    if (typeof entry.reason !== 'string' || !entry.reason.trim()) issues.push('reason is required');
    const versions = entry.supabase ?? [];
    if (!Array.isArray(versions)) issues.push('supabase must be an array of migration versions');
    else {
      if (entry.status === 'ported' && !versions.length) issues.push('ported entries must list the supabase/migrations versions that contain them');
      for (const version of versions) {
        if (!supabaseVersions.has(version)) issues.push(`supabase/migrations/${version}_*.sql does not exist`);
      }
    }
    return issues.map((issue) => `${file}: ${issue}`);
  });
  expect(problems, `Fix these entries in ${MANIFEST}`).toEqual([]);
});

it('explains the fix in the failure message', () => {
  const message = howToFix('0099_example.sql');
  expect(message).toContain('supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql');
  expect(message).toContain(`"0099_example.sql": { "status": "ported"`);
});
