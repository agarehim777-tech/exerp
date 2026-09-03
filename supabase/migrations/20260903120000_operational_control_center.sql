CREATE OR REPLACE FUNCTION public.preview_sales_order_reversal(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target public.orders%rowtype;
  credit_count integer := 0;
  reservation_count integer := 0;
  stock_return_count integer := 0;
  payment_amount numeric := 0;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sifariş tapılmadı'; END IF;
  IF NOT private.has_module_access(target.tenant_id, 'sales', 'view') THEN
    RAISE EXCEPTION 'Bu satışa baxmaq icazəniz yoxdur';
  END IF;

  SELECT count(*) INTO credit_count FROM public.credit_contracts WHERE order_id = target.id;
  SELECT count(*) INTO reservation_count FROM public.stock_reservations WHERE order_id = target.id AND status = 'active';
  SELECT count(*) INTO stock_return_count FROM public.order_items WHERE order_id = target.id;
  SELECT coalesce(sum(CASE WHEN direction::text IN ('in','Mədaxil') THEN amount ELSE -amount END), 0)
    INTO payment_amount
    FROM public.cash_transactions
   WHERE tenant_id = target.tenant_id
     AND reversed_at IS NULL
     AND (reference_id = target.id OR reference = target.order_no);

  RETURN jsonb_build_object(
    'order_id', target.id,
    'order_no', target.order_no,
    'status', target.status,
    'credit_count', credit_count,
    'payment_amount', greatest(payment_amount, 0),
    'reservation_count', reservation_count,
    'stock_return_count', CASE WHEN target.status::text = 'delivered' THEN stock_return_count ELSE 0 END,
    'will_close_credit', credit_count > 0,
    'will_reverse_cash', payment_amount > 0,
    'will_restore_stock', target.status::text = 'delivered'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_sales_order_reversal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_sales_order_reversal(uuid) TO authenticated, service_role;


