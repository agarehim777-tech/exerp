// Every table in the public schema must have row level security enabled: a table without it is readable
// and writable by any signed-in user of any tenant through the API. Runs in CI against the throwaway local
// Supabase built from supabase/migrations. Many tables enable RLS inside DO-loops, so reading the
// migration files is not enough; this asks the built database.
import postgres from 'postgres';

const url = process.env.LOCAL_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error(`verify-rls-coverage only runs against a local database, not ${host}`);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const tables = await sql`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY c.relname`;
  const withoutRls = tables.filter((row) => !row.relrowsecurity).map((row) => row.relname);

  // Views run with their owner's rights unless security_invoker is set, so a view granted to API roles
  // can read past RLS. Reported for review, not failed: some are deliberate aggregates.
  const definerViews = await sql`
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      AND NOT coalesce(c.reloptions::text[] @> ARRAY['security_invoker=true'], false)
      AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT'))
    ORDER BY c.relname`;

  console.log(`RLS: ${tables.length - withoutRls.length}/${tables.length} public tables have row level security.`);
  if (definerViews.length) {
    console.log(`::warning::Views readable by API roles without security_invoker: ${definerViews.map((row) => row.relname).join(', ')}`);
  }
  if (withoutRls.length) {
    console.error(`Public tables without row level security: ${withoutRls.join(', ')}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
