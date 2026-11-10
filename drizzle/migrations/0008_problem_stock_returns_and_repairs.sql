CREATE TABLE IF NOT EXISTS public.inventory_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_no text NOT NULL,
  return_type text NOT NULL CHECK (return_type IN ('customer','vendor')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','inspection','completed','cancelled')),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  reason text,
  created_by uuid,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, return_no)
);
CREATE TABLE IF NOT EXISTS public.inventory_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_id uuid NOT NULL REFERENCES public.inventory_returns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  condition text NOT NULL CHECK (condition IN ('saleable','damaged','defective')),
  disposition text NOT NULL CHECK (disposition IN ('restock','quarantine','vendor_return','write_off')),
  unit_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  stock_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  note text,
  repair_status text NOT NULL DEFAULT 'not_required' CHECK (repair_status IN ('not_required','pending','in_progress','repaired','not_repairable')),
  repair_started_by uuid,
  repair_started_at timestamptz,
  repaired_by uuid,
  repaired_at timestamptz,
  repair_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_returns_tenant_status_idx ON public.inventory_returns(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_returns_warehouse_idx ON public.inventory_returns(warehouse_id);
CREATE INDEX IF NOT EXISTS inventory_returns_order_idx ON public.inventory_returns(order_id);
CREATE INDEX IF NOT EXISTS inventory_return_lines_product_idx ON public.inventory_return_lines(tenant_id,product_id,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_return_lines_return_idx ON public.inventory_return_lines(return_id);
CREATE INDEX IF NOT EXISTS inventory_return_lines_movement_idx ON public.inventory_return_lines(stock_movement_id);

GRANT SELECT ON public.inventory_returns, public.inventory_return_lines TO authenticated;
GRANT ALL ON public.inventory_returns, public.inventory_return_lines TO service_role;
ALTER TABLE public.inventory_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_returns_tenant_read ON public.inventory_returns FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY inventory_return_lines_tenant_read ON public.inventory_return_lines FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));

ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS problem_qty numeric(14,3) NOT NULL DEFAULT 0;
ALTER TABLE public.stock_balances DROP CONSTRAINT IF EXISTS stock_balances_problem_qty_check;
ALTER TABLE public.stock_balances ADD CONSTRAINT stock_balances_problem_qty_check CHECK (problem_qty >= 0 AND problem_qty <= on_hand);
COMMENT ON COLUMN public.stock_balances.problem_qty IS 'on_hand fiziki qalığının problemli və satışa buraxılmayan hissəsi';

CREATE OR REPLACE FUNCTION public.record_problem_stock_action(_product uuid,_warehouse uuid,_quantity numeric,_action text,_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE tenant uuid; balance public.stock_balances%rowtype; header_id uuid; line_id uuid; movement_id uuid; document_no text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Miqdar 0-dan böyük olmalıdır'; END IF;
  IF _action NOT IN ('problem','write_off') THEN RAISE EXCEPTION 'Yanlış stok əməliyyatı'; END IF;
  IF NULLIF(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Əməliyyatın səbəbini yazın'; END IF;
  SELECT w.tenant_id INTO tenant FROM public.warehouses w
    JOIN public.products p ON p.tenant_id=w.tenant_id AND p.id=_product WHERE w.id=_warehouse;
  IF tenant IS NULL OR auth.uid() IS NULL OR NOT private.has_module_access(tenant,'warehouse','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  SELECT * INTO balance FROM public.stock_balances WHERE tenant_id=tenant AND warehouse_id=_warehouse AND product_id=_product FOR UPDATE;
  IF balance.tenant_id IS NULL OR balance.on_hand-balance.reserved-balance.problem_qty < _quantity THEN
    RAISE EXCEPTION 'Seçilmiş anbarda satışa uyğun qalıq kifayət deyil';
  END IF;
  document_no := 'STK-' || to_char(clock_timestamp(),'YYMMDDHH24MISSMS') || '-' || upper(substr(gen_random_uuid()::text,1,4));
  INSERT INTO public.inventory_returns(tenant_id,return_no,return_type,status,warehouse_id,reason,created_by,completed_by,completed_at)
    VALUES (tenant,document_no,'customer','completed',_warehouse,trim(_reason),auth.uid(),auth.uid(),now()) RETURNING id INTO header_id;
  IF _action='problem' THEN
    UPDATE public.stock_balances SET problem_qty=problem_qty+_quantity,updated_at=now()
     WHERE tenant_id=tenant AND warehouse_id=_warehouse AND product_id=_product;
    INSERT INTO public.inventory_return_lines(tenant_id,return_id,product_id,quantity,condition,disposition,unit_cost,repair_status)
      VALUES (tenant,header_id,_product,_quantity,'damaged','quarantine',coalesce(balance.avg_cost,0),'pending') RETURNING id INTO line_id;
  ELSE
    UPDATE public.stock_balances SET on_hand=on_hand-_quantity,updated_at=now()
     WHERE tenant_id=tenant AND warehouse_id=_warehouse AND product_id=_product;
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES (tenant,_warehouse,_product,'write_off',-_quantity,'out',_quantity,coalesce(balance.avg_cost,0),'inventory_return',header_id,document_no,
        document_no || ' · Məhsul anbardan silindi: ' || trim(_reason),auth.uid()) RETURNING id INTO movement_id;
    INSERT INTO public.inventory_return_lines(tenant_id,return_id,product_id,quantity,condition,disposition,unit_cost,stock_movement_id,repair_status)
      VALUES (tenant,header_id,_product,_quantity,'defective','write_off',coalesce(balance.avg_cost,0),movement_id,'not_required') RETURNING id INTO line_id;
  END IF;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
  VALUES(gen_random_uuid()::text,tenant,auth.uid(),'warehouse',
    CASE WHEN _action='problem' THEN 'problem_stock' ELSE 'stock_write_off' END, document_no || ': ' || trim(_reason),
    jsonb_build_object('document_id',header_id,'line_id',line_id,'product_id',_product,'warehouse_id',_warehouse,'quantity',_quantity,'reason',trim(_reason)));
  RETURN line_id;
END; $fn$;
REVOKE ALL ON FUNCTION public.record_problem_stock_action(uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_problem_stock_action(uuid,uuid,numeric,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.start_inventory_repair(_line uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE target record;
BEGIN
  SELECT l.*, r.status AS return_status, r.warehouse_id INTO target
    FROM public.inventory_return_lines l JOIN public.inventory_returns r ON r.id=l.return_id
   WHERE l.id=_line FOR UPDATE OF l;
  IF target.id IS NULL OR auth.uid() IS NULL OR NOT private.has_module_access(target.tenant_id,'warehouse','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF target.return_status <> 'completed' OR target.disposition <> 'quarantine' THEN RAISE EXCEPTION 'Yalnız tamamlanmış problemli stok təmirə verilə bilər'; END IF;
  IF target.repair_status='repaired' THEN RETURN target.id; END IF;
  UPDATE public.inventory_return_lines SET repair_status='in_progress',repair_started_by=auth.uid(),repair_started_at=COALESCE(repair_started_at,now()) WHERE id=target.id;
  RETURN target.id;
END; $fn$;

CREATE OR REPLACE FUNCTION public.complete_inventory_repair(_line uuid, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE target record;
BEGIN
  SELECT l.*, r.status AS return_status, r.warehouse_id, r.return_no INTO target
    FROM public.inventory_return_lines l JOIN public.inventory_returns r ON r.id=l.return_id
   WHERE l.id=_line FOR UPDATE OF l;
  IF target.id IS NULL OR auth.uid() IS NULL OR NOT private.has_module_access(target.tenant_id,'warehouse','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF target.return_status <> 'completed' OR target.disposition <> 'quarantine' THEN RAISE EXCEPTION 'Yalnız tamamlanmış problemli stok təmir edilə bilər'; END IF;
  IF target.repair_status='repaired' THEN RETURN target.id; END IF;
  UPDATE public.stock_balances SET problem_qty=problem_qty-target.quantity,updated_at=now()
   WHERE tenant_id=target.tenant_id AND warehouse_id=target.warehouse_id AND product_id=target.product_id AND problem_qty>=target.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Problemli stok qalığı təmir miqdarı ilə uyğun deyil'; END IF;
  UPDATE public.inventory_return_lines SET repair_status='repaired',repair_started_by=COALESCE(repair_started_by,auth.uid()),
    repair_started_at=COALESCE(repair_started_at,now()),repaired_by=auth.uid(),repaired_at=now(),repair_note=NULLIF(trim(_note),'')
  WHERE id=target.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
  VALUES(gen_random_uuid()::text,target.tenant_id,auth.uid(),'warehouse','repair_completed',target.return_no || ' üzrə təmir tamamlandı',
    jsonb_build_object('return_line_id',target.id,'product_id',target.product_id,'quantity',target.quantity,'warehouse_id',target.warehouse_id));
  RETURN target.id;
END; $fn$;
REVOKE ALL ON FUNCTION public.start_inventory_repair(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_inventory_repair(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_inventory_repair(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.complete_inventory_repair(uuid,text) TO authenticated,service_role;