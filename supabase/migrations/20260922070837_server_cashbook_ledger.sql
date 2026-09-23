-- Read the complete ledger in one database snapshot, never a UI page of rows.
CREATE OR REPLACE FUNCTION public.cashbook_ledger_summary(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'finance', 'view') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  WITH ledger AS (
    SELECT t.*, (t.reversal_of IS NULL AND t.category <> 'transaction_reversal'
      AND t.category <> 'internal_transfer' AND NOT EXISTS (
        SELECT 1 FROM public.cash_transactions r
        WHERE r.tenant_id = _tenant_id AND (r.reversal_of = t.id OR
          (r.category = 'transaction_reversal' AND r.description LIKE '%REVERSAL_OF:' || t.id::text || '%'))
      )) AS external_entry
    FROM public.cash_transactions t WHERE t.tenant_id = _tenant_id
  ), accounts AS (
    SELECT a.id, a.currency,
      coalesce(a.opening_balance, 0) + coalesce(sum(CASE WHEN t.direction::text = 'in' THEN t.amount ELSE -t.amount END), 0) AS balance,
      coalesce(sum(t.amount) FILTER (WHERE t.external_entry AND t.direction::text = 'in'), 0) AS inflow,
      coalesce(sum(t.amount) FILTER (WHERE t.external_entry AND t.direction::text = 'out'), 0) AS outflow
    FROM public.cash_accounts a LEFT JOIN ledger t ON t.account_id = a.id
    WHERE a.tenant_id = _tenant_id GROUP BY a.id, a.currency, a.opening_balance
  ), currencies AS (
    SELECT currency, sum(balance) AS balance, sum(inflow) AS inflow, sum(outflow) AS outflow
    FROM accounts GROUP BY currency
  ) SELECT jsonb_build_object(
    'accounts', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM accounts a), '[]'::jsonb),
    'currencies', coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'pending', (SELECT count(*) FROM public.expenses e WHERE e.tenant_id = _tenant_id AND e.currency = c.currency AND e.status IN ('draft','pending')),
      'refundPending', (SELECT coalesce(sum(e.amount), 0) FROM public.expenses e WHERE e.tenant_id = _tenant_id AND e.currency = c.currency AND e.status = 'refund_pending')
    ) ORDER BY c.currency) FROM currencies c), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cashbook_ledger_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashbook_ledger_summary(uuid) TO authenticated;

-- Expense and outgoing ledger row succeed or roll back together.
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
  INSERT INTO public.expenses(id, tenant_id, expense_no, account_id, amount, vat_amount, currency, category, description, expense_date, status, created_by)
  VALUES (expense_id, _tenant_id, 'EXP-' || expense_id::text, account.id, amount, vat, account.currency,
    coalesce(nullif(_payload->>'category', ''), 'other'), _payload->>'description', expense_date, 'pending', auth.uid());
  INSERT INTO public.cash_transactions(id, tenant_id, transaction_no, account_id, direction, amount, currency, category, reference, description, occurred_at, created_by)
  VALUES (cash_id, _tenant_id, 'XRC-' || cash_id::text, account.id, 'out', amount, account.currency, 'expense',
    'EXPENSE:' || expense_id::text, _payload->>'description', expense_date::timestamp AT TIME ZONE 'Asia/Baku', auth.uid());
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
  -- Lock both accounts in a stable order, including opposite-direction transfers.
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
    IF expense.status NOT IN ('pending','draft','approved','paid','refund_pending','rejected') THEN RAISE EXCEPTION 'invalid_expense_status'; END IF;
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
