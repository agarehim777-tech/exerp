import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);

// Minimal stand-ins for the Supabase-managed schemas the migrations reference.
const supabaseStubs = `
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_admin;
  CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage; CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
    created_at timestamptz DEFAULT now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE
    AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated') $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint,
    allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
  CREATE PUBLICATION supabase_realtime;
  CREATE FUNCTION public.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql VOLATILE
    AS $$ SELECT decode(substr(repeat(md5(random()::text), 8), 1, $1 * 2), 'hex') $$;
  CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1, '/') $$;
`;

// Replays every migration in order. A few historical migrations only applied to databases that
// already had hand-made objects; they are reported instead of aborting the replay.
export async function replayMigrations() {
  const db = new PGlite();
  await db.exec(supabaseStubs);
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  const skipped = [];
  for (const file of files) {
    try {
      await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'));
    } catch (error) {
      skipped.push({ file, error: error.message.split('\n')[0] });
    }
  }
  return { db, files, skipped };
}
