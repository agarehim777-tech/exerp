-- Broken and drifted database functions (found by `supabase db lint` on production, 2026-11-14).
--
-- 1. delete_sales_order_safe and complete_inventory_return wrote stock_movements.move_type/qty (and doc_no),
--    columns the repo schema no longer has (movement_type/quantity remain). Every call failed, so deleting an
--    unshipped sale and completing an inventory return did not work. The legacy columns are dropped
--    from the INSERTs; nothing else changes. apply_stock_movement skips rows with movement_type, so
--    these movements are not double-posted.
--    ensure_rls_helper_grants loops over a query instead of FOREACH over a literal array, the same behaviour
--    without the false syntax error plpgsql_check reported on its dynamic GRANT.
-- 2. Production ran older bodies of 16 functions than the repo (body hashes compared). Among them
--    reverse_cash_transaction cast to a nonexistent public.cash_direction type (cash reversal failed),
--    and several lacked guards the repo added (create_sales_order auth check, invoice precision,
--    landed-cost replay, vendor VAT check). They are redefined from the repo's final definitions,
--    which is a no-op on a database built from supabase/migrations. Grants are left untouched
--    (CREATE OR REPLACE keeps the existing ACL).

-- Part 1: fixed functions.
CREATE OR REPLACE FUNCTION public.delete_sales_order_safe(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  target public.orders%rowtype;
  reservation_row public.stock_reservations%rowtype;
  payment_row public.cash_transactions%rowtype;
  cash_account public.cash_accounts%rowtype;
  refund_transaction_id uuid;
  refund_journal_id uuid;
  cash_gl_id uuid;
  advance_gl_id uuid;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Sifariş tapılmadı';
  END IF;
  IF NOT (public.is_tenant_admin(target.tenant_id, auth.uid()) OR target.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Bu sifarişi silmək üçün icazəniz yoxdur';
  END IF;
  IF target.status::text IN ('delivered', 'shipped', 'processing') THEN
    RAISE EXCEPTION 'Anbar və ya təhvil əməliyyatı başlamış sifariş silinə bilməz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_bonus_entries WHERE order_id = target.id AND status <> 'reversed') THEN
    UPDATE public.sales_bonus_entries SET status = 'reversed', reversed_at = now()
     WHERE order_id = target.id AND status <> 'reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.credit_payments payment
    JOIN public.credit_contracts contract ON contract.id = payment.credit_id
    WHERE contract.order_id = target.id
  ) THEN
    RAISE EXCEPTION 'Kredit ödənişi olan sifariş silinə bilməz';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_reservations WHERE order_id = target.id AND status = 'fulfilled') THEN
    RAISE EXCEPTION 'Anbardan çıxışı tamamlanmış sifariş silinə bilməz';
  END IF;

  FOR reservation_row IN
    SELECT * FROM public.stock_reservations WHERE order_id = target.id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.stock_balances
       SET reserved = GREATEST(0, COALESCE(reserved, 0) - reservation_row.quantity), updated_at = now()
     WHERE tenant_id = reservation_row.tenant_id
       AND warehouse_id = reservation_row.warehouse_id
       AND product_id = reservation_row.product_id;
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, movement_type, quantity,
      reference_type, reference_id, note, created_by
    ) VALUES (
      reservation_row.tenant_id, reservation_row.warehouse_id, reservation_row.product_id,
      'release', -reservation_row.quantity, 'stock_reservation', reservation_row.id,
      target.order_no || ' sifarişi silindi', auth.uid()
    );
  END LOOP;

  IF COALESCE(target.paid_amount, 0) > 0 THEN
    PERFORM public.ensure_inventory_accounts(target.tenant_id);
    FOR payment_row IN
      SELECT * FROM public.cash_transactions
       WHERE tenant_id = target.tenant_id
         AND reference = target.order_no
         AND direction = 'in'
         AND category = 'sales_payment'
       FOR UPDATE
    LOOP
      SELECT * INTO cash_account FROM public.cash_accounts WHERE id = payment_row.account_id FOR UPDATE;
      INSERT INTO public.cash_transactions(
        tenant_id, account_id, direction, amount, currency, category,
        customer_id, reference, description, occurred_at
      ) VALUES (
        target.tenant_id, payment_row.account_id, 'out', payment_row.amount,
        payment_row.currency, 'sales_refund', target.customer_id,
        target.order_no || '-LƏĞV', target.order_no || ' silinmə üzrə ödəniş qaytarılması', current_date
      ) RETURNING id INTO refund_transaction_id;

      cash_gl_id := COALESCE(cash_account.gl_account_id, public.gl_account_by_code(
        target.tenant_id, CASE WHEN cash_account.type::text = 'cash' THEN '1000' ELSE '1010' END
      ));
      advance_gl_id := public.gl_account_by_code(target.tenant_id, '2300');
      INSERT INTO public.journal_entries(
        tenant_id, entry_date, reference, description, source_type, source_id, created_by
      ) VALUES (
        target.tenant_id, current_date, target.order_no || '-LƏĞV',
        'Təhvil verilməmiş sifariş ödənişinin qaytarılması', 'sales_order_refund', refund_transaction_id, auth.uid()
      ) RETURNING id INTO refund_journal_id;
      INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no) VALUES
        (refund_journal_id, advance_gl_id, payment_row.amount, 0, 'Müştəri avansının ləğvi', 1),
        (refund_journal_id, cash_gl_id, 0, payment_row.amount, 'Kassadan geri ödəniş', 2);
      UPDATE public.journal_entries SET posted = true WHERE id = refund_journal_id;
    END LOOP;
    UPDATE public.orders SET paid_amount = 0, payment_status = 'unpaid' WHERE id = target.id;
  END IF;

  DELETE FROM public.sales_bonus_entries WHERE order_id = target.id;
  DELETE FROM public.stock_reservations WHERE order_id = target.id;
  DELETE FROM public.order_bonus_assignments WHERE order_id = target.id;
  DELETE FROM public.credit_contracts WHERE order_id = target.id;
  DELETE FROM public.order_items WHERE order_id = target.id;
  DELETE FROM public.orders WHERE id = target.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_inventory_return(_return uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'receipt',line.quantity,new_cost,'inventory_return',header.id,'Satışa uyğun müştəri qaytarması',auth.uid())
      RETURNING id INTO movement_id;

    ELSIF header.return_type = 'vendor' OR line.disposition = 'vendor_return' THEN
      IF balance.tenant_id IS NULL OR balance.on_hand - balance.problem_qty - balance.reserved < line.quantity THEN
        RAISE EXCEPTION 'Vendor qaytarması üçün satışa uyğun qalıq kifayət deyil';
      END IF;
      UPDATE public.stock_balances SET on_hand=on_hand-line.quantity,updated_at=now()
       WHERE tenant_id=header.tenant_id AND warehouse_id=header.warehouse_id AND product_id=line.product_id;
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'write_off',-line.quantity,balance.avg_cost,'inventory_return',header.id,'Vendor qaytarması',auth.uid())
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
      INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(header.tenant_id,header.warehouse_id,line.product_id,'write_off',-line.quantity,new_cost,'inventory_return',header.id,'Məhsul anbardan silindi: ' || COALESCE(header.reason,'səbəb göstərilməyib'),auth.uid())
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
$function$;

CREATE OR REPLACE FUNCTION public.ensure_rls_helper_grants()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  missing text[] := ARRAY[]::text[];
  fixed   text[] := ARRAY[]::text[];
  fn text;
  fns text[] := ARRAY[
    'private.is_tenant_member(uuid,uuid)',
    'private.is_tenant_admin(uuid,uuid)',
    'private.is_platform_admin(uuid)',
    'private.current_tenant_id()',
    'private.has_module_access(uuid,text,text)',
    'private.has_tenant_role(uuid,uuid,app_role)'
  ];
BEGIN
  -- Loop over a query, not FOREACH over the literal array: `supabase db lint` (plpgsql_check) otherwise
  -- substitutes the whole array into the dynamic GRANT below and reports a false syntax error.
  FOR fn IN SELECT unnest(fns) LOOP
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      missing := array_append(missing, fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
      IF has_function_privilege('authenticated', fn, 'EXECUTE') THEN
        fixed := array_append(fixed, fn);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'missing_before', to_jsonb(missing),
    'repaired', to_jsonb(fixed),
    'healthy', (array_length(missing,1) IS NULL)
  );
END;
$function$;

-- Part 2: repo definitions for functions whose production body had drifted.
CREATE OR REPLACE FUNCTION private.enforce_finance_period_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  row_data jsonb;
  business_date date;
  row_tenant uuid;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_tenant := NULLIF(row_data->>'tenant_id', '')::uuid;
  business_date := CASE TG_TABLE_NAME
    WHEN 'expenses' THEN COALESCE(NULLIF(row_data->>'expense_date', '')::date, current_date)
    WHEN 'cash_transactions' THEN COALESCE(NULLIF(row_data->>'occurred_at', '')::timestamptz::date, current_date)
    WHEN 'credit_payments' THEN COALESCE(NULLIF(row_data->>'paid_at', '')::timestamptz::date, current_date)
    ELSE current_date
  END;
  PERFORM private.assert_open_accounting_period(row_tenant, business_date);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.guard_vendor_invoice_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE expected_net numeric; expected_gross numeric; expected_tax numeric;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='paid' THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  IF NEW.status='paid' THEN
    IF NOT EXISTS(SELECT 1 FROM public.vendor_invoice_payments WHERE invoice_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
      RAISE EXCEPTION 'invoice_payment_requires_server_command';
    END IF;
    SELECT round(sum(qty_invoiced*unit_price),2),round(sum(qty_invoiced*unit_price*(1+tax_rate/100)),2)
      INTO expected_net,expected_gross FROM public.vendor_invoice_lines WHERE invoice_id=NEW.id;
    expected_tax:=expected_gross-expected_net;
    IF EXISTS(SELECT 1 FROM public.vendor_invoice_lines WHERE invoice_id=NEW.id AND tax_rate<>0)
      AND expected_tax>0 AND NOT EXISTS(SELECT 1 FROM public.vendor_invoice_tax_postings p
        JOIN public.journal_entries j ON j.id=p.journal_entry_id AND j.tenant_id=NEW.tenant_id AND j.posted
        WHERE p.tenant_id=NEW.tenant_id AND p.invoice_id=NEW.id AND p.net_amount=expected_net
          AND p.tax_amount=expected_tax AND p.gross_amount=expected_gross AND p.currency=NEW.currency) THEN
      RAISE EXCEPTION 'invoice_vat_posting_required';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.has_module_access(_tenant uuid, _module text, _action text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (NOT EXISTS (SELECT 1 FROM public.tenant_modules WHERE tenant_id = _tenant)
      OR EXISTS (SELECT 1 FROM public.tenant_modules WHERE tenant_id = _tenant AND module = _module))
    AND EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.role_permissions rp ON rp.role = tm.role AND rp.module = _module
      WHERE tm.tenant_id = _tenant
        AND tm.user_id = auth.uid()
        AND ((_action = 'view' AND rp.can_view) OR (_action = 'edit' AND rp.can_edit))
    );
$function$;

CREATE OR REPLACE FUNCTION private.is_platform_admin(_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user);
$function$;

CREATE OR REPLACE FUNCTION public.create_sales_invoice_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  request public.operation_requests%rowtype;
  invoice_id uuid := gen_random_uuid();
  customer_id uuid;
  source_order_id uuid;
  invoice_no text;
  business_date date;
  due_date date;
  currency_value text;
  source_order public.orders%rowtype;
  line jsonb;
  line_number integer := 0;
  product_id uuid;
  quantity numeric;
  price numeric;
  discount numeric;
  vat_rate numeric;
  net numeric;
  vat numeric;
  net_total numeric := 0;
  vat_total_value numeric := 0;
  gross_total numeric;
  paid numeric := 0;
  result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'invoices','edit') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(_payload->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_invoice_lines'; END IF;
  IF jsonb_array_length(_payload->'lines') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'invalid_invoice_lines'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'create_sales_invoice_atomic',md5(_payload::text))
    ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF request.operation<>'create_sales_invoice_atomic' OR request.request_hash<>md5(_payload::text) THEN
    RAISE EXCEPTION 'idempotency_key_payload_mismatch';
  END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  business_date := coalesce(nullif(_payload->>'invoice_date','')::date,(now() AT TIME ZONE 'Asia/Baku')::date);
  due_date := nullif(_payload->>'due_date','')::date;
  IF due_date<business_date THEN RAISE EXCEPTION 'invalid_due_date'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  currency_value := coalesce(nullif(_payload->>'currency',''),'AZN');
  IF currency_value<>'AZN' THEN RAISE EXCEPTION 'invoice_currency_not_supported'; END IF;
  customer_id := nullif(_payload->>'customer_id','')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.customers c WHERE c.id=customer_id AND c.tenant_id=_tenant_id) THEN
    RAISE EXCEPTION 'customer_not_found';
  END IF;
  source_order_id := nullif(_payload->>'order_id','')::uuid;
  IF source_order_id IS NOT NULL THEN
    SELECT * INTO source_order FROM public.orders o WHERE o.id=source_order_id AND o.tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
    IF source_order.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_order_is_terminal'; END IF;
    IF source_order.customer_id IS DISTINCT FROM customer_id OR source_order.currency<>currency_value THEN
      RAISE EXCEPTION 'invoice_order_mismatch';
    END IF;
    IF EXISTS(SELECT 1 FROM public.sales_invoices i WHERE i.tenant_id=_tenant_id AND i.order_id=source_order_id AND i.status::text<>'cancelled') THEN
      RAISE EXCEPTION 'order_already_invoiced';
    END IF;
    paid := source_order.paid_amount;
  END IF;
  -- Serialize number allocation as well as user-entered duplicate numbers.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-number:'||_tenant_id::text,0));
  invoice_no := coalesce(nullif(trim(_payload->>'invoice_no'),''),
    public.generate_doc_number(_tenant_id,'INV','sales_invoices','invoice_no'));
  INSERT INTO public.sales_invoices(id,tenant_id,invoice_no,customer_id,order_id,invoice_date,due_date,currency,notes,created_by)
    VALUES(invoice_id,_tenant_id,invoice_no,customer_id,source_order_id,business_date,due_date,currency_value,_payload->>'notes',auth.uid());
  FOR line IN SELECT value FROM jsonb_array_elements(_payload->'lines') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_invoice_line'; END IF;
    quantity := (line->>'qty')::numeric;
    price := (line->>'unit_price')::numeric;
    discount := coalesce(nullif(line->>'discount_pct','')::numeric,0);
    vat_rate := coalesce(nullif(line->>'vat_rate','')::numeric,0);
    IF quantity IS NULL OR price IS NULL OR quantity<=0 OR price<0 OR discount NOT BETWEEN 0 AND 100
      OR vat_rate NOT BETWEEN 0 AND 100 OR quantity::text IN('NaN','Infinity','-Infinity')
      OR price::text IN('NaN','Infinity','-Infinity') OR discount::text IN('NaN','Infinity','-Infinity')
      OR vat_rate::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_invoice_amount'; END IF;
    IF quantity<>round(quantity,3) OR price<>round(price,2)
      OR discount<>round(discount,2) OR vat_rate<>round(vat_rate,2) THEN
      RAISE EXCEPTION 'invalid_invoice_precision';
    END IF;
    product_id := nullif(line->>'product_id','')::uuid;
    IF product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products p
      WHERE p.id=product_id AND p.tenant_id=_tenant_id AND p.is_active) THEN RAISE EXCEPTION 'product_not_found'; END IF;
    net := round(quantity*price*(1-discount/100),2);
    vat := round(net*vat_rate/100,2);
    net_total := net_total+net;
    vat_total_value := vat_total_value+vat;
    line_number := line_number+1;
    INSERT INTO public.sales_invoice_lines(tenant_id,invoice_id,product_id,line_no,description,qty,unit_price,discount_pct,vat_rate,line_total)
      VALUES(_tenant_id,invoice_id,product_id,line_number,line->>'description',quantity,price,discount,vat_rate,net+vat);
  END LOOP;
  gross_total := net_total+vat_total_value;
  IF gross_total<=0 THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  IF source_order_id IS NOT NULL AND (gross_total<>round(source_order.total,2) OR vat_total_value<>round(source_order.vat_total,2)) THEN
    RAISE EXCEPTION 'invoice_order_totals_mismatch';
  END IF;
  UPDATE public.sales_invoices SET subtotal=net_total,vat_total=vat_total_value,total=gross_total,paid_amount=paid,
    status=CASE WHEN paid>=gross_total THEN 'paid'::public.sales_invoice_status
      WHEN paid>0 THEN 'partial'::public.sales_invoice_status ELSE 'draft'::public.sales_invoice_status END
    WHERE id=invoice_id;
  result_payload := jsonb_build_object('invoice_id',invoice_id,'invoice_no',invoice_no,'total',gross_total,'vat_total',vat_total_value);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'invoices','invoice_created',invoice_no,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END $function$;

CREATE OR REPLACE FUNCTION public.create_sales_order(_tenant_id uuid, _order_no text, _customer_id uuid, _order_date date, _currency text, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  new_order_id UUID;
  item JSONB;
  subtotal_value NUMERIC(14,2) := 0;
  vat_value NUMERIC(14,2) := 0;
  line_net NUMERIC(14,2);
  line_vat NUMERIC(14,2);
  line_total_value NUMERIC(14,2);
  item_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF trim(COALESCE(_order_no, '')) = '' OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF COALESCE((item->>'qty')::NUMERIC, 0) <= 0
       OR COALESCE((item->>'unit_price')::NUMERIC, 0) < 0 THEN
      RAISE EXCEPTION 'invalid_order_line';
    END IF;
    line_net := round((item->>'qty')::NUMERIC * (item->>'unit_price')::NUMERIC
      * (1 - COALESCE((item->>'discount_pct')::NUMERIC, 0) / 100), 2);
    line_vat := round(line_net * COALESCE((item->>'vat_rate')::NUMERIC, 0) / 100, 2);
    subtotal_value := subtotal_value + line_net;
    vat_value := vat_value + line_vat;
  END LOOP;

  INSERT INTO public.orders(
    tenant_id, order_no, customer_id, order_date, status, currency,
    subtotal, vat_total, total, notes, created_by
  ) VALUES (
    _tenant_id, trim(_order_no), _customer_id, COALESCE(_order_date, current_date),
    'draft', COALESCE(NULLIF(trim(_currency), ''), 'AZN'),
    subtotal_value, vat_value, subtotal_value + vat_value, _notes, auth.uid()
  ) RETURNING id INTO new_order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_count := item_count + 1;
    line_net := round((item->>'qty')::NUMERIC * (item->>'unit_price')::NUMERIC
      * (1 - COALESCE((item->>'discount_pct')::NUMERIC, 0) / 100), 2);
    line_vat := round(line_net * COALESCE((item->>'vat_rate')::NUMERIC, 0) / 100, 2);
    line_total_value := line_net + line_vat;

    INSERT INTO public.order_items(
      tenant_id, order_id, product_id, line_no, description, qty,
      unit_price, discount_pct, vat_rate, line_total
    ) VALUES (
      _tenant_id, new_order_id, NULLIF(item->>'product_id', '')::UUID,
      COALESCE((item->>'line_no')::INTEGER, item_count), item->>'description',
      (item->>'qty')::NUMERIC, (item->>'unit_price')::NUMERIC,
      COALESCE((item->>'discount_pct')::NUMERIC, 0),
      COALESCE((item->>'vat_rate')::NUMERIC, 0), line_total_value
    );
  END LOOP;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'sales', 'create',
    trim(_order_no) || ' sifarişi yaradıldı',
    jsonb_build_object('order_id', new_order_id, 'total', subtotal_value + vat_value)
  );

  RETURN new_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  SELECT private.is_tenant_admin(_tenant, _user);
$function$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant uuid, _user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  SELECT private.is_tenant_member(_tenant, _user);
$function$;

CREATE OR REPLACE FUNCTION public.platform_delete_tenant(_tenant uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target record;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN RAISE EXCEPTION 'tenant_not_found'; END IF;

  PERFORM set_config('app.tenant_purge', 'on', true);
  SET LOCAL session_replication_role = replica;

  -- Rows without their own tenant_id that hang off a tenant-scoped parent (journal_lines, *_lines, ...).
  FOR target IN
    SELECT c.conrelid::regclass AS child_table, c.confrelid::regclass AS parent_table,
           ca.attname AS child_column, pa.attname AS parent_column
    FROM pg_constraint c
    JOIN pg_attribute ca ON ca.attrelid = c.conrelid AND ca.attnum = c.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND cardinality(c.conkey) = 1
      AND c.connamespace = 'public'::regnamespace
      AND c.confrelid <> 'public.tenants'::regclass
      AND NOT EXISTS (SELECT 1 FROM pg_attribute t
                      WHERE t.attrelid = c.conrelid AND t.attname = 'tenant_id' AND NOT t.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute t
                  WHERE t.attrelid = c.confrelid AND t.attname = 'tenant_id' AND NOT t.attisdropped
                    AND t.atttypid = 'uuid'::regtype)
  LOOP
    EXECUTE format('DELETE FROM %s child USING %s parent WHERE child.%I = parent.%I AND parent.tenant_id = $1',
      target.child_table, target.parent_table, target.child_column, target.parent_column) USING _tenant;
  END LOOP;

  -- Logs that reference tenants with ON DELETE SET NULL keep their rows, as the FK intends.
  FOR target IN
    SELECT c.conrelid::regclass AS table_name, a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.tenants'::regclass AND c.confdeltype = 'n'
      AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', target.table_name, target.column_name, target.column_name)
      USING _tenant;
  END LOOP;

  FOR target IN
    SELECT c.oid::regclass AS table_name
    FROM pg_class c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
                       AND a.atttypid = 'uuid'::regtype
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_constraint n
                      WHERE n.conrelid = c.oid AND n.contype = 'f' AND n.confrelid = 'public.tenants'::regclass
                        AND n.confdeltype = 'n')
  LOOP
    EXECUTE format('DELETE FROM %s WHERE tenant_id = $1', target.table_name) USING _tenant;
  END LOOP;

  DELETE FROM public.tenants WHERE id = _tenant;

  SET LOCAL session_replication_role = origin;
  PERFORM set_config('app.tenant_purge', 'off', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_limits(_tenant uuid, _max_users integer, _max_warehouses integer DEFAULT 3, _max_storage_mb integer DEFAULT 1024, _enabled_modules text[] DEFAULT ARRAY[]::text[])
 RETURNS tenant_limits
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result public.tenant_limits;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator permission is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO public.tenant_limits (
    tenant_id, max_users, max_warehouses, max_storage_mb, enabled_modules, updated_at
  ) VALUES (
    _tenant,
    GREATEST(1, COALESCE(_max_users, 10)),
    GREATEST(1, COALESCE(_max_warehouses, 3)),
    GREATEST(128, COALESCE(_max_storage_mb, 1024)),
    COALESCE(_enabled_modules, ARRAY[]::TEXT[]),
    now()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    max_users = EXCLUDED.max_users,
    max_warehouses = EXCLUDED.max_warehouses,
    max_storage_mb = EXCLUDED.max_storage_mb,
    enabled_modules = EXCLUDED.enabled_modules,
    updated_at = now()
  RETURNING * INTO result;

  INSERT INTO public.audit_events (id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::TEXT,
    _tenant,
    auth.uid(),
    'platform',
    'tenant_limits_updated',
    'Tenant limitləri və modul lisenziyaları yeniləndi',
    jsonb_build_object(
      'max_users', result.max_users,
      'max_warehouses', result.max_warehouses,
      'max_storage_mb', result.max_storage_mb,
      'enabled_modules', result.enabled_modules
    )
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.platform_tenant_usage()
 RETURNS TABLE(tenant_id uuid, tenant_name text, tenant_status text, member_count bigint, warehouse_count bigint, max_users integer, max_warehouses integer, max_storage_mb integer, enabled_modules text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator permission is required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    COALESCE(t.status::TEXT, 'active'),
    (SELECT count(*) FROM public.tenant_members tm WHERE tm.tenant_id = t.id),
    (SELECT count(*) FROM public.warehouses w WHERE w.tenant_id = t.id),
    COALESCE(l.max_users, 10),
    COALESCE(l.max_warehouses, 3),
    COALESCE(l.max_storage_mb, 1024),
    COALESCE(l.enabled_modules, ARRAY[]::TEXT[])
  FROM public.tenants t
  LEFT JOIN public.tenant_limits l ON l.tenant_id = t.id
  ORDER BY t.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.post_credit_initial_payment(_tenant_id uuid, _credit_id uuid, _amount numeric, _cash_account_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  contract_record public.credit_contracts%ROWTYPE;
  target_order public.orders%ROWTYPE;
  remaining numeric(14,2);
  applied numeric(14,2);
  account_id uuid := _cash_account_id;
  account_currency text := 'AZN';
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF _amount IS NULL OR round(_amount, 2) <= 0 THEN RAISE EXCEPTION 'credit_payment_amount_required'; END IF;

  SELECT * INTO contract_record FROM public.credit_contracts
   WHERE id = _credit_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;

  IF COALESCE(contract_record.required_initial, 0) <= 0 THEN
    IF EXISTS (SELECT 1 FROM public.credit_payments WHERE credit_id = _credit_id) THEN
      RAISE EXCEPTION 'legacy_credit_has_payments';
    END IF;
    UPDATE public.credit_contracts
       SET required_initial = GREATEST(initial_payment, round(principal * 0.10, 2)),
           status = 'draft', start_date = NULL, updated_at = now()
     WHERE id = _credit_id;
    DELETE FROM public.credit_installments WHERE credit_id = _credit_id;
    SELECT * INTO contract_record FROM public.credit_contracts WHERE id = _credit_id;
  END IF;

  IF contract_record.status <> 'draft' THEN RAISE EXCEPTION 'credit_already_started'; END IF;
  remaining := round(contract_record.required_initial - contract_record.initial_payment, 2);
  applied := round(_amount, 2);
  IF remaining <= 0 THEN RAISE EXCEPTION 'initial_payment_already_complete'; END IF;
  IF applied > remaining THEN RAISE EXCEPTION 'initial_payment_exceeds_target'; END IF;

  IF contract_record.order_id IS NOT NULL THEN
    SELECT * INTO target_order FROM public.orders
     WHERE id = contract_record.order_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit_order_not_found'; END IF;
    IF account_id IS NULL THEN
      account_id := private.ensure_main_cash_account(_tenant_id, target_order.currency);
    END IF;
    IF account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
    PERFORM public.register_order_payment(target_order.id, applied, account_id);
  ELSE
    IF account_id IS NULL THEN
      account_id := private.ensure_main_cash_account(_tenant_id, 'AZN');
    END IF;
    SELECT currency INTO account_currency FROM public.cash_accounts
     WHERE id = account_id AND tenant_id = _tenant_id AND is_active;
    IF account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      customer_id, reference, reference_id, description, occurred_at, created_by
    ) VALUES (
      _tenant_id, account_id, 'in', applied, COALESCE(account_currency, 'AZN'), 'credit_initial',
      contract_record.customer_id, contract_record.contract_no, _credit_id,
      COALESCE(_note, contract_record.contract_no || ' ilkin ödəniş'), CURRENT_DATE, auth.uid()
    );
  END IF;

  UPDATE public.credit_contracts SET initial_payment = initial_payment + applied, updated_at = now()
   WHERE id = _credit_id;
  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (gen_random_uuid()::text, _tenant_id, auth.uid(), 'credits', 'initial_payment',
    contract_record.contract_no || ' üzrə ilkin ödəniş qəbul edildi',
    jsonb_build_object('credit_id', _credit_id, 'amount', applied,
      'paid_initial', round(contract_record.initial_payment + applied, 2),
      'required_initial', contract_record.required_initial));
  RETURN round(remaining - applied, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role'
     OR current_setting('app.tenant_purge', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_events is append-only';
END;
$function$;

CREATE OR REPLACE FUNCTION public.receive_landed_cost_shipment(_shipment uuid, _warehouse uuid, _receipt_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  s public.procurement_shipments%rowtype;
  existing public.procurement_receipts%rowtype;
  r uuid; x record; m uuid; je uuid; total_value numeric:=0; line_count integer:=0;
BEGIN
  SELECT * INTO s FROM public.procurement_shipments WHERE id=_shipment FOR UPDATE;
  IF s.id IS NULL OR auth.uid() IS NULL OR NOT coalesce(private.has_module_access(s.tenant_id,'warehouse','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  SELECT * INTO existing FROM public.procurement_receipts WHERE shipment_id=s.id;
  IF FOUND THEN
    IF existing.warehouse_id IS DISTINCT FROM _warehouse OR existing.receipt_date IS DISTINCT FROM _receipt_date THEN
      RAISE EXCEPTION 'receipt_replay_payload_mismatch';
    END IF;
    IF existing.tenant_id IS DISTINCT FROM s.tenant_id OR NOT EXISTS(
      SELECT 1 FROM public.journal_entries j WHERE j.tenant_id=s.tenant_id
        AND j.source_type='procurement_receipt' AND j.source_id=existing.id AND j.posted
    ) THEN RAISE EXCEPTION 'existing_receipt_posting_missing'; END IF;
    RETURN existing.id;
  END IF;
  IF _receipt_date IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.warehouses WHERE id=_warehouse AND tenant_id=s.tenant_id AND is_active
  ) THEN RAISE EXCEPTION 'invalid_receipt_scope'; END IF;
  IF s.status<>'costed' OR s.costing_approved_at IS NULL THEN RAISE EXCEPTION 'costing_not_approved'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.procurement_shipment_lines sl
    LEFT JOIN public.purchase_order_lines pol ON pol.id=sl.po_line_id
    LEFT JOIN public.purchase_orders po ON po.id=pol.po_id
    LEFT JOIN public.products p ON p.id=pol.product_id
    LEFT JOIN public.procurement_landed_cost_lines lc ON lc.shipment_line_id=sl.id
      AND lc.shipment_id=s.id AND lc.costing_version=s.costing_version AND lc.is_approved
    WHERE sl.shipment_id=s.id AND (
      sl.tenant_id IS DISTINCT FROM s.tenant_id OR po.tenant_id IS DISTINCT FROM s.tenant_id
      OR p.tenant_id IS DISTINCT FROM s.tenant_id OR lc.tenant_id IS DISTINCT FROM s.tenant_id
      OR sl.received_qty<=0 OR lc.unit_landed_cost<0
      OR abs(sl.received_qty*lc.unit_landed_cost-lc.landed_total)>0.02
    )
  ) THEN RAISE EXCEPTION 'invalid_receipt_line'; END IF;
  PERFORM private.assert_open_accounting_period(s.tenant_id,_receipt_date);
  PERFORM public.ensure_inventory_accounts(s.tenant_id);
  INSERT INTO public.procurement_receipts(tenant_id,receipt_no,shipment_id,warehouse_id,receipt_date,created_by)
    VALUES(s.tenant_id,'GRN-'||gen_random_uuid(),s.id,_warehouse,_receipt_date,auth.uid()) RETURNING id INTO r;
  FOR x IN SELECT sl.*,pol.product_id,lc.unit_landed_cost,lc.landed_total
    FROM public.procurement_shipment_lines sl
    JOIN public.purchase_order_lines pol ON pol.id=sl.po_line_id
    JOIN public.procurement_landed_cost_lines lc ON lc.shipment_line_id=sl.id
      AND lc.shipment_id=s.id AND lc.costing_version=s.costing_version AND lc.is_approved
    WHERE sl.shipment_id=s.id ORDER BY pol.product_id,sl.id FOR UPDATE OF sl,pol,lc
  LOOP
    m:=public.receive_stock(s.tenant_id,_warehouse,x.product_id,x.received_qty,x.unit_landed_cost,
      'procurement_receipt',r,s.shipment_no);
    INSERT INTO public.inventory_cost_layers(tenant_id,warehouse_id,product_id,source_movement_id,
      source_type,source_id,received_at,original_qty,remaining_qty,unit_cost)
      VALUES(s.tenant_id,_warehouse,x.product_id,m,'procurement_receipt',r,_receipt_date,
        x.received_qty,x.received_qty,x.unit_landed_cost);
    INSERT INTO public.procurement_receipt_lines(receipt_id,shipment_line_id,product_id,po_line_id,
      lot_no,received_qty,unit_landed_cost,landed_total,stock_movement_id)
      VALUES(r,x.id,x.product_id,x.po_line_id,x.lot_no,x.received_qty,x.unit_landed_cost,x.landed_total,m);
    total_value:=total_value+x.landed_total; line_count:=line_count+1;
  END LOOP;
  IF line_count=0 OR total_value<=0 THEN RAISE EXCEPTION 'approved_cost_lines_missing'; END IF;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(s.tenant_id,_receipt_date,s.shipment_no,'Landed cost receipt','procurement_receipt',r,auth.uid())
    RETURNING id INTO je;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
    (je,public.gl_account_by_code(s.tenant_id,'2050'),round(total_value,2),0,'Inventory',1),
    (je,public.gl_account_by_code(s.tenant_id,'2200'),0,round(total_value,2),'Payables',2);
  UPDATE public.journal_entries SET posted=true WHERE id=je;
  UPDATE public.procurement_shipments SET status='received',warehouse_id=_warehouse,received_at=now(),
    received_by=auth.uid(),updated_at=now() WHERE id=s.id;
  RETURN r;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_cash_transaction(_tenant_id uuid, _transaction_id uuid, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  original public.cash_transactions%rowtype;
  reversal_id uuid;
BEGIN
  IF NOT private.has_module_access(_tenant_id, 'finance', 'edit') THEN
    RAISE EXCEPTION 'Bu əməliyyat üçün maliyyə redaktə icazəsi tələb olunur';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO original
  FROM public.cash_transactions
  WHERE tenant_id = _tenant_id AND id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Kassa əməliyyatı tapılmadı'; END IF;
  IF original.reversal_of IS NOT NULL THEN RAISE EXCEPTION 'Reversal əməliyyatı yenidən ləğv edilə bilməz'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_transactions WHERE reversal_of = original.id) THEN
    RAISE EXCEPTION 'Bu əməliyyat artıq ləğv edilib';
  END IF;

  INSERT INTO public.cash_transactions(
    tenant_id, account_id, direction, amount, currency, category,
    counterparty, customer_id, vendor_id, reference, description,
    occurred_at, created_by, reversal_of
  ) VALUES (
    original.tenant_id, original.account_id,
    CASE original.direction::text WHEN 'in' THEN 'out' ELSE 'in' END,
    original.amount, original.currency, 'transaction_reversal',
    original.counterparty, original.customer_id, original.vendor_id,
    original.reference,
    'Ləğv: ' || original.transaction_no || ' · ' || trim(_reason),
    current_date, auth.uid(), original.id
  ) RETURNING id INTO reversal_id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, _tenant_id, auth.uid(), 'finance', 'cash_transaction_reversed',
    original.transaction_no || ' əməliyyatı əks yazılışla ləğv edildi',
    jsonb_build_object('transaction_id', original.id, 'reversal_id', reversal_id, 'reason', trim(_reason))
  );

  RETURN reversal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_stock_balance_average_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.movement_type IN ('receipt', 'transfer_in')
     AND NEW.quantity > 0
     AND NEW.unit_cost >= 0 THEN
    UPDATE public.stock_balances
       SET avg_cost = CASE
             WHEN on_hand > 0 THEN round(
               (
                 GREATEST(0, on_hand - NEW.quantity) * avg_cost
                 + NEW.quantity * NEW.unit_cost
               ) / on_hand,
               6
             )
             ELSE NEW.unit_cost
           END,
           updated_at = now()
     WHERE tenant_id = NEW.tenant_id
       AND warehouse_id = NEW.warehouse_id
       AND product_id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
