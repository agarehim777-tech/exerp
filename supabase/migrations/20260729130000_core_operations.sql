-- Normalize the critical ERP ledgers. Mutations that affect more than one
-- balance are exposed as RPCs and execute in a single PostgreSQL transaction.

CREATE TABLE IF NOT EXISTS public.credit_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_no TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  principal NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  initial_payment NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (initial_payment >= 0),
  term_months INTEGER NOT NULL CHECK (term_months IN (2,3,4,5,6,12,18,24,36,48)),
  start_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','overdue','closed','cancelled')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, contract_no),
  UNIQUE (tenant_id, order_id),
  CHECK (initial_payment <= principal)
);

CREATE TABLE IF NOT EXISTS public.credit_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL CHECK (installment_no > 0),
  due_date DATE NOT NULL,
  principal_due NUMERIC(14,2) NOT NULL CHECK (principal_due >= 0),
  principal_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_paid >= 0),
  penalty_due NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_due >= 0),
  penalty_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_paid >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','partial','paid','overdue','waived')),
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (credit_id, installment_no),
  CHECK (principal_paid <= principal_due),
  CHECK (penalty_paid <= penalty_due)
);

CREATE TABLE IF NOT EXISTS public.credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  credit_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE RESTRICT,
  receipt_no TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  penalty_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
  unallocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  UNIQUE (tenant_id, receipt_no),
  CHECK (amount = principal_amount + penalty_amount + unallocated_amount)
);

CREATE TABLE IF NOT EXISTS public.credit_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.credit_payments(id) ON DELETE CASCADE,
  installment_id UUID NOT NULL REFERENCES public.credit_installments(id) ON DELETE RESTRICT,
  principal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  penalty_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
  CHECK (principal_amount + penalty_amount > 0)
);

CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.stock_balances (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  on_hand NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  minimum_level NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (minimum_level >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, warehouse_id, product_id),
  CHECK (reserved <= on_hand)
);

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','released','fulfilled','cancelled')),
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  delivery_no TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','delivered','cancelled')),
  recipient_name TEXT,
  recipient_document TEXT,
  delivered_at TIMESTAMPTZ,
  delivered_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, delivery_no),
  UNIQUE (tenant_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  reservation_id UUID NOT NULL REFERENCES public.stock_reservations(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('receipt','reservation','release','delivery','transfer_in',
                      'transfer_out','adjustment','write_off')
  ),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity <> 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  reference_type TEXT,
  reference_id UUID,
  note TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cash_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AZN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  transaction_no TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  UNIQUE (tenant_id, transaction_no)
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  expense_no TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft','pending','approved','paid','rejected','cancelled')),
  expense_date DATE NOT NULL DEFAULT current_date,
  description TEXT,
  cash_account_id UUID REFERENCES public.cash_accounts(id) ON DELETE RESTRICT,
  cash_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, expense_no)
);

DO $$
DECLARE
  item RECORD;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('credit_contracts','credits'),('credit_installments','credits'),
    ('credit_payments','credits'),('credit_payment_allocations','credits'),
    ('warehouses','warehouse'),('stock_balances','warehouse'),
    ('stock_reservations','warehouse'),('deliveries','deliveries'),
    ('delivery_items','deliveries'),('stock_movements','warehouse'),
    ('cash_accounts','finance'),('cash_transactions','finance'),('expenses','finance')
  ) AS x(table_name, module_name)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', item.table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
       USING (private.is_tenant_member(tenant_id, auth.uid()))',
      item.table_name || '_tenant_select', item.table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
       USING (private.has_module_access(tenant_id, %L, ''edit''))
       WITH CHECK (private.has_module_access(tenant_id, %L, ''edit''))',
      item.table_name || '_tenant_write', item.table_name,
      item.module_name, item.module_name
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS credit_contract_customer_idx
  ON public.credit_contracts(tenant_id, customer_id, status);
CREATE INDEX IF NOT EXISTS credit_installment_due_idx
  ON public.credit_installments(tenant_id, due_date, status);
CREATE INDEX IF NOT EXISTS credit_payment_credit_idx
  ON public.credit_payments(tenant_id, credit_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS stock_reservation_order_idx
  ON public.stock_reservations(tenant_id, order_id, status);
CREATE INDEX IF NOT EXISTS stock_movement_product_idx
  ON public.stock_movements(tenant_id, warehouse_id, product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_sales_order(
  _tenant_id UUID,
  _order_no TEXT,
  _customer_id UUID,
  _order_date DATE,
  _currency TEXT,
  _notes TEXT,
  _items JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  order_id UUID;
  item JSONB;
  subtotal_value NUMERIC(14,2) := 0;
  vat_value NUMERIC(14,2) := 0;
  line_net NUMERIC(14,2);
  line_vat NUMERIC(14,2);
  line_total_value NUMERIC(14,2);
  item_count INTEGER := 0;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF trim(COALESCE(_order_no, '')) = '' OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    IF COALESCE((item->>'qty')::NUMERIC, 0) <= 0
       OR COALESCE((item->>'unit_price')::NUMERIC, 0) < 0 THEN
      RAISE EXCEPTION 'invalid_order_line';
    END IF;
    line_net := round(
      (item->>'qty')::NUMERIC * (item->>'unit_price')::NUMERIC
      * (1 - COALESCE((item->>'discount_pct')::NUMERIC, 0) / 100), 2
    );
    line_vat := round(line_net * COALESCE((item->>'vat_rate')::NUMERIC, 0) / 100, 2);
    subtotal_value := subtotal_value + line_net;
    vat_value := vat_value + line_vat;
  END LOOP;

  INSERT INTO public.orders(
    tenant_id, order_no, customer_id, order_date, status, currency,
    subtotal, vat_total, total, notes
  ) VALUES (
    _tenant_id, trim(_order_no), _customer_id, COALESCE(_order_date, current_date),
    'draft', COALESCE(NULLIF(trim(_currency), ''), 'AZN'),
    subtotal_value, vat_value, subtotal_value + vat_value, _notes
  ) RETURNING id INTO order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    item_count := item_count + 1;
    line_net := round(
      (item->>'qty')::NUMERIC * (item->>'unit_price')::NUMERIC
      * (1 - COALESCE((item->>'discount_pct')::NUMERIC, 0) / 100), 2
    );
    line_vat := round(line_net * COALESCE((item->>'vat_rate')::NUMERIC, 0) / 100, 2);
    line_total_value := line_net + line_vat;

    INSERT INTO public.order_items(
      tenant_id, order_id, product_id, line_no, description, qty,
      unit_price, discount_pct, vat_rate, line_total
    ) VALUES (
      _tenant_id, order_id, NULLIF(item->>'product_id', '')::UUID,
      COALESCE((item->>'line_no')::INTEGER, item_count), item->>'description',
      (item->>'qty')::NUMERIC, (item->>'unit_price')::NUMERIC,
      COALESCE((item->>'discount_pct')::NUMERIC, 0),
      COALESCE((item->>'vat_rate')::NUMERIC, 0), line_total_value
    );
  END LOOP;

  INSERT INTO public.audit_events(
    id, tenant_id, actor_id, module, action, detail, payload
  ) VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'sales', 'create',
    trim(_order_no) || ' sifarişi yaradıldı',
    jsonb_build_object('order_id', order_id, 'line_count', item_count,
                       'total', subtotal_value + vat_value)
  );
  RETURN order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_credit_contract(
  _tenant_id UUID,
  _contract_no TEXT,
  _customer_id UUID,
  _order_id UUID,
  _principal NUMERIC,
  _initial_payment NUMERIC,
  _term_months INTEGER,
  _start_date DATE
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  credit_id UUID;
  financed NUMERIC(14,2);
  regular_amount NUMERIC(14,2);
  last_amount NUMERIC(14,2);
  installment_no INTEGER;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _term_months NOT IN (2,3,4,5,6,12,18,24,36,48) THEN
    RAISE EXCEPTION 'invalid_credit_term';
  END IF;

  financed := round(_principal - COALESCE(_initial_payment, 0), 2);
  IF financed <= 0 THEN RAISE EXCEPTION 'invalid_financed_amount'; END IF;

  -- Whole AZN installments are used where possible; the remainder is placed
  -- in the final installment (1200 - 100 => 11 x 92 + 88).
  regular_amount := ceil(financed / _term_months);
  last_amount := financed - regular_amount * (_term_months - 1);
  IF last_amount <= 0 THEN
    regular_amount := floor(financed / _term_months);
    last_amount := financed - regular_amount * (_term_months - 1);
  END IF;

  INSERT INTO public.credit_contracts(
    tenant_id, contract_no, customer_id, order_id, principal,
    initial_payment, term_months, start_date
  ) VALUES (
    _tenant_id, trim(_contract_no), _customer_id, _order_id, _principal,
    COALESCE(_initial_payment, 0), _term_months, _start_date
  ) RETURNING id INTO credit_id;

  FOR installment_no IN 1.._term_months LOOP
    INSERT INTO public.credit_installments(
      tenant_id, credit_id, installment_no, due_date, principal_due
    ) VALUES (
      _tenant_id, credit_id, installment_no,
      (_start_date + make_interval(months => installment_no))::date,
      CASE WHEN installment_no = _term_months THEN last_amount ELSE regular_amount END
    );
  END LOOP;

  INSERT INTO public.audit_events(
    id, tenant_id, actor_id, module, action, detail, payload
  ) VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'create',
    trim(_contract_no) || ' kredit müqaviləsi yaradıldı',
    jsonb_build_object('credit_id', credit_id, 'order_id', _order_id)
  );
  RETURN credit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_stock(
  _tenant_id UUID,
  _warehouse_id UUID,
  _product_id UUID,
  _quantity NUMERIC,
  _unit_cost NUMERIC,
  _reference_type TEXT DEFAULT NULL,
  _reference_id UUID DEFAULT NULL,
  _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE movement_id UUID;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'warehouse', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _quantity <= 0 OR COALESCE(_unit_cost, 0) < 0 THEN
    RAISE EXCEPTION 'invalid_stock_receipt';
  END IF;

  INSERT INTO public.stock_balances(
    tenant_id, warehouse_id, product_id, on_hand, reserved
  ) VALUES (_tenant_id, _warehouse_id, _product_id, _quantity, 0)
  ON CONFLICT (tenant_id, warehouse_id, product_id)
  DO UPDATE SET on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand,
                updated_at = now();

  INSERT INTO public.stock_movements(
    tenant_id, warehouse_id, product_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, note
  ) VALUES (
    _tenant_id, _warehouse_id, _product_id, 'receipt', _quantity,
    COALESCE(_unit_cost, 0), _reference_type, _reference_id, _note
  ) RETURNING id INTO movement_id;

  INSERT INTO public.audit_events(
    id, tenant_id, actor_id, module, action, detail, payload
  ) VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'warehouse', 'receipt',
    'Anbara mədaxil qeydə alındı',
    jsonb_build_object('movement_id', movement_id, 'product_id', _product_id,
                       'warehouse_id', _warehouse_id, 'quantity', _quantity)
  );
  RETURN movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_credit_payment(
  _tenant_id UUID,
  _credit_id UUID,
  _receipt_no TEXT,
  _amount NUMERIC,
  _penalty_amount NUMERIC,
  _cash_account_id UUID,
  _payment_method TEXT DEFAULT 'cash',
  _note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  payment_id UUID;
  principal_budget NUMERIC(14,2);
  penalty_budget NUMERIC(14,2);
  principal_applied NUMERIC(14,2) := 0;
  penalty_applied NUMERIC(14,2) := 0;
  amount_to_apply NUMERIC(14,2);
  installment RECORD;
  remaining_principal NUMERIC(14,2);
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _amount <= 0 OR COALESCE(_penalty_amount, 0) < 0
     OR COALESCE(_penalty_amount, 0) > _amount THEN
    RAISE EXCEPTION 'invalid_payment_amount';
  END IF;

  PERFORM 1 FROM public.credit_contracts
  WHERE id = _credit_id AND tenant_id = _tenant_id
    AND status IN ('active','overdue') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_payable'; END IF;

  principal_budget := _amount - COALESCE(_penalty_amount, 0);
  penalty_budget := COALESCE(_penalty_amount, 0);

  INSERT INTO public.credit_payments(
    tenant_id, credit_id, receipt_no, amount, unallocated_amount,
    payment_method, note
  ) VALUES (
    _tenant_id, _credit_id, trim(_receipt_no), _amount, _amount,
    _payment_method, _note
  ) RETURNING id INTO payment_id;

  FOR installment IN
    SELECT * FROM public.credit_installments
    WHERE tenant_id = _tenant_id AND credit_id = _credit_id
      AND (principal_paid < principal_due OR penalty_paid < penalty_due)
    ORDER BY installment_no FOR UPDATE
  LOOP
    EXIT WHEN principal_budget <= 0 AND penalty_budget <= 0;

    amount_to_apply := LEAST(
      penalty_budget, installment.penalty_due - installment.penalty_paid
    );
    IF amount_to_apply > 0 THEN
      UPDATE public.credit_installments
      SET penalty_paid = penalty_paid + amount_to_apply
      WHERE id = installment.id;
      INSERT INTO public.credit_payment_allocations(
        tenant_id, payment_id, installment_id, penalty_amount
      ) VALUES (_tenant_id, payment_id, installment.id, amount_to_apply);
      penalty_budget := penalty_budget - amount_to_apply;
      penalty_applied := penalty_applied + amount_to_apply;
    END IF;

    amount_to_apply := LEAST(
      principal_budget, installment.principal_due - installment.principal_paid
    );
    IF amount_to_apply > 0 THEN
      UPDATE public.credit_installments
      SET principal_paid = principal_paid + amount_to_apply,
          paid_at = CASE WHEN principal_paid + amount_to_apply >= principal_due
                         THEN now() ELSE paid_at END,
          status = CASE WHEN principal_paid + amount_to_apply >= principal_due
                        THEN 'paid' ELSE 'partial' END,
          updated_at = now()
      WHERE id = installment.id;
      INSERT INTO public.credit_payment_allocations(
        tenant_id, payment_id, installment_id, principal_amount
      ) VALUES (_tenant_id, payment_id, installment.id, amount_to_apply);
      principal_budget := principal_budget - amount_to_apply;
      principal_applied := principal_applied + amount_to_apply;
    END IF;
  END LOOP;

  UPDATE public.credit_payments
  SET principal_amount = principal_applied,
      penalty_amount = penalty_applied,
      unallocated_amount = _amount - principal_applied - penalty_applied
  WHERE id = payment_id;

  INSERT INTO public.cash_transactions(
    tenant_id, account_id, transaction_no, direction, amount, category,
    reference_type, reference_id, description
  ) VALUES (
    _tenant_id, _cash_account_id, 'CT-' || replace(gen_random_uuid()::text, '-', ''),
    'in', _amount, 'credit_payment', 'credit_payment', payment_id,
    trim(_receipt_no) || ' kredit ödənişi'
  );

  SELECT COALESCE(sum(principal_due - principal_paid), 0)
  INTO remaining_principal FROM public.credit_installments
  WHERE tenant_id = _tenant_id AND credit_id = _credit_id;

  IF remaining_principal = 0 THEN
    UPDATE public.credit_contracts
    SET status = 'closed', closed_at = now(), closed_by = auth.uid(), updated_at = now()
    WHERE id = _credit_id AND tenant_id = _tenant_id;
  END IF;

  INSERT INTO public.audit_events(
    id, tenant_id, actor_id, module, action, detail, payload
  ) VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'payment',
    trim(_receipt_no) || ' ödənişi qəbul edildi',
    jsonb_build_object(
      'credit_id', _credit_id, 'payment_id', payment_id, 'amount', _amount,
      'principal', principal_applied, 'penalty', penalty_applied,
      'unallocated', _amount - principal_applied - penalty_applied
    )
  );
  RETURN payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_stock(
  _tenant_id UUID,
  _warehouse_id UUID,
  _product_id UUID,
  _order_id UUID,
  _order_item_id UUID,
  _quantity NUMERIC
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  reservation_id UUID;
  available_quantity NUMERIC(14,3);
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'warehouse', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _quantity <= 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;

  SELECT on_hand - reserved INTO available_quantity
  FROM public.stock_balances
  WHERE tenant_id = _tenant_id AND warehouse_id = _warehouse_id
    AND product_id = _product_id FOR UPDATE;
  IF available_quantity IS NULL OR available_quantity < _quantity THEN
    RAISE EXCEPTION 'insufficient_available_stock';
  END IF;

  INSERT INTO public.stock_reservations(
    tenant_id, warehouse_id, product_id, order_id, order_item_id, quantity
  ) VALUES (
    _tenant_id, _warehouse_id, _product_id, _order_id, _order_item_id, _quantity
  ) RETURNING id INTO reservation_id;

  UPDATE public.stock_balances
  SET reserved = reserved + _quantity, updated_at = now()
  WHERE tenant_id = _tenant_id AND warehouse_id = _warehouse_id
    AND product_id = _product_id;

  INSERT INTO public.stock_movements(
    tenant_id, warehouse_id, product_id, movement_type, quantity,
    reference_type, reference_id
  ) VALUES (
    _tenant_id, _warehouse_id, _product_id, 'reservation', _quantity,
    'stock_reservation', reservation_id
  );
  RETURN reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_delivery(
  _tenant_id UUID,
  _delivery_id UUID,
  _recipient_name TEXT,
  _recipient_document TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  delivery_record RECORD;
  item RECORD;
  item_count INTEGER := 0;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'deliveries', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO delivery_record FROM public.deliveries
  WHERE id = _delivery_id AND tenant_id = _tenant_id
    AND status IN ('pending','ready') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery_not_available'; END IF;

  FOR item IN
    SELECT di.*, sr.status reservation_status, sr.quantity reserved_quantity
    FROM public.delivery_items di
    JOIN public.stock_reservations sr ON sr.id = di.reservation_id
    WHERE di.delivery_id = _delivery_id AND di.tenant_id = _tenant_id
    FOR UPDATE OF di, sr
  LOOP
    item_count := item_count + 1;
    IF item.reservation_status <> 'active' OR item.reserved_quantity < item.quantity THEN
      RAISE EXCEPTION 'delivery_item_not_fully_reserved';
    END IF;

    UPDATE public.stock_balances
    SET on_hand = on_hand - item.quantity,
        reserved = reserved - item.quantity,
        updated_at = now()
    WHERE tenant_id = _tenant_id
      AND warehouse_id = delivery_record.warehouse_id
      AND product_id = item.product_id
      AND on_hand >= item.quantity AND reserved >= item.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'stock_balance_conflict'; END IF;

    UPDATE public.stock_reservations
    SET status = 'fulfilled', updated_at = now()
    WHERE id = item.reservation_id;

    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      reference_type, reference_id
    ) VALUES (
      _tenant_id, delivery_record.warehouse_id, item.product_id,
      'delivery', -item.quantity, 'delivery', _delivery_id
    );
  END LOOP;
  IF item_count = 0 THEN RAISE EXCEPTION 'delivery_has_no_items'; END IF;

  UPDATE public.deliveries
  SET status = 'delivered', delivered_at = now(), delivered_by = auth.uid(),
      recipient_name = trim(_recipient_name),
      recipient_document = _recipient_document, updated_at = now()
  WHERE id = _delivery_id;

  UPDATE public.orders SET status = 'delivered', updated_at = now()
  WHERE id = delivery_record.order_id AND tenant_id = _tenant_id;

  INSERT INTO public.audit_events(
    id, tenant_id, actor_id, module, action, detail, payload
  ) VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'deliveries', 'complete',
    delivery_record.delivery_no || ' təhvil verildi',
    jsonb_build_object('delivery_id', _delivery_id, 'order_id', delivery_record.order_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_expense(
  _tenant_id UUID,
  _expense_id UUID,
  _cash_account_id UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  expense_record RECORD;
  transaction_id UUID;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'finance', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO expense_record FROM public.expenses
  WHERE id = _expense_id AND tenant_id = _tenant_id AND status = 'approved'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense_not_payable'; END IF;

  INSERT INTO public.cash_transactions(
    tenant_id, account_id, transaction_no, direction, amount, category,
    reference_type, reference_id, description
  ) VALUES (
    _tenant_id, _cash_account_id, 'CT-' || replace(gen_random_uuid()::text, '-', ''),
    'out', expense_record.amount, expense_record.category, 'expense', _expense_id,
    expense_record.description
  ) RETURNING id INTO transaction_id;

  UPDATE public.expenses
  SET status = 'paid', cash_account_id = _cash_account_id,
      cash_transaction_id = transaction_id, updated_at = now()
  WHERE id = _expense_id;

  INSERT INTO public.audit_events(
    id, tenant_id, actor_id, module, action, detail, payload
  ) VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'finance', 'expense_payment',
    expense_record.expense_no || ' xərci ödənildi',
    jsonb_build_object('expense_id', _expense_id, 'transaction_id', transaction_id,
                       'amount', expense_record.amount)
  );
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_credit_contract(UUID,TEXT,UUID,UUID,NUMERIC,NUMERIC,INTEGER,DATE)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sales_order(UUID,TEXT,UUID,DATE,TEXT,TEXT,JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_stock(UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,UUID,TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_credit_payment(UUID,UUID,TEXT,NUMERIC,NUMERIC,UUID,TEXT,TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_stock(UUID,UUID,UUID,UUID,UUID,NUMERIC)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_delivery(UUID,UUID,TEXT,TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_expense(UUID,UUID,UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_credit_contract(UUID,TEXT,UUID,UUID,NUMERIC,NUMERIC,INTEGER,DATE)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_order(UUID,TEXT,UUID,DATE,TEXT,TEXT,JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock(UUID,UUID,UUID,NUMERIC,NUMERIC,TEXT,UUID,TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_credit_payment(UUID,UUID,TEXT,NUMERIC,NUMERIC,UUID,TEXT,TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stock(UUID,UUID,UUID,UUID,UUID,NUMERIC)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(UUID,UUID,TEXT,TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_expense(UUID,UUID,UUID)
  TO authenticated;
