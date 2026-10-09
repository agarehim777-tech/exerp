CREATE OR REPLACE FUNCTION private.assign_credit_contract_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE next_number numeric;
BEGIN
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'tenant_required'; END IF;
  -- Cancelled contracts still own their numbers; allocate inside the sale transaction.
  IF NEW.contract_no ~ '^İN-[0-9]+$' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.tenant_id::text || ':credit-number', 0));
    SELECT greatest(1000, coalesce(max(substring(c.contract_no FROM '^İN-([0-9]+)$')::numeric), 1000)) + 1
      INTO next_number FROM public.credit_contracts c
      WHERE c.tenant_id = NEW.tenant_id AND c.contract_no ~ '^İN-[0-9]+$';
    NEW.contract_no := 'İN-' || next_number::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.assign_credit_contract_number() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS assign_credit_contract_number ON public.credit_contracts;
CREATE TRIGGER assign_credit_contract_number BEFORE INSERT ON public.credit_contracts
  FOR EACH ROW EXECUTE FUNCTION private.assign_credit_contract_number();
NOTIFY pgrst, 'reload schema';
