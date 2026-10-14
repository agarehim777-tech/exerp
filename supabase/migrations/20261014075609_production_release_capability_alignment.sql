-- Forward-only convergence for release c2c3e97. Reviewed source migrations are
-- embedded verbatim below; do not replay unrelated historical backfills.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $snapshot_guard$
BEGIN
  IF to_regclass('public.tenant_collection_records') IS NULL AND EXISTS (
    SELECT 1 FROM public.tenant_state_snapshots s
    CROSS JOIN LATERAL jsonb_each(s.state) e
    WHERE e.key IN ('employees','departments','leaveRequests','vacancies','contracts','cashEntries','financeAccounts','credits')
      AND jsonb_typeof(e.value)='array' AND e.value <> '[]'::jsonb
  ) THEN
    RAISE EXCEPTION 'ERP_SNAPSHOT_COLLECTION_MIGRATION_REQUIRED';
  END IF;
END $snapshot_guard$;

-- Source: 20260915072842_eccc2889-b44e-40e0-b2a4-82bdf39b1249.sql
DO $capability$
BEGIN
  IF to_regclass('public.tenant_collection_records') IS NULL THEN
    EXECUTE $capability_sql$
CREATE TABLE IF NOT EXISTS public.tenant_collection_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  collection text NOT NULL,
  record_key text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_collection_records_unique UNIQUE (tenant_id, collection, record_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_collection_records TO authenticated;
GRANT ALL ON public.tenant_collection_records TO service_role;

ALTER TABLE public.tenant_collection_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members read collection records" ON public.tenant_collection_records;
CREATE POLICY "tenant members read collection records"
  ON public.tenant_collection_records FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "tenant members write collection records" ON public.tenant_collection_records;
CREATE POLICY "tenant members write collection records"
  ON public.tenant_collection_records FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

CREATE INDEX IF NOT EXISTS tenant_collection_records_tenant_collection_idx
  ON public.tenant_collection_records (tenant_id, collection, position);

CREATE OR REPLACE FUNCTION public.touch_tenant_collection_records()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_collection_records_touch ON public.tenant_collection_records;
CREATE TRIGGER tenant_collection_records_touch
  BEFORE UPDATE ON public.tenant_collection_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_tenant_collection_records();
$capability_sql$;
  END IF;
END $capability$;

-- Source: 20261003135641_atomic_vendor_invoice_payment.sql
DO $capability$
BEGIN
  IF to_regclass('public.vendor_invoice_payments') IS NULL THEN
    EXECUTE $capability_sql$
CREATE TABLE public.vendor_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  invoice_id uuid NOT NULL UNIQUE REFERENCES public.vendor_invoices(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.cash_accounts(id),
  cash_transaction_id uuid NOT NULL UNIQUE REFERENCES public.cash_transactions(id) ON DELETE RESTRICT,
  journal_entry_id uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL CHECK(amount>0), currency text NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.vendor_invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_invoice_payments_read ON public.vendor_invoice_payments FOR SELECT TO authenticated
  USING(public.is_tenant_member(tenant_id,auth.uid()) AND coalesce(private.has_module_access(tenant_id,'finance','view'),false));
GRANT SELECT ON public.vendor_invoice_payments TO authenticated;
GRANT ALL ON public.vendor_invoice_payments TO service_role;
REVOKE ALL ON public.vendor_invoice_payments FROM anon;
CREATE INDEX vendor_invoice_payments_tenant_idx ON public.vendor_invoice_payments(tenant_id,paid_at);

CREATE FUNCTION public.pay_vendor_invoice_atomic(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; inv public.vendor_invoices%rowtype;
  account public.cash_accounts%rowtype; po public.purchase_orders%rowtype;
  total_amount numeric; available numeric; cash_id uuid; journal_id uuid; payment_id uuid;
  business_date date := (_payload->>'payment_date')::date; cash_gl uuid; payable_gl uuid; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'procurement','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR business_date IS NULL THEN RAISE EXCEPTION 'invalid_payment_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'pay_vendor_invoice_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'pay_vendor_invoice_atomic' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  SELECT * INTO inv FROM public.vendor_invoices WHERE id=(_payload->>'invoice_id')::uuid AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF inv.status NOT IN ('matched','approved') THEN RAISE EXCEPTION 'invoice_not_payable'; END IF;
  SELECT * INTO po FROM public.purchase_orders WHERE id=inv.po_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND OR po.vendor_id<>inv.vendor_id OR po.status::text IN ('draft','cancelled') THEN RAISE EXCEPTION 'invalid_purchase_scope'; END IF;
  IF inv.currency<>'AZN' OR po.currency<>inv.currency THEN RAISE EXCEPTION 'invoice_fx_posting_required'; END IF;
  PERFORM 1 FROM public.purchase_order_lines WHERE po_id=po.id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.vendor_invoice_lines WHERE invoice_id=inv.id ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.vendor_invoice_lines WHERE invoice_id=inv.id)
    OR EXISTS(SELECT 1 FROM public.vendor_invoice_lines l LEFT JOIN public.purchase_order_lines p ON p.id=l.po_line_id
      WHERE l.invoice_id=inv.id AND (p.id IS NULL OR p.po_id<>po.id OR l.tax_rate<0 OR l.tax_rate>100))
    OR EXISTS(SELECT 1 FROM public.evaluate_invoice_match(inv.id,0,0.02) WHERE status<>'matched') THEN RAISE EXCEPTION 'invoice_match_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_order_lines p WHERE p.po_id=po.id AND
    (SELECT coalesce(sum(l.qty_invoiced),0) FROM public.vendor_invoice_lines l JOIN public.vendor_invoices v ON v.id=l.invoice_id
      WHERE l.po_line_id=p.id AND v.tenant_id=_tenant_id AND v.status<>'cancelled')>
    (SELECT coalesce(sum(l.qty_received-l.qty_rejected),0) FROM public.goods_receipt_lines l WHERE l.po_line_id=p.id)) THEN
    RAISE EXCEPTION 'invoice_quantity_exceeds_receipts';
  END IF;
  IF EXISTS(SELECT 1 FROM public.purchase_order_lines p WHERE p.po_id=po.id AND
    (SELECT coalesce(sum(l.qty_invoiced),0) FROM public.vendor_invoice_lines l JOIN public.vendor_invoices v ON v.id=l.invoice_id
      WHERE l.po_line_id=p.id AND v.tenant_id=_tenant_id AND v.status<>'cancelled')>
    (SELECT coalesce(sum(l.received_qty),0) FROM public.procurement_receipt_lines l
      JOIN public.procurement_receipts r ON r.id=l.receipt_id AND r.tenant_id=_tenant_id
      WHERE l.po_line_id=p.id AND EXISTS(SELECT 1 FROM public.journal_entries j
        WHERE j.tenant_id=_tenant_id AND j.source_type='procurement_receipt' AND j.source_id=r.id AND j.posted))) THEN
    RAISE EXCEPTION 'posted_inventory_receipt_required';
  END IF;
  SELECT round(sum(qty_invoiced*unit_price*(1+tax_rate/100)),2) INTO total_amount FROM public.vendor_invoice_lines WHERE invoice_id=inv.id;
  IF total_amount IS NULL OR total_amount<=0 OR total_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
  SELECT * INTO account FROM public.cash_accounts WHERE tenant_id=_tenant_id AND id=(_payload->>'account_id')::uuid AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF account.currency<>inv.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  SELECT account.opening_balance+coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0)
    INTO available FROM public.cash_transactions WHERE tenant_id=_tenant_id AND account_id=account.id;
  IF total_amount>available THEN RAISE EXCEPTION 'insufficient_funds'; END IF;
  PERFORM public.ensure_inventory_accounts(_tenant_id);
  cash_gl:=coalesce(account.gl_account_id,public.gl_account_by_code(_tenant_id,CASE WHEN account.type::text='cash' THEN '1000' ELSE '1010' END));
  payable_gl:=public.gl_account_by_code(_tenant_id,'2200');
  IF NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=cash_gl AND tenant_id=_tenant_id) THEN RAISE EXCEPTION 'invalid_cash_gl_scope'; END IF;
  INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,reference_type,reference_id,reference,vendor_id,description,occurred_at,created_by)
    VALUES(_tenant_id,account.id,'out',total_amount,inv.currency,'vendor_invoice_payment','vendor_invoice',inv.id,inv.invoice_number,inv.vendor_id,
      'Vendor invoice payment',business_date::timestamp AT TIME ZONE 'Asia/Baku',auth.uid()) RETURNING id INTO cash_id;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(_tenant_id,business_date,inv.invoice_number,'Vendor payable settlement','vendor_invoice_payment',cash_id,auth.uid()) RETURNING id INTO journal_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    VALUES(journal_id,payable_gl,total_amount,0,'Vendor payable',1),(journal_id,cash_gl,0,total_amount,'Cash payment',2);
  UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
  INSERT INTO public.vendor_invoice_payments(tenant_id,invoice_id,account_id,cash_transaction_id,journal_entry_id,amount,currency,created_by)
    VALUES(_tenant_id,inv.id,account.id,cash_id,journal_id,total_amount,inv.currency,auth.uid()) RETURNING id INTO payment_id;
  UPDATE public.vendor_invoices SET status='paid',updated_at=now() WHERE id=inv.id;
  result_payload:=jsonb_build_object('payment_id',payment_id,'invoice_id',inv.id,'cash_transaction_id',cash_id,'journal_entry_id',journal_id,'amount',total_amount);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'procurement','invoice_paid',inv.invoice_number,result_payload);
  UPDATE public.operation_requests SET status='completed',completed_at=now(),result=result_payload WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.pay_vendor_invoice_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_vendor_invoice_atomic(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION private.guard_vendor_invoice_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='paid' THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  IF NEW.status='paid' AND NOT EXISTS(SELECT 1 FROM public.vendor_invoice_payments WHERE invoice_id=NEW.id AND tenant_id=NEW.tenant_id) THEN
    RAISE EXCEPTION 'invoice_payment_requires_server_command';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_vendor_invoice_payment() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER vendor_invoice_payment_guard BEFORE INSERT OR UPDATE ON public.vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_vendor_invoice_payment();

CREATE FUNCTION private.guard_paid_invoice_lines() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN
    PERFORM 1 FROM public.vendor_invoices WHERE id=OLD.invoice_id AND status='paid' FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
  END IF;
  IF TG_OP<>'DELETE' THEN
    PERFORM 1 FROM public.vendor_invoices WHERE id=NEW.invoice_id AND status='paid' FOR UPDATE;
    IF FOUND THEN RAISE EXCEPTION 'paid_invoice_is_immutable'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION private.guard_paid_invoice_lines() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER paid_invoice_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.vendor_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_invoice_lines();

$capability_sql$;
  END IF;
END $capability$;

-- Source: 20261003140457_viewer_write_boundary.sql
DO $capability$
BEGIN
  IF to_regprocedure('private.guard_viewer_write()') IS NULL THEN
    EXECUTE $capability_sql$
CREATE FUNCTION private.guard_viewer_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb; scope_id uuid; parent_tenant uuid; link record;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id=auth.uid() AND role='viewer') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(
    CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW))
         WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD))
         ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
    scope_id:=(row_data->>'tenant_id')::uuid;
    IF EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=scope_id AND user_id=auth.uid() AND role='viewer') THEN
      RAISE EXCEPTION 'readonly_role_write_denied' USING ERRCODE='42501';
    END IF;
    FOR link IN SELECT pn.nspname,pc.relname,ca.attname child_column,pa.attname parent_column
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class pc ON pc.oid=c.confrelid JOIN pg_catalog.pg_namespace pn ON pn.oid=pc.relnamespace
      JOIN pg_catalog.pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=c.conkey[1]
      JOIN pg_catalog.pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[1]
      WHERE c.conrelid=TG_RELID AND c.contype='f' AND array_length(c.conkey,1)=1 AND pn.nspname='public'
        AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.confrelid AND a.attname='tenant_id' AND NOT a.attisdropped) LOOP
      EXECUTE format('SELECT tenant_id FROM %I.%I WHERE %I::text=$1',link.nspname,link.relname,link.parent_column)
        INTO parent_tenant USING row_data->>link.child_column;
      IF EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=parent_tenant AND user_id=auth.uid() AND role='viewer') THEN
        RAISE EXCEPTION 'readonly_role_write_denied' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.guard_viewer_write() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE target record;
BEGIN
  FOR target IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND (
      EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped)
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_constraint fk JOIN pg_catalog.pg_attribute a ON a.attrelid=fk.confrelid
        WHERE fk.conrelid=c.oid AND fk.contype='f' AND a.attname='tenant_id' AND NOT a.attisdropped)) LOOP
    EXECUTE format('CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write()',target.nspname,target.relname);
  END LOOP;
END $$;

$capability_sql$;
  END IF;
END $capability$;

-- Source: 20261003140739_atomic_material_production.sql
DO $capability$
BEGIN
  IF to_regclass('public.production_batches') IS NULL THEN
    EXECUTE $capability_sql$
CREATE TABLE public.production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  batch_no text NOT NULL, warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id), quantity numeric(18,3) NOT NULL CHECK(quantity>0),
  total_cost numeric(18,6) NOT NULL CHECK(total_cost>=0), unit_cost numeric(18,6) NOT NULL CHECK(unit_cost>=0),
  valuation_method text NOT NULL, journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  created_by uuid NOT NULL REFERENCES auth.users(id), completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,batch_no)
);
CREATE TABLE public.production_batch_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES public.production_batches(id),
  product_id uuid NOT NULL REFERENCES public.products(id), quantity numeric(18,3) NOT NULL CHECK(quantity>0),
  total_cost numeric(18,6) NOT NULL CHECK(total_cost>=0), stock_movement_id uuid NOT NULL REFERENCES public.stock_movements(id),
  UNIQUE(batch_id,product_id)
);
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_batch_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_batches_read ON public.production_batches FOR SELECT TO authenticated
  USING(coalesce(private.has_module_access(tenant_id,'production','view'),false));
CREATE POLICY production_materials_read ON public.production_batch_materials FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.production_batches b WHERE b.id=batch_id AND coalesce(private.has_module_access(b.tenant_id,'production','view'),false)));
GRANT SELECT ON public.production_batches,public.production_batch_materials TO authenticated;
GRANT ALL ON public.production_batches,public.production_batch_materials TO service_role;
REVOKE ALL ON public.production_batches,public.production_batch_materials FROM anon;
CREATE INDEX production_batches_tenant_date_idx ON public.production_batches(tenant_id,completed_at);
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.production_batches
  FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();
CREATE TRIGGER viewer_write_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.production_batch_materials
  FOR EACH ROW EXECUTE FUNCTION private.guard_viewer_write();

CREATE FUNCTION public.post_material_production(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; material jsonb; components jsonb:=_payload->'materials';
  output_id uuid:=(_payload->>'product_id')::uuid; warehouse uuid:=(_payload->>'warehouse_id')::uuid;
  output_qty numeric:=(_payload->>'quantity')::numeric; product uuid; required_qty numeric; need numeric; take numeric;
  balance public.stock_balances%rowtype; layer public.inventory_cost_layers%rowtype; method text;
  batch uuid:=gen_random_uuid(); journal uuid; movement uuid; material_cost numeric; total_cost numeric:=0;
  allocations jsonb:='[]'; result_payload jsonb; inventory_gl uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'production','edit'),false)
    OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR output_qty IS NULL OR output_qty<=0
    OR output_qty::text IN('NaN','Infinity','-Infinity') OR output_qty<>round(output_qty,3)
    OR jsonb_typeof(components) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_production_request'; END IF;
  IF jsonb_array_length(components)=0 OR jsonb_array_length(components)>100 THEN RAISE EXCEPTION 'production_materials_required'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'post_material_production',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'post_material_production' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse AND tenant_id=_tenant_id AND is_active)
    OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=output_id AND tenant_id=_tenant_id AND is_active) THEN RAISE EXCEPTION 'invalid_production_scope'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(components) m GROUP BY m->>'product_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'duplicate_material'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  PERFORM public.ensure_inventory_accounts(_tenant_id);
  SELECT valuation_method INTO method FROM public.inventory_accounting_settings WHERE tenant_id=_tenant_id;
  -- Serializes new output balance creation; all material balances are then locked in product order.
  PERFORM pg_advisory_xact_lock(hashtextextended('production:'||_tenant_id::text,0));
  INSERT INTO public.stock_balances(tenant_id,warehouse_id,product_id,on_hand,reserved)
    VALUES(_tenant_id,warehouse,output_id,0,0) ON CONFLICT(tenant_id,warehouse_id,product_id) DO NOTHING;
  PERFORM 1 FROM public.stock_balances WHERE tenant_id=_tenant_id AND warehouse_id=warehouse
    AND (product_id=output_id OR product_id IN(SELECT (m->>'product_id')::uuid FROM jsonb_array_elements(components) m)) ORDER BY product_id FOR UPDATE;
  FOR material IN SELECT value FROM jsonb_array_elements(components) ORDER BY value->>'product_id' LOOP
    product:=(material->>'product_id')::uuid; required_qty:=(material->>'quantity')::numeric;
    IF product=output_id OR required_qty IS NULL OR required_qty<=0 OR required_qty::text IN('NaN','Infinity','-Infinity')
      OR required_qty<>round(required_qty,3) OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=product AND tenant_id=_tenant_id AND is_active)
      THEN RAISE EXCEPTION 'invalid_production_material'; END IF;
    SELECT * INTO balance FROM public.stock_balances WHERE tenant_id=_tenant_id AND warehouse_id=warehouse AND product_id=product FOR UPDATE;
    IF NOT FOUND OR balance.on_hand-balance.reserved-coalesce(balance.problem_qty,0)<required_qty THEN RAISE EXCEPTION 'insufficient_material_stock'; END IF;
    material_cost:=0;
    IF method='fifo' THEN
      need:=required_qty;
      FOR layer IN SELECT * FROM public.inventory_cost_layers WHERE tenant_id=_tenant_id AND warehouse_id=warehouse
        AND product_id=product AND remaining_qty>0 ORDER BY received_at,id FOR UPDATE LOOP
        EXIT WHEN need<=0;
        take:=least(need,layer.remaining_qty); material_cost:=material_cost+take*layer.unit_cost;
        UPDATE public.inventory_cost_layers SET remaining_qty=remaining_qty-take WHERE id=layer.id;
        need:=need-take;
      END LOOP;
      IF need>0 THEN RAISE EXCEPTION 'material_cost_layers_require_reconciliation'; END IF;
    ELSE material_cost:=required_qty*balance.avg_cost;
    END IF;
    UPDATE public.stock_balances SET on_hand=on_hand-required_qty,updated_at=now()
      WHERE tenant_id=_tenant_id AND warehouse_id=warehouse AND product_id=product;
    INSERT INTO public.stock_movements(tenant_id,warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by)
      VALUES(_tenant_id,warehouse,product,'write_off',-required_qty,round(material_cost/required_qty,6),'production_batch',batch,'BOM material consumption',auth.uid()) RETURNING id INTO movement;
    allocations:=allocations||jsonb_build_array(jsonb_build_object('product_id',product,'quantity',required_qty,'total_cost',material_cost,'movement_id',movement));
    total_cost:=total_cost+material_cost;
  END LOOP;
  IF round(total_cost,2)<=0 THEN RAISE EXCEPTION 'production_material_valuation_required'; END IF;
  PERFORM public.receive_stock(_tenant_id,warehouse,output_id,output_qty,round(total_cost/output_qty,6),'production_batch',batch,'Finished goods');
  inventory_gl:=public.gl_account_by_code(_tenant_id,'2050');
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(_tenant_id,current_date,'PROD-'||batch::text,'Material conversion to finished goods','production_batch',batch,auth.uid()) RETURNING id INTO journal;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    VALUES(journal,inventory_gl,round(total_cost,2),0,'Finished goods',1),(journal,inventory_gl,0,round(total_cost,2),'Consumed materials',2);
  UPDATE public.journal_entries SET posted=true WHERE id=journal;
  INSERT INTO public.production_batches(id,tenant_id,batch_no,warehouse_id,product_id,quantity,total_cost,unit_cost,valuation_method,journal_entry_id,created_by)
    VALUES(batch,_tenant_id,'PROD-'||batch::text,warehouse,output_id,output_qty,total_cost,round(total_cost/output_qty,6),method,journal,auth.uid());
  INSERT INTO public.production_batch_materials(batch_id,product_id,quantity,total_cost,stock_movement_id)
    SELECT batch,(m->>'product_id')::uuid,(m->>'quantity')::numeric,(m->>'total_cost')::numeric,(m->>'movement_id')::uuid FROM jsonb_array_elements(allocations) m;
  result_payload:=jsonb_build_object('batch_id',batch,'journal_entry_id',journal,'quantity',output_qty,'total_cost',total_cost,'unit_cost',round(total_cost/output_qty,6));
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'production','batch_posted','BOM material conversion',result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.post_material_production(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_material_production(uuid,text,jsonb) TO authenticated;

$capability_sql$;
  END IF;
END $capability$;

-- Source: 20261005120626_atomic_warehouse_csv_import.sql
DO $capability$
BEGIN
  IF to_regprocedure('public.import_warehouse_stock_atomic(uuid,text,jsonb)') IS NULL THEN
    EXECUTE $capability_sql$
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS serial_tracked boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD CONSTRAINT products_cost_price_nonnegative CHECK (cost_price>=0 AND cost_price::text NOT IN ('NaN','Infinity','-Infinity'));

CREATE FUNCTION public.import_warehouse_stock_atomic(_tenant_id uuid,_request_key text,_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; item jsonb; product public.products%rowtype;
  warehouse_id uuid; quantity numeric; cost numeric; sale_price_value numeric; minimum numeric;
  item_sku text; product_name text; movement_id uuid; results jsonb := '[]'; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'warehouse','edit'),false)
    THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 OR jsonb_typeof(_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(_rows)<1 OR jsonb_array_length(_rows)>500 THEN RAISE EXCEPTION 'invalid_import_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'import_warehouse_stock_atomic',md5(_rows::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'import_warehouse_stock_atomic' OR req.request_hash<>md5(_rows::text)
    THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  -- Serialize catalog creation and acquire inventory locks in a stable order.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('warehouse-import:'||_tenant_id::text,0));
  PERFORM private.assert_open_accounting_period(_tenant_id,current_date);
  FOR item IN SELECT value FROM jsonb_array_elements(_rows) WITH ORDINALITY rows(value,position)
    ORDER BY value->>'warehouseId',value->>'sku',position LOOP
    warehouse_id := (item->>'warehouseId')::uuid;
    quantity := (item->>'qty')::numeric; cost := (item->>'costPrice')::numeric;
    sale_price_value := (item->>'salePrice')::numeric; minimum := (item->>'reorderLevel')::numeric;
    item_sku := nullif(upper(trim(item->>'sku')),''); product_name := nullif(trim(item->>'product'),'');
    IF product_name IS NULL OR length(product_name)>300 OR length(item_sku)>120 OR quantity IS NULL OR quantity<=0
      OR quantity::text IN ('NaN','Infinity','-Infinity')
      OR cost<0 OR cost::text IN ('NaN','Infinity','-Infinity')
      OR sale_price_value<0 OR sale_price_value::text IN ('NaN','Infinity','-Infinity')
      OR minimum<0 OR minimum::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_import_row'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse_id AND tenant_id=_tenant_id AND is_active)
      THEN RAISE EXCEPTION 'invalid_stock_scope'; END IF;
    SELECT * INTO product FROM public.products WHERE tenant_id=_tenant_id
      AND CASE WHEN item_sku IS NOT NULL THEN products.sku=item_sku ELSE name=product_name END ORDER BY id LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF product.currency<>'AZN' OR NOT product.is_active THEN RAISE EXCEPTION 'invalid_import_product'; END IF;
      UPDATE public.products SET price=coalesce(sale_price_value,products.price),
        cost_price=coalesce(cost,products.cost_price),minimum_stock=coalesce(minimum,products.minimum_stock),
        serial_tracked=coalesce((item->>'serialTracked')::boolean,products.serial_tracked),
        description=coalesce(nullif(item->>'category',''),products.description),unit=coalesce(nullif(item->>'unit',''),products.unit),updated_at=now()
        WHERE id=product.id AND tenant_id=_tenant_id RETURNING * INTO product;
    ELSE
      INSERT INTO public.products(tenant_id,sku,name,description,unit,price,cost_price,minimum_stock,serial_tracked,currency,created_by)
        VALUES(_tenant_id,coalesce(item_sku,'IMP-'||gen_random_uuid()::text),product_name,nullif(item->>'category',''),
          coalesce(nullif(item->>'unit',''),'pcs'),coalesce(sale_price_value,0),coalesce(cost,0),coalesce(minimum,0),
          coalesce((item->>'serialTracked')::boolean,false),'AZN',auth.uid()) RETURNING * INTO product;
    END IF;
    movement_id := public.receive_stock(_tenant_id,warehouse_id,product.id,quantity,coalesce(cost,product.cost_price),
      'csv_import',req.id,'CSV stock import');
    results := results||jsonb_build_array(jsonb_build_object('product_id',product.id,'warehouse_id',warehouse_id,
      'movement_id',movement_id,'quantity',quantity));
  END LOOP;
  result_payload := jsonb_build_object('request_id',req.id,'rows',results,'row_count',jsonb_array_length(results));
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'warehouse','csv_import','CSV stock import completed',result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.import_warehouse_stock_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_warehouse_stock_atomic(uuid,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';

$capability_sql$;
  END IF;
END $capability$;

-- Source: 20261006062828_atomic_sales_invoice_commands.sql
DO $capability$
BEGIN
  IF to_regprocedure('public.create_sales_invoice_atomic(uuid,text,jsonb)') IS NULL THEN
    EXECUTE $capability_sql$
-- Invoice receipts own a cash row and a journal, not a second sales payment.
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS cash_transaction_id uuid REFERENCES public.cash_transactions(id),
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid REFERENCES public.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_cash_row_idx ON public.invoice_payments(cash_transaction_id)
  WHERE cash_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_payments_journal_idx ON public.invoice_payments(journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS invoice_payments_reversal_journal_idx ON public.invoice_payments(reversal_journal_entry_id)
  WHERE reversal_journal_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_sales_invoice_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
END $$;

CREATE OR REPLACE FUNCTION public.post_invoice_to_gl(_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.sales_invoices%rowtype; linked_order uuid; source_order public.orders%rowtype;
  entry_id uuid; ar uuid; revenue uuid; vat_account uuid;
BEGIN
  SELECT order_id INTO linked_order FROM public.sales_invoices WHERE id=_invoice_id;
  -- Order first matches cancellation and delivery lock order.
  IF linked_order IS NOT NULL THEN SELECT * INTO source_order FROM public.orders WHERE id=linked_order FOR UPDATE; END IF;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT private.has_module_access(inv.tenant_id,'invoices','edit') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF inv.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_invoice_is_terminal'; END IF;
  IF inv.posted THEN
    IF NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=inv.journal_entry_id AND tenant_id=inv.tenant_id AND posted) THEN
      RAISE EXCEPTION 'invoice_journal_requires_reconciliation';
    END IF;
    RETURN inv.journal_entry_id;
  END IF;
  IF inv.currency<>'AZN' THEN RAISE EXCEPTION 'invoice_currency_not_supported'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_invoice_lines WHERE invoice_id=inv.id AND tenant_id=inv.tenant_id)
    OR inv.total<>(SELECT coalesce(sum(line_total),0) FROM public.sales_invoice_lines WHERE invoice_id=inv.id AND tenant_id=inv.tenant_id)
    OR inv.vat_total<>(SELECT coalesce(sum(round(round(qty*unit_price*(1-discount_pct/100),2)*vat_rate/100,2)),0)
      FROM public.sales_invoice_lines WHERE invoice_id=inv.id AND tenant_id=inv.tenant_id) THEN
    RAISE EXCEPTION 'invoice_lines_require_reconciliation';
  END IF;
  IF inv.order_id IS NOT NULL THEN
    IF source_order.tenant_id IS DISTINCT FROM inv.tenant_id OR source_order.status::text='cancelled' THEN
      RAISE EXCEPTION 'invoice_order_mismatch';
    END IF;
    IF round(source_order.total,2)<>inv.total OR round(source_order.vat_total,2)<>inv.vat_total THEN
      RAISE EXCEPTION 'invoice_order_totals_mismatch';
    END IF;
    SELECT journal_entry_id INTO entry_id FROM public.order_accounting_events
      WHERE tenant_id=inv.tenant_id AND order_id=inv.order_id AND event_type='delivery';
    IF entry_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=entry_id AND tenant_id=inv.tenant_id AND posted) THEN
      RAISE EXCEPTION 'invoice_order_delivery_required';
    END IF;
  ELSE
    PERFORM private.assert_open_accounting_period(inv.tenant_id,inv.invoice_date);
    IF inv.total<=0 OR inv.total<>inv.subtotal+inv.vat_total THEN RAISE EXCEPTION 'invalid_invoice_total'; END IF;
    IF EXISTS(SELECT 1 FROM public.journal_entries WHERE tenant_id=inv.tenant_id AND source_type='sales_invoice' AND source_id=inv.id) THEN
      RAISE EXCEPTION 'invoice_journal_requires_reconciliation';
    END IF;
    ar := public.gl_account_by_code(inv.tenant_id,'1200');
    revenue := public.gl_account_by_code(inv.tenant_id,'4000');
    vat_account := public.gl_account_by_code(inv.tenant_id,'2100');
    IF ar IS NULL OR revenue IS NULL OR (inv.vat_total>0 AND vat_account IS NULL) THEN RAISE EXCEPTION 'chart_of_accounts_incomplete'; END IF;
    INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
      VALUES(inv.tenant_id,inv.invoice_date,inv.invoice_no,'Sales invoice','sales_invoice',inv.id,auth.uid()) RETURNING id INTO entry_id;
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
      (entry_id,ar,inv.total,0,'Accounts receivable',1),(entry_id,revenue,0,inv.subtotal,'Revenue',2);
    IF inv.vat_total>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
      VALUES(entry_id,vat_account,0,inv.vat_total,'VAT',3); END IF;
    UPDATE public.journal_entries SET posted=true WHERE id=entry_id;
  END IF;
  UPDATE public.sales_invoices SET posted=true,journal_entry_id=entry_id,
    status=CASE WHEN status='draft' THEN 'issued'::public.sales_invoice_status ELSE status END,updated_at=now() WHERE id=inv.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,inv.tenant_id,auth.uid(),'invoices','invoice_posted',inv.invoice_no,
      jsonb_build_object('invoice_id',inv.id,'journal_entry_id',entry_id));
  RETURN entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.post_payment_to_gl(_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.invoice_payments%rowtype; inv public.sales_invoices%rowtype; account public.cash_accounts%rowtype;
  entry_id uuid; cash_id uuid; ar uuid; cash_gl uuid; invoice_id uuid;
BEGIN
  SELECT p.invoice_id INTO invoice_id FROM public.invoice_payments p WHERE p.id=_payment_id;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=invoice_id FOR UPDATE;
  SELECT * INTO pay FROM public.invoice_payments WHERE id=_payment_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT private.has_module_access(pay.tenant_id,'invoices','edit')
    OR NOT private.has_module_access(pay.tenant_id,'finance','edit') OR inv.tenant_id IS DISTINCT FROM pay.tenant_id THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF inv.status::text='cancelled' OR pay.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'cancelled_invoice_is_terminal'; END IF;
  IF inv.order_id IS NOT NULL THEN RAISE EXCEPTION 'invoice_payment_use_sales_lifecycle'; END IF;
  IF pay.journal_entry_id IS NOT NULL AND pay.cash_transaction_id IS NOT NULL THEN RETURN pay.journal_entry_id; END IF;
  -- Never auto-repair historical partial postings: they need administrator review.
  IF pay.journal_entry_id IS NOT NULL OR pay.cash_transaction_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.journal_entries
    WHERE tenant_id=pay.tenant_id AND source_type='invoice_payment' AND source_id=pay.id) THEN
    RAISE EXCEPTION 'invoice_payment_requires_reconciliation';
  END IF;
  IF NOT inv.posted THEN RAISE EXCEPTION 'invoice_posting_required'; END IF;
  IF inv.paid_amount>inv.total THEN RAISE EXCEPTION 'invoice_payment_requires_reconciliation'; END IF;
  PERFORM private.assert_open_accounting_period(pay.tenant_id,pay.paid_at);
  SELECT * INTO account FROM public.cash_accounts WHERE id=pay.account_id AND tenant_id=pay.tenant_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF pay.currency<>'AZN' OR account.currency<>pay.currency OR inv.currency<>pay.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  IF pay.amount<=0 OR pay.amount::text IN('NaN','Infinity','-Infinity') OR pay.amount<>round(pay.amount,2) THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;
  ar := public.gl_account_by_code(pay.tenant_id,'1200');
  cash_gl := coalesce(account.gl_account_id,public.gl_account_by_code(pay.tenant_id,CASE WHEN account.type::text='cash' THEN '1000' ELSE '1010' END));
  IF ar IS NULL OR cash_gl IS NULL OR NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=cash_gl AND tenant_id=pay.tenant_id) THEN
    RAISE EXCEPTION 'chart_of_accounts_incomplete';
  END IF;
  INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,reference_type,reference_id,
    reference,customer_id,description,occurred_at,created_by)
    VALUES(pay.tenant_id,account.id,'in',pay.amount,pay.currency,'invoice_payment','invoice_payment',pay.id,
      inv.invoice_no,inv.customer_id,'Invoice receipt',pay.paid_at::timestamp AT TIME ZONE 'Asia/Baku',auth.uid()) RETURNING id INTO cash_id;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(pay.tenant_id,pay.paid_at,inv.invoice_no,'Invoice receipt','invoice_payment',pay.id,auth.uid()) RETURNING id INTO entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
    (entry_id,cash_gl,pay.amount,0,'Cash receipt',1),(entry_id,ar,0,pay.amount,'Receivable settled',2);
  UPDATE public.journal_entries SET posted=true WHERE id=entry_id;
  UPDATE public.invoice_payments SET cash_transaction_id=cash_id,journal_entry_id=entry_id WHERE id=pay.id;
  RETURN entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(_tenant_id uuid, _request_key text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE request public.operation_requests%rowtype; inv public.sales_invoices%rowtype;
  amount_value numeric; business_date date; payment_id uuid; entry_id uuid; result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id,'invoices','edit')
    OR NOT private.has_module_access(_tenant_id,'finance','edit') THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>160 THEN RAISE EXCEPTION 'invalid_request_key'; END IF;
  IF jsonb_typeof(_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'record_invoice_payment_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO request FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF request.operation<>'record_invoice_payment_atomic' OR request.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF request.status='completed' THEN RETURN request.result; END IF;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=(_payload->>'invoice_id')::uuid AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;
  IF inv.status::text='cancelled' THEN RAISE EXCEPTION 'cancelled_invoice_is_terminal'; END IF;
  IF inv.order_id IS NOT NULL THEN RAISE EXCEPTION 'invoice_payment_use_sales_lifecycle'; END IF;
  IF NOT inv.posted THEN RAISE EXCEPTION 'invoice_posting_required'; END IF;
  amount_value := (_payload->>'amount')::numeric;
  business_date := coalesce(nullif(_payload->>'paid_at','')::date,(now() AT TIME ZONE 'Asia/Baku')::date);
  IF amount_value IS NULL OR amount_value<=0 OR amount_value::text IN('NaN','Infinity','-Infinity')
    OR amount_value<>round(amount_value,2) OR amount_value>inv.total-inv.paid_amount THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF business_date<inv.invoice_date THEN RAISE EXCEPTION 'invalid_payment_date'; END IF;
  INSERT INTO public.invoice_payments(tenant_id,invoice_id,account_id,amount,currency,method,reference,paid_at,created_by)
    VALUES(_tenant_id,inv.id,nullif(_payload->>'account_id','')::uuid,amount_value,inv.currency,
      coalesce(nullif(_payload->>'method',''),'bank'),_payload->>'reference',business_date,auth.uid()) RETURNING id INTO payment_id;
  entry_id := public.post_payment_to_gl(payment_id);
  SELECT jsonb_build_object('payment_id',payment_id,'invoice_id',inv.id,'journal_entry_id',entry_id,'transaction_id',p.cash_transaction_id)
    INTO result_payload FROM public.invoice_payments p WHERE p.id=payment_id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'invoices','invoice_payment',inv.invoice_no,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=request.id;
  RETURN result_payload;
END $$;

CREATE OR REPLACE FUNCTION public.sync_invoice_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE invoice_id uuid := coalesce(NEW.invoice_id,OLD.invoice_id); inv public.sales_invoices%rowtype; paid numeric;
BEGIN
  SELECT * INTO inv FROM public.sales_invoices WHERE id=invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN coalesce(NEW,OLD); END IF;
  IF inv.order_id IS NOT NULL THEN
    SELECT o.paid_amount INTO paid FROM public.orders o WHERE o.id=inv.order_id AND o.tenant_id=inv.tenant_id;
  ELSE
    SELECT coalesce(sum(p.amount),0) INTO paid FROM public.invoice_payments p
      WHERE p.invoice_id=inv.id AND p.tenant_id=inv.tenant_id AND p.reversed_at IS NULL;
  END IF;
  UPDATE public.sales_invoices SET paid_amount=coalesce(paid,0),status=CASE
    WHEN status::text='cancelled' THEN status
    WHEN paid>=total AND total>0 THEN 'paid'::public.sales_invoice_status
    WHEN paid>0 THEN 'partial'::public.sales_invoice_status
    WHEN due_date<(now() AT TIME ZONE 'Asia/Baku')::date THEN 'overdue'::public.sales_invoice_status
    WHEN status::text='draft' THEN status ELSE 'issued'::public.sales_invoice_status END,updated_at=now() WHERE id=inv.id;
  RETURN coalesce(NEW,OLD);
END $$;

CREATE OR REPLACE FUNCTION private.sync_order_invoice_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.sales_invoices SET paid_amount=NEW.paid_amount,status=CASE
    WHEN status::text='cancelled' THEN status
    WHEN NEW.paid_amount>=total AND total>0 THEN 'paid'::public.sales_invoice_status
    WHEN NEW.paid_amount>0 THEN 'partial'::public.sales_invoice_status
    WHEN due_date<(now() AT TIME ZONE 'Asia/Baku')::date THEN 'overdue'::public.sales_invoice_status
    WHEN status::text='draft' THEN status ELSE 'issued'::public.sales_invoice_status END,updated_at=now()
    WHERE tenant_id=NEW.tenant_id AND order_id=NEW.id AND status::text<>'cancelled';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_order_invoice_balance ON public.orders;
CREATE TRIGGER sync_order_invoice_balance AFTER UPDATE OF paid_amount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.sync_order_invoice_balance();

CREATE OR REPLACE FUNCTION private.guard_invoice_cash_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.invoice_payments%rowtype; inv public.sales_invoices%rowtype;
BEGIN
  IF TG_OP<>'INSERT' THEN
    IF OLD.category='invoice_payment' OR EXISTS(SELECT 1 FROM public.invoice_payments WHERE cash_transaction_id=OLD.reversal_of) THEN
      RAISE EXCEPTION 'invoice_cash_is_immutable';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;
  IF NEW.reversal_of IS NOT NULL THEN
    SELECT * INTO pay FROM public.invoice_payments WHERE cash_transaction_id=NEW.reversal_of;
    IF FOUND THEN
      IF auth.uid() IS NULL OR NOT private.has_module_access(pay.tenant_id,'finance','edit') THEN
        RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
      END IF;
      IF pay.tenant_id<>NEW.tenant_id OR pay.account_id<>NEW.account_id OR pay.currency<>NEW.currency
        OR pay.amount<>NEW.amount OR NEW.direction::text<>'out' OR NEW.category<>'transaction_reversal' THEN
        RAISE EXCEPTION 'invoice_cash_reversal_mismatch';
      END IF;
    END IF;
  ELSIF NEW.category='invoice_payment' THEN
    SELECT * INTO pay FROM public.invoice_payments WHERE id=NEW.reference_id;
    SELECT * INTO inv FROM public.sales_invoices WHERE id=pay.invoice_id;
    IF auth.uid() IS NULL OR NOT private.has_module_access(NEW.tenant_id,'finance','edit') THEN
      RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
    END IF;
    IF pay.id IS NULL OR pay.tenant_id<>NEW.tenant_id OR pay.account_id IS DISTINCT FROM NEW.account_id
      OR pay.currency<>NEW.currency OR pay.amount<>NEW.amount OR NEW.direction::text<>'in'
      OR NEW.reference_type IS DISTINCT FROM 'invoice_payment' OR inv.customer_id IS DISTINCT FROM NEW.customer_id
      OR pay.cash_transaction_id IS NOT NULL OR pay.reversed_at IS NOT NULL
      OR inv.status::text='cancelled' OR inv.order_id IS NOT NULL OR NOT inv.posted THEN
      RAISE EXCEPTION 'invoice_cash_source_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_cash_source_guard ON public.cash_transactions;
CREATE TRIGGER invoice_cash_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_cash_source();

-- A cashbook reversal must also reopen invoice debt and reverse its receipt journal.
CREATE OR REPLACE FUNCTION private.reverse_invoice_receipt_from_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE pay public.invoice_payments%rowtype; reversal_entry_id uuid;
BEGIN
  IF NEW.reversal_of IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO pay FROM public.invoice_payments WHERE tenant_id=NEW.tenant_id AND cash_transaction_id=NEW.reversal_of;
  IF NOT FOUND THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.sales_invoices WHERE id=pay.invoice_id FOR UPDATE;
  SELECT * INTO pay FROM public.invoice_payments WHERE id=pay.id FOR UPDATE;
  IF pay.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'invoice_payment_already_reversed'; END IF;
  PERFORM private.assert_open_accounting_period(pay.tenant_id,(NEW.occurred_at AT TIME ZONE 'Asia/Baku')::date);
  IF pay.journal_entry_id IS NULL THEN RAISE EXCEPTION 'invoice_payment_requires_reconciliation'; END IF;
  INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
    VALUES(pay.tenant_id,(NEW.occurred_at AT TIME ZONE 'Asia/Baku')::date,pay.reference,'Invoice receipt reversal',
      'invoice_payment_reversal',pay.id,auth.uid()) RETURNING id INTO reversal_entry_id;
  INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
    SELECT reversal_entry_id,l.account_id,l.credit,l.debit,'Invoice receipt reversal',l.line_no
    FROM public.journal_lines l WHERE l.entry_id=pay.journal_entry_id ORDER BY l.line_no;
  UPDATE public.journal_entries SET posted=true WHERE id=reversal_entry_id;
  UPDATE public.invoice_payments SET reversed_at=now(),reversal_journal_entry_id=reversal_entry_id WHERE id=pay.id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reverse_invoice_receipt_from_cash ON public.cash_transactions;
CREATE TRIGGER reverse_invoice_receipt_from_cash AFTER INSERT ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION private.reverse_invoice_receipt_from_cash();

CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE inv public.sales_invoices%rowtype; line record; pay record; journal_id uuid; linked_status text;
BEGIN
  SELECT o.status::text INTO linked_status FROM public.orders o JOIN public.sales_invoices i ON i.order_id=o.id
    WHERE i.id=_invoice_id FOR UPDATE OF o;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    private.has_module_access(inv.tenant_id,'invoices','edit') OR
    (linked_status IS NOT NULL AND private.has_module_access(inv.tenant_id,'sales','edit'))
  ) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF inv.status::text='cancelled' THEN RETURN; END IF;
  PERFORM private.assert_open_accounting_period(inv.tenant_id,(now() AT TIME ZONE 'Asia/Baku')::date);
  FOR pay IN SELECT * FROM public.invoice_payments WHERE tenant_id=inv.tenant_id AND invoice_id=inv.id AND reversed_at IS NULL ORDER BY id LOOP
    IF pay.cash_transaction_id IS NULL OR pay.journal_entry_id IS NULL THEN
      RAISE EXCEPTION 'invoice_payment_requires_reconciliation';
    END IF;
    -- The reversal trigger closes the receipt's GL and paid_amount in this transaction.
    INSERT INTO public.cash_transactions(tenant_id,account_id,direction,amount,currency,category,reference,
      customer_id,description,occurred_at,created_by,reversal_of)
      VALUES(inv.tenant_id,pay.account_id,'out',pay.amount,pay.currency,'transaction_reversal',inv.invoice_no,
        inv.customer_id,'Invoice cancelled',now(),auth.uid(),pay.cash_transaction_id);
  END LOOP;
  IF inv.order_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.order_accounting_events
    WHERE tenant_id=inv.tenant_id AND order_id=inv.order_id AND event_type='delivery') THEN
    IF linked_status<>'cancelled' THEN RAISE EXCEPTION 'cancel_linked_order_first'; END IF;
  ELSIF inv.posted AND inv.journal_entry_id IS NOT NULL THEN
    INSERT INTO public.journal_entries(tenant_id,entry_date,reference,description,source_type,source_id,created_by)
      VALUES(inv.tenant_id,(now() AT TIME ZONE 'Asia/Baku')::date,inv.invoice_no||'-L','Invoice reversal',
        'sales_invoice_cancellation',inv.id,auth.uid()) RETURNING id INTO journal_id;
    FOR line IN SELECT * FROM public.journal_lines WHERE entry_id=inv.journal_entry_id ORDER BY line_no LOOP
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no)
        VALUES(journal_id,line.account_id,line.credit,line.debit,'Invoice reversal',line.line_no);
    END LOOP;
    UPDATE public.journal_entries SET posted=true WHERE id=journal_id;
  END IF;
  UPDATE public.sales_invoices SET status='cancelled',updated_at=now() WHERE id=inv.id;
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,inv.tenant_id,auth.uid(),'invoices','invoice_cancelled',inv.invoice_no,jsonb_build_object('invoice_id',inv.id));
END $$;

REVOKE ALL ON FUNCTION public.create_sales_invoice_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.post_invoice_to_gl(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.post_payment_to_gl(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sync_invoice_payment() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_order_invoice_balance() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.reverse_invoice_receipt_from_cash() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.guard_invoice_cash_source() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_sales_invoice_atomic(uuid,text,jsonb),public.record_invoice_payment_atomic(uuid,text,jsonb),
  public.post_invoice_to_gl(uuid),public.post_payment_to_gl(uuid),public.cancel_sales_invoice(uuid) TO authenticated;
-- Read-only tables for the browser. All writes above pass module/tenant guards.
REVOKE INSERT,UPDATE,DELETE ON public.sales_invoices,public.sales_invoice_lines,public.invoice_payments FROM authenticated;

$capability_sql$;
  END IF;
END $capability$;

-- Source: 20261010062858_server_receivable_kpi_settlement.sql
DO $capability$
BEGIN
  IF to_regclass('public.receivable_settlements') IS NULL THEN
    EXECUTE $capability_sql$
CREATE TABLE public.receivable_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_type text NOT NULL CHECK (source_type IN ('credit','order','vendor_invoice')),
  source_id uuid NOT NULL,
  credit_id uuid REFERENCES public.credit_contracts(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.vendor_invoices(id) ON DELETE RESTRICT,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  account_id uuid NOT NULL REFERENCES public.cash_accounts(id),
  receipt_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id),
  CHECK (num_nonnulls(credit_id,order_id,invoice_id)=1),
  CHECK ((source_type='credit' AND credit_id=source_id AND order_id IS NULL AND invoice_id IS NULL) OR
    (source_type='order' AND order_id=source_id AND credit_id IS NULL AND invoice_id IS NULL) OR
    (source_type='vendor_invoice' AND invoice_id=source_id AND credit_id IS NULL AND order_id IS NULL))
);
ALTER TABLE public.receivable_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY receivable_settlements_read ON public.receivable_settlements FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id,'finance','view'),false));
REVOKE ALL ON public.receivable_settlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.receivable_settlements TO authenticated;
GRANT ALL ON public.receivable_settlements TO service_role;

CREATE FUNCTION public.settle_receivable_atomic(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  req public.operation_requests%rowtype;
  credit public.credit_contracts%rowtype;
  sale public.orders%rowtype;
  account public.cash_accounts%rowtype;
  v_source_id uuid := (_payload->>'source_id')::uuid;
  kind text := _payload->>'source_type';
  business_date date := (now() AT TIME ZONE 'Asia/Baku')::date;
  value numeric; penalty numeric; receipt uuid; result_payload jsonb; linked_order uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>120 OR v_source_id IS NULL
    OR kind IS NULL OR kind NOT IN ('credit','order','vendor_invoice') THEN RAISE EXCEPTION 'invalid_settlement_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'settle_receivable_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'settle_receivable_atomic' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  -- A different request key cannot collect the same full settlement twice.
  PERFORM pg_advisory_xact_lock(hashtextextended(_tenant_id::text||':settlement:'||kind||':'||v_source_id::text,0));
  IF EXISTS(SELECT 1 FROM public.receivable_settlements WHERE tenant_id=_tenant_id AND source_type=kind AND source_id=v_source_id) THEN
    RAISE EXCEPTION 'receivable_already_settled';
  END IF;
  SELECT * INTO account FROM public.cash_accounts WHERE tenant_id=_tenant_id AND id=(_payload->>'account_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
  PERFORM private.assert_open_accounting_period(_tenant_id,business_date);
  IF kind='vendor_invoice' THEN
    result_payload:=public.pay_vendor_invoice_atomic(_tenant_id,'settle-invoice:'||req.id::text,
      jsonb_build_object('invoice_id',v_source_id,'account_id',account.id,'payment_date',business_date));
    value:=(result_payload->>'amount')::numeric;
    receipt:=(result_payload->>'payment_id')::uuid;
  ELSIF kind='credit' THEN
    SELECT c.order_id INTO linked_order FROM public.credit_contracts c WHERE c.id=v_source_id AND c.tenant_id=_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
    IF linked_order IS NOT NULL THEN
      SELECT * INTO sale FROM public.orders WHERE id=linked_order AND tenant_id=_tenant_id FOR UPDATE;
      IF NOT FOUND OR sale.status='cancelled' THEN RAISE EXCEPTION 'order_not_active'; END IF;
      IF sale.currency<>account.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
    ELSIF account.currency<>'AZN' THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
    SELECT * INTO credit FROM public.credit_contracts WHERE id=v_source_id AND tenant_id=_tenant_id FOR UPDATE;
    IF credit.order_id IS DISTINCT FROM linked_order THEN RAISE EXCEPTION 'credit_order_changed'; END IF;
    IF credit.status NOT IN ('active','overdue') THEN RAISE EXCEPTION 'credit_not_active'; END IF;
    SELECT coalesce(sum(principal_due-principal_paid),0),coalesce(sum(penalty_due-penalty_paid),0)
      INTO value,penalty FROM public.credit_installments WHERE tenant_id=_tenant_id AND credit_id=credit.id AND status<>'waived';
    value:=value+penalty;
    IF value<=0 THEN RAISE EXCEPTION 'receivable_already_settled'; END IF;
    receipt:=public.post_credit_payment(_tenant_id,credit.id,'SETTLE-'||req.id::text,value,penalty,account.id,'cash','Debtor full settlement');
    result_payload:=jsonb_build_object('payment_id',receipt,'amount',value,'principal',value-penalty,'penalty',penalty);
  ELSE
    IF NOT coalesce(private.has_module_access(_tenant_id,'sales','edit'),false) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
    SELECT * INTO sale FROM public.orders WHERE id=v_source_id AND tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND OR sale.status='cancelled' THEN RAISE EXCEPTION 'order_not_active'; END IF;
    IF EXISTS(SELECT 1 FROM public.credit_contracts WHERE tenant_id=_tenant_id AND order_id=sale.id AND status<>'cancelled') THEN RAISE EXCEPTION 'settle_linked_credit_instead'; END IF;
    IF sale.currency<>account.currency THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
    value:=round(sale.total-coalesce(sale.paid_amount,0),2);
    IF value<=0 THEN RAISE EXCEPTION 'receivable_already_settled'; END IF;
    receipt:=public.register_order_payment(sale.id,value,account.id);
    result_payload:=jsonb_build_object('transaction_id',receipt,'amount',value);
  END IF;
  INSERT INTO public.receivable_settlements(tenant_id,source_type,source_id,credit_id,order_id,invoice_id,amount,currency,account_id,receipt_id,result,created_by)
    VALUES(_tenant_id,kind,v_source_id,CASE WHEN kind='credit' THEN v_source_id END,
      CASE WHEN kind='order' THEN v_source_id END,CASE WHEN kind='vendor_invoice' THEN v_source_id END,
      value,account.currency,account.id,receipt,result_payload,auth.uid());
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'finance','receivable_settled',kind||':'||v_source_id::text,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.settle_receivable_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_receivable_atomic(uuid,text,jsonb) TO authenticated;

CREATE TABLE public.kpi_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  period date NOT NULL CHECK (extract(day FROM period)=1),
  status text NOT NULL CHECK (status IN ('closed','approved','paid')),
  snapshot jsonb NOT NULL,
  payout_amount numeric(18,2) NOT NULL CHECK (payout_amount>=0),
  closed_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz, paid_at timestamptz,
  closed_by uuid NOT NULL REFERENCES auth.users(id), approved_by uuid REFERENCES auth.users(id),
  expense_id uuid UNIQUE REFERENCES public.expenses(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES public.cash_accounts(id),
  UNIQUE (tenant_id,period),
  CHECK ((status='closed' AND approved_at IS NULL AND paid_at IS NULL) OR
    (status='approved' AND approved_at IS NOT NULL AND paid_at IS NULL) OR
    (status='paid' AND approved_at IS NOT NULL AND paid_at IS NOT NULL AND (payout_amount=0 OR expense_id IS NOT NULL)))
);
ALTER TABLE public.kpi_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY kpi_periods_read ON public.kpi_periods FOR SELECT TO authenticated
  USING (coalesce(private.has_module_access(tenant_id,'kpi','view'),false));
REVOKE ALL ON public.kpi_periods FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.kpi_periods TO authenticated;
GRANT ALL ON public.kpi_periods TO service_role;

-- A frozen paid KPI period cannot silently diverge through generic expense tools.
CREATE FUNCTION private.guard_paid_kpi_expense() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.kpi_periods p WHERE p.tenant_id=OLD.tenant_id AND p.expense_id=OLD.id AND p.status='paid') THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'paid_kpi_expense_is_locked'; END IF;
    IF (NEW.amount,NEW.vat_amount,NEW.account_id,NEW.currency,NEW.status,NEW.expense_date)
      IS DISTINCT FROM (OLD.amount,OLD.vat_amount,OLD.account_id,OLD.currency,OLD.status,OLD.expense_date) THEN
      RAISE EXCEPTION 'paid_kpi_expense_is_locked';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_paid_kpi_expense() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_paid_kpi_expense BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_kpi_expense();
CREATE FUNCTION private.guard_paid_kpi_cash() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE posting public.cash_transactions%rowtype;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.reversal_of IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO posting FROM public.cash_transactions WHERE id=NEW.reversal_of AND tenant_id=NEW.tenant_id;
  ELSE posting:=OLD;
  END IF;
  IF EXISTS(SELECT 1 FROM public.kpi_periods p WHERE p.tenant_id=posting.tenant_id AND p.status='paid'
    AND posting.reference='EXPENSE:'||p.expense_id::text) THEN
    RAISE EXCEPTION 'paid_kpi_cash_is_locked';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_paid_kpi_cash() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_paid_kpi_cash BEFORE INSERT OR UPDATE OR DELETE ON public.cash_transactions
  FOR EACH ROW EXECUTE FUNCTION private.guard_paid_kpi_cash();

CREATE FUNCTION public.run_kpi_period_atomic(_tenant_id uuid,_request_key text,_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.operation_requests%rowtype; period_row public.kpi_periods%rowtype;
  business_period date := ((_payload->>'period')||'-01')::date;
  action_name text := _payload->>'action'; snap jsonb := _payload->'snapshot';
  value numeric; employee jsonb; employee_amount numeric; employee_ids text[] := '{}'; result_payload jsonb;
  expense_result jsonb; account public.cash_accounts%rowtype;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'kpi','edit'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  IF nullif(trim(_request_key),'') IS NULL OR length(_request_key)>120 OR action_name IS NULL
    OR action_name NOT IN ('close','approve','payout') OR (_payload->>'period') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR business_period IS NULL OR business_period>date_trunc('month',now() AT TIME ZONE 'Asia/Baku')::date THEN RAISE EXCEPTION 'invalid_kpi_request'; END IF;
  INSERT INTO public.operation_requests(tenant_id,request_key,operation,request_hash)
    VALUES(_tenant_id,_request_key,'run_kpi_period_atomic',md5(_payload::text)) ON CONFLICT(tenant_id,request_key) DO NOTHING;
  SELECT * INTO req FROM public.operation_requests WHERE tenant_id=_tenant_id AND request_key=_request_key FOR UPDATE;
  IF req.operation<>'run_kpi_period_atomic' OR req.request_hash<>md5(_payload::text) THEN RAISE EXCEPTION 'idempotency_key_payload_mismatch'; END IF;
  IF req.status='completed' THEN RETURN req.result; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_tenant_id::text||':kpi:'||business_period::text,0));
  SELECT * INTO period_row FROM public.kpi_periods WHERE tenant_id=_tenant_id AND period=business_period FOR UPDATE;
  IF action_name='close' THEN
    IF FOUND THEN RAISE EXCEPTION 'kpi_period_already_closed'; END IF;
    IF jsonb_typeof(snap->'payoutRows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_kpi_snapshot'; END IF;
    value:=0;
    FOR employee IN SELECT * FROM jsonb_array_elements(snap->'payoutRows') LOOP
      IF nullif(employee->>'employeeId','') IS NULL OR employee->>'employeeId'=ANY(employee_ids)
        OR NOT EXISTS(SELECT 1 FROM public.tenant_collection_records WHERE tenant_id=_tenant_id AND collection='employees'
          AND (record_key=employee->>'employeeId' OR data->>'id'=employee->>'employeeId')) THEN RAISE EXCEPTION 'invalid_kpi_employee_scope'; END IF;
      employee_ids:=array_append(employee_ids,employee->>'employeeId');
      employee_amount:=(employee->>'payoutAmount')::numeric;
      IF employee_amount IS NULL OR employee_amount<0 OR employee_amount<>round(employee_amount,2)
        OR employee_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'invalid_kpi_amount'; END IF;
      value:=value+employee_amount;
    END LOOP;
    IF (snap->>'payoutAmount')::numeric IS DISTINCT FROM value THEN RAISE EXCEPTION 'kpi_total_mismatch'; END IF;
    INSERT INTO public.kpi_periods(tenant_id,period,status,snapshot,payout_amount,closed_by)
      VALUES(_tenant_id,business_period,'closed',snap,value,auth.uid()) RETURNING * INTO period_row;
  ELSIF action_name='approve' THEN
    IF period_row.id IS NULL OR period_row.status<>'closed' THEN RAISE EXCEPTION 'kpi_period_not_closed'; END IF;
    UPDATE public.kpi_periods SET status='approved',approved_at=now(),approved_by=auth.uid()
      WHERE id=period_row.id RETURNING * INTO period_row;
  ELSE
    IF period_row.id IS NULL OR period_row.status<>'approved' THEN RAISE EXCEPTION 'kpi_period_not_approved'; END IF;
    IF NOT coalesce(private.has_module_access(_tenant_id,'finance','edit'),false) THEN RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501'; END IF;
    IF period_row.payout_amount>0 THEN
      SELECT * INTO account FROM public.cash_accounts WHERE tenant_id=_tenant_id AND id=(_payload->>'account_id')::uuid AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'account_not_found'; END IF;
      IF account.currency<>'AZN' THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
      expense_result:=public.create_cash_expense_atomic(_tenant_id,'kpi-expense:'||period_row.id::text,
        jsonb_build_object('account_id',account.id,'amount',period_row.payout_amount,'currency','AZN',
          'expense_date',(now() AT TIME ZONE 'Asia/Baku')::date,'category','KPI/Bonus payout','description','KPI payout - '||(_payload->>'period')));
      UPDATE public.expenses SET status='approved' WHERE id=(expense_result->>'expense_id')::uuid AND tenant_id=_tenant_id;
    END IF;
    UPDATE public.kpi_periods SET status='paid',paid_at=now(),expense_id=(expense_result->>'expense_id')::uuid,account_id=account.id
      WHERE id=period_row.id RETURNING * INTO period_row;
  END IF;
  result_payload:=to_jsonb(period_row);
  INSERT INTO public.audit_events(id,tenant_id,actor_id,module,action,detail,payload)
    VALUES(gen_random_uuid()::text,_tenant_id,auth.uid(),'kpi','period_'||action_name,business_period::text,result_payload);
  UPDATE public.operation_requests SET status='completed',result=result_payload,completed_at=now() WHERE id=req.id;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.run_kpi_period_atomic(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.run_kpi_period_atomic(uuid,text,jsonb) TO authenticated;

CREATE FUNCTION public.receivable_ledger_snapshot(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(private.has_module_access(_tenant_id,'finance','view'),false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  WITH credit_debt AS (
    SELECT c.id,c.contract_no,c.order_id,c.status,coalesce(o.currency,'AZN') currency,u.name party,
      CASE WHEN c.status='draft' THEN c.principal-c.initial_payment ELSE
        coalesce(sum(i.principal_due-i.principal_paid+i.penalty_due-i.penalty_paid) FILTER (WHERE i.status<>'waived'),0) END amount,
      min(i.due_date) FILTER (WHERE i.status<>'waived' AND i.principal_due+i.penalty_due>i.principal_paid+i.penalty_paid) due_date
    FROM public.credit_contracts c
      JOIN public.customers u ON u.id=c.customer_id AND u.tenant_id=c.tenant_id
      LEFT JOIN public.orders o ON o.id=c.order_id AND o.tenant_id=c.tenant_id
      LEFT JOIN public.credit_installments i ON i.credit_id=c.id AND i.tenant_id=c.tenant_id
    WHERE c.tenant_id=_tenant_id AND c.status IN ('draft','active','overdue') AND (o.id IS NULL OR o.status<>'cancelled')
    GROUP BY c.id,c.contract_no,c.order_id,c.status,c.principal,c.initial_payment,o.currency,u.name
  ), items AS (
    SELECT jsonb_build_object('source_type','credit','source_id',id,'source',contract_no,'order_id',order_id,
      'type','Debitor','party',party,'amount',amount,'currency',currency,'due_date',due_date,'can_settle',status<>'draft','status',status) item
      FROM credit_debt WHERE amount>0
    UNION ALL
    SELECT jsonb_build_object('source_type','order','source_id',o.id,'source',o.order_no,'order_id',o.id,
      'type','Debitor','party',u.name,'amount',o.total-coalesce(o.paid_amount,0),'currency',o.currency,
      'due_date',o.order_date,'can_settle',true,'status',o.status)
      FROM public.orders o JOIN public.customers u ON u.id=o.customer_id AND u.tenant_id=o.tenant_id
      WHERE o.tenant_id=_tenant_id AND o.status<>'cancelled' AND o.total>coalesce(o.paid_amount,0)
        AND NOT EXISTS(SELECT 1 FROM public.credit_contracts c WHERE c.order_id=o.id AND c.tenant_id=o.tenant_id AND c.status<>'cancelled')
    UNION ALL
    SELECT jsonb_build_object('source_type','vendor_invoice','source_id',v.id,'source',v.invoice_number,
      'type','Kreditor','party',u.name,'amount',round(sum(l.qty_invoiced*l.unit_price*(1+l.tax_rate/100)),2),
      'currency',v.currency,'due_date',coalesce(v.due_date,v.invoice_date),'can_settle',v.status IN ('matched','approved'),'status',v.status)
      FROM public.vendor_invoices v JOIN public.vendors u ON u.id=v.vendor_id AND u.tenant_id=v.tenant_id
      JOIN public.vendor_invoice_lines l ON l.invoice_id=v.id
      JOIN public.purchase_orders p ON p.id=v.po_id AND p.tenant_id=v.tenant_id
      WHERE v.tenant_id=_tenant_id AND v.status NOT IN ('paid','cancelled') AND p.status::text<>'cancelled'
      GROUP BY v.id,v.invoice_number,v.currency,v.due_date,v.invoice_date,v.status,u.name
  ) SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(item ORDER BY item->>'source') FROM items),'[]'::jsonb),
    'settlements',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC) FROM public.receivable_settlements s
      WHERE s.tenant_id=_tenant_id),'[]'::jsonb),
    'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'currency',a.currency) ORDER BY a.created_at,a.id)
      FROM public.cash_accounts a WHERE a.tenant_id=_tenant_id AND a.is_active),'[]'::jsonb)
  ) INTO result_payload;
  RETURN result_payload;
END $$;
REVOKE ALL ON FUNCTION public.receivable_ledger_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receivable_ledger_snapshot(uuid) TO authenticated;

$capability_sql$;
  END IF;
END $capability$;

DO $verify$
DECLARE name text; signature text;
BEGIN
  FOREACH name IN ARRAY ARRAY['tenant_collection_records','vendor_invoice_payments','production_batches',
    'production_batch_materials','receivable_settlements','kpi_periods'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=name AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'ERP_RELEASE_TABLE_OR_RLS_MISSING: %',name;
    END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'public.pay_vendor_invoice_atomic(uuid,text,jsonb)',
    'public.post_material_production(uuid,text,jsonb)',
    'public.import_warehouse_stock_atomic(uuid,text,jsonb)',
    'public.create_sales_invoice_atomic(uuid,text,jsonb)',
    'public.settle_receivable_atomic(uuid,text,jsonb)',
    'public.run_kpi_period_atomic(uuid,text,jsonb)',
    'public.receivable_ledger_snapshot(uuid)'] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'ERP_RELEASE_RPC_MISSING: %',signature;
    END IF;
    IF has_function_privilege('anon',signature,'EXECUTE')
      OR NOT has_function_privilege('authenticated',signature,'EXECUTE') THEN
      RAISE EXCEPTION 'ERP_RELEASE_RPC_ACL_INVALID: %',signature;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.tenant_collection_records'::regclass
    AND tgname='viewer_write_boundary' AND tgenabled='O') THEN
    RAISE EXCEPTION 'ERP_RELEASE_VIEWER_BOUNDARY_MISSING';
  END IF;
END $verify$;
NOTIFY pgrst,'reload schema';
