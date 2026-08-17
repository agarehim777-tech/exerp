-- Draft/new sales orders can be removed atomically. Financial, delivery and
-- inventory history remains immutable once a real downstream event exists.
CREATE OR REPLACE FUNCTION public.delete_sales_order_safe(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE order_id = target.id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'Təhvil sənədi olan sifariş silinə bilməz';
  END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations WHERE order_id = target.id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = reserved - reservation_row.quantity, updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id
       AND reserved >= reservation_row.quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Anbar rezerv qalığı uyğun deyil';
    END IF;
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      reference_type, reference_id, note
    ) VALUES (
      reservation_row.tenant_id, reservation_row.warehouse_id, reservation_row.product_id,
      'release', -reservation_row.quantity, 'stock_reservation', reservation_row.id,
      target.order_no || ' sifarişi silindi'
    );
  END LOOP;

  -- Təhvil verilməmiş sifariş üzrə qəbul edilmiş ilkin ödəniş kassadan geri
  -- qaytarılır. İlkin mədaxil və refund ayrı maliyyə izləri kimi saxlanılır.
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

REVOKE ALL ON FUNCTION public.delete_sales_order_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_sales_order_safe(uuid) TO authenticated;
