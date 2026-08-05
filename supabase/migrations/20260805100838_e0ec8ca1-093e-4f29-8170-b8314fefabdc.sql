-- 1. Append-only audit journal
CREATE TABLE IF NOT EXISTS public.audit_events (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_role TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'Tamamlandı',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
DROP POLICY IF EXISTS audit_events_read ON public.audit_events;
CREATE POLICY audit_events_read ON public.audit_events FOR SELECT TO authenticated
  USING (private.is_tenant_member(tenant_id, auth.uid()));
DROP POLICY IF EXISTS audit_events_append ON public.audit_events;
CREATE POLICY audit_events_append ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (private.is_tenant_member(tenant_id, auth.uid()) AND actor_id = auth.uid());
CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'audit_events is append-only'; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS audit_events_append_only ON public.audit_events;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_event_mutation();
CREATE INDEX IF NOT EXISTS audit_events_tenant_time_idx ON public.audit_events(tenant_id, occurred_at DESC);

-- 2. Customer FIN code used by the credit registry
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS fin TEXT;

-- 3. Credit portfolio
CREATE TABLE IF NOT EXISTS public.credit_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_no TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  principal NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  initial_payment NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (initial_payment >= 0),
  term_months INTEGER NOT NULL CHECK (term_months IN (2,3,4,5,6,12,18,24,36,48)),
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','overdue','closed','cancelled')),
  daily_penalty_rate NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (daily_penalty_rate >= 0),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  collection_stage TEXT NOT NULL DEFAULT 'current'
    CHECK (collection_stage IN ('current','reminder','soft_collection','hard_collection','legal','restructured','closed')),
  last_risk_calculated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contract_no),
  CHECK (initial_payment <= principal)
);

CREATE TABLE IF NOT EXISTS public.credit_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL CHECK (installment_no > 0),
  due_date DATE NOT NULL,
  principal_due NUMERIC(14,2) NOT NULL CHECK (principal_due >= 0),
  principal_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_paid >= 0),
  penalty_due NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_due >= 0),
  penalty_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_paid >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid','overdue','waived')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (credit_id, installment_no),
  CHECK (principal_paid <= principal_due),
  CHECK (penalty_paid <= penalty_due)
);

CREATE TABLE IF NOT EXISTS public.credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE RESTRICT,
  receipt_no TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  penalty_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
  unallocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, receipt_no),
  CHECK (amount = principal_amount + penalty_amount + unallocated_amount)
);

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

-- 4. Shared workflow infrastructure
CREATE TABLE IF NOT EXISTS public.workflow_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('procurement','warehouse','credits','crm','finance','hr','production','communications','reports','platform')),
  record_type TEXT NOT NULL, record_no TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', title TEXT NOT NULL,
  party_type TEXT, party_id UUID, parent_type TEXT, parent_id UUID, owner_id UUID REFERENCES auth.users(id),
  amount NUMERIC(16,2) NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'AZN', due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id), updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module, record_type, record_no)
);

CREATE TABLE IF NOT EXISTS public.workflow_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflow_records(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL CHECK (line_no > 0),
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT, description TEXT NOT NULL,
  quantity NUMERIC(16,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit_price NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.workflow_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflow_records(id) ON DELETE CASCADE,
  step_no INTEGER NOT NULL CHECK (step_no > 0),
  role_code TEXT, approver_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
  comment TEXT, decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_no)
);

-- 5. Inventory units (serial / IMEI / batch / location)
CREATE TABLE IF NOT EXISTS public.inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  serial_no TEXT, imei TEXT, batch_no TEXT, expiry_date DATE, location_code TEXT, rack_code TEXT, bin_code TEXT,
  quantity NUMERIC(16,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit_cost NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','quarantine','issued','sold','written_off')),
  source_type TEXT, source_id UUID, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_serial_uq ON public.inventory_units(tenant_id, serial_no) WHERE serial_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_imei_uq ON public.inventory_units(tenant_id, imei) WHERE imei IS NOT NULL;

-- 6. Timeline, notifications, finance, HR, platform limits
CREATE TABLE IF NOT EXISTS public.entity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id UUID NOT NULL, event_type TEXT NOT NULL, title TEXT NOT NULL,
  detail TEXT, channel TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT, entity_id UUID, recipient TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','email','sms','push')),
  provider TEXT, template_code TEXT, subject TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','delivered','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id TEXT, last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  statement_balance NUMERIC(16,2) NOT NULL DEFAULT 0, ledger_balance NUMERIC(16,2) NOT NULL DEFAULT 0,
  difference NUMERIC(16,2) GENERATED ALWAYS AS (statement_balance - ledger_balance) STORED,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','reconciled','reopened')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID REFERENCES auth.users(id), approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reconciliation_id UUID NOT NULL REFERENCES public.financial_reconciliations(id) ON DELETE CASCADE,
  ledger_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE RESTRICT,
  statement_reference TEXT, statement_date DATE, statement_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','difference','ignored')),
  note TEXT, matched_by UUID REFERENCES auth.users(id), matched_at TIMESTAMPTZ,
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
  fiscal_year INTEGER NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  category TEXT NOT NULL,
  planned_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (planned_amount >= 0),
  actual_amount NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (actual_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'AZN',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','locked')),
  approved_by UUID REFERENCES auth.users(id), approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, cost_center_id, fiscal_year, period_month, category)
);

CREATE TABLE IF NOT EXISTS public.employee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('leave','attendance','contract','document','payroll','performance')),
  status TEXT NOT NULL DEFAULT 'draft', start_date DATE, end_date DATE,
  amount NUMERIC(16,2) NOT NULL DEFAULT 0, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID REFERENCES auth.users(id), approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.tenant_limits (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_users INTEGER NOT NULL DEFAULT 10 CHECK (max_users > 0),
  max_warehouses INTEGER NOT NULL DEFAULT 3 CHECK (max_warehouses > 0),
  max_storage_mb INTEGER NOT NULL DEFAULT 1024 CHECK (max_storage_mb > 0),
  enabled_modules TEXT[] NOT NULL DEFAULT ARRAY['crm','sales','warehouse','finance'],
  security_policy JSONB NOT NULL DEFAULT '{"mfa_required":false,"session_hours":12}'::jsonb,
  updated_by UUID REFERENCES auth.users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Grants + RLS for every new table
DO $$ DECLARE item RECORD; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('credit_contracts','credits'),('credit_installments','credits'),('credit_payments','credits'),
    ('credit_restructures','credits'),('credit_adjustments','credits'),
    ('workflow_records','settings'),('workflow_lines','settings'),('workflow_approvals','settings'),
    ('inventory_units','warehouse'),('entity_timeline','crm'),('notification_deliveries','notifications'),
    ('financial_reconciliations','finance'),('reconciliation_lines','finance'),
    ('finance_cost_centers','finance'),('finance_budgets','finance'),
    ('employee_events','hr'),('tenant_limits','settings')
  ) AS x(table_name, module_name) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', item.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.table_name || '_tenant_select', item.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', item.table_name || '_tenant_write', item.table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.is_tenant_member(tenant_id, auth.uid()))', item.table_name || '_tenant_select', item.table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.has_module_access(tenant_id, %L, ''edit'')) WITH CHECK (private.has_module_access(tenant_id, %L, ''edit''))', item.table_name || '_tenant_write', item.table_name, item.module_name, item.module_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS workflow_records_tenant_write ON public.workflow_records;
CREATE POLICY workflow_records_tenant_write ON public.workflow_records FOR ALL TO authenticated
  USING (private.has_module_access(tenant_id, module, 'edit'))
  WITH CHECK (private.has_module_access(tenant_id, module, 'edit'));

DROP POLICY IF EXISTS workflow_lines_tenant_write ON public.workflow_lines;
CREATE POLICY workflow_lines_tenant_write ON public.workflow_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_records r WHERE r.id = workflow_lines.workflow_id AND r.tenant_id = workflow_lines.tenant_id AND private.has_module_access(r.tenant_id, r.module, 'edit')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workflow_records r WHERE r.id = workflow_lines.workflow_id AND r.tenant_id = workflow_lines.tenant_id AND private.has_module_access(r.tenant_id, r.module, 'edit')));

DROP POLICY IF EXISTS workflow_approvals_tenant_write ON public.workflow_approvals;
CREATE POLICY workflow_approvals_tenant_write ON public.workflow_approvals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_records r WHERE r.id = workflow_approvals.workflow_id AND r.tenant_id = workflow_approvals.tenant_id AND private.has_module_access(r.tenant_id, r.module, 'edit')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workflow_records r WHERE r.id = workflow_approvals.workflow_id AND r.tenant_id = workflow_approvals.tenant_id AND private.has_module_access(r.tenant_id, r.module, 'edit')));

-- 8. Indexes
CREATE INDEX IF NOT EXISTS workflow_records_lookup_idx ON public.workflow_records(tenant_id, module, record_type, status);
CREATE INDEX IF NOT EXISTS workflow_records_due_idx ON public.workflow_records(tenant_id, due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS inventory_units_lookup_idx ON public.inventory_units(tenant_id, warehouse_id, product_id, status);
CREATE INDEX IF NOT EXISTS entity_timeline_lookup_idx ON public.entity_timeline(tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_delivery_queue_idx ON public.notification_deliveries(status, scheduled_at);
CREATE INDEX IF NOT EXISTS employee_events_lookup_idx ON public.employee_events(tenant_id, employee_id, event_type, status);
CREATE INDEX IF NOT EXISTS credit_contract_customer_idx ON public.credit_contracts(tenant_id, customer_id, status);
CREATE INDEX IF NOT EXISTS credit_installment_due_idx ON public.credit_installments(tenant_id, due_date, status);
CREATE INDEX IF NOT EXISTS credit_collection_idx ON public.credit_contracts(tenant_id, collection_stage, risk_score DESC);
CREATE INDEX IF NOT EXISTS credit_adjustments_idx ON public.credit_adjustments(tenant_id, credit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_budget_period_idx ON public.finance_budgets(tenant_id, fiscal_year, period_month, status);
CREATE INDEX IF NOT EXISTS reconciliation_lines_idx ON public.reconciliation_lines(tenant_id, reconciliation_id, status);

-- 9. updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_enterprise_record() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN NEW.updated_at = now(); IF TG_TABLE_NAME = 'workflow_records' THEN NEW.updated_by = auth.uid(); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS workflow_records_touch ON public.workflow_records;
CREATE TRIGGER workflow_records_touch BEFORE UPDATE ON public.workflow_records FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();
DROP TRIGGER IF EXISTS inventory_units_touch ON public.inventory_units;
CREATE TRIGGER inventory_units_touch BEFORE UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();
DROP TRIGGER IF EXISTS employee_events_touch ON public.employee_events;
CREATE TRIGGER employee_events_touch BEFORE UPDATE ON public.employee_events FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();
DROP TRIGGER IF EXISTS credit_contracts_touch ON public.credit_contracts;
CREATE TRIGGER credit_contracts_touch BEFORE UPDATE ON public.credit_contracts FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();
DROP TRIGGER IF EXISTS credit_installments_touch ON public.credit_installments;
CREATE TRIGGER credit_installments_touch BEFORE UPDATE ON public.credit_installments FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();

-- 10. RPCs
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

CREATE OR REPLACE FUNCTION public.platform_set_tenant_limits(
  _tenant UUID, _max_users INTEGER, _max_warehouses INTEGER DEFAULT 3,
  _max_storage_mb INTEGER DEFAULT 1024, _enabled_modules TEXT[] DEFAULT ARRAY[]::TEXT[]
) RETURNS public.tenant_limits
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result public.tenant_limits;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator permission is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN RAISE EXCEPTION 'Tenant not found'; END IF;
  INSERT INTO public.tenant_limits (tenant_id, max_users, max_warehouses, max_storage_mb, enabled_modules, updated_by, updated_at)
  VALUES (_tenant, GREATEST(1, COALESCE(_max_users, 10)), GREATEST(1, COALESCE(_max_warehouses, 3)),
          GREATEST(128, COALESCE(_max_storage_mb, 1024)), COALESCE(_enabled_modules, ARRAY[]::TEXT[]), auth.uid(), now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    max_users = EXCLUDED.max_users, max_warehouses = EXCLUDED.max_warehouses,
    max_storage_mb = EXCLUDED.max_storage_mb, enabled_modules = EXCLUDED.enabled_modules,
    updated_by = auth.uid(), updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_tenant_usage()
RETURNS TABLE (tenant_id UUID, tenant_name TEXT, tenant_status TEXT, member_count BIGINT,
  warehouse_count BIGINT, max_users INTEGER, max_warehouses INTEGER, max_storage_mb INTEGER, enabled_modules TEXT[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator permission is required';
  END IF;
  RETURN QUERY
  SELECT t.id, t.name, COALESCE(t.status::TEXT, 'active'),
    (SELECT count(*) FROM public.tenant_members tm WHERE tm.tenant_id = t.id),
    (SELECT count(*) FROM public.warehouses w WHERE w.tenant_id = t.id),
    COALESCE(l.max_users, 10), COALESCE(l.max_warehouses, 3), COALESCE(l.max_storage_mb, 1024),
    COALESCE(l.enabled_modules, ARRAY[]::TEXT[])
  FROM public.tenants t LEFT JOIN public.tenant_limits l ON l.tenant_id = t.id
  ORDER BY t.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.refresh_credit_overdue(UUID,DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_360_snapshot(UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_tenant_limits(UUID,INTEGER,INTEGER,INTEGER,TEXT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_tenant_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_credit_overdue(UUID,DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.customer_360_snapshot(UUID,UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_limits(UUID,INTEGER,INTEGER,INTEGER,TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_tenant_usage() TO authenticated, service_role;