-- Customer 360 documents/service history and operational completion fields.
CREATE TABLE IF NOT EXISTS public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  title text NOT NULL,
  document_type text NOT NULL DEFAULT 'Digər',
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  expires_at date,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_service_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  case_no text NOT NULL,
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','diagnosis','repair','waiting_part','resolved','closed','cancelled')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, case_no)
);

CREATE TABLE IF NOT EXISTS public.credit_collection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id uuid NOT NULL REFERENCES public.credit_contracts(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK(stage IN ('current','reminder','call','warning','soft_collection','hard_collection','legal','restructured','closed')),
  outcome text, next_action_at timestamptz, note text,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS acceptance_name text,
  ADD COLUMN IF NOT EXISTS acceptance_document_no text,
  ADD COLUMN IF NOT EXISTS acceptance_signature text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_note text;
ALTER TABLE public.delivery_items ADD COLUMN IF NOT EXISTS delivered_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(delivered_quantity >= 0 AND delivered_quantity <= quantity);

ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS qty_received numeric(14,3) NOT NULL DEFAULT 0 CHECK(qty_received >= 0);

ALTER TABLE public.credit_adjustments
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS requested_amount numeric(14,2) CHECK (requested_amount IS NULL OR requested_amount > 0),
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_note text;

CREATE INDEX IF NOT EXISTS customer_documents_customer_idx ON public.customer_documents(tenant_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_service_cases_customer_idx ON public.customer_service_cases(tenant_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS credit_collection_events_credit_idx ON public.credit_collection_events(tenant_id,credit_id,created_at DESC);

DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['customer_documents','customer_service_cases','credit_collection_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',item);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',item);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',item||'_tenant',item);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(private.is_tenant_member(tenant_id,auth.uid())) WITH CHECK(private.is_tenant_member(tenant_id,auth.uid()))',item||'_tenant',item);
  END LOOP;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('customer-documents','customer-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS customer_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS customer_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS customer_documents_storage_delete ON storage.objects;
CREATE POLICY customer_documents_storage_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='customer-documents' AND private.is_tenant_member((storage.foldername(name))[1]::uuid,auth.uid()));
CREATE POLICY customer_documents_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='customer-documents' AND private.is_tenant_member((storage.foldername(name))[1]::uuid,auth.uid()));
CREATE POLICY customer_documents_storage_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='customer-documents' AND private.is_tenant_member((storage.foldername(name))[1]::uuid,auth.uid()));

CREATE OR REPLACE VIEW public.inventory_aging_v WITH (security_invoker=true) AS
SELECT l.tenant_id,l.warehouse_id,l.product_id,p.name product_name,p.sku,l.received_at,l.remaining_qty,l.unit_cost,
  (current_date-l.received_at::date) age_days,
  CASE WHEN current_date-l.received_at::date<=30 THEN '0-30' WHEN current_date-l.received_at::date<=90 THEN '31-90' WHEN current_date-l.received_at::date<=180 THEN '91-180' ELSE '180+' END aging_bucket,
  round(l.remaining_qty*l.unit_cost,2) stock_value
FROM public.inventory_cost_layers l JOIN public.products p ON p.id=l.product_id WHERE l.remaining_qty>0;
GRANT SELECT ON public.inventory_aging_v TO authenticated,service_role;

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
  IF NOT private.has_module_access(_tenant,'credits','edit') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _term NOT IN(2,3,4,5,6,12,18,24,36,48) THEN RAISE EXCEPTION 'invalid_term'; END IF;
  SELECT * INTO source FROM public.credit_contracts WHERE tenant_id=_tenant AND id=_credit AND status IN('active','overdue') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_restructurable'; END IF;
  SELECT round(greatest(0,coalesce(sum(principal_due-principal_paid),0)),2) INTO balance FROM public.credit_installments WHERE credit_id=source.id;
  IF balance<=0 THEN RAISE EXCEPTION 'credit_has_no_balance'; END IF;
  INSERT INTO public.credit_contracts(tenant_id,contract_no,customer_id,order_id,principal,initial_payment,required_initial,term_months,start_date,status,daily_penalty_rate,collection_stage,created_by)
  VALUES(_tenant,source.contract_no||'-R'||to_char(clock_timestamp(),'YYMMDDHH24MISS'),source.customer_id,source.order_id,balance,0,0,_term,_start_date,'active',source.daily_penalty_rate,'restructured',auth.uid()) RETURNING id INTO replacement;
  monthly:=round(balance/_term,2); last_amount:=balance-monthly*(_term-1);
  FOR i IN 1.._term LOOP INSERT INTO public.credit_installments(tenant_id,credit_id,installment_no,due_date,principal_due,status)
    VALUES(_tenant,replacement,i,(_start_date+(i||' month')::interval)::date,CASE WHEN i=_term THEN last_amount ELSE monthly END,'pending'); END LOOP;
  UPDATE public.credit_contracts SET status='closed',collection_stage='restructured',closed_at=now(),closed_by=auth.uid(),updated_at=now() WHERE id=source.id;
  INSERT INTO public.credit_restructures(tenant_id,source_credit_id,replacement_credit_id,reason,previous_balance,new_term_months,approved_by,created_by)
    VALUES(_tenant,source.id,replacement,_reason,balance,_term,auth.uid(),auth.uid());
  INSERT INTO public.credit_collection_events(tenant_id,credit_id,stage,outcome,note) VALUES(_tenant,source.id,'restructured','Yeni müqavilə: '||replacement,_reason);
  INSERT INTO public.credit_adjustments(tenant_id,credit_id,adjustment_type,old_value,new_value,reason)
    VALUES(_tenant,source.id,'status',jsonb_build_object('status',source.status,'balance',balance),jsonb_build_object('status','closed','replacement_credit_id',replacement),_reason);
  RETURN replacement;
END $$;
REVOKE ALL ON FUNCTION public.restructure_credit_contract(uuid,uuid,integer,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restructure_credit_contract(uuid,uuid,integer,date,text) TO authenticated,service_role;
