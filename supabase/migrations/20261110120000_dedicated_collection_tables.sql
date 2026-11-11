-- Dedicated tables for the app collections that used to live in tenant_collection_records.
--
-- The app (src/shared/adapters/dedicatedCollections.ts) now reads and writes these tables
-- directly. They were created by Lovable through drizzle/migrations/0014 and 0015, which are
-- not part of supabase/migrations, so staging (and any database built from this repo) lacked
-- them and every collection sync failed with PGRST205.
--
-- This ports drizzle 0014 and the table-related parts of 0015 so the repo's migration history is
-- authoritative again. Every statement is idempotent: it is safe on a database where Lovable
-- already applied the drizzle versions. The reverse_vendor_invoice_payment and
-- reverse_procurement_receipt rewrites from 0015 are not ported: those functions do not exist in
-- supabase/migrations.

DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('hr_departments', 'hr',
       'name text, parent_department text, description text, status text'),
      ('hr_leave_requests', 'hr',
       'employee_id text, employee_name text, department text, type text, from_date text, to_date text, days numeric, approver text, status text'),
      ('hr_vacancies', 'hr',
       'role text, department text, candidates numeric, stage text, owner text, target_date text, status text'),
      ('business_contracts', 'contracts',
       'customer text, fin text, product text, amount numeric, status text, order_id text'),
      ('finance_entries', 'finance',
       'description text, amount numeric, currency text, direction text, category text, date text, status text, account_id text'),
      ('finance_account_records', 'finance',
       'name text, code text, type text, currency text, opening_balance numeric, status text'),
      ('finance_credit_records', 'credits',
       'customer text, contract_id text, order_id text, total numeric, initial_payment numeric, balance numeric, months numeric, status text')
    ) AS t(table_name, module, columns)
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (tenant_id uuid NOT NULL REFERENCES public.tenants(id), record_key text NOT NULL, '
      'sort_position integer NOT NULL DEFAULT 0, %s, metadata jsonb NOT NULL DEFAULT ''{}'', PRIMARY KEY (tenant_id, record_key))',
      spec.table_name, spec.columns);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', spec.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', spec.table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', spec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.table_name || '_read', spec.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (coalesce(private.has_module_access(tenant_id, %L, ''view''), false))',
      spec.table_name || '_read', spec.table_name, spec.module);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', spec.table_name || '_write', spec.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (coalesce(private.has_module_access(tenant_id, %L, ''edit''), false)) '
      'WITH CHECK (coalesce(private.has_module_access(tenant_id, %L, ''edit''), false))',
      spec.table_name || '_write', spec.table_name, spec.module, spec.module);
  END LOOP;
END $$;

-- Copy existing collection records into the dedicated tables (same mapping as the app adapter).
INSERT INTO public.hr_departments(tenant_id,record_key,sort_position,name,parent_department,description,status,metadata)
SELECT tenant_id,record_key,position,data->>'name',data->>'parentDepartment',data->>'description',data->>'status',
  data-ARRAY['name','parentDepartment','description','status']
FROM public.tenant_collection_records WHERE collection='departments' ON CONFLICT DO NOTHING;

INSERT INTO public.hr_leave_requests(tenant_id,record_key,sort_position,employee_id,employee_name,department,type,from_date,to_date,days,approver,status,metadata)
SELECT tenant_id,record_key,position,data->>'employeeId',data->>'employeeName',data->>'department',data->>'type',data->>'from',data->>'to',
  nullif(data->>'days','')::numeric,data->>'approver',data->>'status',
  data-ARRAY['employeeId','employeeName','department','type','from','to','days','approver','status']
FROM public.tenant_collection_records WHERE collection='leaveRequests' ON CONFLICT DO NOTHING;

INSERT INTO public.hr_vacancies(tenant_id,record_key,sort_position,role,department,candidates,stage,owner,target_date,status,metadata)
SELECT tenant_id,record_key,position,data->>'role',data->>'department',nullif(data->>'candidates','')::numeric,data->>'stage',data->>'owner',
  data->>'targetDate',data->>'status',data-ARRAY['role','department','candidates','stage','owner','targetDate','status']
FROM public.tenant_collection_records WHERE collection='vacancies' ON CONFLICT DO NOTHING;

INSERT INTO public.business_contracts(tenant_id,record_key,sort_position,customer,fin,product,amount,status,order_id,metadata)
SELECT tenant_id,record_key,position,data->>'customer',data->>'fin',data->>'product',nullif(data->>'amount','')::numeric,data->>'status',
  data->>'orderId',data-ARRAY['customer','fin','product','amount','status','orderId']
FROM public.tenant_collection_records WHERE collection='contracts' ON CONFLICT DO NOTHING;

INSERT INTO public.finance_entries(tenant_id,record_key,sort_position,description,amount,currency,direction,category,date,status,account_id,metadata)
SELECT tenant_id,record_key,position,data->>'description',nullif(data->>'amount','')::numeric,data->>'currency',data->>'direction',
  data->>'category',data->>'date',data->>'status',data->>'accountId',
  data-ARRAY['description','amount','currency','direction','category','date','status','accountId']
FROM public.tenant_collection_records WHERE collection='cashEntries' ON CONFLICT DO NOTHING;

INSERT INTO public.finance_account_records(tenant_id,record_key,sort_position,name,code,type,currency,opening_balance,status,metadata)
SELECT tenant_id,record_key,position,data->>'name',data->>'code',data->>'type',data->>'currency',nullif(data->>'openingBalance','')::numeric,
  data->>'status',data-ARRAY['name','code','type','currency','openingBalance','status']
FROM public.tenant_collection_records WHERE collection='financeAccounts' ON CONFLICT DO NOTHING;

INSERT INTO public.finance_credit_records(tenant_id,record_key,sort_position,customer,contract_id,order_id,total,initial_payment,balance,months,status,metadata)
SELECT tenant_id,record_key,position,data->>'customer',data->>'contractId',data->>'orderId',nullif(data->>'total','')::numeric,
  nullif(data->>'initialPayment','')::numeric,nullif(data->>'balance','')::numeric,nullif(data->>'months','')::numeric,data->>'status',
  data-ARRAY['customer','contractId','orderId','total','initialPayment','balance','months','status']
FROM public.tenant_collection_records WHERE collection='credits' ON CONFLICT DO NOTHING;

-- Employees keep their existing table; the app now addresses them by record_key.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS record_key text,
  ADD COLUMN IF NOT EXISTS sort_position integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
UPDATE public.employees SET record_key = id::text WHERE record_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_record_key ON public.employees(tenant_id, record_key);
INSERT INTO public.employees(tenant_id,record_key,sort_position,full_name,position,department,email,phone,salary,status,metadata)
SELECT tenant_id,record_key,position,coalesce(data->>'name',''),data->>'position',data->>'department',data->>'email',data->>'phone',
  coalesce(nullif(data->>'salary','')::numeric,0),'active',data-ARRAY['name','position','department','email','phone','salary']
FROM public.tenant_collection_records WHERE collection='employees' ON CONFLICT (tenant_id, record_key) DO NOTHING;

-- KPI payouts must read employees from the employees table, where the app now writes them.
DO $$
DECLARE
  definition text;
  old_source constant text := 'FROM public.tenant_collection_records WHERE tenant_id=_tenant_id AND collection=''employees''';
  old_match constant text := 'data->>''id''=employee->>''employeeId''';
BEGIN
  SELECT pg_get_functiondef('public.run_kpi_period_atomic(uuid,text,jsonb)'::regprocedure) INTO definition;
  IF position(old_source IN definition) > 0 THEN
    IF position(old_match IN definition) = 0 THEN
      RAISE EXCEPTION 'run_kpi_period_atomic reads employees from collection records but not in the expected form; port it by hand';
    END IF;
    definition := replace(definition, old_source, 'FROM public.employees WHERE tenant_id=_tenant_id');
    definition := replace(definition, old_match, 'id::text=employee->>''employeeId''');
    EXECUTE definition;
  ELSIF position('tenant_collection_records' IN definition) > 0 THEN
    RAISE EXCEPTION 'run_kpi_period_atomic still references tenant_collection_records; port it by hand';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS receivable_settlements_credit_idx ON public.receivable_settlements(credit_id);
CREATE INDEX IF NOT EXISTS receivable_settlements_order_idx ON public.receivable_settlements(order_id);
CREATE INDEX IF NOT EXISTS receivable_settlements_invoice_idx ON public.receivable_settlements(invoice_id);
CREATE INDEX IF NOT EXISTS receivable_settlements_account_idx ON public.receivable_settlements(account_id);
CREATE INDEX IF NOT EXISTS kpi_periods_account_idx ON public.kpi_periods(account_id);

-- The app no longer writes the generic table; keep it read-only for the migration audit.
REVOKE INSERT, UPDATE, DELETE ON public.tenant_collection_records FROM authenticated;
COMMENT ON TABLE public.tenant_collection_records IS 'DEPRECATED: replaced by employees, hr_departments, hr_leave_requests, hr_vacancies, business_contracts and dedicated finance record tables. Retained for migration audit only; never read or written by the app.';
COMMENT ON TABLE public.finance_credit_records IS 'Standalone legacy credit records only. Order-linked credit contracts and payments remain authoritative in credit_contracts and credit_payments.';
COMMENT ON TABLE public.finance_account_records IS 'Legacy account registry only. Posted cash balance is authoritative in cash_accounts and cash_transactions.';

NOTIFY pgrst, 'reload schema';
