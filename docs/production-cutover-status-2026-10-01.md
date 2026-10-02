# Production Cutover Status

## October 2 Follow-Up

- CI `36874846338` passed 255 unit tests, release checks, and all 28 browser/tenant tests; expense lifecycle failed because recovery had not restored `accept_expense`/`cancel_expense`. Later lifecycle and 21-flow audit steps were skipped, not passed.
- Migration `20261002052217` restores guarded, row-locked expense acceptance/cancellation. Acceptance reuses the existing ledger entry; repeated acceptance/cancellation cannot duplicate postings. Duplicate legacy postings fail explicitly for reconciliation. No missing account is silently created.
- Authenticated rollback checks passed on staging and production: repeated acceptance creates one outgoing entry, repeated cancellation creates one reversal, and opening 500 is restored after expense 75. No test business records persisted.
- Migration `20261001141748` restores reconciliation report storage, tenant-guarded detection, and admin-only repair of already-cancelled orders. Detection uses exact document or structural links, never description substring matching. Both databases returned zero critical issues without business mutations.
- This does not configure a daily scheduler or complete the 21 legacy UI scenarios. Application deployment remains gated on CI evidence.
- CI `36968985017` passed release gates and 27/28 browser tests, but AI insights navigation was denied because the recovered permissions matrix lacked that module. Migration `20261002053210` adds only missing admin/owner AI permissions without overwriting explicit denials, and restores the expense `note`/`source` columns required by the UI. Lifecycle/audit steps were skipped in this run.
- Fixed audit Fetch error handling so HTTP failures retain their actual status/detail, covered by a regression test. The insights test now awaits the actual enabled action before registering its response timeout.

Production project: `tcqdhwtnjrwpfdxoijmv`. Staging: `cvjctwgdyzhijhzhhjqd`.

## Verified

- Production initially had 74 migration history entries, latest `20260909121437`, and five orders.
- Production initially lacked `create_sales_order_complete`, `reverse_sales_order_v3`, and `process_sales_order_status`. All three are now installed; delivery/reversal verification is detailed below.
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
- An authenticated rollback-only production test verified incomplete-deposit rejection, collection of the remaining 1800, activation, same-date activation retry, and 12 installments totaling 18000. Canonical production cancellation is now installed and tested below.
- PGlite regressions passed with and without the legacy collection trigger, including explicit-account collection, replay, mismatched input rejection, failed-payment rollback, activation shortfall/order mismatch, unchanged schedule IDs on replay, cancelled-order denial, and foreign-tenant denial.

## Delivery And Cancellation Update

- Applied `20261001134507` in staging and production. The status command, legacy handover command, and delivery-card command now share stock valuation and delivery accounting. Cancellation uses one idempotent reversal command.
- Added cost-layer/allocation and order accounting-event tables missing from production. No historical costs were inferred or backfilled.
- A cancelled order cannot regain active credits, reservations, deliveries, invoices, or linked cash receipts. Direct status cancellation is rejected while unreversed dependent operations remain. The incomplete core reversal helper is no longer directly executable by API roles.
- Cash reversal matches structural IDs, or an exact legacy document number only when no structural ID exists. It no longer searches descriptions for a document-number substring.
- Cancelled linked invoices do not reverse a shared delivery journal twice. Delivery journals are reversed from their original lines, not recomputed from later payments.
- Rollback-only authenticated checks passed all six combinations of weighted-average/FIFO and status/legacy/card handover in both databases. Checks covered repeat delivery/reversal, correct card warehouse, stock and FIFO restoration, cancelled credit/reservation/card/invoice, preserved unrelated cash, balanced journals, reactivation denial, and payment denial.
- Production still has five orders and total recorded paid amount 1000 after verification. Detection-only reconciliation found zero active credit/reservation/delivery/invoice or unreversed linked cash issues on its four cancelled orders.
- Added the same six authenticated REST lifecycle scenarios to mandatory CI. SQL rollback checks passing does not substitute for their CI results.

## Staging Restore Incident

- Scheduled restore run `36848962043` dropped staging `public` in an autocommitted statement, then failed restoring the full schema because managed `auth` already existed. Production was unaffected.
- Commit `b40f4e7` removes automatic restore scheduling, rejects both production and CI staging as targets, requires manual confirmation plus a third disposable project, and uses atomic custom-archive restore. Legacy archives without `application.dump` are rejected before mutation.
- Recovered staging application DDL from successful production backup `36829019570`, retaining managed Auth, its existing test account, migration history, and the surviving private snapshot archive. No production business data was imported.
- Restored the two staging tenant IDs, the test user's primary-tenant admin membership (not owner/platform admin), role configuration, archived staging snapshot, and tenant collections table. A clearly identified test customer was seeded for lifecycle prerequisites.
- Recovery restored a production schema baseline, not proof that every historical staging-only migration remains installed. Missing staging-only contracts must still be checked explicitly; preserved history alone is not evidence of their schema presence.
- The third disposable restore target and managed Auth dependencies for application-data restore still require setup/testing. No successful disaster-recovery drill is claimed.

## 21-Scenario Audit Port Status

- Replaced the runner's business-localStorage reader with authenticated Supabase snapshot/collection and canonical-table reads. Financial balances come from the server ledger summary. Canonical empty results replace obsolete snapshot business arrays.
- Replaced positional navigation with explicit route mapping; removed modules such as production/projects/tax fail with `AUDIT_MODULE_UNAVAILABLE` instead of silently visiting the dashboard.
- Preserved all 21 original scenario assertions and the strict all-21 release gate. Existing scenario-specific UI selectors and some legacy field expectations still need adaptation and live verification. This is not a claim that all 21 pass.
- Application deployment remains blocked until that exact commit's complete release gates pass.
