# Release audit status: 2026-10-03

Full deploy is not approved. Do not remove or weaken the all-21 business-flow gate.

## Evidence

- CI 37099812135, commit a34226ee: all 21 business audits failed. Earlier browser, tenant-isolation, sales/expense, concurrent-command, credit-deposit and delivery/reversal suites passed.
- Fix commit 2b138ee9: the ambiguous expense account FK, missing main-cash code, missing server reversal preview, reversal overlay stacking, delivery CSV order number, closed-order drawer navigation and excessive audit-reader concurrency were corrected.
- CI 37101744304, commit 2b138ee9: 2/21 passed (vendor lifecycle and help/onboarding). Earlier mandatory lifecycle suites passed; the all-21 gate failed and deployment remains blocked.
- Follow-up: shared cash-account creation now supplies code and currency scope, including conflict recovery. Standard SF sale numbers are assigned under a tenant-scoped server transaction lock, including cancelled history. Staging rollback evidence: stale SF-1029 became SF-1030 without retaining a new sale. Cancellation asserts the canonical cancelled credit status; credit registry audits search explicitly instead of depending on the first ten rows.
- 308 unit tests, migration ordering (208 files), security (9), transaction hardening (54), core backend, recovery (20), build and bundle budget passed locally. Initial local backend probes were blocked by sandbox networking; after permission was granted, the same probes passed.
- Desktop 1440px and mobile 375px overlay tests passed. These are isolated CSS/stacking tests, not authenticated cancellation tests.
- Preview and ledger-read migrations were installed in staging and production with matching repository migration versions. Preview denies anonymous, foreign-tenant and null-permission access.
- Follow-up preview scope and sales-number trigger were installed in both databases with matching migration versions. Existing production business records were not reset or rewritten. A new full CI run is required for the follow-up commit.
- Staging ledger execution time measured 1708.898ms before and 46.261ms after. Identical before/after output hashes were verified in both environments. No business ledger rows were changed by these read-only migrations.

## Remaining release blockers

- Purchase order / receivable / integrated-finance audits still use the removed standalone vendor interface and old approval-to-stock/expense behavior. Port them to actual PO, receipt, landed-cost and invoice posting workflows; approval alone must not create stock or cash.
- Purchase payment tracking is a legacy direct-write path without an atomic cash-ledger command. It is disabled by default with an explicit UI warning. Do not create an optional tracking table solely to make the audit green.
- Production/BOM and project ROI have no supported application routes or canonical posting workflow. Restoring navigation to browser-state implementations does not fulfill the Supabase-only acceptance criteria.
- Invoice/accounting/tax and warehouse CSV-import audits use obsolete screens/selectors. Their actual database effects, VAT posting and inventory totals must remain asserted when ported.
- Settings permission audit creates browser-only users and uses a simulated user switcher. Replace it with real Supabase identities, grants and permission-denial evidence.
- API/Webhook `runApiAction` currently generates a response code and random latency without sending HTTP. `rotateApiSecret` updates metadata, not a real signing secret. A simulated 200 must not count as a successful live integration.
- Notification dispatch, KPI payout, HR hierarchy and reporting/support persistence need authenticated, current-UI assertions and durable server results, not fixed sleeps or local-state success.

## Operational residuals

The daily reconciliation scheduler and independent restore drill have not been verified. Auth leaked-password protection remains disabled in both Supabase advisors. SECURITY DEFINER authenticated-execute advisories require per-function authorization review; the preview function intentionally uses explicit auth/module guards and an empty search path.

Advisor references: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Release only when all mandatory CI suites pass on one identical commit, then verify that commit's successful deploy and served build. Pending, skipped and cancelled runs are not success.
