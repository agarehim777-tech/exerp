CREATE OR REPLACE FUNCTION public.sync_expense_cash(_tenant_id uuid, _expense_no text, _status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_expense public.expenses%ROWTYPE;
  v_account uuid;
  v_posting public.cash_transactions%ROWTYPE;
  v_reversal_id uuid;
  v_posted boolean := false;
  v_reversed boolean := false;
  v_balance numeric := 0;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_tenant_member';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE tenant_id = _tenant_id AND expense_no = _expense_no
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'expense_not_found';
  END IF;

  v_account := COALESCE(v_expense.account_id, private.ensure_main_cash_account(_tenant_id, COALESCE(v_expense.currency, 'AZN')));

  SELECT * INTO v_posting FROM public.cash_transactions
   WHERE tenant_id = _tenant_id
     AND reference_type = 'expense'
     AND reference = 'EXPENSE:' || _expense_no
     AND category = 'expense'
   LIMIT 1;

  IF _status IN ('approved', 'accepted') THEN
    IF v_posting.id IS NULL THEN
      INSERT INTO public.cash_transactions (
        tenant_id, account_id, direction, amount, currency, category,
        reference, reference_type, description, occurred_at, created_by
      ) VALUES (
        _tenant_id, v_account, 'out', COALESCE(v_expense.amount, 0),
        COALESCE(v_expense.currency, 'AZN'), 'expense',
        'EXPENSE:' || _expense_no, 'expense',
        COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc'),
        COALESCE(v_expense.expense_date, CURRENT_DATE), auth.uid()
      ) RETURNING * INTO v_posting;
      v_posted := true;
    ELSE
      SELECT id INTO v_reversal_id FROM public.cash_transactions
       WHERE tenant_id = _tenant_id AND reversal_of = v_posting.id LIMIT 1;
      IF v_reversal_id IS NOT NULL THEN
        DELETE FROM public.cash_transactions WHERE id = v_reversal_id;
      END IF;
      UPDATE public.cash_transactions
         SET amount = COALESCE(v_expense.amount, 0),
             account_id = v_account,
             occurred_at = COALESCE(v_expense.expense_date, CURRENT_DATE),
             description = COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc')
       WHERE id = v_posting.id;
      v_posted := true;
    END IF;
    UPDATE public.expenses SET account_id = v_account WHERE id = v_expense.id;
  ELSIF _status IN ('cancelled', 'rejected') THEN
    IF v_posting.id IS NOT NULL THEN
      SELECT id INTO v_reversal_id FROM public.cash_transactions
       WHERE tenant_id = _tenant_id AND reversal_of = v_posting.id LIMIT 1;
      IF v_reversal_id IS NULL THEN
        INSERT INTO public.cash_transactions (
          tenant_id, account_id, direction, amount, currency, category,
          reference, reference_type, reversal_of, description, occurred_at, created_by
        ) VALUES (
          _tenant_id, v_posting.account_id, 'in', v_posting.amount,
          v_posting.currency, 'expense_reversal',
          'EXPENSE-REVERSAL:' || _expense_no, 'expense', v_posting.id,
          COALESCE(NULLIF(v_expense.description, ''), v_expense.category, 'Xərc') || ' — ləğv edildi',
          CURRENT_DATE, auth.uid()
        );
        v_reversed := true;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    INTO v_balance
    FROM public.cash_transactions
   WHERE tenant_id = _tenant_id AND account_id = v_account;

  RETURN jsonb_build_object(
    'account_id', v_account,
    'posted', v_posted,
    'reversed', v_reversed,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_expense_cash(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_expense_cash(uuid, text, text) TO authenticated;