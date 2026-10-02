-- Compatibility commands retain the server ledger as the source of truth.
CREATE OR REPLACE FUNCTION public.accept_expense(_tenant_id uuid, _expense_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  expense public.expenses%rowtype;
  account public.cash_accounts%rowtype;
  posting public.cash_transactions%rowtype;
  posting_count integer;
  available numeric;
  posted boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO expense FROM public.expenses
    WHERE tenant_id = _tenant_id AND id = _expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF expense.status NOT IN ('approved','pending','draft','paid') THEN RAISE EXCEPTION 'expense_not_acceptable'; END IF;
  SELECT count(*) INTO posting_count FROM public.cash_transactions
    WHERE tenant_id = _tenant_id AND direction::text = 'out' AND reversal_of IS NULL
      AND (reference = 'EXPENSE:' || _expense_id::text OR (reference_type = 'expense' AND reference_id = _expense_id));
  IF posting_count > 1 THEN RAISE EXCEPTION 'expense_duplicate_postings_require_reconciliation'; END IF;
  SELECT * INTO posting FROM public.cash_transactions
    WHERE tenant_id = _tenant_id AND direction::text = 'out' AND reversal_of IS NULL
      AND (reference = 'EXPENSE:' || _expense_id::text OR (reference_type = 'expense' AND reference_id = _expense_id)) FOR UPDATE;
  IF FOUND THEN
    IF posting.amount <> expense.amount OR posting.currency <> expense.currency THEN RAISE EXCEPTION 'expense_posting_mismatch'; END IF;
    IF EXISTS (SELECT 1 FROM public.cash_transactions WHERE tenant_id = _tenant_id AND reversal_of = posting.id) THEN
      RAISE EXCEPTION 'expense_posting_already_reversed';
    END IF;
  ELSE
    IF expense.status = 'paid' THEN RAISE EXCEPTION 'paid_expense_missing_posting'; END IF;
    IF expense.amount IS NULL OR expense.amount <= 0 OR expense.amount::text IN ('NaN','Infinity','-Infinity')
      OR expense.amount <> round(expense.amount,2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    SELECT * INTO account FROM public.cash_accounts
      WHERE tenant_id = _tenant_id AND id = coalesce(expense.account_id,expense.cash_account_id) AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
    IF account.currency <> expense.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
    PERFORM private.assert_open_accounting_period(_tenant_id,coalesce(expense.expense_date,current_date));
    SELECT coalesce(account.opening_balance,0) + coalesce(sum(CASE WHEN direction::text = 'in' THEN amount ELSE -amount END),0)
      INTO available FROM public.cash_transactions WHERE tenant_id = _tenant_id AND account_id = account.id;
    IF expense.amount > available THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
    INSERT INTO public.cash_transactions(tenant_id,account_id,transaction_no,direction,amount,currency,category,
      reference,reference_type,reference_id,description,occurred_at,created_by)
    VALUES(_tenant_id,account.id,'XRC-' || gen_random_uuid()::text,'out',expense.amount,expense.currency,'expense',
      'EXPENSE:' || _expense_id::text,'expense',_expense_id,expense.description,
      coalesce(expense.expense_date,current_date)::timestamp AT TIME ZONE 'Asia/Baku',auth.uid()) RETURNING * INTO posting;
    posted := true;
  END IF;
  IF expense.status <> 'paid' THEN
    UPDATE public.expenses SET status = 'paid',account_id = posting.account_id,
      cash_account_id = posting.account_id,cash_transaction_id = posting.id,updated_at = now()
      WHERE tenant_id = _tenant_id AND id = _expense_id;
    INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'finance','expense_accepted','Server ledger expense acceptance',
      jsonb_build_object('expense_id',_expense_id,'transaction_id',posting.id,'posted',posted));
  END IF;
  RETURN jsonb_build_object('posted',posted,'expense_id',_expense_id,'transaction_id',posting.id,'status','paid');
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_expense(_tenant_id uuid, _expense_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  expense public.expenses%rowtype;
  posting public.cash_transactions%rowtype;
  reversal_id uuid;
  posting_count integer;
  reversed boolean := false;
  balance numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO expense FROM public.expenses WHERE tenant_id = _tenant_id AND id = _expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  SELECT count(*) INTO posting_count FROM public.cash_transactions
    WHERE tenant_id = _tenant_id AND direction::text = 'out' AND reversal_of IS NULL
      AND (reference = 'EXPENSE:' || _expense_id::text OR (reference_type = 'expense' AND reference_id = _expense_id));
  IF posting_count > 1 THEN RAISE EXCEPTION 'expense_duplicate_postings_require_reconciliation'; END IF;
  SELECT * INTO posting FROM public.cash_transactions
    WHERE tenant_id = _tenant_id AND direction::text = 'out' AND reversal_of IS NULL
      AND (reference = 'EXPENSE:' || _expense_id::text OR (reference_type = 'expense' AND reference_id = _expense_id)) FOR UPDATE;
  IF FOUND THEN
    PERFORM id FROM public.cash_accounts WHERE tenant_id = _tenant_id AND id = posting.account_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
    SELECT id INTO reversal_id FROM public.cash_transactions WHERE tenant_id = _tenant_id AND reversal_of = posting.id;
    IF reversal_id IS NULL THEN
      PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
      INSERT INTO public.cash_transactions(tenant_id,account_id,transaction_no,direction,amount,currency,category,
        reference,reference_type,reference_id,reversal_of,description,occurred_at,created_by)
      VALUES(_tenant_id,posting.account_id,'REFUND-' || gen_random_uuid()::text,'in',posting.amount,posting.currency,'expense_reversal',
        'EXPENSE-REVERSAL:' || _expense_id::text,'expense',_expense_id,posting.id,_reason,now(),auth.uid()) RETURNING id INTO reversal_id;
      reversed := true;
    END IF;
  END IF;
  IF expense.status <> 'cancelled' OR reversed THEN
    UPDATE public.expenses SET status = 'cancelled',updated_at = now()
      WHERE tenant_id = _tenant_id AND id = _expense_id;
    INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'finance','expense_cancelled','Server ledger expense cancellation',
      jsonb_build_object('expense_id',_expense_id,'reversal_id',reversal_id));
  END IF;
  SELECT coalesce(a.opening_balance,0) + coalesce(sum(CASE WHEN t.direction::text = 'in' THEN t.amount ELSE -t.amount END),0)
    INTO balance FROM public.cash_accounts a LEFT JOIN public.cash_transactions t ON t.tenant_id = a.tenant_id AND t.account_id = a.id
    WHERE a.tenant_id = _tenant_id AND a.id = coalesce(posting.account_id,expense.account_id,expense.cash_account_id)
    GROUP BY a.id,a.opening_balance;
  RETURN jsonb_build_object('reversed',reversed,'balance',balance,'expense_id',_expense_id,'reversal_id',reversal_id,'status','cancelled');
END;
$$;
REVOKE ALL ON FUNCTION public.accept_expense(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_expense(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_expense(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expense(uuid,uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
