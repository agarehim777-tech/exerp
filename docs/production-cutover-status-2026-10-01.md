# Production Cutover Status

## October 2 Follow-Up

- CI `37004410670` on `ff335ebe` verified the stock receipt fixture now persists correctly, but only 1/21 legacy audits passed. Ten sale-based scenarios reached a missing freshly-created warehouse option in the global sale form; other blockers include removed vendor/production routes, HR fixture collisions, and obsolete settings/import forms. The cash account existed with opening 250, but the audit incorrectly expected metadata from the balance-only RPC.
- The expense hook now defaults to a server read model: client changes do not upsert or delete expenses. Realtime/wake refresh reads canonical expenses; offline read failures remain retryable. Legacy write behavior requires the explicit existing `VITE_ENABLE_LEGACY_WRITES` flag. Automatic browser-created HR payroll expenses are disabled with that flag off. This does not claim that all legacy payroll/KPI posting commands have been migrated.
- Sale-modal opening refreshes the shared inventory read model so warehouse options do not depend solely on realtime publication. Audit cash metadata is joined by account ID to canonical ledger balances. HR fixtures now use unique employee and department names per run, retaining ID-based manager reassignment.
- Vendor lifecycle audit now uses the current procurement vendor/PO forms and canonical PO tables. It verifies vendor edits, draft and approved PO foreign keys, deactivation preserving PO history, and deletion of an unlinked vendor. This is a port awaiting live CI, not a passing-case claim.
- CI `36973008964` on `5473e4c8` passed the browser/tenant and server lifecycle suites, including all six delivery/reversal cases, but only 2/21 legacy audits passed (help/onboarding and API/webhook). Application deploy was skipped. The successful backup workflow is not a successful application release.
- Fourteen audit scenarios stopped at the common product fixture: application product creation uppercases SKU, whereas the fixture compared a mixed-case UUID SKU literally. The audit now generates uppercase SKU from the outset; it still requires the matching canonical product and stock movement to persist.
- Updated HR hierarchy navigation to expand the actual manager branch before selecting a subordinate. Cash account setup now uses the current inline account form, a unique account name, and a server-ledger opening-balance assertion instead of a removed modal and fixed sleep.
- Operational Health run `36987121607` failed on a nonexistent `cash_transactions.reversed_at` column, not on a completed integrity scan. Verified production exposes `reversal_of` instead. Removed the nonexistent projection and taught the report to recognize the compensating ledger entry by its exact original transaction ID. Three new regressions cover a reversed receipt, an unreversed receipt, and an unrelated reversal; a fresh authenticated operational workflow is still required.
- CI `37002927199` on `acb357f7` confirmed product persistence now passes, but 14 scenarios stopped at stock intake. The stock hook still inserted removed `move_type`/`qty` columns. Manual receipts now call the existing guarded `receive_stock` service, which updates balance, movement, cost layer, and audit atomically. No database migration was needed. Two hook regressions passed, including rejection without a fallback write.
- That CI run passed zero of the 21 legacy audits. It also exposed background expense synchronization violating `expenses_status_check` and persistent HR fixture-name collisions. These remain release blockers; they were not hidden by ignoring browser errors or weakening assertions.
- Final local verification: 279/279 unit tests and production build passed, including receipt and operational-health regressions. Confirmed the receipt RPC exists in production as well as staging. The complete patch still requires a fresh complete CI run. No claim of 21 passing business audits or completed deploy is made.
- CI `36874846338` passed 255 unit tests, release checks, and all 28 browser/tenant tests; expense lifecycle failed because recovery had not restored `accept_expense`/`cancel_expense`. Later lifecycle and 21-flow audit steps were skipped, not passed.
- Migration `20261002052217` restores guarded, row-locked expense acceptance/cancellation. Acceptance reuses the existing ledger entry; repeated acceptance/cancellation cannot duplicate postings. Duplicate legacy postings fail explicitly for reconciliation. No missing account is silently created.
- Authenticated rollback checks passed on staging and production: repeated acceptance creates one outgoing entry, repeated cancellation creates one reversal, and opening 500 is restored after expense 75. No test business records persisted.
- Migration `20261001141748` restores reconciliation report storage, tenant-guarded detection, and admin-only repair of already-cancelled orders. Detection uses exact document or structural links, never description substring matching. Both databases returned zero critical issues without business mutations.
- This does not configure a daily scheduler or complete the 21 legacy UI scenarios. Application deployment remains gated on CI evidence.
- CI `36968985017` passed release gates and 27/28 browser tests, but AI insights navigation was denied because the recovered permissions matrix lacked that module. Migration `20261002053210` adds only missing admin/owner AI permissions without overwriting explicit denials, and restores the expense `note`/`source` columns required by the UI. Lifecycle/audit steps were skipped in this run.
- Fixed audit Fetch error handling so HTTP failures retain their actual status/detail, covered by a regression test. The insights test now awaits the actual enabled action before registering its response timeout.
- Exact commit `44fbb901` in CI `36969470690` passed 256 unit tests, all 28 browser/tenant tests, sales/expense lifecycle, both concurrency tests, credit deposit lifecycle, and all six delivery/reversal REST scenarios. The optional AI chat scenario remains skipped.
- All 21 legacy audit scenarios failed. Most share the obsolete warehouse setup helper: `.page-header .primary-btn` opens the global sale form and `input.nth(3)` is now quantity, not a warehouse manager. Other failures include cashbook/settings/HR selectors and KPI expectations. These are not passing scenarios and the deploy gate remains closed.
- The audit also exposed a real missing `customer_sales_metrics` RPC. Migration `20261002054124` restores only the CRM aggregate, with tenant membership/module authorization and cancelled-order exclusion; no legacy journal functions were overwritten. Production verification returned one active order, sales 20000, paid 1000; staging verified foreign-tenant denial. The metrics patch itself still needs fresh CI.
- Next audit work: replace warehouse/customer fixture setup and positional form selectors, then adapt each scenario's current module contract. Production/project/tax routes are absent and must not be silently substituted or counted as passing.

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
# Expense follow-up, 2026-10-02

- Remaining UI audit blocker: sale fixtures reach submission but their orders are not persisted. The global sale modal now refreshes customer and product references as well as inventory; independent module hooks cannot rely on realtime alone. Failed RPC responses are captured without authorization headers in audit diagnostics. These changes need a fresh live run; no 21/21 claim is made. The old purchase flow still points to `/vendor`, and production/project/tax modules still lack supported routes.
- Local verification after atomic edit and queued-read coverage: 284/284 unit tests and production build pass. CI run `37007820435` passed the authenticated expense lifecycle including decimal edit, repeated request and cancellation; its full legacy audit step is still running. Realtime refreshes arriving during expense reads are now coalesced into one subsequent read. Approval uses a conditional pending/draft update so a stale screen cannot resurrect a cancelled expense.
- Commit `840f24e2` passed 280 unit tests, 29 browser tests, two sales/expense lifecycle tests, two concurrency tests, one deposit lifecycle, and six delivery/reversal cases. The legacy audit suite failed during setup (0/21): `purchase_order_lines` inherits tenant ownership from `purchase_orders` and has no `tenant_id` column. The reader now uses an inner parent join with an explicit parent tenant filter, covered by a regression assertion.
- Migration `20261002122938_atomic_expense_edit.sql` is installed in staging and production. Pending expense editing is one permission-checked, idempotent RPC; it locks the expense, posting and accounts, rejects stale edits and validates funds, currency and accounting periods. Cancellation preserves the expense and reverses its posting rather than deleting financial history.
- Staging rollback verification passed create, edit, repeated request, stale-edit rejection and cancellation with a net-zero posting balance. PGlite tests also verify rollback when the expense update fails. This does not certify all 21 legacy UI scenarios or a completed production deploy.

