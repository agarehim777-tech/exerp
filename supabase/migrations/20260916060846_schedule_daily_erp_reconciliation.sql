-- Daily reconciliation is detection-only. Repairs remain explicit admin RPCs.

-- Preserve transitional snapshot arrays before removing operational data from
-- the blob. Future writes go directly to tenant_collection_records.
WITH collection_names(name) AS (
  VALUES ('employees'), ('departments'), ('leaveRequests'), ('vacancies'),
         ('contracts'), ('cashEntries'), ('financeAccounts'), ('credits')
), expanded AS (
  SELECT snapshot.tenant_id,
         names.name AS collection,
         element.value AS data,
         element.ordinality - 1 AS position
    FROM public.tenant_state_snapshots snapshot
    CROSS JOIN collection_names names
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(snapshot.state -> names.name) = 'array' THEN snapshot.state -> names.name
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS element(value, ordinality)
)
INSERT INTO public.tenant_collection_records(tenant_id, collection, record_key, position, data)
SELECT tenant_id,
       collection,
       coalesce(nullif(data ->> 'id', ''), nullif(data ->> 'key', ''), nullif(data ->> 'code', ''), 'legacy-' || position::text),
       position,
       data
  FROM expanded
ON CONFLICT (tenant_id, collection, record_key) DO NOTHING;

UPDATE public.tenant_state_snapshots
   SET state = state - ARRAY[
     'customers', 'products', 'orders', 'invoices', 'stock', 'warehouses',
     'vendors', 'accounting', 'warehouseStock', 'expenses', 'cashEntries',
     'financeAccounts', 'credits', 'employees', 'departments', 'leaveRequests',
     'vacancies', 'contracts'
   ]::text[];

CREATE OR REPLACE FUNCTION private.capture_daily_erp_reconciliation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tenant_row record;
  issues jsonb;
  inserted_count integer := 0;
BEGIN
  FOR tenant_row IN SELECT id FROM public.tenants LOOP
    SELECT coalesce(jsonb_agg(issue ORDER BY issue->>'order_no', issue->>'type'), '[]'::jsonb)
      INTO issues
      FROM (
        SELECT jsonb_build_object('type','active_credit_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(c.id)) issue
          FROM public.orders o JOIN public.credit_contracts c ON c.order_id=o.id AND c.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND c.status::text NOT IN ('cancelled','closed') GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','active_reservation_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(r.id))
          FROM public.orders o JOIN public.stock_reservations r ON r.order_id=o.id AND r.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND r.status::text='active' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','active_delivery_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(d.id))
          FROM public.orders o JOIN public.deliveries d ON d.order_id=o.id AND d.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND d.status::text<>'cancelled' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','active_invoice_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(i.id))
          FROM public.orders o JOIN public.sales_invoices i ON i.order_id=o.id AND i.tenant_id=o.tenant_id
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' AND i.status::text<>'cancelled' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','unreversed_cash_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(tx.id))
          FROM public.orders o JOIN public.cash_transactions tx ON tx.tenant_id=o.tenant_id
           AND tx.direction::text='in' AND tx.reversal_of IS NULL
           AND (tx.reference_id=o.id OR tx.reference=o.order_no OR tx.description ILIKE '%'||o.order_no||'%')
           AND NOT EXISTS (SELECT 1 FROM public.cash_transactions reversal WHERE reversal.reversal_of=tx.id)
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled' GROUP BY o.id,o.order_no
        UNION ALL
        SELECT jsonb_build_object('type','missing_accounting_reversal','order_id',o.id,'order_no',o.order_no,'count',1)
          FROM public.orders o
         WHERE o.tenant_id=tenant_row.id AND o.status::text='cancelled'
           AND EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery')
           AND NOT EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='cancellation')
      ) detected;

    INSERT INTO public.erp_reconciliation_reports(tenant_id, critical_count, report, created_by)
    VALUES (tenant_row.id, jsonb_array_length(issues), issues, NULL);
    inserted_count := inserted_count + 1;
  END LOOP;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_daily_erp_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.capture_daily_erp_reconciliation() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'daily-erp-reconciliation';
  PERFORM cron.schedule(
    'daily-erp-reconciliation',
    '15 2 * * *',
    'SELECT private.capture_daily_erp_reconciliation()'
  );
EXCEPTION WHEN undefined_table OR invalid_schema_name OR insufficient_privilege THEN
  RAISE NOTICE 'pg_cron is unavailable; daily ERP reconciliation was not scheduled';
END;
$$;
