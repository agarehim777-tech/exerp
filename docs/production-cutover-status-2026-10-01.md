# Production Cutover Status

Production project: `tcqdhwtnjrwpfdxoijmv`. Staging: `cvjctwgdyzhijhzhhjqd`.

## Verified

- Production initially had 74 migration history entries, latest `20260909121437`, and five orders.
- Production initially lacked `create_sales_order_complete`, `reverse_sales_order_v3`, and `process_sales_order_status`. The complete-sale command is now installed; the other two remain missing.
- Migration `20261001060540` preserved complete legacy snapshot rows in `private.legacy_snapshot_archive` without changing their source.
- Production has two source snapshots and two exact archive copies; staging has one source snapshot and one exact archive copy. Missing archive copies: zero.
- `authenticated` cannot SELECT the archive. RLS is enabled.
- The archive is an in-database preservation copy, not an independent disaster-recovery backup.
- The preservation regression test passed, including repeated migration and changed snapshot versions.

## Finance Migration Update

- Applied reviewed migrations `20260929115836` (expense ledger columns) and `20260922070837` (server cashbook commands) in production. At application time expenses had zero rows and all cash accounts were AZN; no legacy expense currency was inferred.
- Existing permission and accounting-period guards were confirmed before application.
- An authenticated, rollback-only production smoke test passed: create expense, replay identical request, transfer between two temporary accounts, refund expense twice, and verify source ledger balance of 90 from opening 100 after a net transfer of 10. All temporary business records were rolled back.
- Security advisors reported zero ERROR findings. Existing SECURITY DEFINER execute and leaked-password-protection warnings remain.
- Advisor guidance: [review intentional authenticated SECURITY DEFINER execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [enable leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- This is a partial backend rollout, not completed application deployment or completed schema reconciliation.

## Release Blockers

- CI run `36823926527` passed release gates, all 28 browser/tenant tests, both sales/expense lifecycle tests, and both real concurrent-request lifecycle tests. The optional AI chat test was skipped, not verified.
- That run timed out in the legacy 21-flow audit: every scenario waited for obsolete `.nav-item` navigation after login. The runner now reports Supabase incompatibility before launching a browser, preserving all selected scenario failures without weakening the release gate.
- CI run `36827206839` on `1760077c340afee826af7d5911e47ab3146e14cb` passed release gates, all browser/tenant tests, sales/expense tests, concurrent tests, and the new credit deposit lifecycle. It failed the legacy audit preflight explicitly rather than timing out. Deploy remains blocked; the 21 scenarios are not completed.
- The 21 legacy business scenarios still require migration to Supabase-backed assertions. The runner now fails closed and preserves evidence; this does not establish business-flow coverage.
- Production schema/data reconciliation and canonical RPC migration remain pending. Do not replay all historical migrations blindly or mark unapplied history as applied.
- Production application deployment has not occurred. Backend migration subsets listed here have been applied; this is not full cutover.

## Credit Deposit Correction

- Applied reviewed migrations `20260929115603` (main cash account helper) and `20260929115729` (complete-sale request idempotency) in production. Authenticated rollback smoke verified a cash sale with payment 25 and an identical retry: one order, one cash payment.
- A staging rollback test then reproduced a credit sale deposit posted twice: requested 200, order paid amount 400. Credit creation's initial-payment trigger and the complete-sale command both collected the same money.
- Migration `20261001064737` creates an unpaid credit draft with the original deposit target, then collects through `post_credit_initial_payment` using the explicitly selected account. Inconsistent credit/sale deposit inputs are rejected; payment failure rolls back the sale and request record.
- Applied this correction in staging and production. Both authenticated rollback tests verified requested deposit 200, exactly one cash payment to the selected account, unchanged retry result, target 2000, and later collection of the remaining 1800. Temporary business records were rolled back.
- Staging additionally verified activation is rejected before the remaining deposit is collected, then succeeds with 12 installments totaling 18000 on principal 20000. Cancellation closed the linked credit and restored the selected cash account's net ledger to zero.
- Migration `20261001065418` restored the missing production activation RPC and updated staging. It validates tenant/module access, linked-order status and recorded deposit, exact deposit completion, positive financed balance and term, and open accounting period. Same-date activation replay returns without replacing an existing valid schedule.
- An authenticated rollback-only production test verified incomplete-deposit rejection, collection of the remaining 1800, activation, same-date activation retry, and 12 installments totaling 18000. Production cancellation is still pending because its canonical reversal RPC is missing.
- PGlite regressions passed with and without the legacy collection trigger, including explicit-account collection, replay, mismatched input rejection, failed-payment rollback, activation shortfall/order mismatch, unchanged schedule IDs on replay, cancelled-order denial, and foreign-tenant denial.
