CREATE OR REPLACE FUNCTION public.reserve_stock(
  _tenant_id UUID,
  _warehouse_id UUID,
  _product_id UUID,
  _order_id UUID,
  _order_item_id UUID DEFAULT NULL,
  _quantity NUMERIC DEFAULT 0
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  reservation_id UUID;
  available_quantity NUMERIC(14,3);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id, 'warehouse', 'edit')
    OR private.has_module_access(_tenant_id, 'sales', 'edit')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  SELECT COALESCE(on_hand, 0) - COALESCE(reserved, 0) INTO available_quantity
    FROM public.stock_balances
   WHERE tenant_id = _tenant_id AND warehouse_id = _warehouse_id AND product_id = _product_id
   FOR UPDATE;

  IF available_quantity IS NULL THEN
    INSERT INTO public.stock_balances(tenant_id, warehouse_id, product_id, on_hand, reserved)
    VALUES (_tenant_id, _warehouse_id, _product_id, 0, 0)
    ON CONFLICT DO NOTHING;
    available_quantity := 0;
  END IF;

  INSERT INTO public.stock_reservations(
    tenant_id, warehouse_id, product_id, order_id, quantity, status, created_by
  ) VALUES (
    _tenant_id, _warehouse_id, _product_id, _order_id, _quantity, 'active', auth.uid()
  ) RETURNING id INTO reservation_id;

  UPDATE public.stock_balances
     SET reserved = COALESCE(reserved, 0) + _quantity, updated_at = now()
   WHERE tenant_id = _tenant_id AND warehouse_id = _warehouse_id AND product_id = _product_id;

  INSERT INTO public.stock_movements(
    tenant_id, warehouse_id, product_id, movement_type, quantity,
    move_type, qty, reference_type, reference_id, note, created_by
  ) VALUES (
    _tenant_id, _warehouse_id, _product_id, 'reservation', _quantity,
    'adjust', 0, 'stock_reservation', reservation_id, 'Satış sifarişi üzrə rezerv', auth.uid()
  );

  RETURN reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stock_reservation(
  _tenant_id UUID,
  _reservation_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  reservation_row public.stock_reservations%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id, 'warehouse', 'edit')
    OR private.has_module_access(_tenant_id, 'sales', 'edit')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT * INTO reservation_row
    FROM public.stock_reservations
   WHERE id = _reservation_id AND tenant_id = _tenant_id
   FOR UPDATE;

  IF reservation_row.id IS NULL THEN
    RAISE EXCEPTION 'reservation_not_found';
  END IF;
  IF reservation_row.status <> 'active' THEN
    RETURN;
  END IF;

  UPDATE public.stock_balances
     SET reserved = GREATEST(0, COALESCE(reserved, 0) - reservation_row.quantity), updated_at = now()
   WHERE tenant_id = reservation_row.tenant_id
     AND warehouse_id = reservation_row.warehouse_id
     AND product_id = reservation_row.product_id;

  UPDATE public.stock_reservations
     SET status = 'released', updated_at = now()
   WHERE id = reservation_row.id;

  INSERT INTO public.stock_movements(
    tenant_id, warehouse_id, product_id, movement_type, quantity,
    move_type, qty, reference_type, reference_id, note, created_by
  ) VALUES (
    reservation_row.tenant_id, reservation_row.warehouse_id, reservation_row.product_id,
    'release', -reservation_row.quantity, 'adjust', 0,
    'stock_reservation', reservation_row.id, 'Rezerv ləğv edildi', auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_stock(UUID,UUID,UUID,UUID,UUID,NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_stock_reservation(UUID,UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock(UUID,UUID,UUID,UUID,UUID,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_stock_reservation(UUID,UUID) TO authenticated;

-- Sifariş silinməsi artıq mövcud olmayan deliveries cədvəlinə istinad etməsin
CREATE OR REPLACE FUNCTION public.delete_sales_order_safe(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  payment_row public.cash_transactions%rowtype;
  cash_account public.cash_accounts%rowtype;
  refund_transaction_id uuid;
  refund_journal_id uuid;
  cash_gl_id uuid;
  advance_gl_id uuid;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;
  IF NOT (public.is_tenant_admin(target.tenant_id, auth.uid()) OR target.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Bu sifarişi silmək üçün icazəniz yoxdur';
  END IF;
  IF target.status IN ('delivered', 'shipped', 'processing') THEN
    RAISE EXCEPTION 'Anbar və ya təhvil əməliyyatı başlamış sifariş silinə bilməz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_bonus_entries WHERE order_id = target.id AND status <> 'reversed') THEN
    UPDATE public.sales_bonus_entries SET status = 'reversed', reversed_at = now()
     WHERE order_id = target.id AND status <> 'reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.credit_payments payment
    JOIN public.credit_contracts contract ON contract.id = payment.credit_id
    WHERE contract.order_id = target.id
  ) THEN
    RAISE EXCEPTION 'Kredit ödənişi olan sifariş silinə bilməz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_reservations WHERE order_id = target.id AND status = 'fulfilled') THEN
    RAISE EXCEPTION 'Anbardan çıxışı tamamlanmış sifariş silinə bilməz';
  END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations WHERE order_id = target.id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = GREATEST(0, COALESCE(reserved, 0) - reservation_row.quantity), updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id;
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      move_type, qty, reference_type, reference_id, note, created_by
    ) VALUES (
      reservation_row.tenant_id, reservation_row.warehouse_id, reservation_row.product_id,
      'release', -reservation_row.quantity, 'adjust', 0, 'stock_reservation', reservation_row.id,
      target.order_no || ' sifarişi silindi', auth.uid()
    );
  END LOOP;

  IF COALESCE(target.paid_amount, 0) > 0 THEN
    PERFORM public.ensure_inventory_accounts(target.tenant_id);
    FOR payment_row IN
      SELECT * FROM public.cash_transactions
       WHERE tenant_id = target.tenant_id
         AND reference = target.order_no
         AND direction = 'in'
         AND category = 'sales_payment'
       FOR UPDATE
    LOOP
      SELECT * INTO cash_account FROM public.cash_accounts WHERE id = payment_row.account_id FOR UPDATE;
      INSERT INTO public.cash_transactions(
        tenant_id, account_id, direction, amount, currency, category,
        customer_id, reference, description, occurred_at
      ) VALUES (
        target.tenant_id, payment_row.account_id, 'out', payment_row.amount,
        payment_row.currency, 'sales_refund', target.customer_id,
        target.order_no || '-LƏĞV', target.order_no || ' silinmə üzrə ödəniş qaytarılması', current_date
      ) RETURNING id INTO refund_transaction_id;

      cash_gl_id := COALESCE(cash_account.gl_account_id, public.gl_account_by_code(
        target.tenant_id, CASE WHEN cash_account.type::text = 'cash' THEN '1000' ELSE '1010' END
      ));
      advance_gl_id := public.gl_account_by_code(target.tenant_id, '2300');
      INSERT INTO public.journal_entries(
        tenant_id, entry_date, reference, description, source_type, source_id, created_by
      ) VALUES (
        target.tenant_id, current_date, target.order_no || '-LƏĞV',
        'Təhvil verilməmiş sifariş ödənişinin qaytarılması', 'sales_order_refund', refund_transaction_id, auth.uid()
      ) RETURNING id INTO refund_journal_id;
      INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
        (refund_journal_id, advance_gl_id, payment_row.amount, 0, 'Müştəri avansının ləğvi', 1),
        (refund_journal_id, cash_gl_id, 0, payment_row.amount, 'Kassadan geri ödəniş', 2);
      UPDATE public.journal_entries SET posted = true WHERE id = refund_journal_id;
    END LOOP;
    UPDATE public.orders SET paid_amount = 0, payment_status = 'unpaid' WHERE id = target.id;
  END IF;

  DELETE FROM public.sales_bonus_entries WHERE order_id = target.id;
  DELETE FROM public.stock_reservations WHERE order_id = target.id;
  DELETE FROM public.order_bonus_assignments WHERE order_id = target.id;
  DELETE FROM public.credit_contracts WHERE order_id = target.id;
  DELETE FROM public.order_items WHERE order_id = target.id;
  DELETE FROM public.orders WHERE id = target.id;
END;
$$;