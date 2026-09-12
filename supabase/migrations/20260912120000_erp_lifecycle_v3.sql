-- ERP lifecycle v3: strict schema capabilities, idempotent cancellation and read-only reconciliation.

CREATE TABLE IF NOT EXISTS public.erp_reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  critical_count integer NOT NULL DEFAULT 0 CHECK (critical_count >= 0),
  report jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_reconciliation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_reconciliation_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.erp_reconciliation_reports TO authenticated;
GRANT ALL ON public.erp_reconciliation_reports TO service_role;

DROP POLICY IF EXISTS erp_reconciliation_reports_read ON public.erp_reconciliation_reports;
CREATE POLICY erp_reconciliation_reports_read ON public.erp_reconciliation_reports
FOR SELECT TO authenticated
USING (private.is_tenant_member(tenant_id, (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.erp_runtime_capabilities()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'schema_version', 3,
    'sales_create', 'create_sales_order_complete',
    'sales_reverse', 'reverse_sales_order_v3',
    'reconciliation', 'preview_and_approved_repair',
    'server_time', now()
  );
$$;

REVOKE ALL ON FUNCTION public.erp_runtime_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_runtime_capabilities() TO authenticated, service_role;

-- Resolve the cash account inside the same transaction as order, credit and payment creation.
CREATE OR REPLACE FUNCTION public.create_sales_order_complete(
  _tenant_id uuid, _request_key text, _order_no text, _customer_id uuid,
  _order_date date, _currency text, _notes text, _items jsonb,
  _credit jsonb DEFAULT NULL, _bonus_allocations jsonb DEFAULT '[]'::jsonb,
  _initial_payment numeric DEFAULT 0, _account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE result_payload jsonb; created_order_id uuid; payment_id uuid; resolved_account_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN RAISE EXCEPTION 'permission_denied'; END IF;
  IF coalesce(_initial_payment,0) < 0 THEN RAISE EXCEPTION 'İlkin ödəniş mənfi ola bilməz'; END IF;
  IF coalesce(_initial_payment,0) > 0 THEN
    SELECT id INTO resolved_account_id FROM public.cash_accounts
     WHERE id = _account_id AND tenant_id = _tenant_id AND is_active = true;
    IF resolved_account_id IS NULL THEN
      SELECT id INTO resolved_account_id FROM public.cash_accounts
       WHERE tenant_id = _tenant_id AND is_active = true AND currency = coalesce(nullif(_currency,''),'AZN')
       ORDER BY CASE WHEN account_no = 'MAIN-'||upper(left(_tenant_id::text,8)) OR name = 'Əsas kassa' THEN 0 ELSE 1 END, created_at
       LIMIT 1 FOR UPDATE;
    END IF;
    IF resolved_account_id IS NULL THEN RAISE EXCEPTION 'cash_account_not_found'; END IF;
  END IF;

  result_payload := public.create_sales_order_atomic(
    _tenant_id,_request_key,_order_no,_customer_id,_order_date,_currency,_notes,
    coalesce(_items,'[]'::jsonb),_credit
  );
  created_order_id := (result_payload->>'order_id')::uuid;
  IF jsonb_typeof(coalesce(_bonus_allocations,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Bonus bölgüsü massiv olmalıdır'; END IF;
  IF jsonb_array_length(coalesce(_bonus_allocations,'[]'::jsonb)) > 0 THEN
    PERFORM public.set_order_bonus_assignments(created_order_id,coalesce(_order_date,current_date),_bonus_allocations,'Sifariş yaradılarkən təyin edilib');
  END IF;
  IF coalesce(_initial_payment,0) > 0 THEN
    payment_id := public.register_order_payment(created_order_id,round(_initial_payment,2),resolved_account_id);
  END IF;
  RETURN result_payload || jsonb_build_object('initial_payment_id',payment_id,'schema_version',3);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_complete(uuid,text,text,uuid,date,text,text,jsonb,jsonb,jsonb,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_complete(uuid,text,text,uuid,date,text,text,jsonb,jsonb,jsonb,numeric,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.reverse_sales_order_v3_impl(
  _tenant_id uuid,
  _order_id uuid,
  _reason text,
  _request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  FOR invoice_row IN
    SELECT id FROM public.sales_invoices
     WHERE tenant_id = _tenant_id AND order_id = _order_id AND status::text <> 'cancelled'
     FOR UPDATE
  LOOP
    PERFORM public.cancel_sales_invoice(invoice_row.id);
  END LOOP;

  result_payload := public.reverse_sales_order(_order_id, _reason)
    || jsonb_build_object('request_key', trim(_request_key), 'schema_version', 3);

  -- The stock reversal above is authoritative. Post only the missing GL compensation here.
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
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
      (journal_id,revenue_id,target.subtotal,0,'Gəlirin ləğvi',1),
      (journal_id,vat_id,target.vat_total,0,'ƏDV ləğvi',2),
      (journal_id,ar_id,0,target.total-paid_before,'Debitor ləğvi',3),
      (journal_id,advance_id,0,paid_before,'Geri ödəniləcək məbləğ',4);
    IF delivery_cogs > 0 THEN
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,memo,line_no) VALUES
        (journal_id,inventory_id,delivery_cogs,0,'Stok qaytarması',5),
        (journal_id,cogs_id,0,delivery_cogs,'Maya ləğvi',6);
    END IF;
    UPDATE public.journal_entries SET posted = true WHERE id = journal_id;
    INSERT INTO public.order_accounting_events(tenant_id,order_id,event_type,journal_entry_id,amount,cogs,created_by)
    VALUES(_tenant_id,_order_id,'cancellation',journal_id,target.total,delivery_cogs,auth.uid());
    result_payload := result_payload || jsonb_build_object('accounting_reversal', journal_id);
  END IF;
  UPDATE public.operation_requests SET status = 'completed', result = result_payload, completed_at = now()
   WHERE id = request_row.id;
  RETURN result_payload;
END;
$$;

REVOKE ALL ON FUNCTION private.reverse_sales_order_v3_impl(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.reverse_sales_order_v3_impl(uuid, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_sales_order_v3(
  _tenant_id uuid, _order_id uuid, _reason text, _request_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.reverse_sales_order_v3_impl(_tenant_id, _order_id, _reason, _request_key); $$;

REVOKE ALL ON FUNCTION public.reverse_sales_order_v3(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_sales_order_v3(uuid, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.reject_cancelled_order_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE linked_order uuid;
BEGIN
  IF TG_TABLE_NAME = 'credit_contracts' THEN
    linked_order := NEW.order_id;
    IF NEW.status::text IN ('cancelled', 'closed') THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'stock_reservations' THEN
    linked_order := NEW.order_id;
    IF NEW.status::text <> 'active' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'deliveries' THEN
    linked_order := NEW.order_id;
    IF NEW.status::text = 'cancelled' THEN RETURN NEW; END IF;
  ELSIF TG_TABLE_NAME = 'cash_transactions' THEN
    IF NEW.direction::text <> 'in' OR NEW.category::text NOT IN ('sales_payment','credit_initial','credit_payment','receivable_payment') THEN RETURN NEW; END IF;
    IF NEW.reference_type::text = 'sales_order' THEN linked_order := NEW.reference_id; END IF;
  END IF;
  IF linked_order IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders WHERE id = linked_order AND tenant_id = NEW.tenant_id AND status::text = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'ERP_CANCELLED_ORDER_LINK: ləğv edilmiş sifarişə aktiv əməliyyat bağlana bilməz';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_cancelled_order_credit ON public.credit_contracts;
CREATE TRIGGER reject_cancelled_order_credit BEFORE INSERT OR UPDATE ON public.credit_contracts
FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS reject_cancelled_order_reservation ON public.stock_reservations;
CREATE TRIGGER reject_cancelled_order_reservation BEFORE INSERT OR UPDATE ON public.stock_reservations
FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS reject_cancelled_order_delivery ON public.deliveries;
CREATE TRIGGER reject_cancelled_order_delivery BEFORE INSERT OR UPDATE ON public.deliveries
FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();
DROP TRIGGER IF EXISTS reject_cancelled_order_cash ON public.cash_transactions;
CREATE TRIGGER reject_cancelled_order_cash BEFORE INSERT OR UPDATE ON public.cash_transactions
FOR EACH ROW EXECUTE FUNCTION private.reject_cancelled_order_child();

CREATE OR REPLACE FUNCTION public.scan_erp_integrity(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE issues jsonb; issue_count integer; report_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_tenant_member(_tenant_id, auth.uid()) THEN RAISE EXCEPTION 'permission_denied'; END IF;
  SELECT coalesce(jsonb_agg(issue ORDER BY issue->>'order_no', issue->>'type'), '[]'::jsonb)
  INTO issues FROM (
    SELECT jsonb_build_object('type','active_credit_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(c.id)) issue
      FROM public.orders o JOIN public.credit_contracts c ON c.order_id=o.id AND c.tenant_id=o.tenant_id
     WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND c.status::text NOT IN ('cancelled','closed') GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','active_reservation_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(r.id))
      FROM public.orders o JOIN public.stock_reservations r ON r.order_id=o.id AND r.tenant_id=o.tenant_id
     WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND r.status::text='active' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','active_delivery_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(d.id))
      FROM public.orders o JOIN public.deliveries d ON d.order_id=o.id AND d.tenant_id=o.tenant_id
     WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND d.status::text<>'cancelled' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','active_invoice_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(i.id))
      FROM public.orders o JOIN public.sales_invoices i ON i.order_id=o.id AND i.tenant_id=o.tenant_id
     WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' AND i.status::text<>'cancelled' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','unreversed_cash_on_cancelled_order','order_id',o.id,'order_no',o.order_no,'count',count(tx.id))
      FROM public.orders o JOIN public.cash_transactions tx ON tx.tenant_id=o.tenant_id
       AND tx.direction::text='in' AND tx.reversal_of IS NULL
       AND (tx.reference_id=o.id OR tx.reference=o.order_no OR tx.description ILIKE '%'||o.order_no||'%')
       AND NOT EXISTS (SELECT 1 FROM public.cash_transactions reversal WHERE reversal.reversal_of=tx.id)
     WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled' GROUP BY o.id,o.order_no
    UNION ALL
    SELECT jsonb_build_object('type','missing_accounting_reversal','order_id',o.id,'order_no',o.order_no,'count',1)
      FROM public.orders o
     WHERE o.tenant_id=_tenant_id AND o.status::text='cancelled'
       AND EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='delivery')
       AND NOT EXISTS (SELECT 1 FROM public.order_accounting_events e WHERE e.order_id=o.id AND e.event_type='cancellation')
  ) detected;
  issue_count := jsonb_array_length(issues);
  INSERT INTO public.erp_reconciliation_reports(tenant_id,critical_count,report,created_by)
  VALUES(_tenant_id,issue_count,issues,auth.uid()) RETURNING id INTO report_id;
  RETURN jsonb_build_object('report_id',report_id,'critical_count',issue_count,'issues',issues,'repair_applied',false);
END;
$$;

REVOKE ALL ON FUNCTION public.scan_erp_integrity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_erp_integrity(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.repair_erp_integrity_issue(
  _tenant_id uuid, _order_id uuid, _reason text, _request_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT private.reverse_sales_order_v3_impl(_tenant_id,_order_id,'Təsdiqli reconciliation: '||_reason,_request_key); $$;

REVOKE ALL ON FUNCTION public.repair_erp_integrity_issue(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repair_erp_integrity_issue(uuid, uuid, text, text) TO authenticated, service_role;
