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

## Release remains blocked

The last completed CI run, `37424479203` on `2730ed7`, passed unit/static/build, restricted identity, browser tenant isolation, sales/expense, concurrency, deposit and delivery/reversal gates. Ephemeral identity cleanup succeeded. Its 21-flow audit passed 4 scenarios and failed 17. The signed HTTP gate failed because the audit reader used a nonexistent `webhook_receipts.id` column; this continuation fixes that reader, but the new CI result is not yet known. These completed-run results must not be attributed to the new commit.

The new commit must pass all 21 flows before production deployment. No production migrations or deployment have been performed in this continuation.

Unresolved work includes canonical debtor/creditor closure, KPI financial payout, project routing and canonical ROI sources, notification provider acknowledgement, and any failures still found by the updated staging audit. The updated invoice and message flows still require their authenticated browser audit to pass on the published commit. The AI live test is disabled in CI configuration; it has not been verified. Do not skip these business assertions or present simulated provider/financial state as live evidence.
