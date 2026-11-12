-- Filter journal lines before aggregation; a LEFT JOIN condition alone does not exclude them.
CREATE OR REPLACE FUNCTION public.trial_balance(_tenant uuid, _from date, _to date)
RETURNS TABLE(account_id uuid, code text, name text, type public.account_type, debit numeric, credit numeric, balance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id, a.code, a.name, a.type,
    coalesce(sum(l.debit),0), coalesce(sum(l.credit),0), coalesce(sum(l.debit-l.credit),0)
  FROM public.chart_of_accounts a
  LEFT JOIN (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries e ON e.id = jl.entry_id
    WHERE e.tenant_id = _tenant AND e.posted = true AND e.entry_date BETWEEN _from AND _to
  ) l ON l.account_id = a.id
  WHERE a.tenant_id = _tenant AND public.is_tenant_member(_tenant, auth.uid())
  GROUP BY a.id, a.code, a.name, a.type ORDER BY a.code;
$$;
REVOKE ALL ON FUNCTION public.trial_balance(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trial_balance(uuid,date,date) TO authenticated;

-- Invoker security preserves each dedicated table's RLS and column privileges.
-- All changes either commit together or roll back; retries upsert/delete the same keys.
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
      'business_contracts','finance_entries','finance_account_records','finance_credit_records']) THEN
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
NOTIFY pgrst, 'reload schema';
