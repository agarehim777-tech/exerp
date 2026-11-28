-- Ledger tables are written only by server commands.
--
-- Any user with edit on a module could change its ledger rows directly through the REST API: stock balances
-- and movements, credit contracts, instalments and payments, cash transactions, and (creator or admin) any
-- column of an order, bypassing the commands that keep balances, schedules, cash and accounting in step.
-- Stock reservations and deliveries could even be written by every member of the company.
-- The app writes these tables only through SECURITY DEFINER commands, which keep working. The four direct
-- writes it still made move to commands here:
--   * manual cash in/out            -> post_manual_cash_transaction
--   * order customer/date/notes     -> update_sales_order_header (status stays on process_sales_order_status)
--   * credit collection stage       -> set_credit_collection_stage
--   * stock minimum level           -> column grant on stock_balances.minimum_level only
-- Every trigger that writes these tables is SECURITY DEFINER, so client writes that remain allowed elsewhere
-- (customers, products, expenses, ...) are not affected.

REVOKE INSERT, UPDATE, DELETE ON
  public.orders, public.order_items,
  public.credit_contracts, public.credit_installments, public.credit_payments,
  public.cash_transactions,
  public.stock_balances, public.stock_movements, public.stock_reservations,
  public.deliveries
FROM authenticated, anon;

-- The reorder point is a setting on the balance row, not a quantity; it stays editable (RLS: warehouse edit).
GRANT UPDATE (minimum_level) ON public.stock_balances TO authenticated;

-- Manual cash in/out (the cashbook form). transaction_no is the idempotency key: a retry of the same entry
-- returns the first row, a different entry under the same number is rejected. System categories (sales,
-- credit, receivable payments, transfers) are written only by their own commands.
CREATE OR REPLACE FUNCTION public.post_manual_cash_transaction(
  _tenant_id uuid, _transaction_no text, _account_id uuid, _direction text, _amount numeric,
  _category text, _description text DEFAULT NULL, _customer_id uuid DEFAULT NULL,
  _counterparty text DEFAULT NULL, _occurred_at date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.cash_accounts%rowtype;
  v_existing public.cash_transactions%rowtype;
  v_id uuid;
  v_amount numeric := round(_amount, 2);
  v_category text := nullif(trim(_category), '');
  v_no text := nullif(trim(_transaction_no), '');
  v_counterparty text := nullif(trim(_counterparty), '');
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id, 'finance', 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF v_no IS NULL OR length(v_no) > 80 THEN RAISE EXCEPTION 'cash_transaction_no_required'; END IF;
  IF _direction NOT IN ('in', 'out') THEN RAISE EXCEPTION 'cash_direction_invalid'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR _amount::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'cash_amount_invalid';
  END IF;
  IF v_category IS NULL OR length(v_category) > 120 THEN RAISE EXCEPTION 'cash_category_required'; END IF;
  IF lower(v_category) IN ('sales_payment', 'credit_payment', 'credit_initial', 'receivable_payment',
      'internal_transfer', 'vendor_payment', 'expense', 'invoice_payment', 'sales_refund', 'salary', 'payroll') THEN
    RAISE EXCEPTION 'cash_category_reserved';
  END IF;

  SELECT * INTO v_existing FROM public.cash_transactions WHERE tenant_id = _tenant_id AND transaction_no = v_no;
  IF FOUND THEN
    IF v_existing.account_id = _account_id AND v_existing.direction = _direction AND v_existing.amount = v_amount
      AND v_existing.category = v_category THEN
      RETURN v_existing.id;
    END IF;
    RAISE EXCEPTION 'cash_transaction_no_taken';
  END IF;

  SELECT * INTO v_account FROM public.cash_accounts WHERE id = _account_id AND tenant_id = _tenant_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
  IF _customer_id IS NOT NULL THEN
    SELECT coalesce(v_counterparty, c.name) INTO v_counterparty FROM public.customers c
      WHERE c.id = _customer_id AND c.tenant_id = _tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  END IF;

  INSERT INTO public.cash_transactions(tenant_id, account_id, transaction_no, direction, amount, category,
      description, occurred_at, customer_id, counterparty, currency)
    VALUES (_tenant_id, _account_id, v_no, _direction, v_amount, v_category, nullif(trim(_description), ''),
      coalesce(_occurred_at::timestamptz, now()), _customer_id, v_counterparty, v_account.currency)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Order header edits that do not touch money or stock. Changing the customer of an order that has a credit
-- contract or an invoice would leave those on the old customer, so it is refused; both dates must be in an
-- open accounting period. Status changes go through process_sales_order_status.
CREATE OR REPLACE FUNCTION public.update_sales_order_header(
  _tenant_id uuid, _order_id uuid, _customer_id uuid, _order_date date, _notes text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id, 'sales', 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status::text = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled'; END IF;
  IF _customer_id IS NOT NULL AND _customer_id IS DISTINCT FROM v_order.customer_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _customer_id AND tenant_id = _tenant_id) THEN
      RAISE EXCEPTION 'customer_not_found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.credit_contracts WHERE order_id = _order_id AND tenant_id = _tenant_id
          AND status::text <> 'cancelled')
      OR EXISTS (SELECT 1 FROM public.sales_invoices WHERE order_id = _order_id AND tenant_id = _tenant_id
          AND status::text <> 'cancelled') THEN
      RAISE EXCEPTION 'order_customer_locked';
    END IF;
  END IF;
  IF _order_date IS NOT NULL AND _order_date IS DISTINCT FROM v_order.order_date THEN
    PERFORM private.assert_open_accounting_period(_tenant_id, v_order.order_date);
    PERFORM private.assert_open_accounting_period(_tenant_id, _order_date);
  END IF;
  UPDATE public.orders SET
      customer_id = coalesce(_customer_id, customer_id),
      order_date = coalesce(_order_date, order_date),
      notes = nullif(trim(_notes), '')
    WHERE id = _order_id AND tenant_id = _tenant_id;
END;
$$;

-- Collection stage of a credit, with its adjustment and collection-event history in the same transaction.
CREATE OR REPLACE FUNCTION public.set_credit_collection_stage(
  _tenant_id uuid, _credit_id uuid, _stage text, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old text;
  v_reason text := coalesce(nullif(trim(_reason), ''), 'Kolleksiya mərhələsi yeniləndi');
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id, 'credits', 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF _stage NOT IN ('current', 'reminder', 'soft_collection', 'hard_collection', 'legal', 'restructured', 'closed') THEN
    RAISE EXCEPTION 'credit_collection_stage_invalid';
  END IF;
  SELECT collection_stage INTO v_old FROM public.credit_contracts
    WHERE id = _credit_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF v_old = _stage THEN RETURN; END IF;
  UPDATE public.credit_contracts SET collection_stage = _stage WHERE id = _credit_id AND tenant_id = _tenant_id;
  INSERT INTO public.credit_adjustments(tenant_id, credit_id, adjustment_type, old_value, new_value, reason)
    VALUES (_tenant_id, _credit_id, 'collection', jsonb_build_object('collection_stage', v_old),
      jsonb_build_object('collection_stage', _stage), v_reason);
  INSERT INTO public.credit_collection_events(tenant_id, credit_id, stage, outcome, note)
    VALUES (_tenant_id, _credit_id, _stage, 'Mərhələ yeniləndi', nullif(trim(_reason), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.post_manual_cash_transaction(uuid, text, uuid, text, numeric, text, text, uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_sales_order_header(uuid, uuid, uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_credit_collection_stage(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_manual_cash_transaction(uuid, text, uuid, text, numeric, text, text, uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_sales_order_header(uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_credit_collection_stage(uuid, uuid, text, text) TO authenticated, service_role;
