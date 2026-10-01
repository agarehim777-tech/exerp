CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.legacy_snapshot_archive (
  tenant_id uuid NOT NULL,
  snapshot_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,snapshot_hash)
);
ALTER TABLE private.legacy_snapshot_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.legacy_snapshot_archive FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON private.legacy_snapshot_archive TO service_role;

-- Preserve complete rows, including metadata and unmapped collections, before cutover.
INSERT INTO private.legacy_snapshot_archive(tenant_id,snapshot_hash,snapshot)
SELECT s.tenant_id,md5(to_jsonb(s)::text),to_jsonb(s)
FROM public.tenant_state_snapshots s
ON CONFLICT(tenant_id,snapshot_hash) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenant_state_snapshots s WHERE NOT EXISTS (
      SELECT 1 FROM private.legacy_snapshot_archive a WHERE a.tenant_id=s.tenant_id
        AND a.snapshot_hash=md5(to_jsonb(s)::text) AND a.snapshot=to_jsonb(s)
    )
  ) THEN RAISE EXCEPTION 'snapshot_archive_verification_failed'; END IF;
END $$;
