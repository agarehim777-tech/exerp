REVOKE EXECUTE ON FUNCTION public.reverse_vendor_invoice_payment(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_procurement_receipt(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_vendor_invoice_payment(uuid,text), public.reverse_procurement_receipt(uuid,text) TO authenticated, service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND p.prorettype='trigger'::regtype LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.backfill_sales_bonus_for_order(_order_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted_count integer:=0; tid uuid;
BEGIN
 SELECT tenant_id INTO tid FROM public.orders WHERE id=_order_id;
 IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(tid,'sales','edit'),false) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
 INSERT INTO public.sales_bonus_entries(tenant_id,order_id,assignment_id,cash_transaction_id,seller_name,rate,payment_amount,bonus_amount,accrued_on,created_by)
 SELECT o.tenant_id,o.id,a.id,ct.id,a.seller_name,a.rate,ct.amount,round(ct.amount*a.rate/100,2),ct.occurred_at::date,auth.uid()
 FROM public.orders o JOIN public.cash_transactions ct ON ct.tenant_id=o.tenant_id AND ct.reference=o.order_no AND ct.direction='in' AND ct.category IN ('sales_payment','credit_payment','receivable_payment')
 JOIN public.order_bonus_assignments a ON a.tenant_id=o.tenant_id AND a.order_id=o.id AND a.effective_from<=ct.occurred_at::date AND (a.effective_to IS NULL OR a.effective_to>=ct.occurred_at::date)
 WHERE o.id=_order_id AND o.tenant_id=tid ON CONFLICT(cash_transaction_id,assignment_id) DO NOTHING;
 GET DIAGNOSTICS inserted_count=ROW_COUNT; RETURN inserted_count;
END $$;
REVOKE EXECUTE ON FUNCTION public.backfill_sales_bonus_for_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.backfill_sales_bonus_for_order(uuid) TO authenticated;