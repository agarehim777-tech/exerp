BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  return_no text NOT NULL,
  return_type text NOT NULL CHECK (return_type IN ('customer','vendor')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','inspection','completed','cancelled')),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  reason text,
  created_by uuid REFERENCES auth.users(id),
  completed_by uuid REFERENCES auth.users(id),
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
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_returns_tenant_status_idx ON public.inventory_returns(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_return_lines_product_idx ON public.inventory_return_lines(tenant_id,product_id,created_at DESC);

ALTER TABLE public.inventory_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_return_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_returns_tenant_policy ON public.inventory_returns;
CREATE POLICY inventory_returns_tenant_policy ON public.inventory_returns
FOR ALL USING (public.is_tenant_member(tenant_id, auth.uid()))
WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS inventory_return_lines_tenant_policy ON public.inventory_return_lines;
CREATE POLICY inventory_return_lines_tenant_policy ON public.inventory_return_lines
FOR ALL USING (public.is_tenant_member(tenant_id, auth.uid()))
WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.complete_inventory_return(_return uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  header public.inventory_returns%rowtype;
  line record;
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
    SELECT * INTO balance FROM public.stock_balances
     WHERE tenant_id = header.tenant_id AND warehouse_id = header.warehouse_id AND product_id = line.product_id
     FOR UPDATE;

    IF header.return_type = 'customer' AND line.disposition = 'restock' AND line.condition = 'saleable' THEN
      new_cost := COALESCE(NULLIF(line.unit_cost, 0), balance.avg_cost, 0);
      INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved,avg_cost)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,line.quantity,0,new_cost)
      ON CONFLICT(warehouse_id,product_id) DO UPDATE SET
        avg_cost = CASE WHEN public.stock_balances.on_hand + EXCLUDED.on_hand > 0
          THEN ((public.stock_balances.on_hand * public.stock_balances.avg_cost) + (EXCLUDED.on_hand * EXCLUDED.avg_cost)) /
               (public.stock_balances.on_hand + EXCLUDED.on_hand)
          ELSE public.stock_balances.avg_cost END,
        on_hand = public.stock_balances.on_hand + EXCLUDED.on_hand,
        updated_at = now();
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'customer_return',line.quantity,'in',line.quantity,new_cost,'inventory_return',header.id,header.return_no,'Satışa uyğun müştəri qaytarması',auth.uid()) RETURNING id INTO movement_id;
    ELSIF header.return_type = 'vendor' OR line.disposition = 'vendor_return' THEN
      IF balance.id IS NULL OR balance.on_hand - balance.reserved < line.quantity THEN RAISE EXCEPTION 'Vendor qaytarması üçün satışa uyğun qalıq kifayət deyil'; END IF;
      UPDATE public.stock_balances SET on_hand=on_hand-line.quantity,updated_at=now() WHERE id=balance.id;
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'vendor_return',-line.quantity,'out',line.quantity,balance.avg_cost,'inventory_return',header.id,header.return_no,'Vendor qaytarması',auth.uid()) RETURNING id INTO movement_id;
    ELSE
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,move_type,qty,unit_cost,reference_type,reference_id,doc_no,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'return_quarantine',line.quantity,'adjust',line.quantity,COALESCE(balance.avg_cost,0),'inventory_return',header.id,header.return_no,
        CASE line.disposition WHEN 'write_off' THEN 'Qaytarılan məhsul silinməyə ayrıldı' ELSE 'Qaytarılan məhsul karantinə ayrıldı' END,auth.uid()) RETURNING id INTO movement_id;
    END IF;
    UPDATE public.inventory_return_lines SET stock_movement_id=movement_id,unit_cost=COALESCE(NULLIF(unit_cost,0),balance.avg_cost,0) WHERE id=line.id;
  END LOOP;

  UPDATE public.inventory_returns SET status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now() WHERE id=header.id;
  RETURN header.id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.complete_inventory_return(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_inventory_return(uuid) TO authenticated;

COMMIT;
