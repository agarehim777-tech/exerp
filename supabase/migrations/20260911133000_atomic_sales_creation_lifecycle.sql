-- Keep the complete sales creation lifecycle in one database transaction.
-- Any failure in credit, bonus or initial-payment setup rolls the order back.
CREATE OR REPLACE FUNCTION public.create_sales_order_complete(
  _tenant_id uuid,
  _request_key text,
  _order_no text,
  _customer_id uuid,
  _order_date date,
  _currency text,
  _notes text,
  _items jsonb,
  _credit jsonb DEFAULT NULL,
  _bonus_allocations jsonb DEFAULT '[]'::jsonb,
  _initial_payment numeric DEFAULT 0,
  _account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_payload jsonb;
  created_order_id uuid;
  payment_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT private.has_module_access(_tenant_id, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  IF coalesce(_initial_payment, 0) < 0 THEN
    RAISE EXCEPTION 'İlkin ödəniş mənfi ola bilməz';
  END IF;
  IF coalesce(_initial_payment, 0) > 0 AND _account_id IS NULL THEN
    RAISE EXCEPTION 'İlkin ödəniş üçün kassa hesabı seçilməlidir';
  END IF;

  result_payload := public.create_sales_order_atomic(
    _tenant_id,
    _request_key,
    _order_no,
    _customer_id,
    _order_date,
    _currency,
    _notes,
    coalesce(_items, '[]'::jsonb),
    _credit
  );
  created_order_id := (result_payload->>'order_id')::uuid;

  IF jsonb_typeof(coalesce(_bonus_allocations, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Bonus bölgüsü massiv olmalıdır';
  END IF;
  IF jsonb_array_length(coalesce(_bonus_allocations, '[]'::jsonb)) > 0 THEN
    PERFORM public.set_order_bonus_assignments(
      created_order_id,
      coalesce(_order_date, current_date),
      _bonus_allocations,
      'Sifariş yaradılarkən təyin edilib'
    );
  END IF;

  IF coalesce(_initial_payment, 0) > 0 THEN
    payment_id := public.register_order_payment(
      created_order_id,
      round(_initial_payment, 2),
      _account_id
    );
  END IF;

  RETURN result_payload || jsonb_build_object('initial_payment_id', payment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_sales_order_complete(
  uuid, text, text, uuid, date, text, text, jsonb, jsonb, jsonb, numeric, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_order_complete(
  uuid, text, text, uuid, date, text, text, jsonb, jsonb, jsonb, numeric, uuid
) TO authenticated;

COMMENT ON FUNCTION public.create_sales_order_complete(
  uuid, text, text, uuid, date, text, text, jsonb, jsonb, jsonb, numeric, uuid
) IS 'Atomically creates a sales order with its credit, bonus assignments and initial cash payment.';
