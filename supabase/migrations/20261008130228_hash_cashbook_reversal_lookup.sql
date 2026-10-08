-- Resolve reversal references once per tenant rather than once per cash entry.
CREATE OR REPLACE FUNCTION public.cashbook_ledger_summary(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(private.has_module_access(_tenant_id, 'finance', 'view'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  WITH scoped_ledger AS MATERIALIZED (
    SELECT t.id,t.account_id,t.direction,t.amount,t.category,t.reversal_of,t.description
    FROM public.cash_transactions t WHERE t.tenant_id = _tenant_id
  ), reversed AS MATERIALIZED (
    SELECT reversal_of::text AS id FROM scoped_ledger WHERE reversal_of IS NOT NULL
    UNION
    SELECT marker[1] FROM scoped_ledger
    CROSS JOIN LATERAL pg_catalog.regexp_matches(description,
      'REVERSAL_OF:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') AS marker
    WHERE category = 'transaction_reversal'
  ), ledger AS MATERIALIZED (
    SELECT t.*, (t.reversal_of IS NULL AND t.category <> 'transaction_reversal'
      AND t.category <> 'internal_transfer' AND r.id IS NULL) AS external_entry
    FROM scoped_ledger t LEFT JOIN reversed r ON r.id = t.id::text
  ), accounts AS (
    SELECT a.id,a.currency,
      coalesce(a.opening_balance,0) + coalesce(sum(CASE WHEN t.direction::text = 'in' THEN t.amount ELSE -t.amount END),0) AS balance,
      coalesce(sum(t.amount) FILTER (WHERE t.external_entry AND t.direction::text = 'in'),0) AS inflow,
      coalesce(sum(t.amount) FILTER (WHERE t.external_entry AND t.direction::text = 'out'),0) AS outflow
    FROM public.cash_accounts a LEFT JOIN ledger t ON t.account_id = a.id
    WHERE a.tenant_id = _tenant_id GROUP BY a.id,a.currency,a.opening_balance
  ), currencies AS (
    SELECT currency,sum(balance) AS balance,sum(inflow) AS inflow,sum(outflow) AS outflow
    FROM accounts GROUP BY currency
  ), expense_totals AS (
    SELECT e.currency,count(*) FILTER (WHERE e.status IN ('draft','pending')) AS pending,
      coalesce(sum(e.amount) FILTER (WHERE e.status = 'refund_pending'),0) AS refund_pending
    FROM public.expenses e WHERE e.tenant_id = _tenant_id GROUP BY e.currency
  ) SELECT jsonb_build_object(
    'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM accounts a),'[]'::jsonb),
    'currencies',coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object(
      'pending',coalesce(e.pending,0),'refundPending',coalesce(e.refund_pending,0)) ORDER BY c.currency)
      FROM currencies c LEFT JOIN expense_totals e ON e.currency = c.currency),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cashbook_ledger_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashbook_ledger_summary(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
