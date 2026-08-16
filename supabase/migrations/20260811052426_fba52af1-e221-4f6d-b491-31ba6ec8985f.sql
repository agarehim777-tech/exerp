CREATE TABLE IF NOT EXISTS public.inventory_accounting_settings(
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 valuation_method text NOT NULL DEFAULT 'weighted_average' CHECK(valuation_method IN('weighted_average','fifo')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inventory_cost_layers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 source_movement_id uuid UNIQUE REFERENCES public.stock_movements(id) ON DELETE SET NULL, source_type text NOT NULL, source_id uuid,
 received_at timestamptz NOT NULL DEFAULT now(), original_qty numeric(18,3) NOT NULL CHECK(original_qty>0),
 remaining_qty numeric(18,3) NOT NULL CHECK(remaining_qty>=0), unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0)
);
CREATE INDEX IF NOT EXISTS inventory_cost_layers_fifo_idx ON public.inventory_cost_layers(tenant_id,product_id,received_at,id) WHERE remaining_qty>0;
CREATE TABLE IF NOT EXISTS public.sales_cost_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), product_id uuid NOT NULL REFERENCES public.products(id),
 cost_layer_id uuid REFERENCES public.inventory_cost_layers(id), stock_movement_id uuid UNIQUE REFERENCES public.stock_movements(id),
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0),
 total_cost numeric(18,6) NOT NULL CHECK(total_cost>=0), reversed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.order_accounting_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, event_type text NOT NULL CHECK(event_type IN('delivery','cancellation')),
 journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id), amount numeric(18,2) NOT NULL DEFAULT 0,
 cogs numeric(18,2) NOT NULL DEFAULT 0, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,event_type)
);

GRANT SELECT,INSERT,UPDATE ON public.inventory_accounting_settings TO authenticated;
GRANT SELECT ON public.inventory_cost_layers,public.sales_cost_allocations,public.order_accounting_events TO authenticated;
GRANT ALL ON public.inventory_accounting_settings,public.inventory_cost_layers,public.sales_cost_allocations,public.order_accounting_events TO service_role;

ALTER TABLE public.inventory_accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_accounting_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_accounting_settings_tenant ON public.inventory_accounting_settings;
DROP POLICY IF EXISTS inventory_cost_layers_tenant ON public.inventory_cost_layers;
DROP POLICY IF EXISTS sales_cost_allocations_tenant ON public.sales_cost_allocations;
DROP POLICY IF EXISTS order_accounting_events_tenant ON public.order_accounting_events;
CREATE POLICY inventory_accounting_settings_tenant ON public.inventory_accounting_settings FOR ALL TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid())) WITH CHECK(public.is_tenant_admin(tenant_id,auth.uid()));
CREATE POLICY inventory_cost_layers_tenant ON public.inventory_cost_layers FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY sales_cost_allocations_tenant ON public.sales_cost_allocations FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY order_accounting_events_tenant ON public.order_accounting_events FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid()));

UPDATE public.stock_balances b SET avg_cost=x.avg_cost
FROM (
 SELECT tenant_id,warehouse_id,product_id,
  round(sum(abs(qty)*unit_cost)/NULLIF(sum(abs(qty)),0),6) avg_cost
 FROM public.stock_movements
 WHERE move_type='in' AND qty>0 AND unit_cost>0 AND product_id IS NOT NULL
 GROUP BY tenant_id,warehouse_id,product_id
) x WHERE b.tenant_id=x.tenant_id AND b.warehouse_id=x.warehouse_id AND b.product_id=x.product_id AND COALESCE(b.avg_cost,0)=0;

INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,received_at,original_qty,remaining_qty,unit_cost)
SELECT q.tenant_id,q.warehouse_id,q.product_id,q.id,'opening_balance',NULL,q.moved_at,q.qty,GREATEST(0,LEAST(q.qty,q.on_hand-q.newer_qty)),q.unit_cost
FROM (
 SELECT m.*,b.qty AS on_hand,COALESCE(sum(m.qty) OVER(PARTITION BY m.tenant_id,m.warehouse_id,m.product_id ORDER BY m.moved_at DESC,m.id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) newer_qty
 FROM public.stock_movements m JOIN public.stock_balances b ON b.tenant_id=m.tenant_id AND b.warehouse_id=m.warehouse_id AND b.product_id=m.product_id
 WHERE m.move_type='in' AND m.qty>0 AND m.unit_cost>0 AND m.product_id IS NOT NULL
) q
ON CONFLICT(source_movement_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_inventory_accounts(_tenant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.chart_of_accounts(tenant_id,code,name,type) VALUES
 (_tenant,'1000','Kassa','asset'),(_tenant,'1010','Bank hesabı','asset'),(_tenant,'1200','Debitor borcları','asset'),
 (_tenant,'2050','Mal ehtiyatları','asset'),(_tenant,'2100','ƏDV öhdəliyi','liability'),(_tenant,'2200','Təchizatçı borcları','liability'),
 (_tenant,'2300','Müştəri avansları və geri ödənişlər','liability'),(_tenant,'4000','Satış gəliri','revenue'),
 (_tenant,'5000','Satılmış məhsulun maya dəyəri','expense') ON CONFLICT(tenant_id,code) DO NOTHING;
 INSERT INTO public.inventory_accounting_settings(tenant_id) VALUES(_tenant) ON CONFLICT DO NOTHING;
END $$;
DO $$ DECLARE t uuid; BEGIN FOR t IN SELECT id FROM public.tenants LOOP PERFORM public.ensure_inventory_accounts(t); END LOOP; END $$;

CREATE OR REPLACE FUNCTION public.process_sales_order_status(_order_id uuid,_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE o public.orders%rowtype; it record; b record; l record; need numeric; take numeric; method text; mv uuid; cogs numeric:=0; je uuid; n int:=1;
 ar uuid; rev uuid; vat uuid; ia uuid; ca uuid; aa uuid; paid numeric; oldq numeric; oldc numeric;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF o.id IS NULL OR NOT private.has_module_access(o.tenant_id,'sales','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF _status NOT IN('draft','pending','confirmed','processing','shipped','delivered','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 IF _status='delivered' THEN
  IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='delivery') THEN UPDATE public.orders SET status='delivered' WHERE id=o.id; RETURN; END IF;
  PERFORM public.ensure_inventory_accounts(o.tenant_id); SELECT valuation_method INTO method FROM public.inventory_accounting_settings WHERE tenant_id=o.tenant_id;
  FOR it IN SELECT * FROM public.order_items WHERE order_id=o.id ORDER BY line_no FOR UPDATE LOOP
   IF it.product_id IS NULL THEN CONTINUE; END IF; need:=it.qty;
   IF method='fifo' THEN
    FOR l IN SELECT * FROM public.inventory_cost_layers WHERE tenant_id=o.tenant_id AND product_id=it.product_id AND remaining_qty>0 ORDER BY received_at,id FOR UPDATE LOOP
     EXIT WHEN need<=0; take:=LEAST(need,l.remaining_qty); UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-take WHERE id=l.id;
     UPDATE public.stock_balances SET qty=qty-take,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=l.warehouse_id AND product_id=it.product_id AND qty>=take;
     IF NOT FOUND THEN RAISE EXCEPTION 'Stok və maya qatı uyğun deyil: %',it.description; END IF;
     INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,move_type,qty,unit_cost,reference,doc_no,note,created_by) VALUES(o.tenant_id,l.warehouse_id,it.product_id,'out',take,l.unit_cost,'sales_order:'||o.id,o.order_no,o.order_no||' təhvil',auth.uid()) RETURNING id INTO mv;
     INSERT INTO public.sales_cost_allocations(tenant_id,order_id,order_item_id,warehouse_id,product_id,cost_layer_id,stock_movement_id,quantity,unit_cost,total_cost) VALUES(o.tenant_id,o.id,it.id,l.warehouse_id,it.product_id,l.id,mv,take,l.unit_cost,take*l.unit_cost);
     cogs:=cogs+take*l.unit_cost; need:=need-take;
    END LOOP;
   ELSE
    FOR b IN SELECT * FROM public.stock_balances WHERE tenant_id=o.tenant_id AND product_id=it.product_id AND qty>0 ORDER BY qty DESC,id FOR UPDATE LOOP
     EXIT WHEN need<=0; take:=LEAST(need,b.qty); UPDATE public.stock_balances SET qty=qty-take,updated_at=now() WHERE id=b.id;
     INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,move_type,qty,unit_cost,reference,doc_no,note,created_by) VALUES(o.tenant_id,b.warehouse_id,it.product_id,'out',take,COALESCE(b.avg_cost,0),'sales_order:'||o.id,o.order_no,o.order_no||' təhvil',auth.uid()) RETURNING id INTO mv;
     INSERT INTO public.sales_cost_allocations(tenant_id,order_id,order_item_id,warehouse_id,product_id,stock_movement_id,quantity,unit_cost,total_cost) VALUES(o.tenant_id,o.id,it.id,b.warehouse_id,it.product_id,mv,take,COALESCE(b.avg_cost,0),take*COALESCE(b.avg_cost,0));
     cogs:=cogs+take*COALESCE(b.avg_cost,0); need:=need-take;
    END LOOP;
   END IF;
   IF need>0.0005 THEN RAISE EXCEPTION 'Anbarda kifayət qədər məhsul yoxdur: %',COALESCE(it.description,it.product_id::text); END IF;
  END LOOP;
  ar:=public.gl_account_by_code(o.tenant_id,'1200'); rev:=public.gl_account_by_code(o.tenant_id,'4000'); vat:=public.gl_account_by_code(o.tenant_id,'2100'); ia:=public.gl_account_by_code(o.tenant_id,'2050'); ca:=public.gl_account_by_code(o.tenant_id,'5000'); aa:=public.gl_account_by_code(o.tenant_id,'2300');
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,o.order_date,o.order_no,'Satış və maya uçotu','sales_order_delivery',o.id,auth.uid()) RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ar,o.total,0,'Müştəri borcu',1),(je,rev,0,o.subtotal,'Satış gəliri',2),(je,vat,0,COALESCE(o.vat_total,0),'ƏDV',3); n:=4;
  IF cogs>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ca,round(cogs,2),0,'Satışın mayası',n),(je,ia,0,round(cogs,2),'Mal ehtiyatı',n+1); n:=n+2; END IF;
  paid:=LEAST(COALESCE(o.paid_amount,0),o.total); IF paid>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,aa,paid,0,'Avansın bağlanması',n),(je,ar,0,paid,'Ödənilmiş debitor',n+1); END IF;
  UPDATE public.journal_entries SET posted=true WHERE id=je; INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by) VALUES(o.tenant_id,o.id,'delivery',je,o.total,round(cogs,2),auth.uid()); UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=o.id;
 ELSIF _status='cancelled' AND EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='delivery') THEN
  IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='cancellation') THEN RETURN; END IF;
  FOR b IN SELECT * FROM public.sales_cost_allocations WHERE order_id=o.id AND reversed_at IS NULL FOR UPDATE LOOP
   SELECT COALESCE(qty,0),COALESCE(avg_cost,0) INTO oldq,oldc FROM public.stock_balances WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id FOR UPDATE;
   UPDATE public.stock_balances SET avg_cost=((COALESCE(oldq,0)*COALESCE(oldc,0))+(b.quantity*b.unit_cost))/NULLIF(COALESCE(oldq,0)+b.quantity,0),qty=COALESCE(oldq,0)+b.quantity,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;
   IF b.cost_layer_id IS NOT NULL THEN UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty+b.quantity WHERE id=b.cost_layer_id; END IF;
   INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,move_type,qty,unit_cost,reference,doc_no,note,created_by) VALUES(o.tenant_id,b.warehouse_id,b.product_id,'in',b.quantity,b.unit_cost,'sales_return:'||o.id,o.order_no,o.order_no||' ləğv',auth.uid()); UPDATE public.sales_cost_allocations SET reversed_at=now() WHERE id=b.id;
  END LOOP;
  SELECT e.cogs INTO cogs FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery';
  ar:=public.gl_account_by_code(o.tenant_id,'1200'); rev:=public.gl_account_by_code(o.tenant_id,'4000'); vat:=public.gl_account_by_code(o.tenant_id,'2100'); ia:=public.gl_account_by_code(o.tenant_id,'2050'); ca:=public.gl_account_by_code(o.tenant_id,'5000'); aa:=public.gl_account_by_code(o.tenant_id,'2300'); paid:=LEAST(COALESCE(o.paid_amount,0),o.total);
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,current_date,o.order_no||'-L','Satışın ləğvi','sales_order_cancellation',o.id,auth.uid()) RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,rev,o.subtotal,0,'Gəlirin ləğvi',1),(je,vat,COALESCE(o.vat_total,0),0,'ƏDV ləğvi',2),(je,ar,0,o.total-paid,'Debitor ləğvi',3),(je,aa,0,paid,'Geri ödəniləcək məbləğ',4);
  IF COALESCE(cogs,0)>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ia,cogs,0,'Stok qaytarması',5),(je,ca,0,cogs,'Maya ləğvi',6); END IF;
  UPDATE public.journal_entries SET posted=true WHERE id=je; INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by) VALUES(o.tenant_id,o.id,'cancellation',je,o.total,COALESCE(cogs,0),auth.uid()); UPDATE public.orders SET status='cancelled',updated_at=now() WHERE id=o.id;
 ELSE
  IF o.status='delivered' THEN RAISE EXCEPTION 'Təhvil verilmiş satış yalnız ləğv edilə bilər'; END IF; UPDATE public.orders SET status=_status,updated_at=now() WHERE id=o.id;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.register_order_payment(_order_id uuid,_amount numeric,_account_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE o public.orders%rowtype; a public.cash_accounts%rowtype; tx uuid; je uuid; cash uuid; contra uuid; np numeric;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE; IF o.id IS NULL OR NOT private.has_module_access(o.tenant_id,'sales','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF _amount<=0 OR COALESCE(o.paid_amount,0)+_amount>o.total+0.009 THEN RAISE EXCEPTION 'Ödəniş məbləği düzgün deyil'; END IF;
 SELECT * INTO a FROM public.cash_accounts WHERE id=_account_id AND tenant_id=o.tenant_id AND is_active FOR UPDATE; IF a.id IS NULL THEN RAISE EXCEPTION 'Kassa tapılmadı'; END IF; PERFORM public.ensure_inventory_accounts(o.tenant_id);
 INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,customer_id,reference,description,occurred_at) VALUES(o.tenant_id,a.id,'in',_amount,o.currency,'sales_payment',o.customer_id,o.order_no,o.order_no||' ödənişi',current_date) RETURNING id INTO tx;
 np:=round(COALESCE(o.paid_amount,0)+_amount,2); UPDATE public.orders SET paid_amount=np,payment_status=CASE WHEN np>=total THEN 'paid' ELSE 'partial' END,updated_at=now() WHERE id=o.id;
 cash:=COALESCE(a.gl_account_id,public.gl_account_by_code(o.tenant_id,CASE WHEN a.type::text='cash' THEN '1000' ELSE '1010' END)); contra:=public.gl_account_by_code(o.tenant_id,CASE WHEN o.status='delivered' THEN '1200' ELSE '2300' END);
 INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,current_date,o.order_no,'Satış ödənişi','sales_order_payment',tx,auth.uid()) RETURNING id INTO je;
 INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,cash,_amount,0,'Kassa/bank',1),(je,contra,0,_amount,CASE WHEN o.status='delivered' THEN 'Debitor bağlanması' ELSE 'Müştəri avansı' END,2); UPDATE public.journal_entries SET posted=true WHERE id=je; RETURN tx;
END $$;

CREATE OR REPLACE FUNCTION public.post_invoice_to_gl(_invoice_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.sales_invoices%rowtype; je uuid; ar uuid; rev uuid; vat uuid;
BEGIN
 SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
 IF inv.id IS NULL OR NOT public.is_tenant_member(inv.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'invoice not found or forbidden'; END IF;
 IF inv.posted THEN RETURN inv.journal_entry_id; END IF;
 IF inv.order_id IS NOT NULL THEN
  SELECT journal_entry_id INTO je FROM public.order_accounting_events WHERE order_id=inv.order_id AND event_type='delivery';
  IF je IS NOT NULL THEN UPDATE public.sales_invoices SET posted=true,journal_entry_id=je,status=CASE WHEN status='draft' THEN 'issued'::public.sales_invoice_status ELSE status END,updated_at=now() WHERE id=inv.id; RETURN je; END IF;
 END IF;
 PERFORM public.ensure_inventory_accounts(inv.tenant_id); ar:=public.gl_account_by_code(inv.tenant_id,'1200'); rev:=public.gl_account_by_code(inv.tenant_id,'4000'); vat:=public.gl_account_by_code(inv.tenant_id,'2100');
 INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(inv.tenant_id,inv.invoice_date,inv.invoice_no,'Satış fakturası','sales_invoice',inv.id,auth.uid()) RETURNING id INTO je;
 INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ar,inv.total,0,'Debitor borcu',1),(je,rev,0,inv.total-COALESCE(inv.vat_total,0),'Satış gəliri',2),(je,vat,0,COALESCE(inv.vat_total,0),'ƏDV öhdəliyi',3);
 UPDATE public.journal_entries SET posted=true WHERE id=je; UPDATE public.sales_invoices SET posted=true,journal_entry_id=je,status=CASE WHEN status='draft' THEN 'issued'::public.sales_invoice_status ELSE status END,updated_at=now() WHERE id=inv.id; RETURN je;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(_invoice_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv public.sales_invoices%rowtype; oldje public.journal_entries%rowtype; je uuid; row record;
BEGIN
 SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
 IF inv.id IS NULL OR NOT public.is_tenant_member(inv.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'invoice not found or forbidden'; END IF;
 IF inv.status='cancelled' THEN RETURN; END IF;
 IF inv.order_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=inv.order_id AND event_type='delivery') THEN RAISE EXCEPTION 'Bu faktura sifarişə bağlıdır. Əvvəlcə satışı ləğv edin.'; END IF;
 IF inv.posted AND inv.journal_entry_id IS NOT NULL THEN
  SELECT * INTO oldje FROM public.journal_entries WHERE id=inv.journal_entry_id;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(inv.tenant_id,current_date,inv.invoice_no||'-L','Faktura ləğvi','sales_invoice_cancellation',inv.id,auth.uid()) RETURNING id INTO je;
  FOR row IN SELECT * FROM public.journal_lines WHERE entry_id=oldje.id ORDER BY line_no LOOP INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,row.account_id,row.credit,row.debit,'Ləğv: '||COALESCE(row.memo,''),row.line_no); END LOOP;
  UPDATE public.journal_entries SET posted=true WHERE id=je;
 END IF;
 UPDATE public.sales_invoices SET status='cancelled',updated_at=now() WHERE id=inv.id;
END $$;

REVOKE ALL ON FUNCTION public.ensure_inventory_accounts(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.process_sales_order_status(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.register_order_payment(uuid,numeric,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_sales_order_status(uuid,text),public.register_order_payment(uuid,numeric,uuid),public.post_invoice_to_gl(uuid),public.cancel_sales_invoice(uuid) TO authenticated,service_role;