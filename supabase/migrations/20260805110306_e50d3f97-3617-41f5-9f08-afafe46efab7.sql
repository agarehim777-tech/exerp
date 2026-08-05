-- 1) Currencies
CREATE TABLE public.currencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT,
  is_base BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "currencies_select_members" ON public.currencies
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "currencies_write_admins" ON public.currencies
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE TRIGGER trg_currencies_updated BEFORE UPDATE ON public.currencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX currencies_one_base_per_tenant
  ON public.currencies(tenant_id) WHERE is_base;

-- 2) Exchange rates
CREATE TABLE public.exchange_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL,
  rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rate NUMERIC(18,6) NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, currency_code, rate_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exchange_rates_select_members" ON public.exchange_rates
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "exchange_rates_write_admins" ON public.exchange_rates
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE TRIGGER trg_exchange_rates_updated BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX exchange_rates_lookup_idx
  ON public.exchange_rates(tenant_id, currency_code, rate_date DESC);

-- 3) Rate lookup helper
CREATE OR REPLACE FUNCTION public.get_exchange_rate(_tenant uuid, _code text, _on_date date DEFAULT CURRENT_DATE)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT r.rate FROM public.exchange_rates r
     WHERE r.tenant_id = _tenant
       AND r.currency_code = _code
       AND r.rate_date <= _on_date
       AND public.is_tenant_member(_tenant, auth.uid())
     ORDER BY r.rate_date DESC
     LIMIT 1
  ), 1);
$$;

REVOKE ALL ON FUNCTION public.get_exchange_rate(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exchange_rate(uuid, text, date) TO authenticated, service_role;

-- 4) Base currency (AZN) for existing tenants
INSERT INTO public.currencies (tenant_id, code, name, symbol, is_base)
SELECT t.id, 'AZN', 'Azərbaycan manatı', '₼', true FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;