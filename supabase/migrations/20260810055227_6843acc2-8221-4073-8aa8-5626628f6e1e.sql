ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS factory_name text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS exchange_rate numeric(18,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0);
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'ədəd';
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit_volume_m3 numeric(18,6) NOT NULL DEFAULT 0 CHECK (unit_volume_m3 >= 0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit_net_weight_kg numeric(18,6) NOT NULL DEFAULT 0 CHECK (unit_net_weight_kg >= 0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS unit_gross_weight_kg numeric(18,6) NOT NULL DEFAULT 0 CHECK (unit_gross_weight_kg >= 0);
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS hs_code text;
ALTER TABLE public.purchase_order_lines ADD COLUMN IF NOT EXISTS duty_rate numeric(9,6) NOT NULL DEFAULT 0 CHECK (duty_rate >= 0);

CREATE TABLE public.procurement_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_no text NOT NULL, container_no text, shipment_date date, expected_arrival_date date, actual_arrival_date date,
  origin_country text, destination_country text, transport_mode text, carrier text, currency text NOT NULL DEFAULT 'AZN',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_transit','arrived','costing','costed','received','closed','cancelled')),
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT, notes text,
  costing_version integer NOT NULL DEFAULT 0, costing_approved_at timestamptz, costing_approved_by uuid REFERENCES auth.users(id),
  received_at timestamptz, received_by uuid REFERENCES auth.users(id), created_by uuid REFERENCES auth.users(id), updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id, shipment_no)
);
CREATE TABLE public.procurement_shipment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.procurement_shipments(id) ON DELETE CASCADE,
  po_line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  shipped_qty numeric(18,3) NOT NULL CHECK (shipped_qty > 0), received_qty numeric(18,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0 AND received_qty <= shipped_qty),
  lot_no text, invoice_unit_price numeric(18,6) NOT NULL CHECK (invoice_unit_price >= 0), exchange_rate numeric(18,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  invoice_amount_base numeric(18,6) GENERATED ALWAYS AS (shipped_qty * invoice_unit_price * exchange_rate) STORED,
  total_volume_m3 numeric(18,6) NOT NULL DEFAULT 0 CHECK (total_volume_m3 >= 0), total_weight_kg numeric(18,6) NOT NULL DEFAULT 0 CHECK (total_weight_kg >= 0),
  duty_rate numeric(9,6) NOT NULL DEFAULT 0 CHECK (duty_rate >= 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(shipment_id, po_line_id)
);
CREATE TABLE public.procurement_shipment_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.procurement_shipments(id) ON DELETE CASCADE,
  cost_type text NOT NULL CHECK (cost_type IN ('customs_duty','customs_clearance','broker','international_freight','local_freight','terminal','insurance','certification','other')),
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL, document_no text, cost_date date NOT NULL DEFAULT current_date,
  amount numeric(18,6) NOT NULL CHECK (amount >= 0), currency text NOT NULL DEFAULT 'AZN', exchange_rate numeric(18,8) NOT NULL DEFAULT 1 CHECK(exchange_rate > 0),
  amount_base numeric(18,6) GENERATED ALWAYS AS (amount * exchange_rate) STORED,
  allocation_method text NOT NULL CHECK (allocation_method IN ('invoice_value','volume','weight','quantity','equal','direct','manual')),
  direct_shipment_line_id uuid REFERENCES public.procurement_shipment_lines(id) ON DELETE RESTRICT, manual_allocations jsonb NOT NULL DEFAULT '{}'::jsonb, notes text,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.procurement_cost_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.procurement_shipments(id) ON DELETE CASCADE,
  shipment_line_id uuid NOT NULL REFERENCES public.procurement_shipment_lines(id) ON DELETE CASCADE,
  shipment_cost_id uuid NOT NULL REFERENCES public.procurement_shipment_costs(id) ON DELETE CASCADE,
  costing_version integer NOT NULL, basis_amount numeric(18,6) NOT NULL, share numeric(18,12) NOT NULL, allocated_amount numeric(18,6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shipment_cost_id, shipment_line_id, costing_version)
);
CREATE TABLE public.procurement_landed_cost_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.procurement_shipments(id) ON DELETE CASCADE,
  shipment_line_id uuid NOT NULL REFERENCES public.procurement_shipment_lines(id) ON DELETE CASCADE, costing_version integer NOT NULL,
  invoice_amount numeric(18,6) NOT NULL, customs_amount numeric(18,6) NOT NULL DEFAULT 0, freight_amount numeric(18,6) NOT NULL DEFAULT 0,
  other_amount numeric(18,6) NOT NULL DEFAULT 0, landed_total numeric(18,6) NOT NULL, unit_landed_cost numeric(18,6) NOT NULL,
  is_approved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(shipment_line_id, costing_version)
);
CREATE TABLE public.procurement_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  receipt_no text NOT NULL, shipment_id uuid NOT NULL UNIQUE REFERENCES public.procurement_shipments(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT, receipt_date date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id, receipt_no)
);
CREATE TABLE public.procurement_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receipt_id uuid NOT NULL REFERENCES public.procurement_receipts(id) ON DELETE CASCADE,
  shipment_line_id uuid NOT NULL UNIQUE REFERENCES public.procurement_shipment_lines(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT, po_line_id uuid NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE RESTRICT,
  lot_no text, received_qty numeric(18,3) NOT NULL CHECK(received_qty > 0), unit_landed_cost numeric(18,6) NOT NULL, landed_total numeric(18,6) NOT NULL,
  stock_movement_id uuid UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT
);

CREATE INDEX ON public.procurement_shipment_lines(shipment_id); CREATE INDEX ON public.procurement_shipment_lines(po_line_id);
CREATE INDEX ON public.procurement_shipment_costs(shipment_id); CREATE INDEX ON public.procurement_cost_allocations(shipment_id, costing_version);

DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['procurement_shipments','procurement_shipment_lines','procurement_shipment_costs','procurement_cost_allocations','procurement_landed_cost_lines','procurement_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid())) WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()))', t || '_tenant', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
END LOOP; END $$;
ALTER TABLE public.procurement_receipt_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY procurement_receipt_lines_tenant ON public.procurement_receipt_lines FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.procurement_receipts r WHERE r.id=receipt_id AND public.is_tenant_member(r.tenant_id,auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.procurement_receipts r WHERE r.id=receipt_id AND public.is_tenant_member(r.tenant_id,auth.uid())));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.procurement_receipt_lines TO authenticated;
GRANT ALL ON public.procurement_receipt_lines TO service_role;

CREATE OR REPLACE FUNCTION public.recalculate_shipment_landed_cost(_shipment uuid, _approve boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.procurement_shipments%rowtype; c record; l record; v integer; total_basis numeric; allocated numeric; remainder numeric; largest uuid;
BEGIN
 SELECT * INTO s FROM public.procurement_shipments WHERE id=_shipment FOR UPDATE;
 IF s.id IS NULL OR NOT public.is_tenant_member(s.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF s.status IN ('received','closed','cancelled') THEN RAISE EXCEPTION 'Göndəriş dəyişdirilə bilməz'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.procurement_shipment_lines WHERE shipment_id=s.id) THEN RAISE EXCEPTION 'Göndərişdə məhsul yoxdur'; END IF;
 v:=s.costing_version+1; DELETE FROM public.procurement_cost_allocations WHERE shipment_id=s.id AND costing_version=v; DELETE FROM public.procurement_landed_cost_lines WHERE shipment_id=s.id AND costing_version=v;
 FOR c IN SELECT * FROM public.procurement_shipment_costs WHERE shipment_id=s.id LOOP
   IF c.allocation_method='direct' THEN
     IF c.direct_shipment_line_id IS NULL THEN RAISE EXCEPTION 'Birbaşa xərc üçün məhsul seçilməyib'; END IF;
     INSERT INTO public.procurement_cost_allocations(tenant_id,shipment_id,shipment_line_id,shipment_cost_id,costing_version,basis_amount,share,allocated_amount) VALUES(s.tenant_id,s.id,c.direct_shipment_line_id,c.id,v,1,1,c.amount_base);
   ELSIF c.allocation_method='manual' THEN
     allocated:=0;
     FOR l IN SELECT * FROM public.procurement_shipment_lines WHERE shipment_id=s.id LOOP
       remainder:=coalesce((c.manual_allocations->>l.id::text)::numeric,0); allocated:=allocated+remainder;
       INSERT INTO public.procurement_cost_allocations(tenant_id,shipment_id,shipment_line_id,shipment_cost_id,costing_version,basis_amount,share,allocated_amount) VALUES(s.tenant_id,s.id,l.id,c.id,v,remainder,CASE WHEN c.amount_base=0 THEN 0 ELSE remainder/c.amount_base END,remainder);
     END LOOP;
     IF round(allocated,6)<>round(c.amount_base,6) THEN RAISE EXCEPTION 'Əl bölgüsünün cəmi xərc məbləğinə bərabər deyil'; END IF;
   ELSE
     SELECT sum(CASE c.allocation_method WHEN 'invoice_value' THEN invoice_amount_base WHEN 'volume' THEN total_volume_m3 WHEN 'weight' THEN total_weight_kg WHEN 'quantity' THEN shipped_qty WHEN 'equal' THEN 1 ELSE 0 END) INTO total_basis FROM public.procurement_shipment_lines WHERE shipment_id=s.id;
     IF coalesce(total_basis,0)=0 THEN RAISE EXCEPTION 'Bölüşdürmə bazası sıfırdır: %',c.allocation_method; END IF;
     SELECT id INTO largest FROM public.procurement_shipment_lines WHERE shipment_id=s.id ORDER BY (CASE c.allocation_method WHEN 'invoice_value' THEN invoice_amount_base WHEN 'volume' THEN total_volume_m3 WHEN 'weight' THEN total_weight_kg WHEN 'quantity' THEN shipped_qty ELSE 1 END) DESC,id LIMIT 1;
     allocated:=0;
     FOR l IN SELECT *,CASE c.allocation_method WHEN 'invoice_value' THEN invoice_amount_base WHEN 'volume' THEN total_volume_m3 WHEN 'weight' THEN total_weight_kg WHEN 'quantity' THEN shipped_qty WHEN 'equal' THEN 1 END basis FROM public.procurement_shipment_lines WHERE shipment_id=s.id LOOP
       remainder:=round(c.amount_base*(l.basis/total_basis),6); allocated:=allocated+remainder;
       INSERT INTO public.procurement_cost_allocations(tenant_id,shipment_id,shipment_line_id,shipment_cost_id,costing_version,basis_amount,share,allocated_amount) VALUES(s.tenant_id,s.id,l.id,c.id,v,l.basis,l.basis/total_basis,remainder);
     END LOOP;
     UPDATE public.procurement_cost_allocations SET allocated_amount=allocated_amount+(c.amount_base-allocated) WHERE shipment_cost_id=c.id AND shipment_line_id=largest AND costing_version=v;
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.procurement_shipment_lines WHERE shipment_id=s.id AND received_qty<=0) THEN RAISE EXCEPTION 'Faktiki qəbul miqdarı daxil edilməyib'; END IF;
 INSERT INTO public.procurement_landed_cost_lines(tenant_id,shipment_id,shipment_line_id,costing_version,invoice_amount,customs_amount,freight_amount,other_amount,landed_total,unit_landed_cost,is_approved)
 SELECT s.tenant_id,s.id,sl.id,v,sl.invoice_amount_base,
 coalesce(sum(a.allocated_amount) FILTER(WHERE c.cost_type IN('customs_duty','customs_clearance','broker')),0)+(sl.invoice_amount_base*sl.duty_rate),
 coalesce(sum(a.allocated_amount) FILTER(WHERE c.cost_type IN('international_freight','local_freight')),0),
 coalesce(sum(a.allocated_amount) FILTER(WHERE c.cost_type NOT IN('customs_duty','customs_clearance','broker','international_freight','local_freight')),0),
 sl.invoice_amount_base+coalesce(sum(a.allocated_amount),0)+(sl.invoice_amount_base*sl.duty_rate),
 (sl.invoice_amount_base+coalesce(sum(a.allocated_amount),0)+(sl.invoice_amount_base*sl.duty_rate))/NULLIF(sl.received_qty,0),_approve
 FROM public.procurement_shipment_lines sl LEFT JOIN public.procurement_cost_allocations a ON a.shipment_line_id=sl.id AND a.costing_version=v LEFT JOIN public.procurement_shipment_costs c ON c.id=a.shipment_cost_id
 WHERE sl.shipment_id=s.id GROUP BY sl.id;
 IF EXISTS(SELECT 1 FROM public.procurement_landed_cost_lines lc JOIN public.procurement_shipment_lines sl ON sl.id=lc.shipment_line_id WHERE lc.shipment_id=s.id AND lc.costing_version=v AND sl.received_qty<=0) THEN RAISE EXCEPTION 'Faktiki qəbul miqdarı daxil edilməyib'; END IF;
 UPDATE public.procurement_shipments SET costing_version=v,status=CASE WHEN _approve THEN 'costed' ELSE 'costing' END,costing_approved_at=CASE WHEN _approve THEN now() ELSE NULL END,costing_approved_by=CASE WHEN _approve THEN auth.uid() ELSE NULL END,updated_at=now() WHERE id=s.id; RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.receive_landed_cost_shipment(_shipment uuid,_warehouse uuid,_receipt_date date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.procurement_shipments%rowtype; r uuid; x record; m uuid;
BEGIN SELECT * INTO s FROM public.procurement_shipments WHERE id=_shipment FOR UPDATE;
 IF s.id IS NULL OR NOT public.is_tenant_member(s.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF s.status<>'costed' OR s.costing_approved_at IS NULL THEN RAISE EXCEPTION 'Maya hesablaması təsdiqlənməyib'; END IF;
 IF EXISTS(SELECT 1 FROM public.procurement_receipts WHERE shipment_id=s.id) THEN RAISE EXCEPTION 'Göndəriş artıq anbara qəbul edilib'; END IF;
 INSERT INTO public.procurement_receipts(tenant_id,receipt_no,shipment_id,warehouse_id,receipt_date,created_by) VALUES(s.tenant_id,'GRN-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS'),s.id,_warehouse,_receipt_date,auth.uid()) RETURNING id INTO r;
 FOR x IN SELECT sl.*,pol.product_id,pol.po_id,pol.product_sku,lc.unit_landed_cost,lc.landed_total FROM public.procurement_shipment_lines sl JOIN public.purchase_order_lines pol ON pol.id=sl.po_line_id JOIN public.procurement_landed_cost_lines lc ON lc.shipment_line_id=sl.id AND lc.costing_version=s.costing_version AND lc.is_approved WHERE sl.shipment_id=s.id LOOP
   IF x.product_id IS NULL THEN RAISE EXCEPTION 'Məhsul bağlantısı yoxdur: %',x.product_sku; END IF;
   INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,sku,move_type,qty,unit_cost,doc_no,reference,note,created_by) VALUES(s.tenant_id,_warehouse,x.product_id,x.product_sku,'in',x.received_qty,x.unit_landed_cost,'GRN-'||r::text,s.shipment_no,'Landed cost qəbulu',auth.uid()) RETURNING id INTO m;
   INSERT INTO public.procurement_receipt_lines(receipt_id,shipment_line_id,product_id,po_line_id,lot_no,received_qty,unit_landed_cost,landed_total,stock_movement_id) VALUES(r,x.id,x.product_id,x.po_line_id,x.lot_no,x.received_qty,x.unit_landed_cost,x.landed_total,m);
 END LOOP;
 UPDATE public.procurement_shipments SET status='received',warehouse_id=_warehouse,received_at=now(),received_by=auth.uid(),updated_at=now() WHERE id=s.id; RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.recalculate_shipment_landed_cost(uuid,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_landed_cost_shipment(uuid,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_shipment_landed_cost(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_landed_cost_shipment(uuid,uuid,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_received_procurement() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.procurement_shipments s WHERE s.id=COALESCE(OLD.shipment_id,NEW.shipment_id) AND s.status IN('received','closed')) THEN RAISE EXCEPTION 'Anbara qəbul edilmiş göndəriş dəyişdirilə bilməz; düzəliş sənədi yaradın'; END IF;
 IF TG_TABLE_NAME='procurement_shipment_costs' THEN UPDATE public.procurement_shipments SET status='costing',costing_approved_at=NULL,costing_approved_by=NULL WHERE id=COALESCE(OLD.shipment_id,NEW.shipment_id) AND status='costed'; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER guard_shipment_lines BEFORE INSERT OR UPDATE OR DELETE ON public.procurement_shipment_lines FOR EACH ROW EXECUTE FUNCTION public.guard_received_procurement();
CREATE TRIGGER guard_shipment_costs BEFORE INSERT OR UPDATE OR DELETE ON public.procurement_shipment_costs FOR EACH ROW EXECUTE FUNCTION public.guard_received_procurement();

CREATE OR REPLACE FUNCTION public.audit_procurement_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id); entity uuid:=COALESCE(NEW.id,OLD.id);
BEGIN INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload) VALUES('PROC-'||gen_random_uuid()::text,tenant,auth.uid(),'Satınalma',TG_TABLE_NAME||' '||TG_OP,entity::text,jsonb_build_object('old',to_jsonb(OLD),'new',to_jsonb(NEW))); RETURN COALESCE(NEW,OLD); END $$;
CREATE TRIGGER audit_procurement_shipments AFTER INSERT OR UPDATE OR DELETE ON public.procurement_shipments FOR EACH ROW EXECUTE FUNCTION public.audit_procurement_change();
CREATE TRIGGER audit_procurement_costs AFTER INSERT OR UPDATE OR DELETE ON public.procurement_shipment_costs FOR EACH ROW EXECUTE FUNCTION public.audit_procurement_change();
CREATE TRIGGER audit_procurement_receipts AFTER INSERT OR UPDATE OR DELETE ON public.procurement_receipts FOR EACH ROW EXECUTE FUNCTION public.audit_procurement_change();