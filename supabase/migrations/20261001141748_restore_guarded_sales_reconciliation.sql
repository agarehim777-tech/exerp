CREATE TABLE IF NOT EXISTS public.erp_reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  critical_count integer NOT NULL DEFAULT 0 CHECK (critical_count >= 0),
  report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.erp_reconciliation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_reconciliation_reports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.erp_reconciliation_reports TO authenticated;
GRANT ALL ON public.erp_reconciliation_reports TO service_role;
DROP POLICY IF EXISTS erp_reconciliation_reports_read ON public.erp_reconciliation_reports;
CREATE POLICY erp_reconciliation_reports_read ON public.erp_reconciliation_reports FOR SELECT TO authenticated
  USING (private.is_tenant_member(tenant_id,(SELECT auth.uid())));
CREATE INDEX IF NOT EXISTS erp_reconciliation_reports_tenant_created_idx
  ON public.erp_reconciliation_reports(tenant_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.scan_erp_integrity(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE issues jsonb; report_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.is_tenant_member(_tenant_id,auth.uid()),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'sales','view'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(issue ORDER BY issue->>'order_no',issue->>'type'),'[]'::jsonb) INTO issues
  FROM (
    SELECT jsonb_build_object('type','active_credit_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(c.id)) issue
    FROM public.orders o JOIN public.credit_contracts c ON c.tenant_id=o.tenant_id AND c.order_id=o.id
    WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND c.status::text NOT IN ('cancelled','closed') GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','active_reservation_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(r.id))
    FROM public.orders o JOIN public.stock_reservations r ON r.tenant_id=o.tenant_id AND r.order_id=o.id
    WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND r.status::text='active' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','active_delivery_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(d.id))
    FROM public.orders o JOIN public.deliveries d ON d.tenant_id=o.tenant_id AND d.order_id=o.id
    WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND d.status::text<>'cancelled' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','active_invoice_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(i.id))
    FROM public.orders o JOIN public.sales_invoices i ON i.tenant_id=o.tenant_id AND i.order_id=o.id
    WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND i.status::text<>'cancelled' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','unreversed_cash_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(tx.id))
    FROM public.orders o JOIN public.cash_transactions tx ON tx.tenant_id=o.tenant_id AND tx.direction::text='in' AND tx.reversal_of IS NULL
      AND (tx.reference_id=o.id OR (tx.reference_id IS NULL AND tx.reference=o.order_no)
        OR EXISTS (SELECT 1 FROM public.credit_contracts c WHERE c.tenant_id=o.tenant_id AND c.order_id=o.id AND c.id=tx.reference_id)
        OR EXISTS (SELECT 1 FROM public.credit_payments p JOIN public.credit_contracts c ON c.id=p.credit_id AND c.tenant_id=p.tenant_id
          WHERE c.tenant_id=o.tenant_id AND c.order_id=o.id AND p.id=tx.reference_id))
      AND NOT EXISTS (SELECT 1 FROM public.cash_transactions r WHERE r.tenant_id=o.tenant_id AND r.reversal_of=tx.id)
    WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','missing_accounting_reversal','order_id',o.id,'order_no',o.order_no,'count',1)
    FROM public.orders o WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled'
      AND EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.tenant_id=o.tenant_id AND e.order_id=o.id AND e.event_type='delivery')
      AND NOT EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.tenant_id=o.tenant_id AND e.order_id=o.id AND e.event_type='cancellation')
  ) detected;
  INSERT INTO public.erp_reconciliation_reports(tenant_id,critical_count,report,created_by)
    VALUES(_tenant_id,jsonb_array_length(issues),issues,auth.uid()) RETURNING id INTO report_id;
  RETURN jsonb_build_object('report_id',report_id,'critical_count',jsonb_array_length(issues),'issues',issues,'repair_applied',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_erp_integrity_issue(_tenant_id uuid,_order_id uuid,_reason text,_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'sales','edit'),false)
    OR NOT coalesce(public.is_tenant_admin(_tenant_id,auth.uid()),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_reason),'') IS NULL THEN RAISE EXCEPTION 'repair_reason_required'; END IF;
  PERFORM id FROM public.orders WHERE tenant_id=_tenant_id AND id=_order_id AND status::text='cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'repair_requires_cancelled_order'; END IF;
  RETURN private.reverse_sales_order_v3_impl(_tenant_id,_order_id,'Approved reconciliation: ' || _reason,_request_key);
END;
$$;
REVOKE ALL ON FUNCTION public.scan_erp_integrity(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.repair_erp_integrity_issue(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.scan_erp_integrity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_erp_integrity_issue(uuid,uuid,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
