ALTER TABLE public.procurement_receipts
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

COMMENT ON COLUMN public.procurement_receipts.reversed_at IS 'Əks yazılışla ləğv edildiyi vaxt; NULL = aktiv qəbul';

CREATE OR REPLACE FUNCTION public.reverse_procurement_receipt(_receipt uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  rec public.procurement_receipts%rowtype;
  original_entry public.journal_entries%rowtype;
  mv public.stock_movements%rowtype;
  reversal_journal uuid;
  reversal_movement uuid;
  existing_journal uuid;
  existing_movement uuid;
  total_qty numeric := 0;
BEGIN
  SELECT * INTO rec FROM public.procurement_receipts WHERE id = _receipt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt_not_found'; END IF;

  IF auth.uid() IS NOT NULL
     AND NOT coalesce(private.has_module_access(rec.tenant_id, 'procurement', 'edit'), false) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF auth.uid() IS NULL
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Ləğv səbəbini daxil edin';
  END IF;

  IF rec.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('receipt_id', rec.id, 'already_reversed', true,
      'quantity', 0, 'cash_reversal', NULL, 'journal_reversal', NULL);
  END IF;

  -- Anbar: qəbul hərəkətinin əksini yaz və qalığı azalt
  FOR mv IN
    SELECT * FROM public.stock_movements
     WHERE reference_type = 'procurement_receipt' AND reference_id = rec.id
       AND reversal_of IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.stock_movements r WHERE r.reversal_of = stock_movements.id)
     ORDER BY created_at
     FOR UPDATE
  LOOP
    INSERT INTO public.stock_movements(
      tenant_id, warehouse_id, product_id, sku, movement_type, quantity,
      unit_cost, reference_type, reference_id, note, created_by, reversal_of, moved_at
    ) VALUES (
      mv.tenant_id, mv.warehouse_id, mv.product_id, mv.sku, 'out',
      -abs(coalesce(mv.quantity, mv.qty, 0)), mv.unit_cost,
      'procurement_receipt_cancellation', rec.id,
      'Ləğv: ' || rec.receipt_no || ' · ' || trim(_reason),
      coalesce(auth.uid(), mv.created_by), mv.id, now()
    ) RETURNING id INTO reversal_movement;

    UPDATE public.stock_balances
       SET on_hand = on_hand - abs(coalesce(mv.quantity, mv.qty, 0)), updated_at = now()
     WHERE tenant_id = mv.tenant_id AND warehouse_id = mv.warehouse_id AND product_id = mv.product_id;

    total_qty := total_qty + abs(coalesce(mv.quantity, mv.qty, 0));
  END LOOP;

  -- Mühasibat: qəbul üzrə bağlanmış jurnalın əks yazılışı
  SELECT * INTO original_entry FROM public.journal_entries
   WHERE source_type = 'procurement_receipt' AND source_id = rec.id
   ORDER BY created_at LIMIT 1;

  IF original_entry.id IS NOT NULL AND original_entry.posted THEN
    SELECT id INTO existing_journal FROM public.journal_entries
     WHERE source_type = 'journal_reversal' AND source_id = original_entry.id LIMIT 1;
    IF existing_journal IS NULL THEN
      INSERT INTO public.journal_entries(tenant_id, entry_date, reference, description, source_type, source_id, created_by)
      VALUES (
        rec.tenant_id, current_date,
        coalesce(original_entry.reference, original_entry.id::text) || '-R',
        'Əks yazılış: ' || trim(_reason), 'journal_reversal', original_entry.id, auth.uid()
      ) RETURNING id INTO reversal_journal;
      INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, memo, line_no)
      SELECT reversal_journal, account_id, credit, debit, 'Əks: ' || coalesce(memo, ''), line_no
        FROM public.journal_lines WHERE entry_id = original_entry.id ORDER BY line_no;
      UPDATE public.journal_entries SET posted = true WHERE id = reversal_journal;
    ELSE
      reversal_journal := existing_journal;
    END IF;
  END IF;

  UPDATE public.procurement_receipts
     SET reversed_at = now(), reversal_reason = trim(_reason)
   WHERE id = rec.id;

  INSERT INTO public.audit_events(id, tenant_id, actor_id, module, action, detail, payload)
  VALUES (
    gen_random_uuid()::text, rec.tenant_id, auth.uid(), 'procurement',
    'receipt_reversed', rec.receipt_no || ' anbar qəbulu əks yazılışla ləğv edildi',
    jsonb_build_object('receipt_id', rec.id, 'quantity', total_qty,
      'reason', trim(_reason), 'journal_reversal', reversal_journal)
  );

  RETURN jsonb_build_object('receipt_id', rec.id, 'quantity', total_qty,
    'cash_reversal', NULL, 'journal_reversal', reversal_journal);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_procurement_receipt(uuid, text) TO authenticated, service_role;