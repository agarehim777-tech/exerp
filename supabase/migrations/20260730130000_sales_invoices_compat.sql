-- Compatibility slice retained from the superseded P0 migration.\n-- Warehouse and cash schemas are provided by the canonical core migration.\n-- ============================================================
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
    RAISE EXCEPTION 'Hesablar planД± natamamdД±r (1200/4000/2100). ЖЏvvЙ™lcЙ™ standart planД± yГјklЙ™yin.';
  END IF;

  INSERT INTO public.journal_entries(tenant_id, entry_date, reference, description, source_type, source_id, created_by)
  VALUES (inv.tenant_id, inv.invoice_date, inv.invoice_no, 'SatД±Еџ fakturasД± ' || inv.invoice_no, 'sales_invoice', inv.id, auth.uid())
  RETURNING id INTO _entry;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
    (_entry, _ar,  inv.total, 0, 'Debitor borcu', 1),
    (_entry, _rev, 0, inv.total - inv.vat_total, 'SatД±Еџ gЙ™liri', 2),
    (_entry, _vat, 0, inv.vat_total, 'ЖЏDV Г¶hdЙ™liyi', 3);

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
    RAISE EXCEPTION 'Hesablar planД± natamamdД±r (1200/1010).';
  END IF;

  INSERT INTO public.journal_entries(tenant_id, entry_date, reference, description, source_type, source_id, created_by)
  VALUES (pay.tenant_id, pay.paid_at, pay.reference, 'MГјЕџtЙ™ri Г¶dЙ™niЕџi', 'invoice_payment', pay.id, auth.uid())
  RETURNING id INTO _entry;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
    (_entry, _cash, pay.amount, 0, 'Kassa/Bank mЙ™daxil', 1),
    (_entry, _ar, 0, pay.amount, 'Debitor baДџlanmasД±', 2);

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
\n