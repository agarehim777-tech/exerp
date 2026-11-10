CREATE TABLE IF NOT EXISTS public.credit_collection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id uuid NOT NULL REFERENCES public.credit_contracts(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK(stage IN ('current','reminder','call','warning','soft_collection','hard_collection','legal','restructured','closed')),
  outcome text, next_action_at timestamptz, note text,
  created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_collection_events_credit_idx ON public.credit_collection_events(tenant_id,credit_id,created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_collection_events TO authenticated;
GRANT ALL ON public.credit_collection_events TO service_role;
ALTER TABLE public.credit_collection_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_collection_events_tenant ON public.credit_collection_events;
CREATE POLICY credit_collection_events_tenant ON public.credit_collection_events FOR ALL TO authenticated
  USING (private.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (private.is_tenant_member(tenant_id, auth.uid()));

ALTER TABLE public.credit_adjustments
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS requested_amount numeric(14,2) CHECK (requested_amount IS NULL OR requested_amount > 0),
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_note text;

CREATE OR REPLACE FUNCTION public.decide_credit_adjustment(_tenant uuid,_adjustment uuid,_decision text,_note text DEFAULT NULL)
RETURNS public.credit_adjustments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result public.credit_adjustments%rowtype;
BEGIN
  IF NOT private.has_module_access(_tenant,'credits','edit') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_decision'; END IF;
  UPDATE public.credit_adjustments SET approval_status=_decision,decided_by=auth.uid(),decided_at=now(),decision_note=nullif(trim(_note),'')
  WHERE tenant_id=_tenant AND id=_adjustment AND approval_status='pending' RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'adjustment_not_pending'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.decide_credit_adjustment(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_credit_adjustment(uuid,uuid,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.restructure_credit_contract(_tenant uuid,_credit uuid,_term integer,_start_date date,_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE source public.credit_contracts%rowtype; replacement uuid; balance numeric(14,2); monthly numeric(14,2); last_amount numeric(14,2); i integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant,'credits','edit') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _term NOT IN(2,3,4,5,6,12,18,24,36,48) THEN RAISE EXCEPTION 'invalid_term'; END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'invalid_start_date'; END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO source FROM public.credit_contracts WHERE tenant_id=_tenant AND id=_credit AND status IN('active','overdue') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_restructurable'; END IF;
  SELECT round(greatest(0,coalesce(sum(principal_due-principal_paid),0)),2) INTO balance FROM public.credit_installments WHERE credit_id=source.id AND status<>'waived';
  IF balance<=0 THEN RAISE EXCEPTION 'credit_has_no_balance'; END IF;
  INSERT INTO public.credit_contracts(tenant_id,contract_no,customer_id,order_id,principal,initial_payment,required_initial,term_months,start_date,status,daily_penalty_rate,collection_stage,created_by)
  VALUES(_tenant,source.contract_no||'-R'||to_char(clock_timestamp(),'YYMMDDHH24MISS'),source.customer_id,source.order_id,balance,0,0,_term,_start_date,'active',source.daily_penalty_rate,'restructured',auth.uid()) RETURNING id INTO replacement;
  monthly:=round(balance/_term,2); last_amount:=balance-monthly*(_term-1);
  FOR i IN 1.._term LOOP INSERT INTO public.credit_installments(tenant_id,credit_id,installment_no,due_date,principal_due,status)
    VALUES(_tenant,replacement,i,(_start_date+(i||' month')::interval)::date,CASE WHEN i=_term THEN last_amount ELSE monthly END,'pending'); END LOOP;
  UPDATE public.credit_installments SET status='waived',updated_at=now() WHERE credit_id=source.id AND status IN ('pending','partial','overdue');
  UPDATE public.credit_contracts SET status='closed',collection_stage='restructured',closed_at=now(),closed_by=auth.uid(),updated_at=now() WHERE id=source.id;
  INSERT INTO public.credit_restructures(tenant_id,source_credit_id,replacement_credit_id,reason,previous_balance,new_term_months,approved_by,created_by)
    VALUES(_tenant,source.id,replacement,_reason,balance,_term,auth.uid(),auth.uid());
  INSERT INTO public.credit_collection_events(tenant_id,credit_id,stage,outcome,note,created_by) VALUES(_tenant,source.id,'restructured','Yeni müqavilə: '||replacement,_reason,auth.uid());
  INSERT INTO public.credit_adjustments(tenant_id,credit_id,adjustment_type,old_value,new_value,reason,created_by)
    VALUES(_tenant,source.id,'status',jsonb_build_object('status',source.status,'balance',balance),jsonb_build_object('status','closed','replacement_credit_id',replacement),_reason,auth.uid());
  RETURN replacement;
END $$;
REVOKE ALL ON FUNCTION public.restructure_credit_contract(uuid,uuid,integer,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restructure_credit_contract(uuid,uuid,integer,date,text) TO authenticated,service_role;