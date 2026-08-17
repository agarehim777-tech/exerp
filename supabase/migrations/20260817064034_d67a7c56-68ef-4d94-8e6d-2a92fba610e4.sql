-- Effective-dated seller bonus assignments and immutable payment accruals.
CREATE TABLE IF NOT EXISTS public.order_bonus_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_name text NOT NULL CHECK (btrim(seller_name) <> ''),
  rate numeric(7,4) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  effective_from date NOT NULL,
  effective_to date,
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS public.sales_bonus_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  assignment_id uuid REFERENCES public.order_bonus_assignments(id) ON DELETE SET NULL,
  cash_transaction_id uuid NOT NULL REFERENCES public.cash_transactions(id) ON DELETE RESTRICT,
  seller_name text NOT NULL,
  rate numeric(7,4) NOT NULL,
  payment_amount numeric(14,2) NOT NULL CHECK (payment_amount >= 0),
  bonus_amount numeric(14,2) NOT NULL CHECK (bonus_amount >= 0),
  accrued_on date NOT NULL,
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','approved','paid','reversed')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  UNIQUE (cash_transaction_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS order_bonus_assignments_period_idx
  ON public.order_bonus_assignments(tenant_id, order_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS sales_bonus_entries_seller_idx
  ON public.sales_bonus_entries(tenant_id, seller_name, accrued_on);

ALTER TABLE public.order_bonus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_bonus_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_bonus_assignments_tenant ON public.order_bonus_assignments;
CREATE POLICY order_bonus_assignments_tenant ON public.order_bonus_assignments FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
DROP POLICY IF EXISTS sales_bonus_entries_tenant ON public.sales_bonus_entries;
CREATE POLICY sales_bonus_entries_tenant ON public.sales_bonus_entries FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.set_order_bonus_assignments(
  _order_id uuid,
  _effective_from date,
  _allocations jsonb,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE
  o public.orders%rowtype;
  item jsonb;
  total_rate numeric := 0;
  seller text;
  seller_rate numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF o.id IS NULL OR NOT private.has_module_access(o.tenant_id,'sales','edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _effective_from IS NULL OR jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations)=0 THEN
    RAISE EXCEPTION 'Ən azı bir satıcı və başlanğıc tarixi daxil edilməlidir';
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    seller := btrim(item->>'seller_name');
    seller_rate := COALESCE((item->>'rate')::numeric,0);
    IF seller='' OR seller_rate<=0 OR seller_rate>100 THEN RAISE EXCEPTION 'Satıcı və bonus faizi düzgün deyil'; END IF;
    total_rate := total_rate + seller_rate;
  END LOOP;
  IF total_rate>100 THEN RAISE EXCEPTION 'Ümumi bonus faizi 100%%-dən çox ola bilməz'; END IF;

  UPDATE public.order_bonus_assignments
     SET effective_to=_effective_from-1
   WHERE tenant_id=o.tenant_id AND order_id=o.id
     AND effective_from<_effective_from
     AND (effective_to IS NULL OR effective_to>=_effective_from);
  DELETE FROM public.order_bonus_assignments
   WHERE tenant_id=o.tenant_id AND order_id=o.id AND effective_from>=_effective_from
     AND NOT EXISTS (SELECT 1 FROM public.sales_bonus_entries e WHERE e.assignment_id=order_bonus_assignments.id);

  FOR item IN SELECT * FROM jsonb_array_elements(_allocations) LOOP
    INSERT INTO public.order_bonus_assignments(tenant_id,order_id,seller_name,rate,effective_from,reason)
    VALUES(o.tenant_id,o.id,btrim(item->>'seller_name'),(item->>'rate')::numeric,_effective_from,NULLIF(btrim(_reason),''));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.accrue_sales_bonus_for_cash_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%rowtype; assignment record;
BEGIN
  IF NEW.direction<>'in' OR NEW.category<>'sales_payment' THEN RETURN NEW; END IF;
  SELECT * INTO o FROM public.orders
   WHERE tenant_id=NEW.tenant_id AND order_no=NEW.reference
   ORDER BY created_at DESC LIMIT 1;
  IF o.id IS NULL THEN RETURN NEW; END IF;
  FOR assignment IN
    SELECT * FROM public.order_bonus_assignments
     WHERE tenant_id=NEW.tenant_id AND order_id=o.id
       AND effective_from<=NEW.occurred_at::date
       AND (effective_to IS NULL OR effective_to>=NEW.occurred_at::date)
  LOOP
    INSERT INTO public.sales_bonus_entries(
      tenant_id,order_id,assignment_id,cash_transaction_id,seller_name,rate,
      payment_amount,bonus_amount,accrued_on,created_by
    ) VALUES(
      NEW.tenant_id,o.id,assignment.id,NEW.id,assignment.seller_name,assignment.rate,
      NEW.amount,round(NEW.amount*assignment.rate/100,2),NEW.occurred_at::date,auth.uid()
    ) ON CONFLICT (cash_transaction_id,assignment_id) DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_accrue_sales_bonus ON public.cash_transactions;
CREATE TRIGGER trg_accrue_sales_bonus AFTER INSERT ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION public.accrue_sales_bonus_for_cash_transaction();

REVOKE ALL ON FUNCTION public.set_order_bonus_assignments(uuid,date,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_order_bonus_assignments(uuid,date,jsonb,text) TO authenticated,service_role;
GRANT SELECT ON public.order_bonus_assignments,public.sales_bonus_entries TO authenticated;
GRANT ALL ON public.order_bonus_assignments,public.sales_bonus_entries TO service_role;