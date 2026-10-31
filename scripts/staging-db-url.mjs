import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const PRODUCTION_REF = 'tcqdhwtnjrwpfdxoijmv';

// Builds the staging session pooler connection string from its parts. Hand-written strings broke on
// passwords with URL-reserved characters ("invalid userinfo"), so the password is always encoded here.
export function buildStagingDbUrl({ ref, password, host }) {
  if (!/^[a-z0-9]{20}$/.test(ref || '')) throw new Error('STAGING_DB_URL_REF_INVALID');
  if (ref === PRODUCTION_REF) throw new Error('STAGING_DB_URL_PRODUCTION_REFUSED');
  if (!password) throw new Error('STAGING_DB_URL_PASSWORD_REQUIRED: add SUPABASE_DB_PASSWORD to the staging environment');
  if (!/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host || '')) throw new Error('STAGING_DB_URL_HOST_INVALID');
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = buildStagingDbUrl({ ref: process.env.STAGING_PROJECT_REF, password: process.env.SUPABASE_DB_PASSWORD,
    host: process.env.STAGING_DB_POOLER_HOST });
  // Mask the whole string before it reaches the job environment; the password is already masked as a secret.
  process.stdout.write(`::add-mask::${url}\n`);
  if (!process.env.GITHUB_ENV) throw new Error('STAGING_DB_URL_GITHUB_ENV_REQUIRED');
  await appendFile(process.env.GITHUB_ENV, `STAGING_DB_URL=${url}\n`);
}
