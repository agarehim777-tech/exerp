-- Message conversations move out of the tenant snapshot into their own table.
--
-- Every conversation (direct, group and support-task threads, with their messages) lived in
-- tenant_state_snapshots.state->'conversations': one JSON array per tenant, so people writing in different
-- threads overwrote each other. Same pattern as support_tickets (20261125090000): one row per conversation
-- in public.message_threads, written by the app's collection sync through apply_collection_changes.
-- Messages of one thread stay together in the row (metadata.messages); two people writing in the SAME
-- thread at the same moment can still collide, different threads no longer can.
--
-- * Read: messages or support viewers (support tasks open their thread).
-- * Insert/update: messages or support editors (a support comment is mirrored into the task thread).
-- * Delete: messages editors only.
-- * Existing conversations are copied from every snapshot; the snapshot copy is left in place.
--   save_tenant_state_patch now also ignores 'conversations'.

CREATE TABLE IF NOT EXISTS public.message_threads (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  type text,
  title text,
  person text,
  status text,
  team text,
  ticket_id text,
  unread numeric,
  last_at text,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_threads TO authenticated;
GRANT ALL ON public.message_threads TO service_role;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_threads_read ON public.message_threads;
CREATE POLICY message_threads_read ON public.message_threads FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'messages', 'view'), false)
      OR coalesce(private.has_module_access(tenant_id, 'support', 'view'), false));
DROP POLICY IF EXISTS message_threads_insert ON public.message_threads;
CREATE POLICY message_threads_insert ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'messages', 'edit'), false)
      OR coalesce(private.has_module_access(tenant_id, 'support', 'edit'), false));
DROP POLICY IF EXISTS message_threads_update ON public.message_threads;
CREATE POLICY message_threads_update ON public.message_threads FOR UPDATE TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'messages', 'edit'), false)
      OR coalesce(private.has_module_access(tenant_id, 'support', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'messages', 'edit'), false)
      OR coalesce(private.has_module_access(tenant_id, 'support', 'edit'), false));
DROP POLICY IF EXISTS message_threads_delete ON public.message_threads;
CREATE POLICY message_threads_delete ON public.message_threads FOR DELETE TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'messages', 'edit'), false));

-- Copy existing conversations (same field mapping and record key as src/shared/adapters/dedicatedCollections.ts).
INSERT INTO public.message_threads (tenant_id, record_key, sort_position, type, title, person, status, team,
  ticket_id, unread, last_at, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item->>'type', t.item->>'title', t.item->>'person', t.item->>'status', t.item->>'team', t.item->>'ticketId',
  CASE WHEN (t.item->>'unread') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (t.item->>'unread')::numeric END,
  t.item->>'time',
  t.item - ARRAY['type','title','person','status','team','ticketId','unread','time']
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'conversations') = 'array' THEN s.state->'conversations' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- The collection batch writer accepts the new table (body unchanged from 20261125090000 otherwise).
CREATE OR REPLACE FUNCTION public.apply_collection_changes(_tenant uuid, _changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  item jsonb; payload jsonb; target text; columns_sql text; values_sql text; updates_sql text;
  field text; affected integer; total integer := 0;
BEGIN
  IF _tenant IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'COLLECTION_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_changes) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'COLLECTION_BATCH_INVALID'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('collections:' || _tenant::text, 0));
  FOR item IN SELECT value FROM jsonb_array_elements(_changes) LOOP
    target := item->>'table';
    IF target IS NULL OR target <> ALL(ARRAY['employees','hr_departments','hr_leave_requests','hr_vacancies',
      'business_contracts','finance_entries','finance_account_records','finance_credit_records','support_tickets','message_threads']) THEN
      RAISE EXCEPTION 'COLLECTION_TABLE_INVALID';
    END IF;
    payload := item->'row';
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR coalesce(payload->>'record_key','') = '' THEN
      RAISE EXCEPTION 'COLLECTION_ROW_INVALID';
    END IF;
    IF payload ? 'tenant_id' AND payload->>'tenant_id' IS DISTINCT FROM _tenant::text THEN
      RAISE EXCEPTION 'COLLECTION_TENANT_MISMATCH' USING ERRCODE = '42501';
    END IF;
    IF item->>'operation' = 'delete' THEN
      EXECUTE format('DELETE FROM public.%I WHERE tenant_id=$1 AND record_key=$2', target)
        USING _tenant, payload->>'record_key';
    ELSIF item->>'operation' = 'upsert' THEN
      payload := payload || jsonb_build_object('tenant_id', _tenant);
      columns_sql := ''; values_sql := ''; updates_sql := '';
      FOR field IN SELECT jsonb_object_keys(payload) ORDER BY 1 LOOP
        IF field IN ('id','created_at','updated_at') OR NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = to_regclass(format('public.%I', target)) AND a.attname = field
            AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
        ) THEN RAISE EXCEPTION 'COLLECTION_FIELD_INVALID: %', field; END IF;
        columns_sql := concat_ws(',', nullif(columns_sql,''), format('%I', field));
        values_sql := concat_ws(',', nullif(values_sql,''), format('r.%I', field));
        IF field NOT IN ('tenant_id','record_key') THEN
          updates_sql := concat_ws(',', nullif(updates_sql,''), format('%I=excluded.%I', field, field));
        END IF;
      END LOOP;
      IF updates_sql = '' THEN RAISE EXCEPTION 'COLLECTION_ROW_EMPTY'; END IF;
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I,$1) r
        ON CONFLICT (tenant_id,record_key) DO UPDATE SET %s', target, columns_sql, values_sql, target, updates_sql)
        USING payload;
    ELSE RAISE EXCEPTION 'COLLECTION_OPERATION_INVALID';
    END IF;
    GET DIAGNOSTICS affected = ROW_COUNT;
    total := total + affected;
  END LOOP;
  RETURN jsonb_build_object('applied', total);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_collection_changes(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_collection_changes(uuid,jsonb) TO authenticated;

-- Snapshot keys that moved to their own tables are ignored (returned in 'ignored'), so an old browser tab
-- cannot write the array back; the rest of its patch still saves.
CREATE OR REPLACE FUNCTION public.save_tenant_state_patch(_tenant_id uuid, _patch jsonb, _schema_version integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_module text;
  v_allowed jsonb := '{}'::jsonb;
  v_saved text[] := '{}';
  v_denied text[] := '{}';
  v_ignored text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR NOT COALESCE(_tenant_id IN (SELECT private.member_tenant_ids()), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'tenant_state_patch_invalid'; END IF;

  FOR v_key IN SELECT jsonb_object_keys(_patch) LOOP
    IF v_key IN ('customers', 'products', 'orders', 'invoices', 'stock', 'warehouses', 'vendors', 'accounting',
                 'warehouseStock', 'expenses', 'cashEntries', 'financeAccounts', 'credits', 'employees',
                 'departments', 'leaveRequests', 'vacancies', 'contracts') THEN
      RAISE EXCEPTION 'tenant_state_key_not_allowed: %', v_key;
    END IF;
    IF v_key IN ('supportTickets', 'conversations') THEN
      v_ignored := v_ignored || v_key;
      CONTINUE;
    END IF;
    v_module := private.tenant_state_key_module(v_key);
    IF v_module = '*' OR private.has_module_access(_tenant_id, v_module, 'edit') THEN
      v_allowed := v_allowed || jsonb_build_object(v_key, _patch -> v_key);
      v_saved := v_saved || v_key;
    ELSE
      v_denied := v_denied || v_key;
    END IF;
  END LOOP;

  IF v_allowed <> '{}'::jsonb THEN
    INSERT INTO public.tenant_state_snapshots AS s (tenant_id, state, schema_version, updated_by, updated_at)
    VALUES (_tenant_id, v_allowed, COALESCE(_schema_version, 2), auth.uid(), now())
    ON CONFLICT (tenant_id) DO UPDATE
      SET state = COALESCE(s.state, '{}'::jsonb) || EXCLUDED.state,
          schema_version = COALESCE(_schema_version, s.schema_version),
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN jsonb_build_object('saved', to_jsonb(v_saved), 'denied', to_jsonb(v_denied), 'ignored', to_jsonb(v_ignored));
END;
$$;

REVOKE ALL ON FUNCTION public.save_tenant_state_patch(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_state_patch(uuid, jsonb, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
