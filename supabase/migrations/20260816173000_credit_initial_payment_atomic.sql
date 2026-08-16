-- Kredit müqaviləsində ilkin ödəniş göstərilibsə, həmin məbləğ sifariş və
-- kassa göstəricilərinə müqavilə ilə eyni transaction daxilində yazılır.
-- Frontend sinxronizasiyası əlavə qoruma olaraq qalır.
CREATE OR REPLACE FUNCTION public.apply_credit_initial_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target_order public.orders%rowtype;
  target_account public.cash_accounts%rowtype;
  missing_amount numeric;
  stable_code text;
BEGIN
  IF NEW.order_id IS NULL OR COALESCE(NEW.initial_payment, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO target_order
  FROM public.orders
  WHERE id = NEW.order_id AND tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF target_order.id IS NULL THEN
    RAISE EXCEPTION 'Kreditə bağlı sifariş tapılmadı';
  END IF;

  missing_amount := round(NEW.initial_payment - COALESCE(target_order.paid_amount, 0), 2);
  IF missing_amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO target_account
  FROM public.cash_accounts
  WHERE tenant_id = NEW.tenant_id
    AND currency = target_order.currency
    AND is_active
  ORDER BY CASE WHEN lower(trim(name)) = lower('Əsas kassa') THEN 0 ELSE 1 END, created_at
  LIMIT 1
  FOR UPDATE;

  IF target_account.id IS NULL THEN
    stable_code := 'MAIN-' || upper(left(NEW.tenant_id::text, 8));
    SELECT * INTO target_account
    FROM public.cash_accounts
    WHERE tenant_id = NEW.tenant_id AND code = stable_code
    LIMIT 1
    FOR UPDATE;

    IF target_account.id IS NULL THEN
      INSERT INTO public.cash_accounts(
        tenant_id, code, name, type, currency, opening_balance, is_active
      ) VALUES (
        NEW.tenant_id, stable_code, 'Əsas kassa', 'cash',
        target_order.currency, 0, true
      ) RETURNING * INTO target_account;
    ELSE
      UPDATE public.cash_accounts
      SET is_active = true, name = 'Əsas kassa', type = 'cash',
          currency = target_order.currency, updated_at = now()
      WHERE id = target_account.id
      RETURNING * INTO target_account;
    END IF;
  END IF;

  PERFORM public.register_order_payment(target_order.id, missing_amount, target_account.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_contract_initial_payment ON public.credit_contracts;
CREATE TRIGGER credit_contract_initial_payment
AFTER INSERT OR UPDATE OF initial_payment ON public.credit_contracts
FOR EACH ROW
WHEN (NEW.order_id IS NOT NULL AND NEW.initial_payment > 0)
EXECUTE FUNCTION public.apply_credit_initial_payment();

REVOKE ALL ON FUNCTION public.apply_credit_initial_payment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_credit_initial_payment() TO authenticated, service_role;
