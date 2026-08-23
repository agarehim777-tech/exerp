BEGIN;

-- Fiziki qalıq problemli məhsulları da ehtiva edir. Bu sütun həmin qalığın
-- satışa buraxılmayan (karantin/təmir) hissəsini ayrıca saxlayır.
ALTER TABLE public.stock_balances
  ADD COLUMN IF NOT EXISTS problem_qty numeric(14,3) NOT NULL DEFAULT 0;

ALTER TABLE public.stock_balances
  DROP CONSTRAINT IF EXISTS stock_balances_problem_qty_check;
ALTER TABLE public.stock_balances
  ADD CONSTRAINT stock_balances_problem_qty_check
  CHECK (problem_qty >= 0 AND problem_qty <= on_hand);

COMMENT ON COLUMN public.stock_balances.problem_qty IS
  'on_hand fiziki qalığının problemli və satışa buraxılmayan hissəsi';

ALTER TABLE public.inventory_return_lines
  ADD COLUMN IF NOT EXISTS repair_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS repair_started_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS repair_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS repaired_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS repaired_at timestamptz,
  ADD COLUMN IF NOT EXISTS repair_note text;

ALTER TABLE public.inventory_return_lines
  DROP CONSTRAINT IF EXISTS inventory_return_lines_repair_status_check;
ALTER TABLE public.inventory_return_lines
  ADD CONSTRAINT inventory_return_lines_repair_status_check
  CHECK (repair_status IN ('not_required','pending','in_progress','repaired','not_repairable'));

-- Köhnə karantin qeydləri yalnız hərəkət jurnalına yazılıb, fiziki qalığa
-- düşməyib. Migration bir dəfə işləyərək onları fiziki və problemli qalığa alır.
WITH old_quarantine AS (
  SELECT l.tenant_id, r.warehouse_id, l.product_id,
         sum(l.quantity)::numeric(14,3) AS qty,
         CASE WHEN sum(l.quantity) > 0
           THEN sum(l.quantity * l.unit_cost) / sum(l.quantity)
           ELSE 0 END::numeric(18,6) AS avg_cost
    FROM public.inventory_return_lines l
    JOIN public.inventory_returns r ON r.id = l.return_id
   WHERE r.status = 'completed'
     AND l.disposition = 'quarantine'
     AND l.repair_status = 'not_required'
   GROUP BY l.tenant_id, r.warehouse_id, l.product_id
)
INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved,avg_cost,problem_qty)
SELECT tenant_id,warehouse_id,product_id,qty,0,avg_cost,qty FROM old_quarantine
ON CONFLICT (tenant_id,warehouse_id,product_id) DO UPDATE SET
  avg_cost = CASE
    WHEN public.stock_balances.on_hand + EXCLUDED.on_hand > 0
    THEN ((public.stock_balances.on_hand * public.stock_balances.avg_cost) +
          (EXCLUDED.on_hand * EXCLUDED.avg_cost)) /
         (public.stock_balances.on_hand + EXCLUDED.on_hand)
    ELSE public.stock_balances.avg_cost END,
  on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand,
  problem_qty = public.stock_balances.problem_qty + EXCLUDED.problem_qty,
  updated_at = now();

UPDATE public.inventory_return_lines l
   SET repair_status = 'pending'
  FROM public.inventory_returns r
 WHERE r.id = l.return_id
   AND r.status = 'completed'
   AND l.disposition = 'quarantine'
   AND l.repair_status = 'not_required';

CREATE OR REPLACE FUNCTION public.complete_inventory_return(_return uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  header public.inventory_returns%rowtype;
  line public.inventory_return_lines%rowtype;
  balance public.stock_balances%rowtype;
  movement_id uuid;
  new_cost numeric(18,6);
BEGIN
  SELECT * INTO header FROM public.inventory_returns WHERE id = _return FOR UPDATE;
  IF header.id IS NULL OR NOT public.is_tenant_member(header.tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF header.status = 'completed' THEN RETURN header.id; END IF;
  IF header.status = 'cancelled' THEN RAISE EXCEPTION 'Qaytarma ləğv edilib'; END IF;

  FOR line IN SELECT * FROM public.inventory_return_lines WHERE return_id = header.id FOR UPDATE LOOP
    movement_id := NULL;
    SELECT * INTO balance FROM public.stock_balances
     WHERE tenant_id = header.tenant_id AND warehouse_id = header.warehouse_id AND product_id = line.product_id
     FOR UPDATE;
    new_cost := COALESCE(NULLIF(line.unit_cost, 0), balance.avg_cost, 0);

    IF header.return_type = 'customer' AND line.disposition = 'restock' AND line.condition = 'saleable' THEN
      INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved,avg_cost,problem_qty)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,line.quantity,0,new_cost,0)
      ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET
        avg_cost = CASE WHEN public.stock_balances.on_hand + EXCLUDED.on_hand > 0
          THEN ((public.stock_balances.on_hand * public.stock_balances.avg_cost) + (EXCLUDED.on_hand * EXCLUDED.avg_cost)) /
               (public.stock_balances.on_hand + EXCLUDED.on_hand)
          ELSE public.stock_balances.avg_cost END,
        on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand,
        updated_at = now();
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'receipt',line.quantity,'in',line.quantity,new_cost,'inventory_return',header.id,header.return_no,'Satışa uyğun müştəri qaytarması',auth.uid())
      RETURNING id INTO movement_id;

    ELSIF header.return_type = 'vendor' OR line.disposition = 'vendor_return' THEN
      IF balance.tenant_id IS NULL OR balance.on_hand - balance.problem_qty - balance.reserved < line.quantity THEN
        RAISE EXCEPTION 'Vendor qaytarması üçün satışa uyğun qalıq kifayət deyil';
      END IF;
      UPDATE public.stock_balances SET on_hand=on_hand-line.quantity,updated_at=now()
       WHERE tenant_id=header.tenant_id AND warehouse_id=header.warehouse_id AND product_id=line.product_id;
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'write_off',-line.quantity,'out',line.quantity,balance.avg_cost,'inventory_return',header.id,header.return_no,'Vendor qaytarması',auth.uid())
      RETURNING id INTO movement_id;

    ELSIF line.disposition = 'quarantine' THEN
      IF balance.tenant_id IS NULL OR balance.on_hand - balance.problem_qty - balance.reserved < line.quantity THEN
        RAISE EXCEPTION 'Problemli stoka keçirmək üçün satışa uyğun qalıq kifayət deyil';
      END IF;
      -- Məhsul anbarda qalır: fiziki on_hand dəyişmir, yalnız onun problemli
      -- və satışa buraxılmayan hissəsi artır.
      UPDATE public.stock_balances
         SET problem_qty=problem_qty+line.quantity,updated_at=now()
       WHERE tenant_id=header.tenant_id AND warehouse_id=header.warehouse_id AND product_id=line.product_id;

    ELSE
      IF balance.tenant_id IS NULL OR balance.on_hand - balance.problem_qty - balance.reserved < line.quantity THEN
        RAISE EXCEPTION 'Silmək üçün satışa uyğun qalıq kifayət deyil';
      END IF;
      -- Silinmə fiziki qalıqdan çıxır və stok dəyərini də həmin miqdar üzrə azaldır.
      UPDATE public.stock_balances
         SET on_hand=on_hand-line.quantity,updated_at=now()
       WHERE tenant_id=header.tenant_id AND warehouse_id=header.warehouse_id AND product_id=line.product_id;
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'write_off',-line.quantity,'out',line.quantity,new_cost,'inventory_return',header.id,header.return_no,'Məhsul anbardan silindi: ' || COALESCE(header.reason,'səbəb göstərilməyib'),auth.uid())
      RETURNING id INTO movement_id;
    END IF;

    UPDATE public.inventory_return_lines SET
      stock_movement_id=movement_id,
      unit_cost=new_cost,
      repair_status=CASE WHEN disposition='quarantine' THEN 'pending' ELSE 'not_required' END
    WHERE id=line.id;

    INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,header.tenant_id,auth.uid(),'warehouse',
      CASE WHEN line.disposition='quarantine' THEN 'problem_stock' ELSE 'stock_write_off' END,
      header.return_no || ': ' || COALESCE(header.reason,'səbəb göstərilməyib'),
      jsonb_build_object('return_line_id',line.id,'product_id',line.product_id,'warehouse_id',header.warehouse_id,'quantity',line.quantity,'reason',header.reason));
  END LOOP;

  UPDATE public.inventory_returns SET status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now() WHERE id=header.id;
  RETURN header.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.start_inventory_repair(_line uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE target record;
BEGIN
  SELECT l.*, r.status AS return_status, r.warehouse_id
    INTO target
    FROM public.inventory_return_lines l
    JOIN public.inventory_returns r ON r.id=l.return_id
   WHERE l.id=_line FOR UPDATE OF l;
  IF target.id IS NULL OR NOT public.is_tenant_member(target.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF target.return_status <> 'completed' OR target.disposition <> 'quarantine' THEN RAISE EXCEPTION 'Yalnız tamamlanmış problemli stok təmirə verilə bilər'; END IF;
  IF target.repair_status='repaired' THEN RETURN target.id; END IF;
  UPDATE public.inventory_return_lines SET repair_status='in_progress',repair_started_by=auth.uid(),repair_started_at=COALESCE(repair_started_at,now()) WHERE id=target.id;
  RETURN target.id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.complete_inventory_repair(_line uuid, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE target record;
BEGIN
  SELECT l.*, r.status AS return_status, r.warehouse_id, r.return_no
    INTO target
    FROM public.inventory_return_lines l
    JOIN public.inventory_returns r ON r.id=l.return_id
   WHERE l.id=_line FOR UPDATE OF l;
  IF target.id IS NULL OR NOT public.is_tenant_member(target.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF target.return_status <> 'completed' OR target.disposition <> 'quarantine' THEN RAISE EXCEPTION 'Yalnız tamamlanmış problemli stok təmir edilə bilər'; END IF;
  IF target.repair_status='repaired' THEN RETURN target.id; END IF;

  UPDATE public.stock_balances
     SET problem_qty=problem_qty-target.quantity,updated_at=now()
   WHERE tenant_id=target.tenant_id AND warehouse_id=target.warehouse_id AND product_id=target.product_id
     AND problem_qty>=target.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Problemli stok qalığı təmir miqdarı ilə uyğun deyil'; END IF;

  UPDATE public.inventory_return_lines SET
    repair_status='repaired',repair_started_by=COALESCE(repair_started_by,auth.uid()),
    repair_started_at=COALESCE(repair_started_at,now()),repaired_by=auth.uid(),repaired_at=now(),repair_note=NULLIF(trim(_note),'')
  WHERE id=target.id;

  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
  VALUES(gen_random_uuid()::text,target.tenant_id,auth.uid(),'warehouse','repair_completed',target.return_no || ' üzrə təmir tamamlandı',
    jsonb_build_object('return_line_id',target.id,'product_id',target.product_id,'quantity',target.quantity,'warehouse_id',target.warehouse_id));
  RETURN target.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.complete_inventory_return(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_inventory_repair(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_inventory_repair(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_inventory_return(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.start_inventory_repair(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_repair(uuid,text) TO authenticated,service_role;

-- Problemli fiziki qalıq təhvil verilə bilməz.
CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $fn$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  fulfilled_count integer := 0;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF target.id IS NULL OR NOT (
    private.has_module_access(target.tenant_id,'delivery','edit') OR
    private.has_module_access(target.tenant_id,'warehouse','edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations
     WHERE order_id=target.id AND tenant_id=target.tenant_id AND status='active'
     ORDER BY created_at,id FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET on_hand=on_hand-reservation_row.quantity,
           reserved=reserved-reservation_row.quantity,
           updated_at=now()
     WHERE tenant_id=reservation_row.tenant_id
       AND warehouse_id=reservation_row.warehouse_id
       AND product_id=reservation_row.product_id
       AND on_hand-problem_qty>=reservation_row.quantity
       AND reserved>=reservation_row.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Təhvil üçün satışa uyğun stok və rezerv qalığı kifayət deyil'; END IF;

    UPDATE public.stock_reservations SET status='fulfilled',updated_at=now() WHERE id=reservation_row.id;
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES(reservation_row.tenant_id,reservation_row.warehouse_id,reservation_row.product_id,'delivery',-reservation_row.quantity,'sales_order',target.id,target.order_no || ' sifarişi təhvil verildi',auth.uid());
    fulfilled_count:=fulfilled_count+1;
  END LOOP;

  IF fulfilled_count=0 THEN
    IF target.status::text='delivered' THEN RETURN; END IF;
    RAISE EXCEPTION 'Sifariş üzrə aktiv anbar rezervi tapılmadı';
  END IF;
  UPDATE public.orders SET status='delivered'::public.order_status,updated_at=now() WHERE id=target.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
  VALUES(gen_random_uuid()::text,target.tenant_id,auth.uid(),'deliveries','complete',target.order_no || ' təhvil verildi',jsonb_build_object('order_id',target.id,'fulfilled_reservations',fulfilled_count));
END;
$fn$;

REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated,service_role;

COMMIT;
