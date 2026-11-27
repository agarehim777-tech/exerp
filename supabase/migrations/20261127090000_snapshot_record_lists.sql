-- The remaining snapshot record lists move into their own tables (same pattern as support_tickets and
-- message_threads). Each list was one JSON array per tenant in tenant_state_snapshots, so two people adding
-- records in the same module overwrote each other. Now one row per record, written by the collection sync
-- through apply_collection_changes; every row lives in `metadata` (the app reads it back unchanged).
-- Lists that carry built-in defaults and are configuration rather than records (KPI targets, notification
-- rules and providers, API webhooks and secrets) stay in the snapshot, where #166 already saves per key.
-- Read needs view, write needs edit on the owning module. Existing records are copied from every snapshot;
-- the snapshot copies are left in place and save_tenant_state_patch ignores these keys from now on.

-- notifications (notifications)
CREATE TABLE IF NOT EXISTS public.notification_records (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_records TO authenticated;
GRANT ALL ON public.notification_records TO service_role;
ALTER TABLE public.notification_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_records_read ON public.notification_records;
CREATE POLICY notification_records_read ON public.notification_records FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'notifications', 'view'), false));
DROP POLICY IF EXISTS notification_records_write ON public.notification_records;
CREATE POLICY notification_records_write ON public.notification_records FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'notifications', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'notifications', 'edit'), false));
INSERT INTO public.notification_records (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'notifications') = 'array' THEN s.state->'notifications' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- notificationSendLog (notifications)
CREATE TABLE IF NOT EXISTS public.notification_send_log (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_send_log TO authenticated;
GRANT ALL ON public.notification_send_log TO service_role;
ALTER TABLE public.notification_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_send_log_read ON public.notification_send_log;
CREATE POLICY notification_send_log_read ON public.notification_send_log FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'notifications', 'view'), false));
DROP POLICY IF EXISTS notification_send_log_write ON public.notification_send_log;
CREATE POLICY notification_send_log_write ON public.notification_send_log FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'notifications', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'notifications', 'edit'), false));
INSERT INTO public.notification_send_log (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'notificationSendLog') = 'array' THEN s.state->'notificationSendLog' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- projects (projects)
CREATE TABLE IF NOT EXISTS public.project_records (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_records TO authenticated;
GRANT ALL ON public.project_records TO service_role;
ALTER TABLE public.project_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_records_read ON public.project_records;
CREATE POLICY project_records_read ON public.project_records FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'projects', 'view'), false));
DROP POLICY IF EXISTS project_records_write ON public.project_records;
CREATE POLICY project_records_write ON public.project_records FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'projects', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'projects', 'edit'), false));
INSERT INTO public.project_records (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'projects') = 'array' THEN s.state->'projects' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- productionPlans (production)
CREATE TABLE IF NOT EXISTS public.production_plan_records (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_plan_records TO authenticated;
GRANT ALL ON public.production_plan_records TO service_role;
ALTER TABLE public.production_plan_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS production_plan_records_read ON public.production_plan_records;
CREATE POLICY production_plan_records_read ON public.production_plan_records FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'production', 'view'), false));
DROP POLICY IF EXISTS production_plan_records_write ON public.production_plan_records;
CREATE POLICY production_plan_records_write ON public.production_plan_records FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'production', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'production', 'edit'), false));
INSERT INTO public.production_plan_records (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'productionPlans') = 'array' THEN s.state->'productionPlans' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- knowledgeBase (help)
CREATE TABLE IF NOT EXISTS public.knowledge_base_articles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_base_articles TO authenticated;
GRANT ALL ON public.knowledge_base_articles TO service_role;
ALTER TABLE public.knowledge_base_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_base_articles_read ON public.knowledge_base_articles;
CREATE POLICY knowledge_base_articles_read ON public.knowledge_base_articles FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'help', 'view'), false));
DROP POLICY IF EXISTS knowledge_base_articles_write ON public.knowledge_base_articles;
CREATE POLICY knowledge_base_articles_write ON public.knowledge_base_articles FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'help', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'help', 'edit'), false));
INSERT INTO public.knowledge_base_articles (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'knowledgeBase') = 'array' THEN s.state->'knowledgeBase' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- taxCalendar (tax)
CREATE TABLE IF NOT EXISTS public.tax_calendar_entries (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_calendar_entries TO authenticated;
GRANT ALL ON public.tax_calendar_entries TO service_role;
ALTER TABLE public.tax_calendar_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tax_calendar_entries_read ON public.tax_calendar_entries;
CREATE POLICY tax_calendar_entries_read ON public.tax_calendar_entries FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'tax', 'view'), false));
DROP POLICY IF EXISTS tax_calendar_entries_write ON public.tax_calendar_entries;
CREATE POLICY tax_calendar_entries_write ON public.tax_calendar_entries FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'tax', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'tax', 'edit'), false));
INSERT INTO public.tax_calendar_entries (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'taxCalendar') = 'array' THEN s.state->'taxCalendar' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- currencyRates (accounting)
CREATE TABLE IF NOT EXISTS public.currency_rate_records (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currency_rate_records TO authenticated;
GRANT ALL ON public.currency_rate_records TO service_role;
ALTER TABLE public.currency_rate_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS currency_rate_records_read ON public.currency_rate_records;
CREATE POLICY currency_rate_records_read ON public.currency_rate_records FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'accounting', 'view'), false));
DROP POLICY IF EXISTS currency_rate_records_write ON public.currency_rate_records;
CREATE POLICY currency_rate_records_write ON public.currency_rate_records FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'accounting', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'accounting', 'edit'), false));
INSERT INTO public.currency_rate_records (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'currencyRates') = 'array' THEN s.state->'currencyRates' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- apiWebhookLogs (api)
CREATE TABLE IF NOT EXISTS public.api_webhook_logs (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_webhook_logs TO authenticated;
GRANT ALL ON public.api_webhook_logs TO service_role;
ALTER TABLE public.api_webhook_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_webhook_logs_read ON public.api_webhook_logs;
CREATE POLICY api_webhook_logs_read ON public.api_webhook_logs FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'api', 'view'), false));
DROP POLICY IF EXISTS api_webhook_logs_write ON public.api_webhook_logs;
CREATE POLICY api_webhook_logs_write ON public.api_webhook_logs FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'api', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'api', 'edit'), false));
INSERT INTO public.api_webhook_logs (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'apiWebhookLogs') = 'array' THEN s.state->'apiWebhookLogs' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- reportExports (reports)
CREATE TABLE IF NOT EXISTS public.report_export_records (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_export_records TO authenticated;
GRANT ALL ON public.report_export_records TO service_role;
ALTER TABLE public.report_export_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_export_records_read ON public.report_export_records;
CREATE POLICY report_export_records_read ON public.report_export_records FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'reports', 'view'), false));
DROP POLICY IF EXISTS report_export_records_write ON public.report_export_records;
CREATE POLICY report_export_records_write ON public.report_export_records FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'reports', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'reports', 'edit'), false));
INSERT INTO public.report_export_records (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'reportExports') = 'array' THEN s.state->'reportExports' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- receivableClosures (receivables)
CREATE TABLE IF NOT EXISTS public.receivable_closure_records (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  record_key text NOT NULL,
  sort_position integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (tenant_id, record_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivable_closure_records TO authenticated;
GRANT ALL ON public.receivable_closure_records TO service_role;
ALTER TABLE public.receivable_closure_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receivable_closure_records_read ON public.receivable_closure_records;
CREATE POLICY receivable_closure_records_read ON public.receivable_closure_records FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'receivables', 'view'), false));
DROP POLICY IF EXISTS receivable_closure_records_write ON public.receivable_closure_records;
CREATE POLICY receivable_closure_records_write ON public.receivable_closure_records FOR ALL TO authenticated
  USING (coalesce(private.has_module_access(tenant_id, 'receivables', 'edit'), false))
  WITH CHECK (coalesce(private.has_module_access(tenant_id, 'receivables', 'edit'), false));
INSERT INTO public.receivable_closure_records (tenant_id, record_key, sort_position, metadata)
SELECT s.tenant_id,
  coalesce(t.item->>'id', t.item->>'key', t.item->>'code', 'idx-' || (t.ord - 1)),
  (t.ord - 1)::integer,
  t.item
FROM public.tenant_state_snapshots s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.state->'receivableClosures') = 'array' THEN s.state->'receivableClosures' ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(item, ord)
WHERE jsonb_typeof(t.item) = 'object'
ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- The collection batch writer accepts the new table (body unchanged from 20261126090000 otherwise).
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
      'business_contracts','finance_entries','finance_account_records','finance_credit_records','support_tickets','message_threads',
      'notification_records','notification_send_log','project_records','production_plan_records','knowledge_base_articles','tax_calendar_entries','currency_rate_records','api_webhook_logs','report_export_records','receivable_closure_records']) THEN
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
    IF v_key IN ('supportTickets', 'conversations', 'notifications', 'notificationSendLog', 'projects', 'productionPlans', 'knowledgeBase', 'taxCalendar', 'currencyRates', 'apiWebhookLogs', 'reportExports', 'receivableClosures') THEN
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
