# cashbook_ledger_summary rollout (2026-11-10)

Migration: `supabase/migrations/20261110090000_cashbook_ledger_summary_definer.sql`

## Why

`cashbook_ledger_summary` was `SECURITY INVOKER`. The "tenant cash transactions" RLS policy calls
`public.is_tenant_member` -> `private.is_tenant_member` for every row. Both are `SECURITY DEFINER`
with their own `search_path`, so Postgres cannot inline them: each cash entry costs two function
calls and a `tenant_members` lookup. On the shared CI tenant this pushed the summary past the
statement timeout (57014), which failed unrelated business flows on the dashboard, sales orders,
sales invoices and cashbook pages.

The function now runs as `SECURITY DEFINER` and checks access itself before reading:
`auth.uid()` must be set and `private.has_module_access(_tenant_id, 'finance', 'view')` must hold
(tenant membership plus a role with finance view). It only returns per-account and per-currency
totals for that tenant. Totals are unchanged (covered by `src/test/cashbook-ledger-sql.test.js`).

The migration also adds three indexes. They are built without `CONCURRENTLY` (migrations run in a
transaction), so writes to `cash_transactions` and `expenses` wait while they build.

## Staging: measure before and after

Run in the Supabase SQL Editor. Replace `<tenant-id>` with the audit tenant and `<user-id>` with a
member of it that has finance access. The `set_config` lines make `auth.uid()` resolve inside this
session only; nothing is written.

```sql
-- 1. Size of the ledger being summarised
SELECT count(*) AS cash_rows FROM public.cash_transactions WHERE tenant_id = '<tenant-id>';

-- 2. Timing (run once before applying the migration, once after)
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<user-id>', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '<user-id>', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT public.cashbook_ledger_summary('<tenant-id>');
ROLLBACK;
```

## Staging: check the totals did not change

Before applying the migration, save the current result:

```sql
BEGIN;
SELECT set_config('request.jwt.claim.sub', '<user-id>', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', '<user-id>', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.cashbook_ledger_summary('<tenant-id>');
ROLLBACK;
```

Apply the migration, run the same query again and compare the two JSON results. They must be
identical.

## Rollback

Re-run `supabase/migrations/20261008130228_hash_cashbook_reversal_lookup.sql`. It restores the
previous `SECURITY INVOKER` function. The new indexes are harmless and can stay.
