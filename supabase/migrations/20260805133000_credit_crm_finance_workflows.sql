ALTER TABLE public.credit_contracts
  ADD COLUMN IF NOT EXISTS daily_penalty_rate NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (daily_penalty_rate >= 0),
  ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS collection_stage TEXT NOT NULL DEFAULT 'current'
    CHECK (collection_stage IN ('current','reminder','soft_collection','hard_collection','legal','restructured','closed')),
  ADD COLUMN IF NOT EXISTS last_risk_calculated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.credit_restructures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE RESTRICT,
  replacement_credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  previous_balance NUMERIC(14,2) NOT NULL CHECK (previous_balance >= 0),
  new_term_months INTEGER NOT NULL CHECK (new_term_months IN (2,3,4,5,6,12,18,24,36,48)),
  approved_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_credit_id, replacement_credit_id)
);

CREATE TABLE IF NOT EXISTS public.credit_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE RESTRICT,
  installment_id UUID REFERENCES public.credit_installments(id) ON DELETE RESTRICT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('due_date','penalty','principal','waiver','status','collection')),
  old_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT NOT NULL, parent_id UUID REFERENCES public.finance_cost_centers(id),
  manager_id UUID REFERENCES auth.users(id), is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.finance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cost_center_id UUID NOT NULL REFERENCES public.finance_cost_centers(id) ON DELETE RESTRICT,
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200), period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  category TEXT NOT NULL, planned_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  actual_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (actual_amount >= 0), currency TEXT NOT NULL DEFAULT 'AZN',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','locked')),
  approved_by UUID REFERENCES auth.users(id), approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cost_center_id, fiscal_year, period_month, category)
);

CREATE TABLE IF NOT EXISTS public.reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reconciliation_id UUID NOT NULL REFERENCES public.financial_reconciliations(id) ON DELETE CASCADE,
  ledger_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE RESTRICT,
  statement_reference TEXT, statement_date DATE, statement_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','difference','ignored')),
  note TEXT, matched_by UUID REFERENCES auth.users(id), matched_at TIMESTAMPTZ
);

DO $$ DECLARE item RECORD; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('credit_restructures','credits'),('credit_adjustments','credits'),
    ('finance_cost_centers','finance'),('finance_budgets','finance'),('reconciliation_lines','finance')
  ) AS x(table_name, module_name) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', item.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', item.table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_tenant_member(tenant_id, auth.uid()))', item.table_name || '_tenant_select', item.table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.has_module_access(tenant_id, %L, ''edit'')) WITH CHECK (private.has_module_access(tenant_id, %L, ''edit''))', item.table_name || '_tenant_write', item.table_name, item.module_name, item.module_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_credit_overdue(_tenant_id UUID, _as_of DATE DEFAULT current_date)
RETURNS TABLE(updated_installments INTEGER, overdue_contracts INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE installment_count INTEGER := 0; contract_count INTEGER := 0;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.credit_installments i
  SET penalty_due = GREATEST(i.penalty_due,
        ROUND(GREATEST(0, _as_of - i.due_date) * GREATEST(0, i.principal_due - i.principal_paid) * c.daily_penalty_rate, 2)),
      status = CASE WHEN i.principal_paid >= i.principal_due AND i.penalty_paid >= i.penalty_due THEN 'paid'
                    WHEN i.due_date < _as_of THEN 'overdue' ELSE i.status END,
      updated_at = now()
  FROM public.credit_contracts c
  WHERE i.credit_id = c.id AND i.tenant_id = _tenant_id AND c.tenant_id = _tenant_id
    AND c.status IN ('active','overdue') AND i.status NOT IN ('paid','waived');
  GET DIAGNOSTICS installment_count = ROW_COUNT;

  WITH risk AS (
    SELECT c.id, COALESCE(MAX(GREATEST(0, _as_of - i.due_date)) FILTER (WHERE i.status = 'overdue'), 0) AS days_late
    FROM public.credit_contracts c LEFT JOIN public.credit_installments i ON i.credit_id = c.id
    WHERE c.tenant_id = _tenant_id AND c.status IN ('active','overdue') GROUP BY c.id
  )
  UPDATE public.credit_contracts c SET
    status = CASE WHEN risk.days_late > 0 THEN 'overdue' ELSE 'active' END,
    risk_score = LEAST(100, risk.days_late * 2),
    collection_stage = CASE WHEN risk.days_late = 0 THEN 'current' WHEN risk.days_late <= 7 THEN 'reminder'
      WHEN risk.days_late <= 30 THEN 'soft_collection' WHEN risk.days_late <= 90 THEN 'hard_collection' ELSE 'legal' END,
    last_risk_calculated_at = now(), updated_at = now()
  FROM risk WHERE c.id = risk.id;
  GET DIAGNOSTICS contract_count = ROW_COUNT;
  RETURN QUERY SELECT installment_count, contract_count;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_360_snapshot(_tenant_id UUID, _customer_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object(
    'customer', to_jsonb(c),
    'orders', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC) FROM public.orders o WHERE o.tenant_id=_tenant_id AND o.customer_id=_customer_id), '[]'::jsonb),
    'credits', COALESCE((SELECT jsonb_agg(to_jsonb(cc) ORDER BY cc.created_at DESC) FROM public.credit_contracts cc WHERE cc.tenant_id=_tenant_id AND cc.customer_id=_customer_id), '[]'::jsonb),
    'timeline', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC) FROM public.entity_timeline t WHERE t.tenant_id=_tenant_id AND t.entity_type='customer' AND t.entity_id=_customer_id), '[]'::jsonb)
  ) FROM public.customers c WHERE c.tenant_id=_tenant_id AND c.id=_customer_id
    AND private.is_tenant_member(_tenant_id, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.refresh_credit_overdue(UUID,DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_360_snapshot(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_credit_overdue(UUID,DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_360_snapshot(UUID,UUID) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS credit_collection_idx ON public.credit_contracts(tenant_id, collection_stage, risk_score DESC);
CREATE INDEX IF NOT EXISTS credit_adjustments_idx ON public.credit_adjustments(tenant_id, credit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_budget_period_idx ON public.finance_budgets(tenant_id, fiscal_year, period_month, status);
CREATE INDEX IF NOT EXISTS reconciliation_lines_idx ON public.reconciliation_lines(tenant_id, reconciliation_id, status);

