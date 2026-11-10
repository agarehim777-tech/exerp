ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cash_account_id uuid REFERENCES public.cash_accounts(id) ON DELETE RESTRICT, ADD COLUMN IF NOT EXISTS cash_transaction_id uuid REFERENCES public.cash_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_cash_account_id_idx ON public.expenses(cash_account_id);
CREATE INDEX IF NOT EXISTS expenses_cash_transaction_id_idx ON public.expenses(cash_transaction_id);

CREATE OR REPLACE FUNCTION public.create_cash_expense_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  account public.cash_accounts%rowtype;
  expense_id uuid := gen_random_uuid();
  cash_id uuid := gen_random_uuid();
  amount numeric := (_payload->>'amount')::numeric;
  vat numeric := coalesce(nullif(_payload->>'vat_amount', '')::numeric, 0);
  expense_date date := coalesce(nullif(_payload->>'expense_date', '')::date, current_date);
  available numeric;
  digest text := md5(_payload::text);
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'finance', 'edit') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(_request_key), '') IS NULL OR length(_request_key) > 160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF amount IS NULL OR amount <= 0 OR amount::text IN ('NaN','Infinity','-Infinity') OR amount <> round(amount, 2)
    OR vat < 0 OR vat::text IN ('NaN','Infinity','-Infinity') OR vat <> round(vat, 2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  INSERT INTO public.operation_requests(tenant_id, request_key, operation, request_hash)
    VALUES (_tenant_id, _request_key, 'create_cash_expense_atomic', digest)
    ON CONFLICT (tenant_id, request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id = _tenant_id AND request_key = _request_key FOR UPDATE;
  IF request.operation <> 'create_cash_expense_atomic' OR request.request_hash <> digest THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF request.status = 'completed' THEN RETURN request.result; END IF;
  SELECT * INTO account FROM public.cash_accounts
    WHERE id = (_payload->>'account_id')::uuid AND tenant_id = _tenant_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF coalesce(nullif(_payload->>'currency', ''), account.currency) <> account.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id, expense_date);
  SELECT coalesce(account.opening_balance, 0) + coalesce(sum(CASE WHEN direction::text = 'in' THEN t.amount ELSE -t.amount END), 0)
    INTO available FROM public.cash_transactions t WHERE t.tenant_id = _tenant_id AND t.account_id = account.id;
  IF amount > available THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  INSERT INTO public.expenses(id, tenant_id, expense_no, account_id, cash_account_id, amount, vat_amount, currency, category, description, expense_date, status, created_by)
  VALUES (expense_id, _tenant_id, 'EXP-' || expense_id::text, account.id, account.id, amount, vat, account.currency,
    coalesce(nullif(_payload->>'category', ''), 'other'), _payload->>'description', expense_date, 'pending', auth.uid());
  INSERT INTO public.cash_transactions(id, tenant_id, transaction_no, account_id, direction, amount, currency, category, reference, reference_type, reference_id, description, occurred_at, created_by)
  VALUES (cash_id, _tenant_id, 'XRC-' || cash_id::text, account.id, 'out', amount, account.currency, 'expense',
    'EXPENSE:' || expense_id::text, 'expense', expense_id, _payload->>'description', expense_date::timestamp AT TIME ZONE 'Asia/Baku', auth.uid());
  UPDATE public.expenses SET cash_transaction_id = cash_id WHERE id = expense_id;
  result_payload := jsonb_build_object('expense_id', expense_id, 'transaction_id', cash_id);
  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
    VALUES (gen_random_uuid()::text, _tenant_id, auth.uid(), 'finance', 'expense_created', 'Atomic cash expense', result_payload);
  UPDATE public.operation_requests SET status = 'completed', result = result_payload, completed_at = now()
    WHERE id = request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.create_cash_expense_atomic(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cash_expense_atomic(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_cash_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  source public.cash_accounts%rowtype;
  target public.cash_accounts%rowtype;
  source_id uuid := (_payload->>'from_account_id')::uuid;
  target_id uuid := (_payload->>'to_account_id')::uuid;
  value numeric := (_payload->>'amount')::numeric;
  business_date date := coalesce(nullif(_payload->>'occurred_at', '')::date, current_date);
  available numeric;
  transfer_id uuid := gen_random_uuid();
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id, 'finance', 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(_request_key), '') IS NULL OR length(_request_key) > 160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF source_id IS NULL OR target_id IS NULL OR source_id = target_id THEN RAISE EXCEPTION 'invalid_accounts'; END IF;
  IF value IS NULL OR value <= 0 OR value::text IN ('NaN','Infinity','-Infinity') OR value <> round(value, 2) THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES (_tenant_id,_request_key,'transfer_cash_atomic',md5(_payload::text)) ON CONFLICT (tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id = _tenant_id AND request_key = _request_key FOR UPDATE;
  IF request.operation <> 'transfer_cash_atomic' OR request.request_hash <> md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF request.status = 'completed' THEN RETURN request.result; END IF;
  PERFORM id FROM public.cash_accounts WHERE tenant_id = _tenant_id AND id IN (source_id,target_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source FROM public.cash_accounts WHERE tenant_id = _tenant_id AND id = source_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  SELECT * INTO target FROM public.cash_accounts WHERE tenant_id = _tenant_id AND id = target_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF source.currency <> target.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  SELECT coalesce(source.opening_balance,0) + coalesce(sum(CASE WHEN direction::text = 'in' THEN amount ELSE -amount END),0)
    INTO available FROM public.cash_transactions WHERE tenant_id = _tenant_id AND account_id = source_id;
  IF value > available THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  INSERT INTO public.cash_transactions(tenant_id,account_id,transaction_no,direction,amount,currency,category,reference,description,occurred_at,created_by)
  VALUES
    (_tenant_id,source_id,'TRF-OUT-' || transfer_id::text,'out',value,source.currency,'internal_transfer','TRANSFER:' || transfer_id::text,_payload->>'description',business_date::timestamp AT TIME ZONE 'Asia/Baku',auth.uid()),
    (_tenant_id,target_id,'TRF-IN-' || transfer_id::text,'in',value,source.currency,'internal_transfer','TRANSFER:' || transfer_id::text,_payload->>'description',business_date::timestamp AT TIME ZONE 'Asia/Baku',auth.uid());
  result_payload := jsonb_build_object('transfer_id',transfer_id);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'finance','cash_transferred','Atomic cash transfer',result_payload);
  UPDATE public.operation_requests SET status = 'completed', result = result_payload, completed_at = now() WHERE id = request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_cash_atomic(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_cash_atomic(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_cash_expense_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  expense public.expenses%rowtype;
  posting public.cash_transactions%rowtype;
  posting_count integer;
  reversal_id uuid;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key) > 160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'refund_cash_expense_atomic',md5(_payload::text)) ON CONFLICT (tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id = _tenant_id AND request_key = _request_key FOR UPDATE;
  IF request.operation <> 'refund_cash_expense_atomic' OR request.request_hash <> md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF request.status = 'completed' THEN RETURN request.result; END IF;
  SELECT * INTO expense FROM public.expenses WHERE tenant_id = _tenant_id AND id = (_payload->>'expense_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF expense.status <> 'cancelled' THEN
    IF coalesce((_payload->>'only_pending')::boolean,false) AND expense.status <> 'refund_pending' THEN RAISE EXCEPTION 'refund_not_pending'; END IF;
    IF expense.status NOT IN ('pending','draft','approved','paid','accepted','refund_pending','rejected') THEN RAISE EXCEPTION 'invalid_expense_status'; END IF;
    PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
    SELECT count(*) INTO posting_count FROM public.cash_transactions WHERE tenant_id = _tenant_id AND reference = 'EXPENSE:' || expense.id::text AND direction::text = 'out' AND reversal_of IS NULL;
    IF posting_count > 1 THEN RAISE EXCEPTION 'expense_duplicate_postings_require_reconciliation'; END IF;
    SELECT * INTO posting FROM public.cash_transactions WHERE tenant_id = _tenant_id AND reference = 'EXPENSE:' || expense.id::text AND direction::text = 'out' AND reversal_of IS NULL FOR UPDATE;
    IF FOUND THEN
      PERFORM id FROM public.cash_accounts WHERE tenant_id = _tenant_id AND id = posting.account_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
      SELECT id INTO reversal_id FROM public.cash_transactions WHERE tenant_id = _tenant_id AND (reversal_of = posting.id OR reference = 'EXPENSE-REVERSAL:' || expense.id::text) LIMIT 1;
      IF reversal_id IS NULL THEN
        reversal_id := gen_random_uuid();
        INSERT INTO public.cash_transactions(id,tenant_id,account_id,transaction_no,direction,amount,currency,category,reference,reversal_of,description,occurred_at,created_by)
          VALUES(reversal_id,_tenant_id,posting.account_id,'REFUND-' || reversal_id::text,'in',posting.amount,posting.currency,'expense_reversal',
            'EXPENSE-REVERSAL:' || expense.id::text,posting.id,_payload->>'reason',now(),auth.uid());
      END IF;
    END IF;
    UPDATE public.expenses SET status = 'cancelled' WHERE id = expense.id AND tenant_id = _tenant_id;
    INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
      VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'finance','expense_refunded',coalesce(_payload->>'reason','Expense cancellation'),jsonb_build_object('expense_id',expense.id,'reversal_id',reversal_id));
  END IF;
  result_payload := jsonb_build_object('expense_id',expense.id,'status','cancelled');
  UPDATE public.operation_requests SET status = 'completed',result = result_payload,completed_at = now() WHERE id = request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_cash_expense_atomic(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_cash_expense_atomic(uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.edit_cash_expense_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.operation_requests%rowtype;
  expense public.expenses%rowtype;
  posting public.cash_transactions%rowtype;
  account public.cash_accounts%rowtype;
  new_amount numeric := (_payload->>'amount')::numeric;
  vat numeric := coalesce((_payload->>'vat_amount')::numeric,0);
  business_date date := (_payload->>'expense_date')::date;
  available numeric;
  posting_count integer;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key) > 160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF new_amount IS NULL OR new_amount <= 0 OR new_amount::text IN ('NaN','Infinity','-Infinity') OR new_amount <> round(new_amount,2)
    OR vat < 0 OR vat > new_amount OR vat::text IN ('NaN','Infinity','-Infinity') OR vat <> round(vat,2)
    OR business_date IS NULL THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'edit_cash_expense_atomic',md5(_payload::text)) ON CONFLICT (tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id = _tenant_id AND request_key = _request_key FOR UPDATE;
  IF request.operation <> 'edit_cash_expense_atomic' OR request.request_hash <> md5(_payload::text) THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status = 'completed' THEN RETURN request.result; END IF;
  SELECT * INTO expense FROM public.expenses WHERE tenant_id = _tenant_id AND id = (_payload->>'expense_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_found'; END IF;
  IF expense.status NOT IN ('pending','draft') THEN RAISE EXCEPTION 'expense_not_editable'; END IF;
  IF _payload->'expected' IS DISTINCT FROM jsonb_build_object('amount',expense.amount,'vat_amount',coalesce(expense.vat_amount,0),
    'account_id',expense.account_id,'category',expense.category,'description',coalesce(expense.description,''),'expense_date',expense.expense_date) THEN
    RAISE EXCEPTION 'expense_changed_refresh_required';
  END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,expense.expense_date);
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  SELECT count(*) INTO posting_count FROM public.cash_transactions
    WHERE tenant_id = _tenant_id AND direction::text = 'out' AND reversal_of IS NULL
      AND (reference = 'EXPENSE:' || expense.id::text OR (reference_type = 'expense' AND reference_id = expense.id));
  IF posting_count <> 1 THEN RAISE EXCEPTION 'expense_posting_requires_reconciliation'; END IF;
  SELECT * INTO posting FROM public.cash_transactions
    WHERE tenant_id = _tenant_id AND direction::text = 'out' AND reversal_of IS NULL
      AND (reference = 'EXPENSE:' || expense.id::text OR (reference_type = 'expense' AND reference_id = expense.id)) FOR UPDATE;
  IF posting.amount <> expense.amount OR posting.currency <> expense.currency OR posting.account_id IS DISTINCT FROM expense.account_id
    OR EXISTS(SELECT 1 FROM public.cash_transactions WHERE tenant_id = _tenant_id AND reversal_of = posting.id) THEN
    RAISE EXCEPTION 'expense_posting_requires_reconciliation';
  END IF;
  PERFORM id FROM public.cash_accounts WHERE tenant_id = _tenant_id
    AND id IN (posting.account_id,(_payload->>'account_id')::uuid) ORDER BY id FOR UPDATE;
  SELECT * INTO account FROM public.cash_accounts WHERE tenant_id = _tenant_id AND id = (_payload->>'account_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF account.currency <> expense.currency OR coalesce(nullif(_payload->>'currency',''),account.currency) <> account.currency THEN
    RAISE EXCEPTION 'currency_mismatch';
  END IF;
  SELECT coalesce(account.opening_balance,0) + coalesce(sum(CASE WHEN direction::text = 'in' THEN t.amount ELSE -t.amount END),0)
    INTO available FROM public.cash_transactions t WHERE t.tenant_id = _tenant_id AND t.account_id = account.id AND t.id <> posting.id;
  IF new_amount > available THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  UPDATE public.cash_transactions SET account_id = account.id,amount = new_amount,
    description = _payload->>'description',occurred_at = business_date::timestamp AT TIME ZONE 'Asia/Baku'
    WHERE tenant_id = _tenant_id AND id = posting.id;
  UPDATE public.expenses SET account_id = account.id,cash_account_id = account.id,cash_transaction_id = posting.id,
    amount = new_amount,vat_amount = vat,category = coalesce(nullif(_payload->>'category',''),'other'),
    description = _payload->>'description',expense_date = business_date,updated_at = now()
    WHERE tenant_id = _tenant_id AND id = expense.id;
  result_payload := jsonb_build_object('expense_id',expense.id,'transaction_id',posting.id,'amount',new_amount);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'finance','expense_edited','Atomic pending expense edit',
      jsonb_build_object('before',to_jsonb(expense),'after',_payload,'result',result_payload));
  UPDATE public.operation_requests SET status = 'completed',result = result_payload,completed_at = now() WHERE id = request.id;
  RETURN result_payload;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_cash_expense_atomic(uuid,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_cash_expense_atomic(uuid,text,jsonb) TO authenticated;