-- cashbook_ledger_summary read the tenant's whole cash history as SECURITY INVOKER, so the
-- "tenant cash transactions" RLS policy ran public.is_tenant_member -> private.is_tenant_member
-- (both SECURITY DEFINER with their own search_path, so never inlined) once per row. On a tenant
-- with tens of thousands of entries that alone took seconds and hit the statement timeout (57014).
--
-- The function now runs as SECURITY DEFINER. Access is still checked explicitly before any read:
-- the caller must be signed in and private.has_module_access(_tenant_id, 'finance', 'view') must
-- hold, which requires membership of that tenant through tenant_members AND a role with finance
-- view permission. Every read below is filtered to _tenant_id, and only per-account and
-- per-currency totals are returned, never individual rows.
--
-- Results are unchanged: the legacy REVERSAL_OF:<uuid> description markers are still honoured,
-- but the regex now only runs on reversal rows whose description contains the marker.

CREATE INDEX IF NOT EXISTS cash_transactions_tenant_account_ledger_idx
  ON public.cash_transactions (tenant_id, account_id)
  INCLUDE (id, direction, amount, category, reversal_of);

CREATE INDEX IF NOT EXISTS cash_transactions_tenant_reversal_of_idx
  ON public.cash_transactions (tenant_id, reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_tenant_currency_status_idx
  ON public.expenses (tenant_id, currency)
  INCLUDE (status, amount);

CREATE OR REPLACE FUNCTION public.cashbook_ledger_summary(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF _tenant_id IS NULL OR auth.uid() IS NULL
     OR NOT COALESCE(private.has_module_access(_tenant_id, 'finance', 'view'), false) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  WITH reversed AS (
    SELECT r.reversal_of AS id
    FROM public.cash_transactions r
    WHERE r.tenant_id = _tenant_id AND r.reversal_of IS NOT NULL
    UNION
    SELECT marker[1]::uuid
    FROM public.cash_transactions r
    CROSS JOIN LATERAL pg_catalog.regexp_matches(r.description,
      'REVERSAL_OF:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g') AS marker
    WHERE r.tenant_id = _tenant_id AND r.category = 'transaction_reversal'
      AND r.description LIKE '%REVERSAL_OF:%'
  ), ledger AS (
    SELECT t.account_id, t.direction, t.amount,
      (t.reversal_of IS NULL AND t.category <> 'transaction_reversal'
        AND t.category <> 'internal_transfer' AND rv.id IS NULL) AS external_entry
    FROM public.cash_transactions t
    LEFT JOIN reversed rv ON rv.id = t.id
    WHERE t.tenant_id = _tenant_id
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
