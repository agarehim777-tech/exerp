Exit code: 0
Wall time: 0.5 seconds
Output:
-- Shared, tenant-isolated records for the ERP workflows that do not warrant
-- duplicating approval, line, timeline and delivery infrastructure per module.
CREATE TABLE IF NOT EXISTS public.workflow_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflow_records(id) ON DELETE CASCADE, line_no INTEGER NOT NULL CHECK (line_no > 0),
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT, description TEXT NOT NULL,
  quantity NUMERIC(16,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0), unit_price NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0), payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.workflow_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflow_records(id) ON DELETE CASCADE, step_no INTEGER NOT NULL CHECK (step_no > 0),
  role_code TEXT, approver_id UUID REFERENCES auth.users(id), status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','skipped')), comment TEXT, decided_at TIMESTAMPTZ,
  UNIQUE (workflow_id, step_no)
);

CREATE TABLE IF NOT EXISTS public.inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  serial_no TEXT, imei TEXT, batch_no TEXT, expiry_date DATE, location_code TEXT, rack_code TEXT, bin_code TEXT,
  quantity NUMERIC(16,3) NOT NULL DEFAULT 1 CHECK (quantity >= 0), unit_cost NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','quarantine','issued','sold','written_off')),
  source_type TEXT, source_id UUID, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_serial_uq ON public.inventory_units(tenant_id, serial_no) WHERE serial_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_units_imei_uq ON public.inventory_units(tenant_id, imei) WHERE imei IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.entity_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id UUID NOT NULL, event_type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, channel TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT, entity_id UUID, recipient TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app','email','sms','push')), provider TEXT, template_code TEXT, subject TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','delivered','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0), provider_message_id TEXT, last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(), sent_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.cash_accounts(id) ON DELETE RESTRICT, period_start DATE NOT NULL, period_end DATE NOT NULL,
  statement_balance NUMERIC(16,2) NOT NULL DEFAULT 0, ledger_balance NUMERIC(16,2) NOT NULL DEFAULT 0,
  difference NUMERIC(16,2) GENERATED ALWAYS AS (statement_balance - ledger_balance) STORED,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','reconciled','reopened')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, approved_by UUID REFERENCES auth.users(id), approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS public.employee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('leave','attendance','contract','document','payroll','performance')),
  status TEXT NOT NULL DEFAULT 'draft', start_date DATE, end_date DATE, amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, approved_by UUID REFERENCES auth.users(id), approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.tenant_limits (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_users INTEGER NOT NULL DEFAULT 10 CHECK (max_users > 0), max_warehouses INTEGER NOT NULL DEFAULT 3 CHECK (max_warehouses > 0),
  max_storage_mb INTEGER NOT NULL DEFAULT 1024 CHECK (max_storage_mb > 0),
  enabled_modules TEXT[] NOT NULL DEFAULT ARRAY['crm','sales','warehouse','finance'],
  security_policy JSONB NOT NULL DEFAULT '{"mfa_required":false,"session_hours":12}'::jsonb,
  updated_by UUID REFERENCES auth.users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ DECLARE item RECORD; BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('workflow_records','settings'),('workflow_lines','settings'),('workflow_approvals','settings'),
    ('inventory_units','warehouse'),('entity_timeline','crm'),('notification_deliveries','notifications'),
    ('financial_reconciliations','finance'),('employee_events','hr'),('tenant_limits','settings')
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

-- Shared workflow tables authorize against the module stored on the parent.
DROP POLICY IF EXISTS workflow_records_tenant_write ON public.workflow_records;
CREATE POLICY workflow_records_tenant_write ON public.workflow_records FOR ALL TO authenticated
  USING (private.has_module_access(tenant_id, module, 'edit'))
  WITH CHECK (private.has_module_access(tenant_id, module, 'edit'));

DROP POLICY IF EXISTS workflow_lines_tenant_write ON public.workflow_lines;
CREATE POLICY workflow_lines_tenant_write ON public.workflow_lines FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_records record
    WHERE record.id = workflow_lines.workflow_id AND record.tenant_id = workflow_lines.tenant_id
      AND private.has_module_access(record.tenant_id, record.module, 'edit')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workflow_records record
    WHERE record.id = workflow_lines.workflow_id AND record.tenant_id = workflow_lines.tenant_id
      AND private.has_module_access(record.tenant_id, record.module, 'edit')
  ));

DROP POLICY IF EXISTS workflow_approvals_tenant_write ON public.workflow_approvals;
CREATE POLICY workflow_approvals_tenant_write ON public.workflow_approvals FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workflow_records record
    WHERE record.id = workflow_approvals.workflow_id AND record.tenant_id = workflow_approvals.tenant_id
      AND private.has_module_access(record.tenant_id, record.module, 'edit')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workflow_records record
    WHERE record.id = workflow_approvals.workflow_id AND record.tenant_id = workflow_approvals.tenant_id
      AND private.has_module_access(record.tenant_id, record.module, 'edit')
  ));

CREATE INDEX IF NOT EXISTS workflow_records_lookup_idx ON public.workflow_records(tenant_id, module, record_type, status);
CREATE INDEX IF NOT EXISTS workflow_records_due_idx ON public.workflow_records(tenant_id, due_at) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS inventory_units_lookup_idx ON public.inventory_units(tenant_id, warehouse_id, product_id, status);
CREATE INDEX IF NOT EXISTS entity_timeline_lookup_idx ON public.entity_timeline(tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notification_delivery_queue_idx ON public.notification_deliveries(status, scheduled_at) WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS employee_events_lookup_idx ON public.employee_events(tenant_id, employee_id, event_type, status);

CREATE OR REPLACE FUNCTION public.touch_enterprise_record() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN NEW.updated_at = now(); IF TG_TABLE_NAME = 'workflow_records' THEN NEW.updated_by = auth.uid(); END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS workflow_records_touch ON public.workflow_records;
CREATE TRIGGER workflow_records_touch BEFORE UPDATE ON public.workflow_records FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();
DROP TRIGGER IF EXISTS inventory_units_touch ON public.inventory_units;
CREATE TRIGGER inventory_units_touch BEFORE UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();
DROP TRIGGER IF EXISTS employee_events_touch ON public.employee_events;
CREATE TRIGGER employee_events_touch BEFORE UPDATE ON public.employee_events FOR EACH ROW EXECUTE FUNCTION public.touch_enterprise_record();

