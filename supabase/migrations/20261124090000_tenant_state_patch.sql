-- Tenant state snapshot: save changed keys only, each checked against its own module permission.
--
-- About 20 non-operational collections (support tickets, conversations, notifications, KPI targets,
-- tax calendar, API webhooks, projects, production plans, ...) live in the one JSON row per tenant in
-- tenant_state_snapshots. The client upserted the WHOLE row, and the write policies require
-- has_module_access(tenant, 'settings', 'edit'). Two problems followed:
--   1. A user without settings edit (the default 'member' role edits messages, notifications, projects,
--      production, hr, ...) could not save anything there: a ticket or message they created was
--      rejected by RLS and gone after a reload.
--   2. Last write wins for the whole tenant: two users working in different modules overwrote each
--      other's changes.
-- save_tenant_state_patch merges only the top-level keys the client changed. Each key maps to the module
-- whose edit permission it needs (unknown keys need settings edit); denied keys are skipped and
-- returned, the allowed ones are saved. Operational collections that have their own tables are refused.
-- The direct table policies stay as they were (settings editors only).

CREATE OR REPLACE FUNCTION private.tenant_state_key_module(_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN _key IN ('kpiTargets', 'kpiPeriods', 'kpiPayouts') THEN 'kpi'
    WHEN _key IN ('notifications', 'notificationRules', 'notificationProviders', 'notificationSendLog',
                  'notificationDispatchSnapshot', 'notificationSweepAt') THEN 'notifications'
    WHEN _key = 'conversations' THEN 'messages'
    WHEN _key IN ('projects', 'projectRoiSnapshot') THEN 'projects'
    WHEN _key = 'productionPlans' THEN 'production'
    WHEN _key = 'supportTickets' THEN 'support'
    WHEN _key IN ('knowledgeBase', 'helpGuideSnapshot') THEN 'help'
    WHEN _key = 'onboarding' THEN 'onboarding'
    WHEN _key = 'taxCalendar' THEN 'tax'
    WHEN _key IN ('currencyRates', 'accountingClose') THEN 'accounting'
    WHEN _key IN ('apiWebhooks', 'apiSecrets', 'apiWebhookLogs', 'apiIntegrationSnapshot') THEN 'api'
    WHEN _key = 'purchaseOrders' THEN 'procurement'
    WHEN _key = 'reportExports' THEN 'reports'
    WHEN _key IN ('receivableClosures', 'receivableSync') THEN 'receivables'
    WHEN _key = 'invoiceSettings' THEN 'invoices'
    -- Client-side copy of audit entries (the authoritative trail is audit_events): every module
    -- action appends to it, so any tenant member may save it.
    WHEN _key = 'auditLog' THEN '*'
    ELSE 'settings'
  END
$$;

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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR NOT COALESCE(_tenant_id IN (SELECT private.member_tenant_ids()), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'tenant_state_patch_invalid'; END IF;

  FOR v_key IN SELECT jsonb_object_keys(_patch) LOOP
    -- Operational collections are loaded from their own tables and must never enter the snapshot.
    IF v_key IN ('customers', 'products', 'orders', 'invoices', 'stock', 'warehouses', 'vendors', 'accounting',
                 'warehouseStock', 'expenses', 'cashEntries', 'financeAccounts', 'credits', 'employees',
                 'departments', 'leaveRequests', 'vacancies', 'contracts') THEN
      RAISE EXCEPTION 'tenant_state_key_not_allowed: %', v_key;
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
    -- One statement: the row lock serializes concurrent patches, and each keeps the other's keys.
    INSERT INTO public.tenant_state_snapshots AS s (tenant_id, state, schema_version, updated_by, updated_at)
    VALUES (_tenant_id, v_allowed, COALESCE(_schema_version, 2), auth.uid(), now())
    ON CONFLICT (tenant_id) DO UPDATE
      SET state = COALESCE(s.state, '{}'::jsonb) || EXCLUDED.state,
          schema_version = COALESCE(_schema_version, s.schema_version),
          updated_by = EXCLUDED.updated_by,
          updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN jsonb_build_object('saved', to_jsonb(v_saved), 'denied', to_jsonb(v_denied));
END;
$$;

REVOKE ALL ON FUNCTION public.save_tenant_state_patch(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_state_patch(uuid, jsonb, integer) TO authenticated;
REVOKE ALL ON FUNCTION private.tenant_state_key_module(text) FROM PUBLIC, anon;
