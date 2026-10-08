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
