-- Mövcud sifariş və kredit müqaviləsi nömrələrini tenant daxilində qısa,
-- ardıcıl biznes nömrələrinə çevirir. UUID əlaqələri dəyişmir.
DO $$
DECLARE
  tenant_row RECORD;
  item RECORD;
  next_no INTEGER;
  new_no TEXT;
BEGIN
  FOR tenant_row IN SELECT id FROM public.tenants LOOP
    SELECT GREATEST(1000, COALESCE(MAX((regexp_match(order_no, '^SF-([0-9]+)$'))[1]::INTEGER), 1000))
      INTO next_no FROM public.orders WHERE tenant_id = tenant_row.id;
    FOR item IN SELECT id, order_no FROM public.orders
      WHERE tenant_id = tenant_row.id AND order_no !~ '^SF-[0-9]+$'
      ORDER BY created_at, id
    LOOP
      next_no := next_no + 1;
      new_no := 'SF-' || next_no;
      UPDATE public.cash_transactions SET reference = new_no
        WHERE tenant_id = tenant_row.id AND reference = item.order_no;
      UPDATE public.orders SET order_no = new_no WHERE id = item.id;
    END LOOP;

    SELECT GREATEST(1000, COALESCE(MAX((regexp_match(contract_no, '^İN-([0-9]+)$'))[1]::INTEGER), 1000))
      INTO next_no FROM public.credit_contracts WHERE tenant_id = tenant_row.id;
    FOR item IN SELECT id, contract_no FROM public.credit_contracts
      WHERE tenant_id = tenant_row.id AND contract_no !~ '^İN-[0-9]+$'
      ORDER BY created_at, id
    LOOP
      next_no := next_no + 1;
      UPDATE public.credit_contracts SET contract_no = 'İN-' || next_no WHERE id = item.id;
    END LOOP;
  END LOOP;
END $$;
