-- Persist delivery dates and the employee who physically receives the goods
-- from the warehouse. Backfill older delivered orders so history is complete.
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS warehouse_employee_name text;

INSERT INTO public.deliveries (
  tenant_id,
  delivery_no,
  order_id,
  warehouse_id,
  status,
  delivered_at,
  created_by,
  created_at,
  updated_at
)
SELECT
  orders.tenant_id,
  'TV-' || orders.order_no,
  orders.id,
  COALESCE(
    (
      SELECT reservation.warehouse_id
      FROM public.stock_reservations reservation
      WHERE reservation.tenant_id = orders.tenant_id
        AND reservation.order_id = orders.id
      ORDER BY
        CASE WHEN reservation.status = 'fulfilled' THEN 0 ELSE 1 END,
        reservation.updated_at DESC,
        reservation.created_at DESC
      LIMIT 1
    ),
    (
      SELECT warehouse.id
      FROM public.warehouses warehouse
      WHERE warehouse.tenant_id = orders.tenant_id
      ORDER BY warehouse.is_active DESC, warehouse.created_at, warehouse.id
      LIMIT 1
    )
  ),
  'delivered',
  COALESCE(orders.updated_at, orders.created_at, now()),
  orders.created_by,
  COALESCE(orders.created_at, now()),
  COALESCE(orders.updated_at, now())
FROM public.orders orders
WHERE orders.status::text = 'delivered'
  AND NOT EXISTS (
    SELECT 1 FROM public.deliveries delivery
    WHERE delivery.tenant_id = orders.tenant_id
      AND delivery.order_id = orders.id
  )
  AND COALESCE(
    (
      SELECT reservation.warehouse_id
      FROM public.stock_reservations reservation
      WHERE reservation.tenant_id = orders.tenant_id
        AND reservation.order_id = orders.id
      ORDER BY reservation.updated_at DESC, reservation.created_at DESC
      LIMIT 1
    ),
    (
      SELECT warehouse.id
      FROM public.warehouses warehouse
      WHERE warehouse.tenant_id = orders.tenant_id
      ORDER BY warehouse.is_active DESC, warehouse.created_at, warehouse.id
      LIMIT 1
    )
  ) IS NOT NULL
ON CONFLICT (tenant_id, order_id) DO UPDATE
SET delivered_at = COALESCE(public.deliveries.delivered_at, EXCLUDED.delivered_at),
    status = 'delivered',
    updated_at = now();

GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
