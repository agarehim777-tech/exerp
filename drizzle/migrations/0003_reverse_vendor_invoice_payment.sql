CREATE OR REPLACE FUNCTION public.reverse_vendor_invoice_payment(_payment uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  payment public.vendor_invoice_payments%rowtype;
  inv public.vendor_invoices%rowtype;
  cash_tx public.cash_transactions%rowtype;
  original_entry public.journal_entries%rowtype;
  reversal_cash uuid;
  reversal_journal uuid;
  existing_cash uuid;
  existing_journal uuid;
BEGIN
  SELECT * INTO payment FROM public.vendor_invoice_payments WHERE id = _payment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  IF auth.uid() IS NOT NULL
     AND NOT coalesce(private.has_module_access(payment.tenant_id, 'finance', 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  SELECT * INTO inv FROM public.vendor_invoices WHERE id = payment.invoice_id AND tenant_id = payment.tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  SELECT * INTO cash_tx FROM public.cash_transactions WHERE id = payment.cash_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cash_transaction_not_found'; END IF;

  SELECT id INTO existing_cash FROM public.cash_transactions WHERE reversal_of = cash_tx.id LIMIT 1;
  IF existing_cash IS NULL THEN
    INSERT INTO public.cash_transactions(
      tenant_id, account_id, direction, amount, currency, category,
      counterparty, customer_id, vendor_id, reference_type, reference_id,
      reference, description, occurred_at, created_by, reversal_of
    ) VALUES (
      cash_tx.tenant_id, cash_tx.account_id, 'in', cash_tx.amount, cash_tx.currency,
      'transaction_reversal', cash_tx.counterparty, cash_tx.customer_id, cash_tx.vendor_id,
      'vendor_invoice_cancellation', inv.id, inv.invoice_number,
      'Ləğv: ' || cash_tx.transaction_no || ' · ' || trim(_reason),
      now(), coalesce(auth.uid(), cash_tx.created_by), cash_tx.id
    ) RETURNING id INTO reversal_cash;
  ELSE
    reversal_cash := existing_cash;
  END IF;

  IF payment.journal_entry_id IS NOT NULL THEN
    SELECT * INTO original_entry FROM public.journal_entries WHERE id = payment.journal_entry_id;
    IF original_entry.id IS NOT NULL THEN
      SELECT id INTO existing_journal FROM public.journal_entries
       WHERE source_type = 'journal_reversal' AND source_id = payment.journal_entry_id LIMIT 1;
      IF existing_journal IS NULL THEN
        INSERT INTO public.journal_entries(tenant_id, entry_date, reference, description, source_type, source_id, created_by)
        VALUES (
          payment.tenant_id, current_date,
          coalesce(original_entry.reference, payment.journal_entry_id::text) || '-R',
          'Əks yazılış: ' || trim(_reason), 'journal_reversal', payment.journal_entry_id, auth.uid()
        ) RETURNING id INTO reversal_journal;
        INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no)
        SELECT reversal_journal, account_id, credit, debit, 'Əks: ' || coalesce(memo, ''), line_no
          FROM public.journal_lines WHERE entry_id = payment.journal_entry_id ORDER BY line_no;
        UPDATE public.journal_entries SET posted = true WHERE id = reversal_journal;
      ELSE
        reversal_journal := existing_journal;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.vendor_invoice_payments WHERE id = payment.id;

  UPDATE public.vendor_invoices SET status = 'matched', updated_at = now() WHERE id = inv.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, payment.tenant_id, auth.uid(), 'procurement',
    'invoice_payment_reversed', inv.invoice_number || ' ödənişi əks yazılışla ləğv edildi',
    jsonb_build_object(
      'payment_id', payment.id, 'invoice_id', inv.id, 'amount', payment.amount,
      'reason', trim(_reason), 'cash_reversal', reversal_cash,
      'journal_reversal', reversal_journal
    )
  );

  RETURN jsonb_build_object(
    'invoice_id', inv.id, 'invoice_status', 'matched', 'amount', payment.amount,
    'cash_reversal', reversal_cash, 'journal_reversal', reversal_journal
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_vendor_invoice_payment(uuid, text) TO authenticated, service_role;