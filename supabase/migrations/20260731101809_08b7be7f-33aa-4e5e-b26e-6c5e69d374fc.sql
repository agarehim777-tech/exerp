-- 1) ACCOUNTING PERIODS (period lock)
CREATE TABLE public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, start_date, end_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periods_select_member" ON public.accounting_periods
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "periods_write_admin" ON public.accounting_periods
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE INDEX idx_accounting_periods_tenant ON public.accounting_periods(tenant_id, start_date, end_date);

CREATE TRIGGER trg_accounting_periods_updated
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- status validation via trigger (not CHECK, keeps future values flexible)
CREATE OR REPLACE FUNCTION public.validate_accounting_period()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('open','locked','closed') THEN
    RAISE EXCEPTION 'invalid period status: %', NEW.status;
  END IF;
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'period end_date must be >= start_date';
  END IF;
  IF NEW.status IN ('locked','closed') AND NEW.locked_at IS NULL THEN
    NEW.locked_at := now();
    NEW.locked_by := auth.uid();
  END IF;
  IF NEW.status = 'open' THEN
    NEW.locked_at := NULL;
    NEW.locked_by := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_accounting_period
  BEFORE INSERT OR UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.validate_accounting_period();

-- helper: is a date locked for a tenant?
CREATE OR REPLACE FUNCTION public.is_period_locked(_tenant uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounting_periods p
    WHERE p.tenant_id = _tenant
      AND p.status IN ('locked','closed')
      AND _date BETWEEN p.start_date AND p.end_date
  )
$$;
REVOKE ALL ON FUNCTION public.is_period_locked(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_period_locked(uuid, date) TO authenticated, service_role;

-- enforce lock on journal entries
CREATE OR REPLACE FUNCTION public.enforce_period_lock_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; t uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN d := OLD.entry_date; t := OLD.tenant_id;
  ELSE d := NEW.entry_date; t := NEW.tenant_id; END IF;
  IF public.is_period_locked(t, d) THEN
    RAISE EXCEPTION 'Bu tarix bağlı mühasibat dövrünə aiddir (%). Əməliyyat mümkün deyil.', d;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.entry_date <> NEW.entry_date AND public.is_period_locked(t, OLD.entry_date) THEN
    RAISE EXCEPTION 'Köhnə tarix bağlı dövrdədir.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_period_lock_journal
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_period_lock_journal();

-- enforce lock on sales invoices
CREATE OR REPLACE FUNCTION public.enforce_period_lock_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; t uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN d := OLD.invoice_date; t := OLD.tenant_id;
  ELSE d := NEW.invoice_date; t := NEW.tenant_id; END IF;
  IF public.is_period_locked(t, d) THEN
    RAISE EXCEPTION 'Bu tarix bağlı mühasibat dövrünə aiddir (%). Faktura dəyişdirilə bilməz.', d;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_period_lock_invoice
  BEFORE INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_period_lock_invoice();

-- 2) AUDIT TRAIL
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id, auth.uid()));

CREATE INDEX idx_audit_logs_tenant_time ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_record ON public.audit_logs(table_name, record_id);

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant uuid;
  _old jsonb;
  _new jsonb;
  _changed text[];
  _rec_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN _old := to_jsonb(OLD); ELSE _new := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN _old := to_jsonb(OLD); END IF;

  _tenant := NULLIF(COALESCE(_new->>'tenant_id', _old->>'tenant_id'), '')::uuid;
  _rec_id := NULLIF(COALESCE(_new->>'id', _old->>'id'), '')::uuid;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key) INTO _changed
      FROM jsonb_each(_new) n
     WHERE n.value IS DISTINCT FROM (_old -> n.key);
    IF _changed IS NULL OR array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.audit_logs(tenant_id, table_name, record_id, action, actor_id, old_data, new_data, changed_fields)
  VALUES (_tenant, TG_TABLE_NAME, _rec_id, TG_OP, auth.uid(), _old, _new, _changed);

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_journal_entries AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_sales_invoices AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_invoice_payments AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_orders AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_tenant_members AFTER INSERT OR UPDATE OR DELETE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_purchase_orders AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_vendor_invoices AFTER INSERT OR UPDATE OR DELETE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_stock_movements AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER trg_audit_accounting_periods AFTER INSERT OR UPDATE OR DELETE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();