CREATE OR REPLACE FUNCTION private.ensure_main_cash_account(_tenant_id uuid, _currency text DEFAULT 'AZN')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account_id uuid;
  account_code text := 'MAIN-' || upper(left(_tenant_id::text, 8));
  cur text := coalesce(nullif(_currency, ''), 'AZN');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_member(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_tenant_id::text || ':main-cash:' || cur, 0));
  SELECT a.id INTO account_id FROM public.cash_accounts a
   WHERE a.tenant_id = _tenant_id AND a.is_active AND a.currency = cur
   ORDER BY CASE WHEN a.account_no = account_code OR a.name = U&'\018Fsas kassa' THEN 0 ELSE 1 END, a.created_at, a.id
   LIMIT 1;
  IF account_id IS NOT NULL THEN RETURN account_id; END IF;

  UPDATE public.cash_accounts a SET is_active = true, updated_at = now()
   WHERE a.id = (SELECT candidate.id FROM public.cash_accounts candidate
     WHERE candidate.tenant_id = _tenant_id AND candidate.account_no = account_code
       AND candidate.currency = cur ORDER BY candidate.created_at, candidate.id LIMIT 1)
   RETURNING a.id INTO account_id;
  IF account_id IS NOT NULL THEN RETURN account_id; END IF;

  -- Canonical installations require code; the legacy table has only account_no.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='cash_accounts' AND column_name='code') THEN
    EXECUTE 'INSERT INTO public.cash_accounts(tenant_id,code,account_no,name,type,currency,opening_balance,is_active)
      VALUES ($1,$2,$5,$3,''cash'',$4,0,true) RETURNING id'
      INTO account_id USING _tenant_id, account_code || '-' || cur, U&'\018Fsas kassa', cur, account_code;
  ELSE
    INSERT INTO public.cash_accounts(tenant_id,account_no,name,type,currency,opening_balance,is_active)
      VALUES (_tenant_id,account_code,U&'\018Fsas kassa','cash',cur,0,true) RETURNING id INTO account_id;
  END IF;
  RETURN account_id;
END;
$$;
REVOKE ALL ON FUNCTION private.ensure_main_cash_account(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.ensure_main_cash_account(uuid,text) TO authenticated,service_role;
