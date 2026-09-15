CREATE TABLE IF NOT EXISTS public.tenant_collection_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  collection text NOT NULL,
  record_key text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_collection_records_unique UNIQUE (tenant_id, collection, record_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_collection_records TO authenticated;
GRANT ALL ON public.tenant_collection_records TO service_role;

ALTER TABLE public.tenant_collection_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members read collection records" ON public.tenant_collection_records;
CREATE POLICY "tenant members read collection records"
  ON public.tenant_collection_records FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "tenant members write collection records" ON public.tenant_collection_records;
CREATE POLICY "tenant members write collection records"
  ON public.tenant_collection_records FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE INDEX IF NOT EXISTS tenant_collection_records_tenant_collection_idx
  ON public.tenant_collection_records (tenant_id, collection, position);

CREATE OR REPLACE FUNCTION public.touch_tenant_collection_records()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_collection_records_touch ON public.tenant_collection_records;
CREATE TRIGGER tenant_collection_records_touch
  BEFORE UPDATE ON public.tenant_collection_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_tenant_collection_records();