-- ============================================================
-- P0.1  tenant state snapshots (server-side blob storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_state_snapshots (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INTEGER NOT NULL DEFAULT 2,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_state_snapshots TO authenticated;
GRANT ALL ON public.tenant_state_snapshots TO service_role;
ALTER TABLE public.tenant_state_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read state" ON public.tenant_state_snapshots
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members write state" ON public.tenant_state_snapshots
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_tss_updated BEFORE UPDATE ON public.tenant_state_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- P0.2a  Warehouse
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.stock_move_type AS ENUM ('in','out','adjust','transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant warehouses" ON public.warehouses FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_wh_updated BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  sku TEXT,
  move_type public.stock_move_type NOT NULL,
  qty NUMERIC(18,3) NOT NULL,
  unit_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  doc_no TEXT,
  reference TEXT,
  note TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sm_tenant_date ON public.stock_movements(tenant_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_sm_wh_prod ON public.stock_movements(warehouse_id, product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant stock movements" ON public.stock_movements FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_sm_updated BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.stock_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  sku TEXT,
  qty NUMERIC(18,3) NOT NULL DEFAULT 0,
  avg_cost NUMERIC(18,2) NOT NULL DEFAULT 0,
  reorder_point NUMERIC(18,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_sb_tenant ON public.stock_balances(tenant_id);
GRANT SELECT, UPDATE ON public.stock_balances TO authenticated;
GRANT ALL ON public.stock_balances TO service_role;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant stock balances read" ON public.stock_balances
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant stock balances reorder" ON public.stock_balances
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _delta NUMERIC;
  _wh UUID;
  _prod UUID;
  _tenant UUID;
  _sku TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _wh := OLD.warehouse_id; _prod := OLD.product_id; _tenant := OLD.tenant_id; _sku := OLD.sku;
    _delta := CASE WHEN OLD.move_type = 'out' THEN OLD.qty ELSE -OLD.qty END;
  ELSE
    _wh := NEW.warehouse_id; _prod := NEW.product_id; _tenant := NEW.tenant_id; _sku := NEW.sku;
    _delta := CASE WHEN NEW.move_type = 'out' THEN -NEW.qty ELSE NEW.qty END;
    IF TG_OP = 'UPDATE' THEN
      _delta := _delta + CASE WHEN OLD.move_type = 'out' THEN OLD.qty ELSE -OLD.qty END;
    END IF;
  END IF;

  INSERT INTO public.stock_balances (tenant_id, warehouse_id, product_id, sku, qty, updated_at)
  VALUES (_tenant, _wh, _prod, _sku, _delta, now())
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET qty = public.stock_balances.qty + EXCLUDED.qty, updated_at = now();

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_stock_balance
AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ============================================================
-- P0.2b  Cash / Finance
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.cash_account_type AS ENUM ('cash','bank','card','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.cash_direction AS ENUM ('in','out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.cash_account_type NOT NULL DEFAULT 'bank',
  currency TEXT NOT NULL DEFAULT 'AZN',
  account_no TEXT,
  opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  gl_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_accounts TO authenticated;
GRANT ALL ON public.cash_accounts TO service_role;
ALTER TABLE public.cash_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant cash accounts" ON public.cash_accounts FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_ca_updated BEFORE UPDATE ON public.cash_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.cash_accounts(id) ON DELETE CASCADE,
  direction public.cash_direction NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'AZN',
  category TEXT,
  counterparty TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  reference TEXT,
  description TEXT,
  occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ct_tenant_date ON public.cash_transactions(tenant_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_transactions TO authenticated;
GRANT ALL ON public.cash_transactions TO service_role;
ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant cash transactions" ON public.cash_transactions FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_ct_updated BEFORE UPDATE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  expense_no TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AZN',
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  gl_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exp_tenant_date ON public.expenses(tenant_id, expense_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_exp_updated BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- P0.3  Sales invoices (AR) + payments
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.sales_invoice_status AS ENUM ('draft','issued','partial','paid','overdue','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  status public.sales_invoice_status NOT NULL DEFAULT 'draft',
  currency TEXT NOT NULL DEFAULT 'AZN',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  total NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  posted BOOLEAN NOT NULL DEFAULT false,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_no)
);
CREATE INDEX IF NOT EXISTS idx_si_tenant_date ON public.sales_invoices(tenant_id, invoice_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoices TO authenticated;
GRANT ALL ON public.sales_invoices TO service_role;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant sales invoices" ON public.sales_invoices FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));
CREATE TRIGGER trg_si_updated BEFORE UPDATE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.sales_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  qty NUMERIC(18,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_pct NUMERIC(6,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(6,2) NOT NULL DEFAULT 18,
  line_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sil_invoice ON public.sales_invoice_lines(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_invoice_lines TO authenticated;
GRANT ALL ON public.sales_invoice_lines TO service_role;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant sales invoice lines" ON public.sales_invoice_lines FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.cash_accounts(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'AZN',
  method TEXT NOT NULL DEFAULT 'bank',
  reference TEXT,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ip_invoice ON public.invoice_payments(invoice_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant invoice payments" ON public.invoice_payments FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

-- keep invoice paid_amount / status in sync
CREATE OR REPLACE FUNCTION public.sync_invoice_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv UUID; _paid NUMERIC; _total NUMERIC; _due DATE;
BEGIN
  _inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.invoice_payments WHERE invoice_id = _inv;
  SELECT total, due_date INTO _total, _due FROM public.sales_invoices WHERE id = _inv;
  UPDATE public.sales_invoices SET
    paid_amount = _paid,
    status = CASE
      WHEN status = 'cancelled' THEN status
      WHEN _paid >= _total AND _total > 0 THEN 'paid'::public.sales_invoice_status
      WHEN _paid > 0 THEN 'partial'::public.sales_invoice_status
      WHEN _due IS NOT NULL AND _due < CURRENT_DATE THEN 'overdue'::public.sales_invoice_status
      WHEN status = 'draft' THEN 'draft'::public.sales_invoice_status
      ELSE 'issued'::public.sales_invoice_status
    END,
    updated_at = now()
  WHERE id = _inv;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_invoice_payment_sync
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_payment();

-- ============================================================
-- Double-entry automation
-- ============================================================
CREATE OR REPLACE FUNCTION public.gl_account_by_code(_tenant UUID, _code TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.chart_of_accounts WHERE tenant_id = _tenant AND code = _code LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.post_invoice_to_gl(_invoice_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv RECORD; _entry UUID;
  _ar UUID; _rev UUID; _vat UUID;
BEGIN
  SELECT * INTO inv FROM public.sales_invoices WHERE id = _invoice_id;
  IF inv IS NULL THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF NOT public.is_tenant_member(inv.tenant_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF inv.posted THEN RETURN inv.journal_entry_id; END IF;

  _ar  := public.gl_account_by_code(inv.tenant_id, '1200');
  _rev := public.gl_account_by_code(inv.tenant_id, '4000');
  _vat := public.gl_account_by_code(inv.tenant_id, '2100');
  IF _ar IS NULL OR _rev IS NULL OR _vat IS NULL THEN
    RAISE EXCEPTION 'Hesablar planı natamamdır (1200/4000/2100). Əvvəlcə standart planı yükləyin.';
  END IF;

  INSERT INTO public.journal_entries(tenant_id, entry_date, reference, description, source_type, source_id, created_by)
  VALUES (inv.tenant_id, inv.invoice_date, inv.invoice_no, 'Satış fakturası ' || inv.invoice_no, 'sales_invoice', inv.id, auth.uid())
  RETURNING id INTO _entry;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
    (_entry, _ar,  inv.total, 0, 'Debitor borcu', 1),
    (_entry, _rev, 0, inv.total - inv.vat_total, 'Satış gəliri', 2),
    (_entry, _vat, 0, inv.vat_total, 'ƏDV öhdəliyi', 3);

  UPDATE public.journal_entries SET posted = true WHERE id = _entry;
  UPDATE public.sales_invoices SET posted = true, journal_entry_id = _entry,
    status = CASE WHEN status = 'draft' THEN 'issued'::public.sales_invoice_status ELSE status END,
    updated_at = now()
  WHERE id = _invoice_id;

  RETURN _entry;
END $$;

CREATE OR REPLACE FUNCTION public.post_payment_to_gl(_payment_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay RECORD; _entry UUID; _ar UUID; _cash UUID;
BEGIN
  SELECT * INTO pay FROM public.invoice_payments WHERE id = _payment_id;
  IF pay IS NULL THEN RAISE EXCEPTION 'payment not found'; END IF;
  IF NOT public.is_tenant_member(pay.tenant_id, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  _ar := public.gl_account_by_code(pay.tenant_id, '1200');
  SELECT COALESCE(ca.gl_account_id, public.gl_account_by_code(pay.tenant_id, CASE WHEN ca.type = 'cash' THEN '1000' ELSE '1010' END))
    INTO _cash FROM public.cash_accounts ca WHERE ca.id = pay.account_id;
  _cash := COALESCE(_cash, public.gl_account_by_code(pay.tenant_id, '1010'));
  IF _ar IS NULL OR _cash IS NULL THEN
    RAISE EXCEPTION 'Hesablar planı natamamdır (1200/1010).';
  END IF;

  INSERT INTO public.journal_entries(tenant_id, entry_date, reference, description, source_type, source_id, created_by)
  VALUES (pay.tenant_id, pay.paid_at, pay.reference, 'Müştəri ödənişi', 'invoice_payment', pay.id, auth.uid())
  RETURNING id INTO _entry;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
    (_entry, _cash, pay.amount, 0, 'Kassa/Bank mədaxil', 1),
    (_entry, _ar, 0, pay.amount, 'Debitor bağlanması', 2);

  UPDATE public.journal_entries SET posted = true WHERE id = _entry;
  RETURN _entry;
END $$;

REVOKE ALL ON FUNCTION public.gl_account_by_code(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_invoice_to_gl(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_payment_to_gl(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_stock_movement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_invoice_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice_to_gl(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment_to_gl(UUID) TO authenticated;