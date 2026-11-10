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
