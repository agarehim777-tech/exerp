# Cross-Module Posting Status

## Implemented

- Vendor invoice payment uses one idempotent server transaction for three-way matching, posted inventory receipt coverage, cash debit, balanced payable settlement, audit and invoice status. Paid invoices and their lines are immutable.
- Warehouse purchase receipt restores the canonical landed-cost posting function: stock, dated valuation layers and a balanced inventory/payable journal commit together. Receipt replay checks the warehouse/date and returns the existing receipt only when its journal is posted.
- The cash-account GL foreign key missing from staging is restored by a forward migration. Payment rejects foreign-tenant GL mappings.
- The invoice work tab is accessible. Invoice totals include VAT, and canonical paid invoice statuses update the PO paid/remaining amounts.
- Recoverable invoice VAT uses an explicitly selected tenant-owned asset GL account and a separate balanced VAT accrual in the same invoice-payment transaction. Tax postings are immutable. The UI requires a recoverability confirmation; it does not infer tax eligibility.
- Procurement child rows are filtered through tenant-owned parent foreign keys. Tenant changes remount the workspace, discard drafts and invalidate delayed responses, including A-to-B-to-A visits. Both receipt/invoice PO controls have stable accessible names.
- Material production consumes available warehouse stock, values FIFO or weighted-average material cost, receives finished stock, posts a balanced inventory conversion journal and persists BOM consumption. Replays return the original batch.
- Integration testing performs a real signed HTTP call between staging Edge Functions. Success requires a durable receiver receipt, not an assumed HTTP status. Signing keys remain private and rotate server-side.
- CI provisions a separate temporary Auth user with only the viewer role in the dedicated nonproduction tenant. Authorization checks cover RPC denial, direct table write denial and foreign-tenant isolation. Cleanup verifies run ownership before deleting that temporary account.
- Production and integration business audits now read canonical Supabase records rather than legacy browser snapshots.
- Report finance, vendor, purchase and production data are read from canonical tenant-filtered tables across every page, in stable ID order. Cash reversals are resolved after reading the full ledger. Failed reads block export rather than reverting to legacy props.
- Report export awaits its server audit record, preserves the displayed filtered snapshot and invalidates delayed PDF work when the tenant changes. The audit reads actual report workflow records and verifies the downloaded sales CSV.
- The HR chart scrolls within its module instead of centering wide branches outside the scrollable canvas. Browser diagnostics use separate output directories per CI group so later tests cannot remove earlier failures.

## Verification

- Final local `npm run verify:release` passed: 85 test files, 364 tests, 220 ordered migrations, security/hardening/recovery checks, network-dependent core API checks, production build and 407.6 KB initial JS budget. An earlier sandbox network denial was resolved by granting network permission and rerunning the complete gate.
- Eight cross-module migrations applied to staging, with migration history aligned to repository timestamps. No production installation is claimed.
- Both staging Edge Functions deployed. Unauthenticated dispatch rejected with HTTP 401. Authenticated clients cannot execute the privileged dispatch claim or read private signing keys.
- Live staging production transaction verified raw consumption, finished receipt, unit cost and idempotency, then rolled back all fixtures.
- Live staging purchasing transaction verified PO, GRN, landed-cost approval, stock/valuation receipt, three-way matching, a 50 AZN untaxed invoice and a 59 AZN VAT invoice, payment replay, VAT accrual and a zero payable balance. Cash moved from 500 to 391. An insufficient-cash VAT attempt left no tax/journal/payment/request records. All fixtures rolled back. The repeatable SQL fixture is `scripts/fixtures/purchasing-posting-rollback.sql`.
- Live staging viewer checks verified direct customer insertion and integration RPC denial, then rolled back the temporary role change.
- PGlite tests cover invoice payment/replay, paid-line protection, posted-receipt requirement, both production valuation methods, reserved-stock denial, viewer child-row protection, webhook receipts and key rotation.
- New regression tests cover receipt replay, closed receipt dates, tenant/edit authorization, missing cash GL columns, foreign GL mappings, failed VAT settlement rollback, VAT-inclusive display and the invoice work tab.
- New report tests cover paginated reversals, tenant visit/request races, empty refreshes, read failures, canonical production and stale PDF export. Procurement tests cover explicit parent filtering, draft reset and both PO labels. Two isolated Playwright layout assertions passed at 1440px and 375px; these are not authenticated HR business-flow evidence.
- CI run 37202404372 passed the authenticated signed HTTP/replay gate, browser/tenant-isolation tests, sales/expense lifecycle, concurrency, credit deposit and delivery/reversal matrices. The production business audit also passed. The 21-flow suite recorded 7 passes and 14 failures; the job failed and production deployment remains blocked.
- The purchasing business audit now uses `/satinalma` and the actual PO-to-payment flow, not the removed `/vendor` workflow. HTTP UI assertions now wait for the exact response dispatch ID rather than a previously delivered row. These changes require a new CI run before being called successful browser evidence.
- Newer CI run 37269400827 passed unit/release checks, signed HTTP/replay, sales/expense, concurrency, credit deposit and delivery/reversal. Browser tests recorded 30 passes and one HR dialog failure. The full business suite recorded 6 passes and 15 failures. Receipt PO naming, HR chart containment, report export and diagnostic retention corrections above still require fresh authenticated CI evidence.

## Remaining Release Evidence And Scope

- CI run 37202404372 failed temporary Auth provisioning before user creation: the configured Management API token returned HTTP 401. Replace the staging SUPABASE_ACCESS_TOKEN, or configure an existing separate viewer account using E2E_READONLY_USER and E2E_READONLY_PASS. Never place credentials in source or chat. Independent diagnostics still run, but this remains a mandatory failed release gate.
- Production installation and the complete 21-flow release gate are not yet claimed complete.
- Invoice settlement currently requires AZN; cross-currency settlement fails explicitly rather than inventing an exchange posting.
- VAT accrual supports explicitly approved recoverable input VAT only. Nonrecoverable/capitalized VAT and statutory tax filing are not implemented. Direct nonzero-VAT settlement without a matching posted accrual remains rejected with `invoice_vat_posting_required`.
- Production costs currently include consumed materials only. Labor/overhead allocation and reusable BOM master data are separate extensions.
- The HTTP integration is the internal ERP audit connection. External partner endpoints, credentials, event subscriptions and provider-specific business synchronization are not configured by this change.
- Other failed audits include legacy invoice/tax, receivable/creditor, project ROI, provider notification, HR/KPI, reports export and linked support comments. They have not been skipped or marked passing.
- The user confirmed on 2026-10-05 that staging credentials have not yet been updated. The restricted-identity gate remains blocked; application changes do not replace this required human action.
- Security advisors report no new missing-RLS errors. The private archive/signing tables intentionally have no client policies. Auth leaked-password protection is still disabled and should be enabled in the dashboard: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
