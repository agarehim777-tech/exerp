CREATE FUNCTION private.guard_viewer_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; scope_id uuid; parent_tenant uuid; link record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id=auth.uid() AND role='viewer') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(
    CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW))
         WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD))
         ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
    scope_id:=(row_data->>'tenant_id')::uuid;
    IF EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=scope_id AND user_id=auth.uid() AND role='viewer') THEN
      RAISE EXCEPTION 'readonly_role_write_denied' USING ERRCODE='42501';
    END IF;
    FOR link IN SELECT pn.nspname,pc.relname,ca.attname child_column,pa.attname parent_column
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class pc ON pc.oid=c.confrelid JOIN pg_catalog.pg_namespace pn ON pn.oid=pc.relnamespace
      JOIN pg_catalog.pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=c.conkey[1]
      JOIN pg_catalog.pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[1]
      WHERE c.conrelid=TG_RELID AND c.contype='f' AND array_length(c.conkey,1)=1 AND pn.nspname='public'
        AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='tenant_id' AND NOT a.attisdropped) LOOP
      EXECUTE format('SELECT tenant_id FROM %I.%I WHERE %I::text=$1',link.nspname,link.relname,link.parent_column)
        INTO parent_tenant USING row_data->>link.child_column;
      IF EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=parent_tenant AND user_id=auth.uid() AND role='viewer') THEN
        RAISE EXCEPTION 'readonly_role_write_denied' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.guard_viewer_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE target record;
BEGIN
  FOR target IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND (
      EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint fk JOIN pg_catalog.pg_attribute a ON a.attrelid=fk.confrelid
        WHERE fk.conrelid=c.oid AND fk.contype='f' AND a.attname='tenant_id' AND NOT a.attisdropped)) LOOP
    EXECUTE format('CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write()',target.nspname,target.relname);
  END LOOP;
END $$;
