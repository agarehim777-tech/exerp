-- Landed cost, inventory, COGS and profit/loss integration.

ALTER TABLE public.stock_balances ADD COLUMN IF NOT EXISTS avg_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK(avg_cost>=0);

CREATE TABLE IF NOT EXISTS public.inventory_accounting_settings(
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 valuation_method text NOT NULL DEFAULT 'weighted_average' CHECK(valuation_method IN('weighted_average','fifo')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inventory_cost_layers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), product_id uuid NOT NULL REFERENCES public.products(id),
 source_movement_id uuid UNIQUE REFERENCES public.stock_movements(id), source_type text NOT NULL, source_id uuid,
 received_at timestamptz NOT NULL DEFAULT now(), original_qty numeric(18,3) NOT NULL CHECK(original_qty>0),
 remaining_qty numeric(18,3) NOT NULL CHECK(remaining_qty>=0), unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0)
);
CREATE INDEX IF NOT EXISTS inventory_cost_layers_fifo_idx ON public.inventory_cost_layers(tenant_id,product_id,received_at,id) WHERE remaining_qty>0;
CREATE TABLE IF NOT EXISTS public.sales_cost_allocations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id), order_item_id uuid NOT NULL REFERENCES public.order_items(id),
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id), product_id uuid NOT NULL REFERENCES public.products(id),
 cost_layer_id uuid REFERENCES public.inventory_cost_layers(id), stock_movement_id uuid UNIQUE REFERENCES public.stock_movements(id),
 quantity numeric(18,3) NOT NULL CHECK(quantity>0), unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0),
 total_cost numeric(18,6) NOT NULL CHECK(total_cost>=0), reversed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.order_accounting_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id), event_type text NOT NULL CHECK(event_type IN('delivery','cancellation')),
 journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id), amount numeric(18,2) NOT NULL DEFAULT 0,
 cogs numeric(18,2) NOT NULL DEFAULT 0, created_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,event_type)
);
ALTER TABLE public.inventory_accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_accounting_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_accounting_settings_tenant ON public.inventory_accounting_settings;
CREATE POLICY inventory_accounting_settings_tenant ON public.inventory_accounting_settings FOR ALL TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid())) WITH CHECK(public.is_tenant_admin(tenant_id,auth.uid()));
DROP POLICY IF EXISTS inventory_cost_layers_tenant ON public.inventory_cost_layers;
CREATE POLICY inventory_cost_layers_tenant ON public.inventory_cost_layers FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS sales_cost_allocations_tenant ON public.sales_cost_allocations;
CREATE POLICY sales_cost_allocations_tenant ON public.sales_cost_allocations FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS order_accounting_events_tenant ON public.order_accounting_events;
CREATE POLICY order_accounting_events_tenant ON public.order_accounting_events FOR SELECT TO authenticated USING(public.is_tenant_member(tenant_id,auth.uid()));
GRANT SELECT,INSERT,UPDATE ON public.inventory_accounting_settings TO authenticated;
GRANT SELECT ON public.inventory_cost_layers,public.sales_cost_allocations,public.order_accounting_events TO authenticated;
GRANT ALL ON public.inventory_accounting_settings,public.inventory_cost_layers,public.sales_cost_allocations,public.order_accounting_events TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_inventory_accounts(_tenant uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_tenant_member(_tenant, auth.uid()) THEN
   RAISE EXCEPTION 'permission_denied';
 END IF;
 INSERT INTO public.chart_of_accounts(tenant_id,code,name,type) VALUES
 (_tenant,'1000','Kassa','asset'),(_tenant,'1010','Bank hesabı','asset'),(_tenant,'1200','Debitor borcları','asset'),
 (_tenant,'2050','Mal ehtiyatları','asset'),(_tenant,'2100','ƏDV öhdəliyi','liability'),(_tenant,'2200','Təchizatçı borcları','liability'),
 (_tenant,'2300','Müştəri avansları və geri ödənişlər','liability'),(_tenant,'4000','Satış gəliri','revenue'),
 (_tenant,'5000','Satılmış məhsulun maya dəyəri','expense') ON CONFLICT(tenant_id,code) DO NOTHING;
 INSERT INTO public.inventory_accounting_settings(tenant_id) VALUES(_tenant) ON CONFLICT DO NOTHING;
END $function$;

CREATE OR REPLACE FUNCTION public.reverse_sales_order(_order_id uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  movement_row public.stock_movements%rowtype;
  payment_row public.cash_transactions%rowtype;
  reversal_ids uuid[] := ARRAY[]::uuid[];
  reversal_id uuid;
  stock_reversal_count integer := 0;
  released_reservation_count integer := 0;
  credit_count integer := 0;
  allocation record;
BEGIN
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO target
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;

  IF auth.uid() IS NULL OR NOT private.has_module_access(target.tenant_id,'sales','edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  PERFORM private.assert_open_accounting_period(target.tenant_id,current_date);

  FOR reservation_row IN
    SELECT *
      FROM public.stock_reservations
     WHERE order_id = target.id
       AND tenant_id = target.tenant_id
       AND status = 'active'
     FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = greatest(0, reserved - reservation_row.quantity),
           updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id;
    released_reservation_count := released_reservation_count + 1;
  END LOOP;

  UPDATE public.stock_reservations
     SET status = 'released', updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status = 'active';

  FOR movement_row IN
    SELECT movement.*
      FROM public.stock_movements movement
     WHERE movement.tenant_id = target.tenant_id
       AND movement.movement_type = 'delivery'
       AND movement.quantity < 0
       AND (
         (movement.reference_type = 'sales_order' AND movement.reference_id = target.id)
         OR
         (movement.reference_type = 'delivery' AND movement.reference_id IN (
           SELECT delivery.id FROM public.deliveries delivery
            WHERE delivery.order_id = target.id
              AND delivery.tenant_id = target.tenant_id
         ))
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.stock_movements reversal
          WHERE reversal.reversal_of = movement.id
       )
     FOR UPDATE
  LOOP
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, note, created_by, reversal_of
    ) VALUES (
      movement_row.tenant_id, movement_row.warehouse_id, movement_row.product_id,
      'receipt', abs(movement_row.quantity), movement_row.unit_cost,
      'sales_cancellation', target.id,
      target.order_no || ' satışının ləğvi ilə anbara qaytarıldı',
      coalesce(auth.uid(), movement_row.created_by), movement_row.id
    );

    UPDATE public.stock_balances
       SET on_hand = on_hand + abs(movement_row.quantity), updated_at = now()
     WHERE tenant_id = movement_row.tenant_id
       AND warehouse_id = movement_row.warehouse_id
       AND product_id = movement_row.product_id;
    stock_reversal_count := stock_reversal_count + 1;
  END LOOP;

  UPDATE public.stock_reservations
     SET status = 'released', updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status = 'fulfilled';

  UPDATE public.deliveries
     SET status = 'cancelled', updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status <> 'cancelled';

  UPDATE public.inventory_units
     SET status = 'available', updated_at = now()
   WHERE tenant_id = target.tenant_id
     AND status IN ('reserved', 'issued', 'sold')
     AND (
       source_id = target.id
       OR source_id IN (
         SELECT delivery.id FROM public.deliveries delivery
          WHERE delivery.order_id = target.id
            AND delivery.tenant_id = target.tenant_id
       )
     );

  -- Restore FIFO layers once, alongside the authoritative movement reversal.
  FOR allocation IN SELECT * FROM public.sales_cost_allocations
    WHERE tenant_id=target.tenant_id AND order_id=target.id AND reversed_at IS NULL
    ORDER BY warehouse_id,product_id,id FOR UPDATE
  LOOP
    IF allocation.cost_layer_id IS NOT NULL THEN
      UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty+allocation.quantity
        WHERE tenant_id=target.tenant_id AND id=allocation.cost_layer_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'inventory_cost_layer_missing'; END IF;
    END IF;
    UPDATE public.sales_cost_allocations SET reversed_at=now() WHERE id=allocation.id;
  END LOOP;

  UPDATE public.sales_bonus_entries
     SET status = 'reversed', reversed_at = coalesce(reversed_at, now())
   WHERE order_id = target.id AND status <> 'reversed';

  UPDATE public.credit_payments payment
     SET reversed_at = coalesce(payment.reversed_at, now()),
         reversed_by = coalesce(payment.reversed_by, auth.uid()),
         reversal_reason = coalesce(payment.reversal_reason, trim(_reason))
    FROM public.credit_contracts contract
   WHERE payment.credit_id = contract.id
     AND contract.order_id = target.id
     AND contract.tenant_id = target.tenant_id
     AND payment.reversed_at IS NULL;

  UPDATE public.credit_installments installment
     SET principal_paid = 0, penalty_paid = 0, paid_at = NULL,
         status = 'waived', updated_at = now()
    FROM public.credit_contracts contract
   WHERE installment.credit_id = contract.id
     AND contract.order_id = target.id
     AND contract.tenant_id = target.tenant_id;

  UPDATE public.credit_contracts
     SET status = 'cancelled', closed_at = coalesce(closed_at, now()),
         closed_by = coalesce(closed_by, auth.uid()), updated_at = now()
   WHERE order_id = target.id
     AND tenant_id = target.tenant_id
     AND status <> 'cancelled';
  GET DIAGNOSTICS credit_count = ROW_COUNT;

  FOR payment_row IN
    SELECT tx.*
      FROM public.cash_transactions tx
     WHERE tx.tenant_id = target.tenant_id
       AND tx.direction = 'in'
       AND tx.category IN (
         'sales_payment', 'credit_initial', 'credit_payment', 'receivable_payment'
       )
       AND tx.reversal_of IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.cash_transactions reversal
          WHERE reversal.reversal_of = tx.id
       )
       AND (
         tx.reference_id = target.id
         OR (tx.reference_id IS NULL AND tx.reference = target.order_no)
         OR tx.reference_id IN (
           SELECT contract.id FROM public.credit_contracts contract
            WHERE contract.order_id = target.id
              AND contract.tenant_id = target.tenant_id
         )
         OR tx.reference_id IN (
           SELECT payment.id
             FROM public.credit_payments payment
             JOIN public.credit_contracts contract ON contract.id = payment.credit_id
            WHERE contract.order_id = target.id
              AND contract.tenant_id = target.tenant_id
         )
       )
     FOR UPDATE
  LOOP
    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      counterparty, customer_id, vendor_id, reference_type, reference_id,
      reference, description, occurred_at, created_by, reversal_of
    ) VALUES (
      payment_row.tenant_id, payment_row.account_id, 'out', payment_row.amount,
      payment_row.currency, 'transaction_reversal', payment_row.counterparty,
      payment_row.customer_id, payment_row.vendor_id, 'sales_cancellation', target.id,
      target.order_no,
      'Ləğv: ' || payment_row.transaction_no || ' · ' || trim(_reason),
      now(), coalesce(auth.uid(), payment_row.created_by), payment_row.id
    ) RETURNING id INTO reversal_id;
    reversal_ids := array_append(reversal_ids, reversal_id);
  END LOOP;

  UPDATE public.orders
     SET paid_amount = 0, payment_status = 'unpaid',
         status = 'cancelled', updated_at = now()
   WHERE id = target.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, target.tenant_id, auth.uid(), 'sales',
    'sales_order_reversed', target.order_no || ' satışı tam ləğv edildi',
    jsonb_build_object(
      'order_id', target.id, 'order_no', target.order_no, 'reason', trim(_reason),
      'stock_reversals', stock_reversal_count,
      'released_reservations', released_reservation_count,
      'cancelled_credits', credit_count,
      'cash_reversals', to_jsonb(reversal_ids)
    )
  );

  RETURN jsonb_build_object(
    'order_id', target.id, 'status', 'cancelled',
    'stock_reversals', stock_reversal_count,
    'released_reservations', released_reservation_count,
    'cancelled_credits', credit_count,
    'cash_reversals', to_jsonb(reversal_ids)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.reverse_sales_order_v3_impl(_tenant_id uuid, _order_id uuid, _reason text, _request_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  request_payload jsonb;
  request_hash text;
  request_row public.operation_requests%rowtype;
  result_payload jsonb;
  target public.orders%rowtype;
  invoice_row record;
  journal_id uuid;
  ar_id uuid; revenue_id uuid; vat_id uuid; inventory_id uuid; cogs_id uuid; advance_id uuid;
  delivery_cogs numeric := 0;
  paid_before numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT * INTO target FROM public.orders WHERE id = _order_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;
  paid_before := least(coalesce(target.paid_amount, 0), target.total);
  IF length(trim(coalesce(_request_key, ''))) < 8 THEN
    RAISE EXCEPTION 'Idempotency açarı tələb olunur';
  END IF;

  request_payload := jsonb_build_object('order_id', _order_id, 'reason', trim(_reason));
  request_hash := md5(request_payload::text);
  INSERT INTO public.operation_requests(tenant_id, request_key, operation, request_hash)
  VALUES (_tenant_id, trim(_request_key), 'reverse_sales_order_v3', request_hash)
  ON CONFLICT (tenant_id, request_key) DO NOTHING;

  SELECT * INTO request_row FROM public.operation_requests
   WHERE tenant_id = _tenant_id AND request_key = trim(_request_key) FOR UPDATE;
  IF request_row.operation <> 'reverse_sales_order_v3' OR request_row.request_hash <> request_hash THEN
    RAISE EXCEPTION 'Idempotency açarı başqa sorğu üçün istifadə olunub';
  END IF;
  IF request_row.status = 'completed' THEN RETURN request_row.result; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);

  FOR invoice_row IN
    SELECT id FROM public.sales_invoices
     WHERE tenant_id = _tenant_id AND order_id = _order_id AND status::text <> 'cancelled'
     FOR UPDATE
  LOOP
    IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE tenant_id=_tenant_id AND order_id=_order_id AND event_type='delivery') THEN
      UPDATE public.sales_invoices SET status='cancelled',updated_at=now() WHERE id=invoice_row.id;
    ELSE
      PERFORM public.cancel_sales_invoice(invoice_row.id);
    END IF;
  END LOOP;

  result_payload := public.reverse_sales_order(_order_id, _reason)
    || jsonb_build_object('request_key', trim(_request_key), 'schema_version', 3);

  IF EXISTS (SELECT 1 FROM public.order_accounting_events WHERE order_id = _order_id AND event_type = 'delivery')
     AND NOT EXISTS (SELECT 1 FROM public.order_accounting_events WHERE order_id = _order_id AND event_type = 'cancellation') THEN
    SELECT coalesce(cogs, 0) INTO delivery_cogs FROM public.order_accounting_events
     WHERE order_id = _order_id AND event_type = 'delivery';
    ar_id := public.gl_account_by_code(_tenant_id, '1200');
    revenue_id := public.gl_account_by_code(_tenant_id, '4000');
    vat_id := public.gl_account_by_code(_tenant_id, '2100');
    inventory_id := public.gl_account_by_code(_tenant_id, '2050');
    cogs_id := public.gl_account_by_code(_tenant_id, '5000');
    advance_id := public.gl_account_by_code(_tenant_id, '2300');
    INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(_tenant_id,current_date,target.order_no||'-L','Satışın ləğvi','sales_order_cancellation',_order_id,auth.uid())
    RETURNING id INTO journal_id;
    FOR invoice_row IN SELECT l.* FROM public.journal_lines l JOIN public.order_accounting_events e
      ON e.journal_entry_id=l.entry_id WHERE e.order_id=_order_id AND e.event_type='delivery' ORDER BY l.line_no LOOP
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
        VALUES(journal_id,invoice_row.account_id,invoice_row.credit,invoice_row.debit,'Delivery reversal',invoice_row.line_no);
    END LOOP;
    UPDATE public.journal_entries SET posted = true WHERE id = journal_id;
    INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by)
    VALUES(_tenant_id,_order_id,'cancellation',journal_id,target.total,delivery_cogs,auth.uid());
    result_payload := result_payload || jsonb_build_object('accounting_reversal', journal_id);
  END IF;
  UPDATE public.operation_requests SET status = 'completed', result = result_payload, completed_at = now()
   WHERE id = request_row.id;
  RETURN result_payload;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_sales_order_v3(_tenant_id uuid, _order_id uuid, _reason text, _request_key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT private.reverse_sales_order_v3_impl(_tenant_id, _order_id, _reason, _request_key); $function$;

CREATE OR REPLACE FUNCTION public.process_sales_order_status(_order_id uuid, _status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders%rowtype; it record; b record; l record; need numeric; take numeric; method text; mv uuid; cogs numeric:=0; je uuid; n int:=1;
 ar uuid; rev uuid; vat uuid; ia uuid; ca uuid; aa uuid; paid numeric; oldq numeric; oldc numeric; available numeric;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF o.id IS NULL OR auth.uid() IS NULL OR NOT (
   private.has_module_access(o.tenant_id,'sales','edit') OR
   (_status='delivered' AND (private.has_module_access(o.tenant_id,'deliveries','edit') OR private.has_module_access(o.tenant_id,'warehouse','edit')))
 ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF _status NOT IN('draft','pending','confirmed','processing','shipped','delivered','cancelled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
 
  IF _status='cancelled' THEN
    PERFORM public.reverse_sales_order_v3(o.tenant_id,o.id,'Status cancellation','status-cancel:'||o.id);
    RETURN;
  END IF;
  PERFORM private.assert_open_accounting_period(o.tenant_id,current_date);
  -- canonical_delivery_columns
  IF o.status='cancelled' THEN
    IF _status='cancelled' THEN RETURN; END IF;
    RAISE EXCEPTION 'cancelled_order_is_terminal';
  END IF;
  IF _status='delivered' THEN
  IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='delivery') THEN UPDATE public.orders SET status='delivered' WHERE id=o.id; RETURN; END IF;
  PERFORM public.ensure_inventory_accounts(o.tenant_id); SELECT valuation_method INTO method FROM public.inventory_accounting_settings WHERE tenant_id=o.tenant_id;
  FOR it IN SELECT * FROM public.order_items WHERE order_id=o.id ORDER BY line_no FOR UPDATE LOOP
   IF it.product_id IS NULL THEN CONTINUE; END IF; need:=it.qty;
   
   -- protected_delivery_stock: lock balances before cost layers in either valuation mode.
   PERFORM 1 FROM public.stock_balances WHERE tenant_id=o.tenant_id AND product_id=it.product_id
     ORDER BY warehouse_id FOR UPDATE;
   IF method='fifo' THEN
    FOR l IN SELECT * FROM public.inventory_cost_layers cl WHERE tenant_id=o.tenant_id AND product_id=it.product_id AND remaining_qty>0
      AND (NOT EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=o.id AND d.status IN('pending','ready'))
        OR EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=o.id AND d.status IN('pending','ready') AND d.warehouse_id=cl.warehouse_id))
      ORDER BY received_at,id FOR UPDATE LOOP
     
     EXIT WHEN need<=0;
     SELECT sb.on_hand-sb.reserved-COALESCE(sb.problem_qty,0)+COALESCE((
       SELECT sum(sr.quantity) FROM public.stock_reservations sr WHERE sr.tenant_id=o.tenant_id
         AND sr.order_id=o.id AND sr.warehouse_id=l.warehouse_id
         AND sr.product_id=it.product_id AND sr.status='active'
     ),0) INTO available FROM public.stock_balances sb WHERE sb.tenant_id=o.tenant_id
       AND sb.warehouse_id=l.warehouse_id AND sb.product_id=it.product_id;
     take:=LEAST(need,l.remaining_qty,GREATEST(COALESCE(available,0),0));
     IF take<=0 THEN CONTINUE; END IF; UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-take WHERE id=l.id;
     UPDATE public.stock_balances SET on_hand=on_hand-take,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=l.warehouse_id AND product_id=it.product_id AND on_hand>=take;
     IF NOT FOUND THEN RAISE EXCEPTION 'Stok və maya qatı uyğun deyil: %',it.description; END IF;
     INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by) VALUES(o.tenant_id,l.warehouse_id,it.product_id,'delivery',-take,l.unit_cost,'sales_order',o.id,o.order_no||' təhvil',auth.uid()) RETURNING id INTO mv;
     INSERT INTO public.sales_cost_allocations(tenant_id,order_id,order_item_id,warehouse_id,product_id,cost_layer_id,stock_movement_id,quantity,unit_cost,total_cost) VALUES(o.tenant_id,o.id,it.id,l.warehouse_id,it.product_id,l.id,mv,take,l.unit_cost,take*l.unit_cost);
     cogs:=cogs+take*l.unit_cost; need:=need-take;
    END LOOP;
   ELSE
    FOR b IN SELECT * FROM public.stock_balances sb WHERE tenant_id=o.tenant_id AND product_id=it.product_id AND on_hand>0
      AND (NOT EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=o.id AND d.status IN('pending','ready'))
        OR EXISTS(SELECT 1 FROM public.deliveries d WHERE d.order_id=o.id AND d.status IN('pending','ready') AND d.warehouse_id=sb.warehouse_id))
      ORDER BY warehouse_id FOR UPDATE LOOP
     
     EXIT WHEN need<=0;
     SELECT COALESCE(sum(sr.quantity),0) INTO available FROM public.stock_reservations sr
       WHERE sr.tenant_id=o.tenant_id AND sr.order_id=o.id AND sr.warehouse_id=b.warehouse_id
         AND sr.product_id=it.product_id AND sr.status='active';
     take:=LEAST(need,GREATEST(b.on_hand-b.reserved-COALESCE(b.problem_qty,0)+available,0));
     IF take<=0 THEN CONTINUE; END IF; UPDATE public.stock_balances SET on_hand=on_hand-take,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;
     INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by) VALUES(o.tenant_id,b.warehouse_id,it.product_id,'delivery',-take,COALESCE(b.avg_cost,0),'sales_order',o.id,o.order_no||' təhvil',auth.uid()) RETURNING id INTO mv;
     INSERT INTO public.sales_cost_allocations(tenant_id,order_id,order_item_id,warehouse_id,product_id,stock_movement_id,quantity,unit_cost,total_cost) VALUES(o.tenant_id,o.id,it.id,b.warehouse_id,it.product_id,mv,take,COALESCE(b.avg_cost,0),take*COALESCE(b.avg_cost,0));
     cogs:=cogs+take*COALESCE(b.avg_cost,0); need:=need-take;
    END LOOP;
   END IF;
   IF need>0.0005 THEN RAISE EXCEPTION 'Anbarda kifayət qədər məhsul yoxdur: %',COALESCE(it.description,it.product_id::text); END IF;
  END LOOP;
  UPDATE public.stock_balances sb
     SET reserved=GREATEST(0, sb.reserved - agg.q), updated_at=now()
    FROM (SELECT tenant_id,warehouse_id,product_id,SUM(quantity) q
            FROM public.stock_reservations
           WHERE order_id=o.id AND status='active'
           GROUP BY 1,2,3) agg
   WHERE sb.tenant_id=agg.tenant_id AND sb.warehouse_id=agg.warehouse_id AND sb.product_id=agg.product_id;
  UPDATE public.stock_reservations SET status='fulfilled', updated_at=now() WHERE order_id=o.id AND status='active';
  ar:=public.gl_account_by_code(o.tenant_id,'1200'); rev:=public.gl_account_by_code(o.tenant_id,'4000'); vat:=public.gl_account_by_code(o.tenant_id,'2100'); ia:=public.gl_account_by_code(o.tenant_id,'2050'); ca:=public.gl_account_by_code(o.tenant_id,'5000'); aa:=public.gl_account_by_code(o.tenant_id,'2300');
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,o.order_date,o.order_no,'Satış və maya uçotu','sales_order_delivery',o.id,auth.uid()) RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ar,o.total,0,'Müştəri borcu',1),(je,rev,0,o.subtotal,'Satış gəliri',2),(je,vat,0,COALESCE(o.vat_total,0),'ƏDV',3); n:=4;
  IF cogs>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ca,round(cogs,2),0,'Satışın mayası',n),(je,ia,0,round(cogs,2),'Mal ehtiyatı',n+1); n:=n+2; END IF;
  paid:=LEAST(COALESCE(o.paid_amount,0),o.total); IF paid>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,aa,paid,0,'Avansın bağlanması',n),(je,ar,0,paid,'Ödənilmiş debitor',n+1); END IF;
  UPDATE public.journal_entries SET posted=true WHERE id=je; INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by) VALUES(o.tenant_id,o.id,'delivery',je,o.total,round(cogs,2),auth.uid()); UPDATE public.orders SET status='delivered',updated_at=now() WHERE id=o.id;
 ELSIF _status='cancelled' AND EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='delivery') THEN
  IF EXISTS(SELECT 1 FROM public.order_accounting_events WHERE order_id=o.id AND event_type='cancellation') THEN RETURN; END IF;
  FOR b IN SELECT * FROM public.sales_cost_allocations WHERE order_id=o.id AND reversed_at IS NULL FOR UPDATE LOOP
   SELECT COALESCE(on_hand,0),COALESCE(avg_cost,0) INTO oldq,oldc FROM public.stock_balances WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id FOR UPDATE;
   UPDATE public.stock_balances SET on_hand=COALESCE(oldq,0)+b.quantity,updated_at=now() WHERE tenant_id=o.tenant_id AND warehouse_id=b.warehouse_id AND product_id=b.product_id;
   IF b.cost_layer_id IS NOT NULL THEN UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty+b.quantity WHERE id=b.cost_layer_id; END IF;
   INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by) VALUES(o.tenant_id,b.warehouse_id,b.product_id,'receipt',b.quantity,b.unit_cost,'sales_return',o.id,o.order_no||' ləğv',auth.uid()); UPDATE public.sales_cost_allocations SET reversed_at=now() WHERE id=b.id;
  END LOOP;
  SELECT e.cogs INTO cogs FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery';
  ar:=public.gl_account_by_code(o.tenant_id,'1200'); rev:=public.gl_account_by_code(o.tenant_id,'4000'); vat:=public.gl_account_by_code(o.tenant_id,'2100'); ia:=public.gl_account_by_code(o.tenant_id,'2050'); ca:=public.gl_account_by_code(o.tenant_id,'5000'); aa:=public.gl_account_by_code(o.tenant_id,'2300'); paid:=LEAST(COALESCE(o.paid_amount,0),o.total);
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by) VALUES(o.tenant_id,current_date,o.order_no||'-L','Satışın ləğvi','sales_order_cancellation',o.id,auth.uid()) RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,rev,o.subtotal,0,'Gəlirin ləğvi',1),(je,vat,COALESCE(o.vat_total,0),0,'ƏDV ləğvi',2),(je,ar,0,o.total-paid,'Debitor ləğvi',3),(je,aa,0,paid,'Geri ödəniləcək məbləğ',4);
  IF COALESCE(cogs,0)>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES(je,ia,cogs,0,'Stok qaytarması',5),(je,ca,0,cogs,'Maya ləğvi',6); END IF;
  UPDATE public.journal_entries SET posted=true WHERE id=je; INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by) VALUES(o.tenant_id,o.id,'cancellation',je,o.total,COALESCE(cogs,0),auth.uid()); UPDATE public.orders SET status='cancelled',updated_at=now() WHERE id=o.id;
 ELSE
  IF o.status='delivered' THEN RAISE EXCEPTION 'Təhvil verilmiş satış yalnız ləğv edilə bilər'; END IF; o.status:=_status; UPDATE public.orders SET status=o.status,updated_at=now() WHERE id=o.id;
 END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.erp_runtime_capabilities()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'schema_version', 3,
    'sales_create', 'create_sales_order_complete',
    'sales_reverse', 'reverse_sales_order_v3',
    'reconciliation', 'preview_and_approved_repair',
    'server_time', now()
  );
$function$;

CREATE OR REPLACE FUNCTION public.reserve_stock(_tenant_id uuid, _warehouse_id uuid, _product_id uuid, _order_id uuid, _order_item_id uuid DEFAULT NULL::uuid, _quantity numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  reservation_id uuid;
  available_quantity numeric;
  order_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id, 'warehouse', 'edit')
    OR private.has_module_access(_tenant_id, 'sales', 'edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;
  SELECT status::text INTO order_status FROM public.orders
    WHERE id=_order_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF order_status IN ('cancelled','delivered') THEN RAISE EXCEPTION 'order_not_reservable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=_warehouse_id AND tenant_id=_tenant_id AND is_active)
    OR NOT EXISTS (SELECT 1 FROM public.products WHERE id=_product_id AND tenant_id=_tenant_id) THEN
    RAISE EXCEPTION 'invalid_stock_scope';
  END IF;
  IF _order_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.order_items WHERE id=_order_item_id AND order_id=_order_id
      AND tenant_id=_tenant_id AND product_id=_product_id
  ) THEN RAISE EXCEPTION 'invalid_order_item'; END IF;
  SELECT on_hand-reserved-COALESCE(problem_qty,0) INTO available_quantity
    FROM public.stock_balances WHERE tenant_id=_tenant_id
      AND warehouse_id=_warehouse_id AND product_id=_product_id FOR UPDATE;
  IF COALESCE(available_quantity,0)<_quantity THEN RAISE EXCEPTION 'insufficient_available_stock'; END IF;
  INSERT INTO public.stock_reservations(tenant_id,warehouse_id,product_id,order_id,order_item_id,quantity,status,created_by)
    VALUES (_tenant_id,_warehouse_id,_product_id,_order_id,_order_item_id,_quantity,'active',auth.uid())
    RETURNING id INTO reservation_id;
  UPDATE public.stock_balances SET reserved=reserved+_quantity,updated_at=now()
    WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id AND product_id=_product_id;
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES (_tenant_id,_warehouse_id,_product_id,'reservation',_quantity,'stock_reservation',reservation_id,'Order reservation',auth.uid());
  RETURN reservation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_stock_reservation(_tenant_id uuid, _reservation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE reservation_row public.stock_reservations%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_module_access(_tenant_id,'warehouse','edit')
    OR private.has_module_access(_tenant_id,'sales','edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  -- Match reserve's lock order: order, reservation, balance.
  PERFORM 1 FROM public.orders WHERE tenant_id=_tenant_id AND id=(
    SELECT order_id FROM public.stock_reservations WHERE id=_reservation_id AND tenant_id=_tenant_id
  ) FOR UPDATE;
  SELECT * INTO reservation_row FROM public.stock_reservations
    WHERE id=_reservation_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF reservation_row.status<>'active' THEN RETURN; END IF;
  UPDATE public.stock_balances SET reserved=reserved-reservation_row.quantity,updated_at=now()
    WHERE tenant_id=_tenant_id AND warehouse_id=reservation_row.warehouse_id
      AND product_id=reservation_row.product_id AND reserved>=reservation_row.quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_balance_mismatch'; END IF;
  UPDATE public.stock_reservations SET status='released',updated_at=now() WHERE id=_reservation_id;
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,reference_type,reference_id,note,created_by)
    VALUES (_tenant_id,reservation_row.warehouse_id,reservation_row.product_id,'release',-reservation_row.quantity,
      'stock_reservation',_reservation_id,'Reservation released',auth.uid());
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_inventory_accounts(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reverse_sales_order(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.reverse_sales_order_v3_impl(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.reverse_sales_order_v3_impl(uuid,uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.reverse_sales_order_v3(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_order_v3(uuid,uuid,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.process_sales_order_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_sales_order_status(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_runtime_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_runtime_capabilities() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.reserve_stock(uuid,uuid,uuid,uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_stock(uuid,uuid,uuid,uuid,uuid,numeric) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.release_stock_reservation(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_stock_reservation(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.orders%rowtype;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    private.has_module_access(target.tenant_id,'deliveries','edit') OR
    private.has_module_access(target.tenant_id,'warehouse','edit')
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  PERFORM public.process_sales_order_status(_order_id,'delivered');
END $$;
REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.complete_delivery(_tenant_id uuid,_delivery_id uuid,
  _recipient_name text,_recipient_document text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.deliveries%rowtype; target_order public.orders%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'deliveries','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_recipient_name),'') IS NULL THEN RAISE EXCEPTION 'delivery_recipient_required'; END IF;
  SELECT o.* INTO target_order FROM public.orders o JOIN public.deliveries d
    ON d.order_id=o.id AND d.tenant_id=o.tenant_id
    WHERE d.id=_delivery_id AND d.tenant_id=_tenant_id FOR UPDATE OF o;
  IF NOT FOUND THEN RAISE EXCEPTION 'delivery_not_available'; END IF;
  SELECT * INTO target FROM public.deliveries WHERE id=_delivery_id AND tenant_id=_tenant_id FOR UPDATE;
  IF target_order.status::text='cancelled' OR target.status='cancelled' THEN RAISE EXCEPTION 'delivery_order_cancelled'; END IF;
  IF target.status='delivered' THEN
    IF target.recipient_name IS DISTINCT FROM trim(_recipient_name)
      OR target.recipient_document IS DISTINCT FROM _recipient_document THEN RAISE EXCEPTION 'delivery_replay_mismatch'; END IF;
    RETURN;
  END IF;
  IF target.status NOT IN ('pending','ready') THEN RAISE EXCEPTION 'delivery_not_available'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.delivery_items WHERE tenant_id=_tenant_id AND delivery_id=target.id) THEN RAISE EXCEPTION 'delivery_has_no_items'; END IF;
  -- This command is a full-order handover. Reject partial/mismatched cards.
  IF EXISTS(
    SELECT 1 FROM (SELECT product_id,sum(qty) qty FROM public.order_items
      WHERE order_id=target.order_id AND tenant_id=_tenant_id AND product_id IS NOT NULL GROUP BY product_id) oi
    FULL JOIN (SELECT product_id,sum(quantity) qty FROM public.delivery_items
      WHERE delivery_id=target.id AND tenant_id=_tenant_id GROUP BY product_id) di USING(product_id)
    WHERE oi.qty IS DISTINCT FROM di.qty
  ) THEN RAISE EXCEPTION 'delivery_order_quantity_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM public.deliveries WHERE tenant_id=_tenant_id AND order_id=target.order_id
    AND id<>target.id AND status<>'cancelled') THEN RAISE EXCEPTION 'duplicate_order_delivery'; END IF;
  IF EXISTS(SELECT 1 FROM public.delivery_items di LEFT JOIN public.stock_reservations sr
    ON sr.id=di.reservation_id AND sr.tenant_id=di.tenant_id
    WHERE di.tenant_id=_tenant_id AND di.delivery_id=target.id
    AND (sr.id IS NULL OR sr.order_id<>target.order_id OR sr.product_id<>di.product_id
      OR sr.warehouse_id<>target.warehouse_id OR sr.status<>'active' OR sr.quantity<di.quantity)) THEN
    RAISE EXCEPTION 'delivery_item_not_fully_reserved';
  END IF;
  PERFORM public.process_sales_order_status(target.order_id,'delivered');
  UPDATE public.deliveries SET status='delivered',delivered_at=now(),delivered_by=auth.uid(),
    recipient_name=trim(_recipient_name),recipient_document=_recipient_document,updated_at=now()
    WHERE id=target.id AND tenant_id=_tenant_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'deliveries','complete',target.delivery_no,
      jsonb_build_object('delivery_id',target.id,'order_id',target.order_id));
END $$;
REVOKE ALL ON FUNCTION public.complete_delivery(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_delivery(uuid,uuid,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.sales_invoices%rowtype; line record; journal_id uuid; linked_status text;
BEGIN
  SELECT o.status::text INTO linked_status FROM public.orders o JOIN public.sales_invoices i ON i.order_id=o.id
    WHERE i.id=_invoice_id FOR UPDATE OF o;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    private.has_module_access(inv.tenant_id,'invoices','edit') OR
    (linked_status IS NOT NULL AND private.has_module_access(inv.tenant_id,'sales','edit'))
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF inv.status::text='cancelled' THEN RETURN; END IF;
  PERFORM private.assert_open_accounting_period(inv.tenant_id,current_date);
  IF inv.order_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_accounting_events
    WHERE tenant_id=inv.tenant_id AND order_id=inv.order_id AND event_type='delivery') THEN
    IF linked_status<>'cancelled' THEN RAISE EXCEPTION 'cancel_linked_order_first'; END IF;
    -- The delivery command owns this journal; the order reversal handles it once.
  ELSIF inv.posted AND inv.journal_entry_id IS NOT NULL THEN
    INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
      VALUES(inv.tenant_id,current_date,inv.invoice_no||'-L','Invoice reversal','sales_invoice_cancellation',inv.id,auth.uid()) RETURNING id INTO journal_id;
    FOR line IN SELECT * FROM public.journal_lines WHERE entry_id=inv.journal_entry_id ORDER BY line_no LOOP
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
        VALUES(journal_id,line.account_id,line.credit,line.debit,'Invoice reversal',line.line_no);
    END LOOP;
    UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
  END IF;
  UPDATE public.sales_invoices SET status='cancelled',updated_at=now() WHERE id=inv.id;
END $$;
REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_sales_invoice(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.receive_stock(_tenant_id uuid,_warehouse_id uuid,_product_id uuid,
  _quantity numeric,_unit_cost numeric,_reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL,_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE movement_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'warehouse','edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _quantity IS NULL OR _quantity<=0 OR _quantity::text IN('NaN','Infinity','-Infinity')
    OR _unit_cost IS NULL OR _unit_cost<0 OR _unit_cost::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_stock_receipt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=_product_id AND tenant_id=_tenant_id)
    OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=_warehouse_id AND tenant_id=_tenant_id AND is_active)
    THEN RAISE EXCEPTION 'invalid_stock_scope'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved)
    VALUES(_tenant_id,_warehouse_id,_product_id,_quantity,0)
    ON CONFLICT(tenant_id,warehouse_id,product_id) DO UPDATE SET on_hand=public.stock_balances.on_hand+excluded.on_hand,updated_at=now();
  INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
    VALUES(_tenant_id,_warehouse_id,_product_id,'receipt',_quantity,_unit_cost,_reference_type,_reference_id,_note,auth.uid()) RETURNING id INTO movement_id;
  -- Landed-cost receipts own their dated layers in receive_landed_cost_shipment.
  IF _reference_type IS DISTINCT FROM 'procurement_receipt' THEN
    INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,source_type,source_id,original_qty,remaining_qty,unit_cost)
      VALUES(_tenant_id,_warehouse_id,_product_id,movement_id,coalesce(_reference_type,'manual_receipt'),_reference_id,_quantity,_quantity,_unit_cost);
  END IF;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'warehouse','receipt','Stock receipt',jsonb_build_object('movement_id',movement_id,'quantity',_quantity));
  RETURN movement_id;
END $$;
REVOKE ALL ON FUNCTION public.receive_stock(uuid,uuid,uuid,numeric,numeric,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_stock(uuid,uuid,uuid,numeric,numeric,text,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_sales_child_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_status text; order_tenant uuid;
BEGIN
  IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
  SELECT o.status::text,o.tenant_id INTO order_status,order_tenant FROM public.orders o WHERE o.id=NEW.order_id FOR UPDATE;
  IF NOT FOUND OR order_tenant IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'invalid_sales_child_scope'; END IF;
  IF order_status='cancelled' AND (
    (TG_TABLE_NAME='credit_contracts' AND NEW.status::text NOT IN('cancelled','closed')) OR
    (TG_TABLE_NAME='stock_reservations' AND NEW.status::text NOT IN('released','cancelled')) OR
    (TG_TABLE_NAME IN('deliveries','sales_invoices') AND NEW.status::text<>'cancelled')
  ) THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_sales_child_lifecycle() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['credit_contracts','stock_reservations','deliveries','sales_invoices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sales_child_lifecycle_guard ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER sales_child_lifecycle_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_sales_child_lifecycle()',table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.guard_sales_order_cancellation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.status::text='cancelled' AND NEW.status::text<>'cancelled' THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
  IF NEW.status::text='cancelled' AND OLD.status::text<>'cancelled' AND (
    EXISTS(SELECT 1 FROM public.credit_contracts WHERE order_id=NEW.id AND status::text NOT IN('cancelled','closed')) OR
    EXISTS(SELECT 1 FROM public.stock_reservations WHERE order_id=NEW.id AND status::text='active') OR
    EXISTS(SELECT 1 FROM public.deliveries WHERE order_id=NEW.id AND status::text<>'cancelled') OR
    EXISTS(SELECT 1 FROM public.sales_invoices WHERE order_id=NEW.id AND status::text<>'cancelled') OR
    EXISTS(SELECT 1 FROM public.cash_transactions tx WHERE tx.tenant_id=NEW.tenant_id AND tx.direction::text='in'
      AND tx.reversal_of IS NULL AND tx.category IN('sales_payment','credit_initial','credit_payment','receivable_payment')
      AND (tx.reference_id=NEW.id OR (tx.reference_id IS NULL AND tx.reference=NEW.order_no)
        OR tx.reference_id IN(SELECT id FROM public.credit_contracts WHERE order_id=NEW.id)
        OR tx.reference_id IN(SELECT p.id FROM public.credit_payments p JOIN public.credit_contracts c ON c.id=p.credit_id WHERE c.order_id=NEW.id))
      AND NOT EXISTS(SELECT 1 FROM public.cash_transactions r WHERE r.reversal_of=tx.id))
  ) THEN RAISE EXCEPTION 'sales_cancellation_requires_reversal_command'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_sales_order_cancellation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sales_order_cancellation_guard ON public.orders;
CREATE TRIGGER sales_order_cancellation_guard BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION private.guard_sales_order_cancellation();

CREATE OR REPLACE FUNCTION private.guard_cancelled_sales_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE linked_order uuid; linked_status text;
BEGIN
  IF NEW.direction::text<>'in' OR NEW.reversal_of IS NOT NULL
    OR NEW.category NOT IN('sales_payment','credit_initial','credit_payment','receivable_payment') THEN RETURN NEW; END IF;
  SELECT id INTO linked_order FROM public.orders WHERE tenant_id=NEW.tenant_id AND
    (id=NEW.reference_id OR (NEW.reference_id IS NULL AND order_no=NEW.reference));
  IF linked_order IS NULL THEN
    SELECT c.order_id INTO linked_order FROM public.credit_contracts c WHERE c.tenant_id=NEW.tenant_id AND c.id=NEW.reference_id;
  END IF;
  IF linked_order IS NULL THEN
    SELECT c.order_id INTO linked_order FROM public.credit_payments p JOIN public.credit_contracts c ON c.id=p.credit_id
      WHERE c.tenant_id=NEW.tenant_id AND p.id=NEW.reference_id;
  END IF;
  IF linked_order IS NOT NULL THEN
    SELECT status::text INTO linked_status FROM public.orders WHERE id=linked_order FOR UPDATE;
    IF linked_status='cancelled' THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_cancelled_sales_cash() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS cancelled_sales_cash_guard ON public.cash_transactions;
CREATE TRIGGER cancelled_sales_cash_guard BEFORE INSERT OR UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION private.guard_cancelled_sales_cash();

