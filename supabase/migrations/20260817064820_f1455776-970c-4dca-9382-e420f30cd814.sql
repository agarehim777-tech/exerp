-- 20260816206000_fix_order_payment_status_enum.sql
CREATE OR REPLACE FUNCTION public.register_order_payment(
  _order_id uuid,
  _amount numeric,
  _account_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%rowtype;
  account_row public.cash_accounts%rowtype;
  transaction_id uuid;
  next_paid numeric;
  transaction_number text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR NOT public.is_tenant_member(o.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _amount IS NULL OR _amount <= 0
     OR COALESCE(o.paid_amount, 0) + _amount > o.total + 0.009 THEN
    RAISE EXCEPTION 'Ödəniş məbləği düzgün deyil';
  END IF;
  SELECT * INTO account_row FROM public.cash_accounts
   WHERE id = _account_id AND tenant_id = o.tenant_id AND is_active = true
   FOR UPDATE;
  IF account_row.id IS NULL THEN RAISE EXCEPTION 'Kassa tapılmadı'; END IF;

  transaction_number := 'KAS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  INSERT INTO public.cash_transactions(
    tenant_id, account_id, transaction_no, direction, amount, currency,
    category, customer_id, reference, description, occurred_at, created_by
  ) VALUES (
    o.tenant_id, account_row.id, transaction_number, 'in', round(_amount, 2),
    o.currency, 'sales_payment', o.customer_id, o.order_no,
    o.order_no || ' sifarişi üzrə ödəniş', current_date, auth.uid()
  ) RETURNING id INTO transaction_id;

  next_paid := round(COALESCE(o.paid_amount, 0) + _amount, 2);
  UPDATE public.orders
     SET paid_amount = next_paid,
         payment_status = CASE
           WHEN next_paid >= total THEN 'paid'::public.payment_status
           WHEN next_paid > 0 THEN 'partial'::public.payment_status
           ELSE 'unpaid'::public.payment_status
         END,
         updated_at = now()
   WHERE id = o.id;
  RETURN transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.register_order_payment(uuid,numeric,uuid) TO authenticated,service_role;

-- 20260816207000_simplify_sales_delivery_flow.sql
CREATE OR REPLACE FUNCTION public.normalize_sales_order_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text IN ('draft', 'pending', 'processing', 'shipped') THEN
    NEW.status := 'confirmed'::public.order_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_sales_order_status ON public.orders;
CREATE TRIGGER trg_normalize_sales_order_status
BEFORE INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.normalize_sales_order_status();

UPDATE public.orders
   SET status = 'confirmed'::public.order_status,
       updated_at = now()
 WHERE status::text IN ('draft', 'pending', 'processing', 'shipped');

CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _tenant uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.orders WHERE id = _order_id;
  IF _tenant IS NULL OR NOT (
    private.has_module_access(_tenant, 'delivery', 'edit')
    OR private.has_module_access(_tenant, 'warehouse', 'edit')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  UPDATE public.orders
     SET status = 'delivered'::public.order_status,
         updated_at = now()
   WHERE id = _order_id AND tenant_id = _tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated, service_role;

-- 20260816209000_fulfill_stock_on_sales_delivery.sql
CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  fulfilled_count integer := 0;
BEGIN
  SELECT * INTO target
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF target.id IS NULL OR NOT (
    private.has_module_access(target.tenant_id, 'delivery', 'edit')
    OR private.has_module_access(target.tenant_id, 'warehouse', 'edit')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  FOR reservation_row IN
    SELECT *
      FROM public.stock_reservations
     WHERE order_id = target.id
       AND tenant_id = target.tenant_id
       AND status = 'active'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET on_hand = on_hand - reservation_row.quantity,
           reserved = reserved - reservation_row.quantity,
           updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id
       AND on_hand >= reservation_row.quantity
       AND reserved >= reservation_row.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Təhvil üçün stok və rezerv qalığı uyğun deyil';
    END IF;

    UPDATE public.stock_reservations
       SET status = 'fulfilled', updated_at = now()
     WHERE id = reservation_row.id;

    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      reference_type, reference_id, note, created_by
    ) VALUES (
      reservation_row.tenant_id, reservation_row.warehouse_id,
      reservation_row.product_id, 'delivery', -reservation_row.quantity,
      'sales_order', target.id, target.order_no || ' sifarişi təhvil verildi', auth.uid()
    );

    fulfilled_count := fulfilled_count + 1;
  END LOOP;

  IF fulfilled_count = 0 THEN
    IF target.status::text = 'delivered' THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Sifariş üzrə aktiv anbar rezervi tapılmadı';
  END IF;

  UPDATE public.orders
     SET status = 'delivered'::public.order_status, updated_at = now()
   WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, target.tenant_id, auth.uid(), 'deliveries', 'complete',
    target.order_no || ' təhvil verildi',
    jsonb_build_object('order_id', target.id, 'fulfilled_reservations', fulfilled_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated, service_role;

DO $$
DECLARE
  target record;
  reservation_row public.stock_reservations%rowtype;
  repaired_count integer;
BEGIN
  FOR target IN
    SELECT o.id, o.tenant_id, o.order_no
      FROM public.orders o
     WHERE o.status::text = 'delivered'
       AND EXISTS (
         SELECT 1 FROM public.stock_reservations r
          WHERE r.order_id = o.id AND r.status = 'active'
       )
     FOR UPDATE
  LOOP
    repaired_count := 0;
    FOR reservation_row IN
      SELECT * FROM public.stock_reservations
       WHERE order_id = target.id AND tenant_id = target.tenant_id AND status = 'active'
       ORDER BY created_at, id
       FOR UPDATE
    LOOP
      UPDATE public.stock_balances
         SET on_hand = on_hand - reservation_row.quantity,
             reserved = reserved - reservation_row.quantity,
             updated_at = now()
       WHERE tenant_id = reservation_row.tenant_id
         AND warehouse_id = reservation_row.warehouse_id
         AND product_id = reservation_row.product_id
         AND on_hand >= reservation_row.quantity
         AND reserved >= reservation_row.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Keçmiş təhvil üçün stok və rezerv qalığı uyğun deyil: %', target.order_no;
      END IF;

      UPDATE public.stock_reservations
         SET status = 'fulfilled', updated_at = now()
       WHERE id = reservation_row.id;

      INSERT INTO public.stock_movements(
        tenant_id, warehouse_id, product_id, movement_type, quantity,
        reference_type, reference_id, note, created_by
      ) VALUES (
        reservation_row.tenant_id, reservation_row.warehouse_id,
        reservation_row.product_id, 'delivery', -reservation_row.quantity,
        'sales_order', target.id, target.order_no || ' keçmiş təhvil düzəlişi',
        reservation_row.created_by
      );
      repaired_count := repaired_count + 1;
    END LOOP;

    INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
    VALUES (
      gen_random_uuid()::text, target.tenant_id, reservation_row.created_by,
      'deliveries', 'stock_reconciliation',
      target.order_no || ' təhvil qalığı düzəldildi',
      jsonb_build_object('order_id', target.id, 'fulfilled_reservations', repaired_count)
    );
  END LOOP;
END;
$$;