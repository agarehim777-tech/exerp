import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Production migrations reach the database through the IPv4 session pooler (the same host the
// nightly backup uses): GitHub runners have no IPv6, so the Supabase CLI's direct `link` connection
// fails there. The password is URL-encoded so reserved characters cannot break the connection string.
export const PRODUCTION_REF = 'tcqdhwtnjrwpfdxoijmv';
export const PRODUCTION_POOLER_HOST = 'aws-0-ap-southeast-1.pooler.supabase.com';

export function buildProductionDbUrl({ password }) {
  if (!password) throw new Error('PRODUCTION_DB_URL_PASSWORD_REQUIRED: add SUPABASE_DB_PASSWORD to the production environment');
  return `postgresql://postgres.${PRODUCTION_REF}:${encodeURIComponent(password)}@${PRODUCTION_POOLER_HOST}:5432/postgres?sslmode=require`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = buildProductionDbUrl({ password: process.env.SUPABASE_DB_PASSWORD });
  // Mask the whole string before it reaches the job environment; the raw password is masked as a secret.
  process.stdout.write(`::add-mask::${url}\n`);
  if (!process.env.GITHUB_ENV) throw new Error('PRODUCTION_DB_URL_GITHUB_ENV_REQUIRED');
  await appendFile(process.env.GITHUB_ENV, `PRODUCTION_DB_URL=${url}\n`);
}
