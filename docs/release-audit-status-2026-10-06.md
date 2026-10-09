# Release audit continuation: 2026-10-06

## Verified in this change

- Warehouse CSV imports now use one authorized, tenant-scoped, idempotent database command. The product catalog, stock receipt, valuation layer and audit entry commit together. A failed row rolls the entire import back.
- Product cost and serial-tracking metadata are persisted and read from Supabase. A missing optional CSV value preserves an existing product value.
- The import dialog preserves a retry key after an uncertain failure, blocks changes while saving and displays the actual server error.
- Inventory base reads are paginated with exact counts, stable composite stock ordering and tenant-request cancellation. An API row cap cannot silently omit later warehouses or stock balances.
- Landed-cost purchase-line reads explicitly join the tenant-owned PO, expose query failures and give the receiving warehouse selector an exact accessible name.
- Business audits use narrower canonical fixture reads and current CSV/message controls. HR payroll-marker neutrality is checked against the real cash ledger rather than a removed browser-only expense flag.

## Evidence

- Local unit suite: 90 files, 376 tests passed.
- Migration ordering: 221 migrations passed. Security posture, transaction hardening and recovery gates passed.
- The core-backend probe passed after granting network access; the initial sandbox network denial was not treated as a successful backend check.
- Production build passed; initial JavaScript is 407.6 KB within the 500 KB budget.
- Staging migration `20261005120626_atomic_warehouse_csv_import` applied and history aligned with the CLI-generated file.
- Live staging rollback fixture verified catalog metadata, stock, replay, changed-payload rejection and multirow rollback without leaving test records.
- Database advisors were inspected. Authenticated SECURITY DEFINER warnings are expected for deliberately authorized RPC commands; leaked-password protection remains a separate account configuration warning. This is not a claim of zero security advisories.

## Invoice and audit continuation

- Invoice header, lines, decimal totals and audit entry now commit in one authorized, idempotent server command. Payments commit the receipt, real cash transaction and balanced journal together.
- Invoice receipts are immutable; reversal reopens the invoice debt and reverses the receipt journal. Invoice cancellation reverses both cash receipts and the revenue/VAT journal. Order-backed invoices use the existing sales payment and delivery journal instead of posting duplicate revenue or credit payments.
- The browser no longer writes invoice financial tables directly. Invoice and billing-source reads use stable pagination, exact counts and tenant-request cancellation, including A-to-B-to-A and empty-result scenarios. Failed forms retain their values and uncertain command keys.
- A live staging fixture detected the real `numeric(18,2)` price constraint. Unsupported quantity/price/rate precision is now rejected before totals are calculated. SQL tests use the actual line-column numeric scales, and draft validation exposes the same constraint.
- Workflow writes for known direct/group message threads now use the existing `messages` module permission. Unknown communication types, other tenants and read-only writes remain denied; other workflow module permissions are unchanged.
- Navigation audits wait for the requested route, active sidebar item and completed lazy-module rendering, not network idle. The audit reader orders webhook receipts by their actual `dispatch_id` key and paginates through a server-imposed row cap.
- The invoice audit now exercises real invoice creation, VAT journal posting, cash receipt, replay and cancellation rather than obsolete browser-only panels or simulated tax payments.

### Verification

- Local release suite: 97 files, 399 tests passed; 224 migration files passed ordering checks. Security posture (9), transaction hardening (54), core-backend and recovery (20) gates passed. Build and 407.6 KB initial-JavaScript budget passed. Dependency audit found zero vulnerabilities.
- Staging migrations `20261006062828_atomic_sales_invoice_commands`, `20261006131651_align_message_workflow_authorization` and `20261006131851_enforce_sales_invoice_decimal_scale` applied; migration history was aligned to the CLI-generated filenames.
- Live staging rollback fixture verified decimal totals, matching request replay, payment cash/GL linkage, overpayment rollback and idempotent cancellation with zero net cash/GL impact. All fixture records rolled back.
- An authenticated-role staging rollback verified message-thread insert/update and rejection of unknown communication types. Policy tests additionally verify read-only, cross-tenant and child-record restrictions.
- Database advisors were inspected. New invoice receipt foreign keys have covering indexes. Deliberately exposed authorized RPCs still produce authenticated SECURITY DEFINER warnings; leaked-password protection and existing performance notices remain separately visible. This is not a claim that every database advisory has been resolved.

## Sales read and canonical fixture continuation

- Sales base reads use exact counts, stable order-date/creation-time/id sorting and actual-row pagination. A server row cap no longer hides later orders or related credits/bonus assignments. The extra row still drives the load-more control.
- Financial relation failures are exposed instead of silently removing credit links. Failed refreshes hide stale financial rows and release loading; tenant A-to-B-to-A responses cannot overwrite the latest tenant visit, including an empty result.
- The sales registry distinguishes loading, query failure and a genuinely empty result.
- Delivery/reversal fixtures create and post their linked invoice through the canonical commands, check command replay, reuse the delivery journal and verify the collected 200 deposit. The direct-write restriction stays enabled. All six FIFO/weighted-average delivery paths remain in the test matrix.
- The finance integration audit now checks actual deposit and credit-payment receipts, principal/penalty separation, server-ledger balance changes, transfer replay and a matching debit/credit pair. Internal transfers must not count as external income or expense. Obsolete browser-only PO/payroll cash markers and removed finance panels are not evidence.
- HR fixture reads are limited to the HR collections and HR/payroll audit modules, retaining tenant filters and pagination. Recruitment uses a unique persisted vacancy rather than matching a previous run's role.
- The invoice audit explicitly opens the new-account form before entering its fixture. The warehouse import audit expects the server-normalized uppercase SKU instead of searching for a lowercase code.

### Local verification

- The full local release suite passed: 100 files, 407 tests; 224 migration-order checks, security posture (9), transaction hardening (54), core-backend and recovery (20) gates, build and 407.6 KB initial-JavaScript budget.
- The updated delivery matrix parses and lists six Playwright scenarios. Listing is not execution: this fixture and the rewritten finance browser audit require a new authenticated staging CI run.
- Static audit-fixture tests guard the invoice RPC boundary and removal of simulated finance evidence. They do not substitute for live lifecycle tests.

## Release remains blocked

The earlier full business-audit run, `37470681977` on `1f157311`, passed unit/static/build, restricted identity, signed HTTP delivery/replay, browser tenant isolation, sales/expense, concurrency and credit-deposit gates. Ephemeral identity cleanup succeeded. Its 21-flow audit passed 8 scenarios and failed 13. These results belong to that published commit, not to the subsequent local fixes.

The new commit must pass all 21 flows before production deployment. No production migrations or deployment have been performed in this continuation.

The earlier delivery/reversal matrix failed because its legacy fixture attempted a forbidden direct insert into `sales_invoices`. The subsequent fixture correction uses the authorized invoice commands. All six matrix paths now pass in staging run `37579491929` on `63f0f843`. That completed run passed 8 of 21 business flows and failed 13; its browser gate passed 32 checks and failed the sales-route check on a network-idle timeout. Ephemeral identity cleanup succeeded. This is not a passing release. No running CI was cancelled.

The latest passing business flows are purchase receiving, vendor lifecycle, invoice accounting/tax, warehouse CSV import, production costing/BOM, help/onboarding, webhook integration and settings permissions. Sales, credit, delivery UI, integrated finance, receivables, project ROI, notifications, KPI payout, HR structure, reports and support flows still failed. Several failures occur before the intended business assertion because a new warehouse is not yet present in a selector, a customer option is unstable, or a confirmation dialog remains open. Passing server lifecycle tests do not establish that these browser workflows work.

Unresolved work includes canonical debtor/creditor closure, KPI financial payout, project routing and canonical ROI sources, notification provider acknowledgement, and any failures still found by the updated staging audit. The updated invoice and message flows still require their authenticated browser audit to pass on the published commit. The AI live test is disabled in CI configuration; it has not been verified. Do not skip these business assertions or present simulated provider/financial state as live evidence.

## Dependency continuation: 2026-10-07

- Published audit/read fixes as `9b08227d`. CI run `37578666139` stopped at the dependency security gate before provisioning an identity or running any business flows; it does not provide a new 21-flow result.
- Newly indexed advisory [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) flags the MCP OAuth client in SDK versions below `1.31.0`. The Lovable development dependency still pins `1.28.0`, so the repository now locks a patched `1.31.0` override rather than disabling the audit or making an unrelated major Lovable upgrade.
- The npm lock changed only the SDK package compared with the published parent. The Bun lock also brings its existing DOMPurify/PGlite entries into line with the already published manifest. This updates repository tooling, not deployed Edge Function artifacts or provider credentials.
- A clean `npm ci` and `npm audit --audit-level=high` passed with zero reported vulnerabilities. Compatibility tests verify the SDK resolved by Lovable, MCP initialization/catalog/existing echo invocation, and rejection of unauthenticated requests by the Supabase OAuth handler.
- Full local release gates passed after the dependency change: 101 files, 410 tests, 224 migrations, security/hardening/backend/recovery checks, production build and 407.6 KB initial JavaScript. The next published commit must still run all live gates; production remains untouched.

## Canonical credit continuation: 2026-10-07

- DB-backed credit identity, activation date/status, deposit target/collected amount, outstanding principal and installment state now override stale collection/browser projections. An explicit zero target is not replaced with an invented 10% deposit. Missing activation dates do not mean an active credit.
- The order read includes the canonical installment schedule, sorted by installment number with partial principal amounts preserved to two decimal places. Browser-only payment-history entries are excluded rather than presented as real receipts; canonical payment-history components remain separate.
- Initial-payment and activation callbacks use the canonical portfolio. With legacy writes disabled, a successful RPC/refresh no longer adds synthetic cash, increments the already-refreshed order payment a second time, or writes a browser activation record.
- The start dialog preserves errors/date, blocks duplicate in-flight submissions and closes only after command success. Partial deposits accept cents. Activation remains blocked until refreshed server totals show the exact target collected, including the final cent.
- Failed credit reads show an explicit error/retry control. Browser orders are used only under the explicit legacy-write flag, never as an automatic fallback for canonical read failure or tenant change.
- Isolated headless Playwright checks at 1440x900 and 390x844 verified modal framing, blocked activation until deposit completion, an uncovered action button and no page errors. The preview uses synthetic callbacks with backend requests intercepted; it is UI evidence, not live cash, receipt or activation evidence.
- The browser gate now waits for rendered module/header content rather than requiring background network traffic to stop. Runtime, route, control and tenant-access assertions remain in place. Its authenticated CI execution is still required.
- The combined credit/browser-wait batch passed 102 test files and 420 tests on 2026-10-08, plus 224 migration-order checks, security (9), hardening (54), backend availability and recovery (20). Windows temporary-cache permissions initially prevented test collection; using the workspace cache restored execution. Backend probes initially lacked network access and passed after permission was granted. These local checks do not replace authenticated lifecycle execution or the 21 live workflows.
- This batch adds no migrations and has not changed production. Its own authenticated staging run is still required; completed `63f0f843` results cannot establish outcomes for later credit changes.
- The combined batch also passed the production build and initial-JavaScript budget (407.6 KB against 500 KB). Playwright successfully parsed/listed all 12 critical scenarios; listing is not authenticated execution.

## Audit-runner and inventory continuation: 2026-10-08

- Completed CI run `37736528233` on `6b1a7b34` passed all 420 unit tests and release gates, restricted identity, webhook HTTP/replay, sales/expense, concurrency, credit deposit and all six delivery/reversal scenarios. Browser checks passed 31 and failed two: the procurement and cashbook pages do not share the assumed `.page-header h1` structure. Their readiness checks now use their actual named headings without removing runtime or tenant assertions.
- The 21-flow audit did not finish: ten scenarios failed before the CSV-import flow crashed on an unhandled response-wait timeout; ten later scenarios were not executed. The prior eight-pass/thirteen-fail result is not this run's outcome. Ephemeral identity cleanup succeeded.
- All eight response/action pairs now use a helper that attaches rejection handlers to both promises before executing the action. Response timeouts still fail the current flow; they no longer escape as an unhandled rejection while a click is pending or has failed. Tests cover success, a timeout with a pending action and a late response failure after a failed click.
- Inventory reads use immutable warehouse IDs and composite warehouse/product cursors instead of offsets into a mutable name-sorted list. UI warehouse name sorting happens after the read. A repeated/missing identity or missing count is exposed as an error, not silently summed or deduplicated. A failed base refresh invalidates its loaded scope. This addresses a demonstrated pagination hazard; authenticated CI must still confirm the cause and disappearance of duplicate warehouse warnings and form stalls.
- Local verification passed: 102 files, 425 tests; 224 migrations, security/hardening/backend/recovery gates, production build and 407.6 KB initial-JavaScript budget. The 12 critical browser scenarios parse/list successfully; that is not live execution. No migration, production write, reset or deployment was performed.
- Remaining functional gaps and the full 21-flow acceptance requirement remain open. No financial assertions or scenarios were skipped to make the gate pass.

## Bounded warehouse rendering and complete collection reads: 2026-10-08

- Completed staging run `37738509977` on `49591415` passed 425 unit tests, all 33 browser/tenant checks and the sales/expense, concurrency, credit-deposit and six delivery/reversal checks. All 21 business audits completed without an unhandled response crash, but only three passed and eighteen failed. The release remains blocked; this is not a thirteen-failure result or a successful deploy.
- Staging read-only counts found 572 warehouses, 503 stock balances, 488 products and 460 collection records in the isolated audit tenant. Stock tables now render 50 rows per page, keep totals over the full filtered dataset, preserve row actions and reset pagination after filtering/data changes. CSV export still uses the full filtered dataset.
- Collection hydration requests exact counts and advances by the actual number returned, not the requested page size. A server row cap no longer silently truncates HR and other collections. Missing counts or premature empty responses fail before hydration or writes. Regression tests cover all 460 records through 100-row responses and preservation of unsaved state on incomplete reads.
- CI business audits start Vite preview over the release-gate build instead of a fresh development/HMR server. Local development behavior remains unchanged. Existing eight-second interaction deadlines and all business assertions remain enabled. The ErrorBoundary test explicitly imports `vi`; its previous global availability was not the cause of this run's business failures.
- The cashbook RPC emitted a real `57014` statement timeout in the failed CI run. A transaction-scoped, authenticated-role staging read repeated the current RPC in approximately 200 ms without changing data or schema. This does not prove the intermittent timeout is resolved; no speculative SQL/permission/timeout changes were made.
- Local verification: 103 files, 429 unit tests passed; 224 migration-order, security (9), hardening (54), backend availability and recovery (20) checks passed; production build and 407.6 KB initial-JavaScript budget passed. The first backend probe lacked sandbox network access and was rerun after access was granted.
- Synthetic headless checks at 1440x900 and 390x844 rendered 50 of 503 stock rows, exercised the product-create menu and pagination, and produced screenshots with no page errors. Menu interactions took 283 ms and 135 ms respectively. This is UI evidence, not live receipt/payment or full lifecycle evidence.
- No production migration, data cleanup or deployment was performed. This batch still requires its own authenticated staging run with all 21 flows passing before release.

## Isolated customer fixtures and non-starving collection writes: 2026-10-08

- Published warehouse/read batch `cd3a226a`. Its CI run `37741794360` was automatically cancelled when the older `49591415` run `37738509977` was rerun as attempt 2. This is not a test failure or evidence that the new batch passed. The older run is being allowed to finish and clean up before another main push.
- Read-only staging inspection found 200 customer records using the audit's fixed phone number. Customer fixtures now allocate a unique phone and FIN, check both against canonical tenant-scoped records, and fail after five collisions. Application duplicate validation remains enabled.
- Collection writes no longer reset their 400 ms timer on every unrelated state refresh. Tenant/session teardown still cancels queued writes, and acknowledged writes remain serialized with explicit retry on failure.
- Edits made while the initial collection read is in flight are merged with canonical rows and remain pending for persistence. Unchanged browser-only rows are not backfilled, including rows shifted by prepending a new employee. Regression coverage checks this race and repeated inventory updates.
- The pagination regression test retains the 503-row/totals/action assertions and verifies the final partial page on a smaller filtered set, avoiding nine redundant full-page renders. No timeout or business assertion was disabled.
- Final local release verification passed: 103 files, 433 unit tests, 224 migration-order checks, security (9), hardening (54), backend availability, recovery (20), production build and 407.6 KB initial-JavaScript budget. Live authenticated execution of this exact batch is still required; production remains untouched.
- Attempt 2 of the older `49591415` run subsequently completed: four business scenarios passed and seventeen failed. Invoice accounting/tax, help/onboarding, webhook integration and settings permissions passed. Ephemeral identity cleanup reported `deleted`. These outcomes do not evaluate the newer warehouse/read or collection/fixture fixes.

## Shared inventory continuation: 2026-10-08

- Completed CI `37743179305` on `a99a9590` passed 433 unit tests, release gates, browser/tenant isolation and all server lifecycle gates. Seven of 21 business scenarios passed: purchase/receiving/payment, invoice accounting/tax, production/BOM, help/onboarding, settings permissions, reports/export and support/messages. Fourteen failed. Restricted identity cleanup succeeded; production deployment remains blocked.
- Sales/reservation and delivery failures now expose two simultaneous dialogs: the sales form and a shortage confirmation. Other flows could not find the newly created warehouse in selectors. The stock module previously created an independent `useStock` instance while the sales/read bridge used App's instance. The stock module now receives App's canonical inventory hook directly, so warehouse mutations and receipts refresh the same rows used by sales. No confirmation, shortage or server reservation assertion was bypassed.
- HR creation/edits now progressed to the integrity check; the remaining snapshot assertion read after a fixed 75 ms despite an 800 ms persistence timer. The audit now waits for the canonical snapshot before checking its HR issues. This does not add a simulated snapshot or remove the integrity assertion.
- A regression test renders the actual stock module with shared inventory, fails if it creates a second inventory reader, and verifies refreshed warehouses appear in movement selectors. Together with canonical receipt tests, all three focused checks passed.
- Other failures remain open, including credit activation readiness, repeated KPI-period fixtures, CSV-import response readiness, webhook/topbar interaction and remaining sales/receivable UI waits. This batch must pass authenticated staging CI; local checks alone are not a deployment approval.
- Final local verification passed: 104 files and 434 unit tests; migration (224), security (9), hardening (54), backend/recovery (20), production build and 407.6 KB initial-JavaScript gates. No migration or production write was performed.

## Bounded canonical stock tables: 2026-10-08

- CI `37748836637` on `7744d059` completed all 21 flows: eight passed and thirteen failed. Delivery/reservation release, purchase/receiving/payment, vendor lifecycle, production/BOM, help/onboarding, webhook integration, HR structure and settings permissions passed. All unit/static/browser/server lifecycle gates passed and restricted-identity cleanup succeeded. This is not a passing release.
- Remaining click stalls include the canonical stock module's new-warehouse and movement controls. Earlier pagination affected the product workspace but not the DB-backed stock module. Its warehouse and balance tables now render 50 rows per page instead of hundreds, while stock totals, filters and all warehouse options retain the complete dataset. Warehouse search reaches records on any page; filtering resets pagination.
- Canonical table horizontal scrolling stays inside the table wrapper rather than widening the entire mobile document. The warehouse form uses responsive columns and page controls stay within the viewport.
- A 603-record regression checks bounded warehouse/balance rows, complete stock totals, creation form, warehouse search, balance pagination and the last warehouse remaining available in movement selectors. Headless checks at 1440x900 and 390x844 verified 50 rendered rows, page navigation, search and zero page errors or horizontal document overflow. New-warehouse interactions took 141 ms and 75 ms. Synthetic timing is not authenticated staging evidence.
- No financial assertions, scenario, modal confirmation or interaction deadline was removed. Credit-directory visibility, CSV response readiness, KPI-period reuse and any remaining UI stalls require further live verification. No production migration, deletion or deployment was performed.
- Final local release verification passed: 104 files, 435 unit tests, 224 migrations, security (9), hardening (54), backend/recovery (20), build and 407.7 KB initial-JavaScript budget.

## Server-confirmed creation and catalog continuation: 2026-10-08

- CI `37778542712` on `b7a7d9db` completed with eight business flows passed and thirteen failed. Release, browser/tenant-isolation and server lifecycle gates passed; restricted identity cleanup succeeded. Failures include product selection/readiness, sales UI waits, CSV-import response readiness, obsolete `/vendor` navigation, KPI/ledger timeout and HR persistence. These are not a passing release or a production deployment approval.
- Product and customer reads now advance by actual returned rows with exact counts, deterministic ID ordering and tenant cancellation. A 100-row API cap no longer silently ends a 500-row page or hides the load-more sentinel. Later-page failures preserve previous valid data instead of publishing a partial result.
- StockPage receives App's product catalog as well as shared inventory. Product creation no longer depends on a second reader's realtime round trip. The product picker has explicit accessible names and selects on completed click instead of removing its option on pointer down. Regressions cover newly refreshed products, pointer and keyboard selection.
- Sales creation awaits the canonical command before closing or notifying success, and does not also synthesize a browser-only order, contract or credit. Failed writes leave the form open; pending submission blocks duplicate clicks and closing. Credit relation changes now trigger canonical order resynchronization.
- Migration `20261008130228_hash_cashbook_reversal_lookup` resolves distinct reversal references once per tenant and materializes the resulting ledger. Legacy textual markers and structured reversals retain their previous semantics without duplicate sums. Invoker security, the module access guard and anonymous denial remain intact.
- The migration was applied only to staging and its history aligned to the CLI-generated version. An authenticated-role SQL check returned the same complete ledger digest before and after (`36854710aaf57df5d6b68d9ed11bbd97`); measured function execution was 203 ms before and 173 ms after. This verifies unchanged totals and successful reads, not a guarantee against CI load-related timeouts. No production records or schema were modified.
- Headless 1440x900 and 390x844 sales-form checks verified pending lock, retry readiness and zero page errors. Ledger SQL regressions passed, including 6000 additional entries, legacy duplicate markers, foreign-tenant reversal exclusion and execution privileges. All 21 authenticated audits still need to pass on the new commit.
- Database advisors retain existing authenticated SECURITY DEFINER notices and other account configuration warnings. They were not silenced by widening permissions. See [the advisor remediation reference](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Final local release verification passed: 107 files, 448 unit tests, 225 migrations, security (9), hardening (54), backend, recovery (20), production build and 407.7 KB initial-JavaScript budget. Headless stock checks also completed product selection on desktop and mobile with zero page errors. These local and staging-SQL checks do not replace the complete authenticated CI business audit.

## Shared sales repository and targeted reads: 2026-10-09

- CI `37782451129` on `4ab15b84` finished with seven business flows passed and fourteen failed. All preceding release, browser/tenant-isolation, authorization and server lifecycle gates passed. CSV import and HR structure passed; most remaining failures waited for a form to close, and KPI still reused a closed period. AI execution was skipped. This is not a passing release.
- SalesOrdersPage now uses App's canonical sales repository, customer list and product catalog instead of independent hooks. Confirmed creation, payment and cancellation update the same registry. A regression rejects duplicate readers and verifies creation, paid amount updates and removal.
- Sales creation hydrates only the server-confirmed order and its tenant-scoped credit, bonus and delivery links before returning. A full portfolio refresh continues separately; its duration is no longer part of the create command's completion. Tests check canonical row hydration while the full refresh remains pending and tenant/order filters on the targeted read.
- Audit credit-payment/installment reads for an isolated customer now join the tenant-scoped credit parent. HR fixture reads filter the exact employee name rather than scanning the entire collection. Tenant and stable-order constraints remain intact.
- CSV import receives the canonical warehouse list directly. Its preview revalidates when that list changes; a changed submitted payload receives a new request key, while an unchanged uncertain retry retains its key. A regression covers a warehouse arriving after the file was parsed.
- No business scenario, financial assertion, confirmation or timeout was removed. Production remains untouched. The complete authenticated audit must pass before deployment approval.
- Final local release verification passed: 108 files, 452 unit tests, 225 migration-order checks, security (9), hardening (54), backend availability, recovery (20), production build and 407.6 KB initial-JavaScript budget.
