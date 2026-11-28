-- Opening balances for a company moving to ExERP from another system.
--
-- One command imports a whole CSV of customers, vendors, cash/bank accounts or active credits. It is
-- all-or-nothing: a bad row stops the import and names its line (opening_import_invalid: line N: reason).
-- The request key makes a repeated submit return the first result instead of importing twice.
--
-- Active credits are opening balances, not sales: the contract has no order, so it adds no revenue, cost or
-- stock movement to the pilot period. Its schedule is rebuilt from the first due date and the principal
-- already paid in the old system is allocated to the earliest instalments (no cash transaction, because
-- that money was collected before the switch). Later payments go through post_credit_payment as usual.
-- Products and stock keep using import_warehouse_stock_atomic.

CREATE OR REPLACE FUNCTION private.opening_import_fail(_line integer, _reason text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'opening_import_invalid: line %: %', _line, _reason USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION private.opening_amount(_value jsonb, _line integer, _field text, _required boolean)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v numeric;
BEGIN
  IF _value IS NULL OR jsonb_typeof(_value) = 'null' OR trim(_value #>> '{}') = '' THEN
    IF _required THEN PERFORM private.opening_import_fail(_line, _field || ' required'); END IF;
    RETURN NULL;
  END IF;
  BEGIN
    v := round((_value #>> '{}')::numeric, 2);
  EXCEPTION WHEN others THEN
    PERFORM private.opening_import_fail(_line, _field || ' is not a number');
  END;
  IF v::text IN ('NaN', 'Infinity', '-Infinity') OR v < 0 THEN
    PERFORM private.opening_import_fail(_line, _field || ' must be zero or more');
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_opening_balances(
  _tenant_id uuid, _kind text, _request_key text, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  req public.operation_requests%rowtype;
  v_module text;
  v_operation text := 'import_opening_balances:' || coalesce(_kind, '');
  row_value jsonb;
  v_pos bigint;
  line integer;
  created integer := 0;
  skipped integer := 0;
  v_result jsonb;
  -- shared
  v_name text; v_fin text; v_tax text; v_phone text; v_email text; v_address text; v_note text;
  seen jsonb := '{}'::jsonb;
  -- cash
  v_code text; v_type text; v_currency text; v_opening numeric;
  -- credits
  v_contract_no text; v_customer uuid; v_initial numeric; v_financed numeric; v_paid numeric; v_term integer;
  v_first_due date; v_credit uuid; v_regular numeric; v_last numeric; v_left numeric; v_due numeric;
  v_alloc numeric; v_inst_due date; v_status text; v_any_overdue boolean; i integer;
BEGIN
  v_module := CASE _kind WHEN 'customers' THEN 'crm' WHEN 'vendors' THEN 'vendors'
    WHEN 'cash_accounts' THEN 'finance' WHEN 'credits' THEN 'credits' END;
  IF v_module IS NULL THEN RAISE EXCEPTION 'opening_import_kind_invalid'; END IF;
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id, v_module, 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF nullif(trim(_request_key), '') IS NULL OR length(_request_key) > 160 OR jsonb_typeof(_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(_rows) < 1 OR jsonb_array_length(_rows) > 2000 THEN
    RAISE EXCEPTION 'invalid_import_request';
  END IF;

  INSERT INTO public.operation_requests(tenant_id, request_key, operation, request_hash)
    VALUES (_tenant_id, _request_key, v_operation, md5(_rows::text)) ON CONFLICT (tenant_id, request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id = _tenant_id AND request_key = _request_key FOR UPDATE;
  IF req.operation <> v_operation OR req.request_hash <> md5(_rows::text) THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF req.status = 'completed' THEN RETURN req.result; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('opening-import:' || _tenant_id::text, 0));

  FOR row_value, v_pos IN SELECT value, ord FROM jsonb_array_elements(_rows) WITH ORDINALITY AS r(value, ord) LOOP
    IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' THEN PERFORM private.opening_import_fail(v_pos::int, 'row is not an object'); END IF;
    line := coalesce(nullif(row_value->>'line', '')::integer, v_pos::int);
    v_name := nullif(trim(row_value->>'name'), '');
    v_fin := nullif(upper(trim(row_value->>'fin')), '');
    v_tax := nullif(trim(row_value->>'taxId'), '');
    v_phone := nullif(trim(row_value->>'phone'), '');
    v_email := nullif(lower(trim(row_value->>'email')), '');
    v_address := nullif(trim(row_value->>'address'), '');
    v_note := nullif(trim(row_value->>'note'), '');

    IF _kind = 'customers' THEN
      IF v_name IS NULL OR length(v_name) > 300 THEN PERFORM private.opening_import_fail(line, 'name required'); END IF;
      IF v_fin IS NOT NULL AND v_fin !~ '^[0-9A-Z]{5,10}$' THEN PERFORM private.opening_import_fail(line, 'FIN invalid'); END IF;
      IF v_fin IS NOT NULL THEN
        IF seen ? ('fin:' || v_fin) THEN PERFORM private.opening_import_fail(line, 'FIN repeated in file'); END IF;
        seen := seen || jsonb_build_object('fin:' || v_fin, line);
      END IF;
      IF v_tax IS NOT NULL THEN
        IF seen ? ('tax:' || v_tax) THEN PERFORM private.opening_import_fail(line, 'VOEN repeated in file'); END IF;
        seen := seen || jsonb_build_object('tax:' || v_tax, line);
      END IF;
      IF EXISTS (SELECT 1 FROM public.customers c WHERE c.tenant_id = _tenant_id
          AND ((v_fin IS NOT NULL AND upper(c.fin) = v_fin) OR (v_tax IS NOT NULL AND c.tax_id = v_tax))) THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;
      INSERT INTO public.customers(tenant_id, name, fin, tax_id, phone, email, address, notes, segment, created_by)
        VALUES (_tenant_id, v_name, v_fin, v_tax, v_phone, v_email, v_address, v_note,
          CASE WHEN v_tax IS NOT NULL AND v_fin IS NULL THEN 'business' ELSE 'individual' END, auth.uid());
      created := created + 1;

    ELSIF _kind = 'vendors' THEN
      IF v_name IS NULL OR length(v_name) > 300 THEN PERFORM private.opening_import_fail(line, 'name required'); END IF;
      IF seen ? ('name:' || lower(v_name)) THEN PERFORM private.opening_import_fail(line, 'vendor repeated in file'); END IF;
      seen := seen || jsonb_build_object('name:' || lower(v_name), line);
      IF EXISTS (SELECT 1 FROM public.vendors v WHERE v.tenant_id = _tenant_id
          AND ((v_tax IS NOT NULL AND v.tax_id = v_tax) OR lower(trim(v.name)) = lower(v_name))) THEN
        skipped := skipped + 1;
        CONTINUE;
      END IF;
      INSERT INTO public.vendors(tenant_id, name, tax_id, phone, email, address, is_active)
        VALUES (_tenant_id, v_name, v_tax, v_phone, v_email, v_address, true);
      created := created + 1;

    ELSIF _kind = 'cash_accounts' THEN
      v_code := nullif(upper(trim(row_value->>'code')), '');
      v_type := coalesce(nullif(lower(trim(row_value->>'type')), ''), 'cash');
      v_currency := coalesce(nullif(upper(trim(row_value->>'currency')), ''), 'AZN');
      v_opening := coalesce(private.opening_amount(row_value->'openingBalance', line, 'opening balance', false), 0);
      IF v_name IS NULL OR length(v_name) > 200 THEN PERFORM private.opening_import_fail(line, 'name required'); END IF;
      IF v_code IS NULL OR length(v_code) > 60 THEN PERFORM private.opening_import_fail(line, 'code required'); END IF;
      IF v_type NOT IN ('cash', 'bank') THEN PERFORM private.opening_import_fail(line, 'type must be cash or bank'); END IF;
      IF v_currency !~ '^[A-Z]{3}$' THEN PERFORM private.opening_import_fail(line, 'currency invalid'); END IF;
      IF seen ? ('code:' || v_code) THEN PERFORM private.opening_import_fail(line, 'code repeated in file'); END IF;
      seen := seen || jsonb_build_object('code:' || v_code, line);
      IF EXISTS (SELECT 1 FROM public.cash_accounts a WHERE a.tenant_id = _tenant_id AND upper(a.code) = v_code) THEN
        PERFORM private.opening_import_fail(line, 'account code already exists');
      END IF;
      INSERT INTO public.cash_accounts(tenant_id, code, name, type, currency, account_no, opening_balance, is_active)
        VALUES (_tenant_id, v_code, v_name, v_type, v_currency, nullif(trim(row_value->>'accountNo'), ''), v_opening, true);
      created := created + 1;

    ELSE -- credits
      v_contract_no := nullif(trim(row_value->>'contractNo'), '');
      IF v_contract_no IS NULL OR length(v_contract_no) > 60 THEN PERFORM private.opening_import_fail(line, 'contract number required'); END IF;
      -- İN-<n> numbers are allocated by the system; keep an old number of that shape recognisable instead.
      IF v_contract_no ~ '^İN-[0-9]+$' THEN v_contract_no := 'K-' || v_contract_no; END IF;
      IF seen ? ('contract:' || v_contract_no) THEN PERFORM private.opening_import_fail(line, 'contract repeated in file'); END IF;
      seen := seen || jsonb_build_object('contract:' || v_contract_no, line);
      IF EXISTS (SELECT 1 FROM public.credit_contracts c WHERE c.tenant_id = _tenant_id AND c.contract_no = v_contract_no) THEN
        PERFORM private.opening_import_fail(line, 'contract already exists');
      END IF;
      IF v_fin IS NULL AND v_tax IS NULL THEN PERFORM private.opening_import_fail(line, 'customer FIN or VOEN required'); END IF;
      SELECT c.id INTO v_customer FROM public.customers c WHERE c.tenant_id = _tenant_id
        AND ((v_fin IS NOT NULL AND upper(c.fin) = v_fin) OR (v_fin IS NULL AND c.tax_id = v_tax))
        ORDER BY c.created_at, c.id LIMIT 1;
      IF v_customer IS NULL THEN PERFORM private.opening_import_fail(line, 'customer not found (import customers first)'); END IF;
      v_initial := coalesce(private.opening_amount(row_value->'initialPayment', line, 'initial payment', false), 0);
      v_financed := private.opening_amount(row_value->'financed', line, 'financed amount', true);
      v_paid := coalesce(private.opening_amount(row_value->'paidPrincipal', line, 'paid principal', false), 0);
      BEGIN
        v_term := (row_value->>'termMonths')::integer;
        v_first_due := (row_value->>'firstDueDate')::date;
      EXCEPTION WHEN others THEN
        PERFORM private.opening_import_fail(line, 'term or first due date invalid');
      END;
      IF v_financed IS NULL OR v_financed <= 0 THEN PERFORM private.opening_import_fail(line, 'financed amount must be more than zero'); END IF;
      IF v_term IS NULL OR v_term < 1 OR v_term > 120 THEN PERFORM private.opening_import_fail(line, 'term must be 1-120 months'); END IF;
      IF v_first_due IS NULL OR v_first_due < DATE '2000-01-01' OR v_first_due > current_date + 3650 THEN
        PERFORM private.opening_import_fail(line, 'first due date invalid');
      END IF;
      IF v_paid >= v_financed THEN PERFORM private.opening_import_fail(line, 'credit already fully paid; do not import'); END IF;

      INSERT INTO public.credit_contracts(tenant_id, customer_id, order_id, contract_no, principal, initial_payment,
          required_initial, term_months, start_date, status, created_by)
        VALUES (_tenant_id, v_customer, NULL, v_contract_no, v_initial + v_financed, v_initial, v_initial, v_term,
          (v_first_due - interval '1 month')::date, 'active', auth.uid())
        RETURNING id INTO v_credit;

      -- Same split as start_credit_contract: whole manats, remainder on the last instalment.
      v_regular := ceil(v_financed / v_term);
      v_last := v_financed - v_regular * (v_term - 1);
      IF v_last <= 0 THEN
        v_regular := floor(v_financed / v_term);
        v_last := v_financed - v_regular * (v_term - 1);
      END IF;
      v_left := v_paid;
      v_any_overdue := false;
      FOR i IN 1..v_term LOOP
        v_due := CASE WHEN i = v_term THEN v_last ELSE v_regular END;
        v_alloc := least(v_left, v_due);
        v_left := v_left - v_alloc;
        v_inst_due := (v_first_due + make_interval(months => i - 1))::date;
        v_status := CASE WHEN v_alloc >= v_due THEN 'paid' WHEN v_inst_due < current_date THEN 'overdue'
          WHEN v_alloc > 0 THEN 'partial' ELSE 'pending' END;
        v_any_overdue := v_any_overdue OR v_status = 'overdue';
        INSERT INTO public.credit_installments(tenant_id, credit_id, installment_no, due_date, principal_due,
            principal_paid, status, paid_at)
          VALUES (_tenant_id, v_credit, i, v_inst_due, v_due, v_alloc, v_status,
            CASE WHEN v_status = 'paid' THEN now() END);
      END LOOP;
      IF v_any_overdue THEN
        UPDATE public.credit_contracts SET status = 'overdue' WHERE id = v_credit AND tenant_id = _tenant_id;
      END IF;
      created := created + 1;
    END IF;
  END LOOP;

  v_result := jsonb_build_object('kind', _kind, 'row_count', jsonb_array_length(_rows), 'created', created, 'skipped', skipped);
  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
    VALUES (gen_random_uuid()::text, _tenant_id, auth.uid(), v_module, 'opening_import',
      'Başlanğıc qalıq idxalı: ' || _kind, v_result);
  UPDATE public.operation_requests SET status = 'completed', completed_at = now(), result = v_result WHERE id = req.id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION private.opening_import_fail(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.opening_amount(jsonb, integer, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_opening_balances(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_opening_balances(uuid, text, text, jsonb) TO authenticated, service_role;
