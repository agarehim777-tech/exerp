CREATE OR REPLACE FUNCTION public.preview_sales_order_reversal(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target public.orders%rowtype;
  credit_count integer;
  reservation_count integer;
  stock_return_count integer;
  payment_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT * INTO target FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR NOT COALESCE(private.has_module_access(target.tenant_id, 'sales', 'view'), false) THEN
    RAISE EXCEPTION 'sales_preview_permission_denied';
  END IF;

  SELECT count(*) INTO credit_count FROM public.credit_contracts
   WHERE tenant_id = target.tenant_id AND order_id = target.id AND status::text NOT IN ('closed','cancelled');
  SELECT count(*) INTO reservation_count FROM public.stock_reservations
   WHERE tenant_id = target.tenant_id AND order_id = target.id AND status = 'active';
  SELECT count(*) INTO stock_return_count FROM public.stock_movements movement
   WHERE movement.tenant_id = target.tenant_id AND movement.quantity < 0
     AND movement.movement_type::text = 'delivery'
     AND ((movement.reference_type = 'sales_order' AND movement.reference_id = target.id)
       OR (movement.reference_type = 'delivery' AND movement.reference_id IN
         (SELECT id FROM public.deliveries WHERE tenant_id = target.tenant_id AND order_id = target.id)))
     AND NOT EXISTS (SELECT 1 FROM public.stock_movements reversal WHERE reversal.reversal_of = movement.id);
  SELECT COALESCE(sum(CASE WHEN tx.direction::text = 'in' THEN tx.amount ELSE -tx.amount END), 0)
    INTO payment_amount FROM public.cash_transactions tx
   WHERE tx.tenant_id = target.tenant_id AND tx.direction::text = 'in'
     AND tx.category IN ('sales_payment','credit_initial','credit_payment','receivable_payment')
     AND tx.reversal_of IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.cash_transactions reversal WHERE reversal.reversal_of = tx.id)
     AND (tx.reference_id = target.id OR (tx.reference_id IS NULL AND tx.reference = target.order_no)
       OR tx.reference_id IN (SELECT id FROM public.credit_contracts WHERE tenant_id = target.tenant_id AND order_id = target.id)
       OR tx.reference_id IN (SELECT payment.id FROM public.credit_payments payment
         JOIN public.credit_contracts credit ON credit.id = payment.credit_id
         WHERE credit.tenant_id = target.tenant_id AND credit.order_id = target.id));

  RETURN jsonb_build_object('order_id', target.id, 'order_no', target.order_no, 'status', target.status,
    'credit_count', credit_count, 'payment_amount', greatest(payment_amount, 0),
    'reservation_count', reservation_count, 'stock_return_count', stock_return_count,
    'will_close_credit', credit_count > 0, 'will_reverse_cash', payment_amount > 0,
    'will_restore_stock', stock_return_count > 0);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_sales_order_reversal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_sales_order_reversal(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
