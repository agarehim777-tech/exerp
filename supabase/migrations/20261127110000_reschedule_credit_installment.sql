-- Changing a credit payment date is saved on the server.
--
-- The credit card let users edit an installment's due date, but the change only went into the browser's
-- old credits list (finance_credit_records). Credits come from credit_contracts / credit_installments, whose
-- dates always won on the next read, so the edit was silently lost. This command moves one open installment
-- of an active credit to a new date, keeping the schedule in order (strictly between its neighbours).

CREATE OR REPLACE FUNCTION public.reschedule_credit_installment(
  _tenant_id uuid, _credit_id uuid, _installment_no integer, _due_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_contract public.credit_contracts%rowtype;
  v_installment public.credit_installments%rowtype;
  v_previous date;
  v_next date;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_module_access(_tenant_id, 'credits', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF _due_date IS NULL THEN RAISE EXCEPTION 'credit_due_date_required'; END IF;

  SELECT * INTO v_contract FROM public.credit_contracts
    WHERE id = _credit_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF v_contract.status::text NOT IN ('active', 'overdue') THEN RAISE EXCEPTION 'credit_not_active'; END IF;

  SELECT * INTO v_installment FROM public.credit_installments
    WHERE tenant_id = _tenant_id AND credit_id = _credit_id AND installment_no = _installment_no FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'credit_installment_not_found'; END IF;
  IF v_installment.status IN ('paid', 'waived') THEN RAISE EXCEPTION 'credit_installment_closed'; END IF;

  SELECT max(due_date) INTO v_previous FROM public.credit_installments
    WHERE tenant_id = _tenant_id AND credit_id = _credit_id AND installment_no < _installment_no;
  SELECT min(due_date) INTO v_next FROM public.credit_installments
    WHERE tenant_id = _tenant_id AND credit_id = _credit_id AND installment_no > _installment_no;
  IF (v_previous IS NOT NULL AND _due_date <= v_previous) OR (v_next IS NOT NULL AND _due_date >= v_next) THEN
    RAISE EXCEPTION 'credit_due_date_out_of_order';
  END IF;

  UPDATE public.credit_installments
    SET due_date = _due_date,
        status = CASE WHEN status = 'overdue' AND _due_date >= current_date
          THEN CASE WHEN principal_paid > 0 THEN 'partial' ELSE 'pending' END
          ELSE status END
    WHERE id = v_installment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_credit_installment(uuid, uuid, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_credit_installment(uuid, uuid, integer, date) TO authenticated, service_role;
