# Cross-Module Posting Status

## Implemented

- Vendor invoice payment uses one idempotent server transaction for three-way matching, posted inventory receipt coverage, cash debit, balanced payable settlement, audit and invoice status. Paid invoices and their lines are immutable.
- Warehouse purchase receipt restores the canonical landed-cost posting function: stock, dated valuation layers and a balanced inventory/payable journal commit together. Receipt replay checks the warehouse/date and returns the existing receipt only when its journal is posted.
- The cash-account GL foreign key missing from staging is restored by a forward migration. Payment rejects foreign-tenant GL mappings.
- The invoice work tab is accessible. Invoice totals include VAT, and canonical paid invoice statuses update the PO paid/remaining amounts.
- Material production consumes available warehouse stock, values FIFO or weighted-average material cost, receives finished stock, posts a balanced inventory conversion journal and persists BOM consumption. Replays return the original batch.
- Integration testing performs a real signed HTTP call between staging Edge Functions. Success requires a durable receiver receipt, not an assumed HTTP status. Signing keys remain private and rotate server-side.
- CI provisions a separate temporary Auth user with only the viewer role in the dedicated nonproduction tenant. Authorization checks cover RPC denial, direct table write denial and foreign-tenant isolation. Cleanup verifies run ownership before deleting that temporary account.
- Production and integration business audits now read canonical Supabase records rather than legacy browser snapshots.

## Verification

- Local `npm run verify:release` passed: 82 test files, 349 tests, 219 ordered migrations, security/hardening/recovery checks, production build and 407.6 KB initial JS budget.
- Seven migrations applied to staging, with migration history aligned to repository timestamps. No production installation is claimed.
- Both staging Edge Functions deployed. Unauthenticated dispatch rejected with HTTP 401. Authenticated clients cannot execute the privileged dispatch claim or read private signing keys.
- Live staging production transaction verified raw consumption, finished receipt, unit cost and idempotency, then rolled back all fixtures.
- Live staging purchasing transaction verified PO, GRN, landed-cost approval, stock/valuation receipt, three-way matching, invoice payment, replay, balanced journal and cash balance (500 to 400). The failed VAT payment left no cash/payment/request records. All fixtures rolled back. The repeatable SQL fixture is `scripts/fixtures/purchasing-posting-rollback.sql`.
- Live staging viewer checks verified direct customer insertion and integration RPC denial, then rolled back the temporary role change.
- PGlite tests cover invoice payment/replay, paid-line protection, posted-receipt requirement, both production valuation methods, reserved-stock denial, viewer child-row protection, webhook receipts and key rotation.
- New regression tests cover receipt replay, closed receipt dates, tenant/edit authorization, missing cash GL columns, foreign GL mappings, failed VAT settlement rollback, VAT-inclusive display and the invoice work tab.
- CI run 37202404372 passed the authenticated signed HTTP/replay gate, browser/tenant-isolation tests, sales/expense lifecycle, concurrency, credit deposit and delivery/reversal matrices. The production business audit also passed. The 21-flow suite recorded 7 passes and 14 failures; the job failed and production deployment remains blocked.
- The purchasing business audit now uses `/satinalma` and the actual PO-to-payment flow, not the removed `/vendor` workflow. HTTP UI assertions now wait for the exact response dispatch ID rather than a previously delivered row. These changes require a new CI run before being called successful browser evidence.

## Remaining Release Evidence And Scope

- CI run 37202404372 failed temporary Auth provisioning before user creation: the configured Management API token returned HTTP 401. Replace the staging SUPABASE_ACCESS_TOKEN, or configure an existing separate viewer account using E2E_READONLY_USER and E2E_READONLY_PASS. Never place credentials in source or chat. Independent diagnostics still run, but this remains a mandatory failed release gate.
- Production installation and the complete 21-flow release gate are not yet claimed complete.
- Invoice settlement currently requires AZN; cross-currency settlement fails explicitly rather than inventing an exchange posting.
- The current receipt journal accrues net landed cost, not a separately classified VAT liability/input tax. Nonzero-VAT invoice settlement therefore fails atomically with `invoice_vat_posting_required` until an approved VAT accrual policy is implemented. VAT display is not evidence of complete tax accounting.
- Production costs currently include consumed materials only. Labor/overhead allocation and reusable BOM master data are separate extensions.
- The HTTP integration is the internal ERP audit connection. External partner endpoints, credentials, event subscriptions and provider-specific business synchronization are not configured by this change.
- Other failed audits include legacy invoice/tax, receivable/creditor, project ROI, provider notification, HR/KPI, reports export and linked support comments. They have not been skipped or marked passing.
- Security advisors report no new missing-RLS errors. The private archive/signing tables intentionally have no client policies. Auth leaked-password protection is still disabled and should be enabled in the dashboard: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
