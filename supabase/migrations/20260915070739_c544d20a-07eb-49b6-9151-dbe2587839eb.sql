CREATE OR REPLACE FUNCTION public.cancel_expense(_tenant_id uuid, _expense_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_posting public.cash_transactions%ROWTYPE;
  v_reversal uuid;
  v_reversed boolean := false;
  v_balance numeric := 0;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_tenant_member';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE tenant_id = _tenant_id AND id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF v_expense.status = 'cancelled' THEN RAISE EXCEPTION 'expense_already_cancelled'; END IF;

  SELECT * INTO v_posting FROM public.cash_transactions
   WHERE tenant_id = _tenant_id
     AND category = 'expense'
     AND reference = 'EXPENSE:' || _expense_id::text
   ORDER BY created_at
   LIMIT 1;

  IF v_posting.id IS NOT NULL THEN
    SELECT id INTO v_reversal FROM public.cash_transactions
     WHERE tenant_id = _tenant_id
       AND (reversal_of = v_posting.id OR reference = 'EXPENSE-REVERSAL:' || _expense_id::text)
     LIMIT 1;
    IF v_reversal IS NULL THEN
      INSERT INTO public.cash_transactions (
        tenant_id, account_id, direction, amount, currency, category,
        reference, reference_type, reversal_of, description, occurred_at, created_by
      ) VALUES (
        _tenant_id, v_posting.account_id, 'in', v_posting.amount, v_posting.currency,
        'expense_reversal', 'EXPENSE-REVERSAL:' || _expense_id::text, 'expense', v_posting.id,
        COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc')
          || ' — ləğv edildi'
          || COALESCE(' · ' || NULLIF(btrim(_reason), ''), ''),
        CURRENT_DATE, auth.uid()
      );
      v_reversed := true;
    END IF;
  END IF;

  UPDATE public.expenses
     SET status = 'cancelled',
         note = COALESCE(NULLIF(btrim(_reason), ''), note)
   WHERE id = _expense_id AND tenant_id = _tenant_id;

  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM public.cash_transactions
   WHERE tenant_id = _tenant_id
     AND account_id = COALESCE(v_posting.account_id, v_expense.account_id);

  RETURN jsonb_build_object('reversed', v_reversed, 'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_expense(_tenant_id uuid, _expense_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_account uuid;
  v_posting uuid;
  v_posted boolean := false;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_tenant_member';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE tenant_id = _tenant_id AND id = _expense_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF v_expense.status NOT IN ('approved', 'pending', 'draft') THEN
    RAISE EXCEPTION 'expense_not_acceptable';
  END IF;

  v_account := COALESCE(v_expense.account_id, private.ensure_main_cash_account(_tenant_id, COALESCE(v_expense.currency, 'AZN')));

  SELECT id INTO v_posting FROM public.cash_transactions
   WHERE tenant_id = _tenant_id
     AND category = 'expense'
     AND reference = 'EXPENSE:' || _expense_id::text
   LIMIT 1;

  IF v_posting IS NULL THEN
    INSERT INTO public.cash_transactions (
      tenant_id, account_id, direction, amount, currency, category,
      reference, reference_type, description, occurred_at, created_by
    ) VALUES (
      _tenant_id, v_account, 'out', COALESCE(v_expense.amount, 0),
      COALESCE(v_expense.currency, 'AZN'), 'expense',
      'EXPENSE:' || _expense_id::text, 'expense',
      COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc'),
      COALESCE(v_expense.expense_date, CURRENT_DATE), auth.uid()
    );
    v_posted := true;
  END IF;

  UPDATE public.expenses
     SET status = 'paid', account_id = v_account
   WHERE id = _expense_id AND tenant_id = _tenant_id;

  RETURN jsonb_build_object('posted', v_posted);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_expense(uuid, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.accept_expense(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_expense(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_expense(uuid, uuid) TO authenticated;