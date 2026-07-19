
-- ============ TENANT INVITES ============
CREATE TABLE public.tenant_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'member',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invites_tenant ON public.tenant_invites(tenant_id);
CREATE INDEX idx_invites_email ON public.tenant_invites(lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_invites TO authenticated;
GRANT ALL ON public.tenant_invites TO service_role;
ALTER TABLE public.tenant_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_admin_all" ON public.tenant_invites
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE POLICY "invites_invitee_read" ON public.tenant_invites
  FOR SELECT TO authenticated
  USING (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

-- Accept invite RPC
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  uid UUID := auth.uid();
  user_email TEXT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = uid;

  SELECT * INTO inv FROM public.tenant_invites WHERE token = _token;
  IF inv IS NULL THEN RAISE EXCEPTION 'invalid invite'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'already accepted'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'invite expired'; END IF;
  IF lower(inv.email) <> lower(user_email) THEN RAISE EXCEPTION 'invite email mismatch'; END IF;

  INSERT INTO public.tenant_members(tenant_id, user_id, role)
    VALUES (inv.tenant_id, uid, inv.role)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.tenant_invites SET accepted_at = now() WHERE id = inv.id;
  UPDATE public.profiles SET active_tenant_id = inv.tenant_id WHERE id = uid AND active_tenant_id IS NULL;

  RETURN inv.tenant_id;
END;
$$;

-- ============ CHART OF ACCOUNTS ============
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','revenue','expense');

CREATE TABLE public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type public.account_type NOT NULL,
  parent_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'AZN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX idx_coa_tenant ON public.chart_of_accounts(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coa_member_read" ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "coa_admin_write" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ JOURNAL ENTRIES ============
CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  description TEXT,
  source_type TEXT,       -- 'manual' | 'sales_invoice' | 'purchase_invoice' | 'payment'
  source_id UUID,
  posted BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_je_tenant_date ON public.journal_entries(tenant_id, entry_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "je_member_read" ON public.journal_entries FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "je_admin_write" ON public.journal_entries FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ JOURNAL LINES ============
CREATE TABLE public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id),
  debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  memo TEXT,
  line_no INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX idx_jl_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_jl_account ON public.journal_lines(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jl_member_read" ON public.journal_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries je
                 WHERE je.id = entry_id AND public.is_tenant_member(je.tenant_id, auth.uid())));
CREATE POLICY "jl_admin_write" ON public.journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journal_entries je
                 WHERE je.id = entry_id AND public.is_tenant_admin(je.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.journal_entries je
                      WHERE je.id = entry_id AND public.is_tenant_admin(je.tenant_id, auth.uid())));

-- Double-entry balance enforcement on posting
CREATE OR REPLACE FUNCTION public.enforce_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  d NUMERIC; c NUMERIC;
BEGIN
  IF NEW.posted = true AND (OLD.posted IS DISTINCT FROM true) THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
      FROM public.journal_lines WHERE entry_id = NEW.id;
    IF d <> c OR d = 0 THEN
      RAISE EXCEPTION 'journal entry not balanced: debit=% credit=%', d, c;
    END IF;
    NEW.posted_at := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_je_balance BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_journal_balance();

-- Trial balance helper
CREATE OR REPLACE FUNCTION public.trial_balance(_tenant UUID, _from DATE, _to DATE)
RETURNS TABLE(account_id UUID, code TEXT, name TEXT, type public.account_type, debit NUMERIC, credit NUMERIC, balance NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.code, a.name, a.type,
         COALESCE(SUM(l.debit),0) AS debit,
         COALESCE(SUM(l.credit),0) AS credit,
         COALESCE(SUM(l.debit - l.credit),0) AS balance
    FROM public.chart_of_accounts a
    LEFT JOIN public.journal_lines l ON l.account_id = a.id
    LEFT JOIN public.journal_entries e ON e.id = l.entry_id
     AND e.posted = true AND e.entry_date BETWEEN _from AND _to
   WHERE a.tenant_id = _tenant
     AND public.is_tenant_member(_tenant, auth.uid())
   GROUP BY a.id, a.code, a.name, a.type
   ORDER BY a.code;
$$;
