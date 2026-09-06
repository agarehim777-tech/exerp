-- Production security/performance hardening.

DO $$
DECLARE
  fn record;
  keep_authenticated boolean;
BEGIN
  FOR fn IN
    SELECT p.oid, p.oid::regprocedure AS signature, p.prorettype = 'trigger'::regtype AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    keep_authenticated := has_function_privilege('authenticated', fn.oid, 'EXECUTE') AND NOT fn.is_trigger;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.signature);
    IF keep_authenticated THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.backfill_sales_bonus_for_order(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  inserted_count integer := 0;
  target_tenant uuid;
BEGIN
  SELECT tenant_id INTO target_tenant FROM public.orders WHERE id = _order_id;
  IF target_tenant IS NULL OR NOT private.has_module_access(target_tenant, 'sales', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  INSERT INTO public.sales_bonus_entries(
    tenant_id, order_id, assignment_id, cash_transaction_id, seller_name, rate,
    payment_amount, bonus_amount, accrued_on, created_by
  )
  SELECT o.tenant_id, o.id, a.id, ct.id, a.seller_name, a.rate,
         ct.amount, round(ct.amount * a.rate / 100, 2), ct.occurred_at::date, auth.uid()
    FROM public.orders o
    JOIN public.cash_transactions ct
      ON ct.tenant_id = o.tenant_id AND ct.reference = o.order_no
     AND ct.direction = 'in'
     AND ct.category IN ('sales_payment', 'credit_payment', 'receivable_payment')
    JOIN public.order_bonus_assignments a
      ON a.tenant_id = o.tenant_id AND a.order_id = o.id
     AND a.effective_from <= ct.occurred_at::date
     AND (a.effective_to IS NULL OR a.effective_to >= ct.occurred_at::date)
   WHERE o.id = _order_id
  ON CONFLICT (cash_transaction_id, assignment_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.backfill_sales_bonus_for_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_sales_bonus_for_order(uuid) TO authenticated;

DO $$
DECLARE
  fk record;
  index_name text;
BEGIN
  FOR fk IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name,
           string_agg(quote_ident(a.attname), ', ' ORDER BY keys.ordinality) AS columns_sql
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = keys.attnum
    WHERE con.contype = 'f' AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = con.conrelid AND i.indisvalid
          AND (
            SELECT array_agg(indexed.attnum ORDER BY indexed.ordinality)
            FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS indexed(attnum, ordinality)
            WHERE indexed.ordinality <= cardinality(con.conkey)
          ) = con.conkey
      )
    GROUP BY n.nspname, c.relname, con.conname
  LOOP
    index_name := 'idx_fk_' || substr(md5(fk.schema_name || '.' || fk.table_name || '.' || fk.constraint_name), 1, 20);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)', index_name, fk.schema_name, fk.table_name, fk.columns_sql);
  END LOOP;
END $$;

DO $$
DECLARE
  pol record;
  next_qual text;
  next_check text;
  statement text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') LIKE '%auth.uid()%' OR coalesce(with_check, '') LIKE '%auth.uid()%')
  LOOP
    next_qual := CASE WHEN pol.qual IS NULL THEN NULL ELSE replace(pol.qual, 'auth.uid()', '(select auth.uid())') END;
    next_check := CASE WHEN pol.with_check IS NULL THEN NULL ELSE replace(pol.with_check, 'auth.uid()', '(select auth.uid())') END;
    statement := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF next_qual IS NOT NULL THEN statement := statement || format(' USING (%s)', next_qual); END IF;
    IF next_check IS NOT NULL THEN statement := statement || format(' WITH CHECK (%s)', next_check); END IF;
    EXECUTE statement;
  END LOOP;
END $$;

-- Drop only byte-for-byte duplicates; non-identical permissive policies remain.
DO $$
DECLARE
  duplicate record;
  policy_to_drop text;
BEGIN
  FOR duplicate IN
    SELECT schemaname, tablename, cmd, roles::text, coalesce(qual, '') AS qual,
           coalesce(with_check, '') AS with_check, array_agg(policyname ORDER BY policyname) AS policies
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY schemaname, tablename, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, '')
    HAVING count(*) > 1
  LOOP
    FOREACH policy_to_drop IN ARRAY duplicate.policies[2:cardinality(duplicate.policies)]
    LOOP
      EXECUTE format('DROP POLICY %I ON %I.%I', policy_to_drop, duplicate.schemaname, duplicate.tablename);
    END LOOP;
  END LOOP;
END $$;
