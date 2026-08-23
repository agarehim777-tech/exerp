BEGIN;

-- Məhsul 360-dan edilən iki sadə və atomik stok qərarı:
-- problem = fiziki qalıq dəyişmir, satışa uyğun qalıq azalır;
-- write_off = fiziki qalıq və stok dəyəri azalır.
CREATE OR REPLACE FUNCTION public.record_problem_stock_action(
  _product uuid,
  _warehouse uuid,
  _quantity numeric,
  _action text,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  tenant uuid;
  balance public.stock_balances%rowtype;
  header_id uuid;
  line_id uuid;
  movement_id uuid;
  document_no text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Miqdar 0-dan böyük olmalıdır'; END IF;
  IF _action NOT IN ('problem','write_off') THEN RAISE EXCEPTION 'Yanlış stok əməliyyatı'; END IF;
  IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Əməliyyatın səbəbini yazın'; END IF;

  SELECT w.tenant_id INTO tenant
    FROM public.warehouses w
    JOIN public.products p ON p.tenant_id=w.tenant_id AND p.id=_product
   WHERE w.id=_warehouse;
  IF tenant IS NULL OR NOT public.is_tenant_member(tenant,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;

  SELECT * INTO balance FROM public.stock_balances
   WHERE tenant_id=tenant AND warehouse_id=_warehouse AND product_id=_product
   FOR UPDATE;
  IF balance.tenant_id IS NULL OR balance.on_hand-balance.reserved-balance.problem_qty < _quantity THEN
    RAISE EXCEPTION 'Seçilmiş anbarda satışa uyğun qalıq kifayət deyil';
  END IF;

  document_no := 'STK-' || to_char(clock_timestamp(),'YYMMDDHH24MISSMS') || '-' || upper(substr(gen_random_uuid()::text,1,4));
  INSERT INTO public.inventory_returns(
    tenant_id,return_no,return_type,status,warehouse_id,reason,created_by,completed_by,completed_at
  ) VALUES (
    tenant,document_no,'customer','completed',_warehouse,trim(_reason),auth.uid(),auth.uid(),now()
  ) RETURNING id INTO header_id;

  IF _action='problem' THEN
    UPDATE public.stock_balances
       SET problem_qty=problem_qty+_quantity,updated_at=now()
     WHERE tenant_id=tenant AND warehouse_id=_warehouse AND product_id=_product;

    INSERT INTO public.inventory_return_lines(
      tenant_id,return_id,product_id,quantity,condition,disposition,unit_cost,repair_status
    ) VALUES (
      tenant,header_id,_product,_quantity,'damaged','quarantine',balance.avg_cost,'pending'
    ) RETURNING id INTO line_id;
  ELSE
    UPDATE public.stock_balances
       SET on_hand=on_hand-_quantity,updated_at=now()
     WHERE tenant_id=tenant AND warehouse_id=_warehouse AND product_id=_product;

    INSERT INTO public.stock_movements(
      tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,
      reference_type,reference_id,note,created_by
    ) VALUES (
      tenant,_warehouse,_product,'write_off',-_quantity,balance.avg_cost,
      'inventory_return',header_id,document_no || ' · Məhsul anbardan silindi: ' || trim(_reason),auth.uid()
    ) RETURNING id INTO movement_id;

    INSERT INTO public.inventory_return_lines(
      tenant_id,return_id,product_id,quantity,condition,disposition,unit_cost,stock_movement_id,repair_status
    ) VALUES (
      tenant,header_id,_product,_quantity,'defective','write_off',balance.avg_cost,movement_id,'not_required'
    ) RETURNING id INTO line_id;
  END IF;

  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
  VALUES(
    gen_random_uuid()::text,tenant,auth.uid(),'warehouse',
    CASE WHEN _action='problem' THEN 'problem_stock' ELSE 'stock_write_off' END,
    document_no || ': ' || trim(_reason),
    jsonb_build_object('document_id',header_id,'line_id',line_id,'product_id',_product,
      'warehouse_id',_warehouse,'quantity',_quantity,'reason',trim(_reason))
  );
  RETURN line_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_problem_stock_action(uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_problem_stock_action(uuid,uuid,numeric,text,text) TO authenticated,service_role;

COMMIT;
