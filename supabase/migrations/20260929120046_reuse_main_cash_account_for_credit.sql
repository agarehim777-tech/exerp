CREATE OR REPLACE FUNCTION public.apply_credit_initial_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_order public.orders%rowtype;
  account_id uuid;
  missing_amount numeric;
BEGIN
  IF NEW.order_id IS NULL OR coalesce(NEW.initial_payment,0)<=0 THEN RETURN NEW; END IF;
  SELECT * INTO target_order FROM public.orders
    WHERE id=NEW.order_id AND tenant_id=NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_order_not_found'; END IF;
  missing_amount:=round(NEW.initial_payment-coalesce(target_order.paid_amount,0),2);
  IF missing_amount<=0 THEN RETURN NEW; END IF;
  account_id:=private.ensure_main_cash_account(NEW.tenant_id,target_order.currency);
  PERFORM public.register_order_payment(target_order.id,missing_amount,account_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_credit_initial_payment() FROM PUBLIC,anon,authenticated;
