DO $$
DECLARE o uuid;
BEGIN
  SELECT id INTO o FROM public.orders
   WHERE tenant_id='19a19333-6284-4b08-a2ac-aaffa5b42399' AND order_no='SF-1002';
  IF o IS NOT NULL THEN
    DELETE FROM public.stock_movements WHERE reference_id IN (SELECT id FROM public.stock_reservations WHERE order_id=o);
    DELETE FROM public.stock_movements WHERE reference_type='sales_order' AND reference_id=o;
    DELETE FROM public.sales_cost_allocations WHERE order_id=o;
    DELETE FROM public.order_accounting_events WHERE order_id=o;
    DELETE FROM public.sales_bonus_entries WHERE order_id=o;
    DELETE FROM public.order_bonus_assignments WHERE order_id=o;
    DELETE FROM public.stock_reservations WHERE order_id=o;
    DELETE FROM public.order_items WHERE order_id=o;
    DELETE FROM public.orders WHERE id=o;
  END IF;
  UPDATE public.stock_balances SET on_hand=10, reserved=0, updated_at=now()
   WHERE tenant_id='19a19333-6284-4b08-a2ac-aaffa5b42399'
     AND product_id='2d90508f-8fd0-4cfc-86e2-35d3236cfb01';
END $$;