-- Critical transaction, idempotency and tenant-integrity hardening.

CREATE TABLE IF NOT EXISTS public.operation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_key text NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed')),
  result jsonb,
  error_code text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, request_key)
);

ALTER TABLE public.operation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operation_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.operation_requests TO authenticated;
GRANT ALL ON public.operation_requests TO service_role;

DROP POLICY IF EXISTS operation_requests_tenant_select ON public.operation_requests;
CREATE POLICY operation_requests_tenant_select ON public.operation_requests
FOR SELECT TO authenticated
USING (private.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS operation_requests_deny_direct_write ON public.operation_requests;
CREATE POLICY operation_requests_deny_direct_write ON public.operation_requests
FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS operation_requests_cleanup_idx
  ON public.operation_requests(created_at)
  WHERE status IN ('completed', 'failed');

CREATE TABLE IF NOT EXISTS public.accounting_period_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'reopened')),
  reason text,
  locked_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  locked_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid REFERENCES auth.users(id),
  reopened_at timestamptz,
  CHECK (period_end >= period_start),
  UNIQUE (tenant_id, period_start, period_end)
);

ALTER TABLE public.accounting_period_locks ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.accounting_period_locks TO authenticated;
GRANT ALL ON public.accounting_period_locks TO service_role;

DROP POLICY IF EXISTS accounting_period_locks_select ON public.accounting_period_locks;
CREATE POLICY accounting_period_locks_select ON public.accounting_period_locks
FOR SELECT TO authenticated
USING (private.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS accounting_period_locks_deny_direct_write ON public.accounting_period_locks;
CREATE POLICY accounting_period_locks_deny_direct_write ON public.accounting_period_locks
FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION private.assert_open_accounting_period(
  _tenant_id uuid,
  _business_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.accounting_period_locks lock
    WHERE lock.tenant_id = _tenant_id
      AND lock.status = 'locked'
      AND _business_date BETWEEN lock.period_start AND lock.period_end
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'accounting_period_locked';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_finance_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  business_date date;
BEGIN
  business_date := CASE TG_TABLE_NAME
    WHEN 'expenses' THEN COALESCE(NEW.expense_date, OLD.expense_date)
    WHEN 'cash_transactions' THEN COALESCE(NEW.occurred_at, OLD.occurred_at)::date
    WHEN 'credit_payments' THEN COALESCE(NEW.paid_at, OLD.paid_at)::date
    ELSE current_date
  END;
  PERFORM private.assert_open_accounting_period(
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    business_date
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['expenses', 'cash_transactions', 'credit_payments'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_period_lock', table_name);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_finance_period_lock()',
        table_name || '_period_lock', table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.enforce_same_tenant_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE reference_tenant uuid;
BEGIN
  IF TG_TABLE_NAME = 'order_items' THEN
    SELECT tenant_id INTO reference_tenant FROM public.orders WHERE id = NEW.order_id;
  ELSIF TG_TABLE_NAME = 'credit_contracts' THEN
    SELECT tenant_id INTO reference_tenant FROM public.orders WHERE id = NEW.order_id;
  ELSIF TG_TABLE_NAME = 'stock_reservations' THEN
    SELECT tenant_id INTO reference_tenant FROM public.orders WHERE id = NEW.order_id;
  ELSIF TG_TABLE_NAME = 'delivery_items' THEN
    SELECT tenant_id INTO reference_tenant FROM public.deliveries WHERE id = NEW.delivery_id;
  END IF;

  IF reference_tenant IS NULL OR reference_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'cross_tenant_reference_denied';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['order_items', 'credit_contracts', 'stock_reservations', 'delivery_items'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_same_tenant', table_name);
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_reference()',
        table_name || '_same_tenant', table_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_sales_order_atomic(
  _tenant_id uuid,
  _request_key text,
  _order_no text,
  _customer_id uuid,
  _order_date date,
  _currency text,
  _notes text,
  _items jsonb,
  _credit jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  request_record public.operation_requests%rowtype;
  payload_hash text;
  created_order_id uuid;
  credit_id uuid;
  item jsonb;
  order_item_id uuid;
  reservation_id uuid;
  item_index integer := 0;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF trim(COALESCE(_request_key, '')) = '' OR length(_request_key) > 160 THEN
    RAISE EXCEPTION 'invalid_request_key';
  END IF;

  payload_hash := md5(jsonb_build_object(
    'order_no', _order_no, 'customer_id', _customer_id, 'order_date', _order_date,
    'currency', _currency, 'notes', _notes, 'items', _items, 'credit', _credit
  )::text);

  INSERT INTO public.operation_requests(tenant_id, request_key, operation, request_hash)
  VALUES (_tenant_id, trim(_request_key), 'create_sales_order_atomic', payload_hash)
  ON CONFLICT (tenant_id, request_key) DO NOTHING;

  SELECT * INTO request_record
  FROM public.operation_requests
  WHERE tenant_id = _tenant_id AND request_key = trim(_request_key)
  FOR UPDATE;

  IF request_record.request_hash <> payload_hash THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request_record.status = 'completed' THEN
    RETURN request_record.result;
  END IF;

  PERFORM private.assert_open_accounting_period(_tenant_id, COALESCE(_order_date, current_date));
  created_order_id := public.create_sales_order(
    _tenant_id, _order_no, _customer_id, _order_date, _currency, _notes, _items
  );

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_index := item_index + 1;
    IF NULLIF(item->>'warehouse_id', '') IS NOT NULL THEN
      SELECT id INTO order_item_id
      FROM public.order_items
      WHERE tenant_id = _tenant_id AND order_id = created_order_id
        AND line_no = COALESCE((item->>'line_no')::integer, item_index)
      LIMIT 1;

      reservation_id := public.reserve_stock(
        _tenant_id,
        (item->>'warehouse_id')::uuid,
        (item->>'product_id')::uuid,
        created_order_id,
        order_item_id,
        (item->>'qty')::numeric
      );
    END IF;
  END LOOP;

  IF _credit IS NOT NULL THEN
    credit_id := public.create_credit_contract(
      _tenant_id,
      _credit->>'contract_no',
      _customer_id,
      created_order_id,
      (_credit->>'principal')::numeric,
      COALESCE((_credit->>'initial_payment')::numeric, 0),
      (_credit->>'term_months')::integer,
      COALESCE((_credit->>'start_date')::date, _order_date, current_date)
    );
  END IF;

  result_payload := jsonb_build_object(
    'order_id', created_order_id,
    'credit_id', credit_id,
    'request_key', trim(_request_key)
  );

  UPDATE public.operation_requests
  SET status = 'completed', result = result_payload, completed_at = now()
  WHERE id = request_record.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'sales', 'atomic_create',
    trim(_order_no) || ' atomik sifariş axını tamamlandı', result_payload
  );

  RETURN result_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_atomic(uuid,text,text,uuid,date,text,text,jsonb,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_atomic(uuid,text,text,uuid,date,text,text,jsonb,jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.lock_accounting_period(
  _tenant_id uuid,
  _period_start date,
  _period_end date,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE lock_id uuid;
BEGIN
  IF NOT private.is_tenant_admin(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  INSERT INTO public.accounting_period_locks(
    tenant_id, period_start, period_end, status, reason
  ) VALUES (_tenant_id, _period_start, _period_end, 'locked', _reason)
  ON CONFLICT (tenant_id, period_start, period_end)
  DO UPDATE SET status = 'locked', reason = EXCLUDED.reason,
    locked_by = auth.uid(), locked_at = now(), reopened_by = NULL, reopened_at = NULL
  RETURNING id INTO lock_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'finance', 'period_lock',
    _period_start || ' - ' || _period_end || ' dövrü bağlandı',
    jsonb_build_object('period_lock_id', lock_id, 'reason', _reason)
  );
  RETURN lock_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_accounting_period(uuid,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_accounting_period(uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(
  _tenant_id uuid,
  _period_lock_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE period_record public.accounting_period_locks%ROWTYPE;
BEGIN
  IF NOT private.is_tenant_admin(_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF length(trim(COALESCE(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'reopen_reason_required';
  END IF;

  UPDATE public.accounting_period_locks
  SET status = 'reopened', reopened_by = auth.uid(), reopened_at = now(),
      reason = trim(_reason)
  WHERE id = _period_lock_id AND tenant_id = _tenant_id AND status = 'locked'
  RETURNING * INTO period_record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'period_lock_not_found';
  END IF;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'finance', 'period_reopen',
    period_record.period_start || ' - ' || period_record.period_end || ' dovru yeniden acildi',
    jsonb_build_object('period_lock_id', _period_lock_id, 'reason', trim(_reason))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_accounting_period(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_accounting_period(uuid,uuid,text) TO authenticated;

-- Ledger rows are reversed through controlled workflows; destructive deletes
-- are not exposed to ordinary authenticated clients.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'credit_payments', 'credit_payment_allocations', 'stock_movements',
    'cash_transactions', 'journal_entries', 'journal_lines', 'sales_cost_allocations'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS credit_contracts_portfolio_idx
  ON public.credit_contracts(tenant_id, status, start_date DESC);
CREATE INDEX IF NOT EXISTS credit_installments_due_idx
  ON public.credit_installments(tenant_id, status, due_date)
  WHERE status IN ('pending', 'partial', 'overdue');
CREATE INDEX IF NOT EXISTS cash_transactions_period_idx
  ON public.cash_transactions(tenant_id, occurred_at DESC, direction);
CREATE INDEX IF NOT EXISTS expenses_period_idx
  ON public.expenses(tenant_id, expense_date DESC, status);
CREATE INDEX IF NOT EXISTS stock_balances_availability_idx
  ON public.stock_balances(tenant_id, product_id, warehouse_id);