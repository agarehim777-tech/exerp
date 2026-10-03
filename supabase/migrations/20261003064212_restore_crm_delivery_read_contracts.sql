CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_identity_idx ON public.customers(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_identity_idx ON public.orders(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_identity_idx ON public.products(tenant_id,id);

CREATE TABLE IF NOT EXISTS public.customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  title text NOT NULL, document_type text NOT NULL DEFAULT 'Digər',
  file_path text NOT NULL, file_name text NOT NULL, mime_type text,
  file_size bigint NOT NULL DEFAULT 0 CHECK(file_size>=0), expires_at date,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES public.customers(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS public.customer_service_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL, order_id uuid, product_id uuid,
  case_no text NOT NULL, subject text NOT NULL, description text,
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','diagnosis','repair','waiting_part','resolved','closed','cancelled')),
  opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,case_no),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES public.customers(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,order_id) REFERENCES public.orders(tenant_id,id) ON DELETE SET NULL(order_id),
  FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id) ON DELETE SET NULL(product_id)
);
CREATE INDEX IF NOT EXISTS customer_documents_customer_idx ON public.customer_documents(tenant_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_service_cases_customer_idx ON public.customer_service_cases(tenant_id,customer_id,created_at DESC);
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['customer_documents','customer_service_cases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',item);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon',item);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',item);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',item);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',item||'_tenant',item);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',item||'_read',item);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',item||'_write',item);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND coalesce(private.has_module_access(tenant_id,''crm'',''view''),false))',item||'_read',item);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(auth.uid() IS NOT NULL AND coalesce(private.has_module_access(tenant_id,''crm'',''edit''),false)) WITH CHECK(auth.uid() IS NOT NULL AND coalesce(private.has_module_access(tenant_id,''crm'',''edit''),false))',item||'_write',item);
  END LOOP;
END $$;
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS acceptance_name text,
  ADD COLUMN IF NOT EXISTS acceptance_document_no text,
  ADD COLUMN IF NOT EXISTS acceptance_signature text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_note text,
  ADD COLUMN IF NOT EXISTS warehouse_employee_name text;
NOTIFY pgrst, 'reload schema';
