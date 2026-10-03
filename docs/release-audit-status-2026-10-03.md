# Release audit status: 2026-10-03

Full deploy is not approved. Do not remove or weaken the all-21 business-flow gate.

## Evidence

- CI 37099812135, commit a34226ee: all 21 business audits failed. Earlier browser, tenant-isolation, sales/expense, concurrent-command, credit-deposit and delivery/reversal suites passed.
- Fix commit 2b138ee9: the ambiguous expense account FK, missing main-cash code, missing server reversal preview, reversal overlay stacking, delivery CSV order number, closed-order drawer navigation and excessive audit-reader concurrency were corrected.
- CI 37101744304, commit 2b138ee9: 2/21 passed (vendor lifecycle and help/onboarding). Earlier mandatory lifecycle suites passed; the all-21 gate failed and deployment remains blocked.
- CI 37103099991, commit 8b0279ea: 4/21 passed. Sale/credit/reservation and sale/expense edit/cancellation now pass as well. Deployment is still blocked by the remaining 17 audits.
- CI 37104242111, commit 8dfdda80: 6/21 passed. Independent credit contracts/CRM links and warehouse delivery now pass too. The remaining 15 audits block deployment.
- Follow-up: shared cash-account creation now supplies code and currency scope, including conflict recovery. Standard SF sale numbers are assigned under a tenant-scoped server transaction lock, including cancelled history. Staging rollback evidence: stale SF-1029 became SF-1030 without retaining a new sale. Cancellation asserts the canonical cancelled credit status; credit registry audits search explicitly instead of depending on the first ten rows.
- Next correction restores missing CRM document/service tables and delivery acceptance columns in both databases. CRM tables use composite tenant foreign keys, read/edit RLS and no anonymous table grants. The credit audit checks actual rendered total/paid/balance tiles against server values instead of waiting for a removed duplicate formula component. A new full CI result is required.
- Follow-up uses cent-precision payment expectations (83.33 + 50 otherwise differs from the server's 133.33 in binary floating point). The role audit now requires a distinct restricted Supabase login and actual RPC authorization denial plus foreign-tenant RLS evidence; missing E2E_READONLY_USER/E2E_READONLY_PASS fails explicitly, never skips.
- 315 unit tests, migration ordering (210 files), security (9), transaction hardening (54), core backend, recovery (20), build and bundle budget passed locally. Deploy configuration verification passed 22 checks. Initial local backend probes were blocked by sandbox networking; after permission was granted, the same probes passed.
- The monthly credit command previously reported an unassessed manual late fee as unallocated cash rather than penalty income, and the UI rounded principal to whole currency units. Both are corrected. The replacement command validates auth, permission, active sale/credit and same-tenant/currency cash account; serializes receipt idempotency; allocates principal separately; and rolls back the receipt, allocation, cash and audit on failure. Installed in both databases with matching migration history. An authenticated staging rollback test verified principal 133.33, penalty 17, cash 150.33 and a single cash row on replay. Existing historical receipts were not repaired or rewritten.
- HR document actions now select the actual profile tab; reporting checks the current period filter, snapshot date and module volumes; messaging explicitly selects the linked conversation. Export/comment persistence uses bounded server polling. A new complete CI run is still required.
- Desktop 1440px and mobile 375px overlay tests passed. These are isolated CSS/stacking tests, not authenticated cancellation tests.
- Preview and ledger-read migrations were installed in staging and production with matching repository migration versions. Preview denies anonymous, foreign-tenant and null-permission access.
- Follow-up preview scope and sales-number trigger were installed in both databases with matching migration versions. Existing production business records were not reset or rewritten. A new full CI run is required for the follow-up commit.
- Staging ledger execution time measured 1708.898ms before and 46.261ms after. Identical before/after output hashes were verified in both environments. No business ledger rows were changed by these read-only migrations.

## Remaining release blockers

- Purchase order / receivable / integrated-finance audits still use the removed standalone vendor interface and old approval-to-stock/expense behavior. Port them to actual PO, receipt, landed-cost and invoice posting workflows; approval alone must not create stock or cash.
- Purchase payment tracking is a legacy direct-write path without an atomic cash-ledger command. It is disabled by default with an explicit UI warning. Do not create an optional tracking table solely to make the audit green.
- Production/BOM and project ROI have no supported application routes or canonical posting workflow. Restoring navigation to browser-state implementations does not fulfill the Supabase-only acceptance criteria.
- Invoice/accounting/tax and warehouse CSV-import audits use obsolete screens/selectors. Their actual database effects, VAT posting and inventory totals must remain asserted when ported.
- The restricted role audit needs a second Supabase account in the test tenant and staging GitHub secrets E2E_READONLY_USER/E2E_READONLY_PASS. Only the primary admin membership currently exists. The new audit rejects reused/elevated identities, validation errors mistaken for authorization errors, successful commands, and foreign rows. Browser role UX still needs additional coverage.
- API/Webhook `runApiAction` currently generates a response code and random latency without sending HTTP. `rotateApiSecret` updates metadata, not a real signing secret. A simulated 200 must not count as a successful live integration.
- Notification dispatch, KPI payout, HR hierarchy and reporting/support persistence need authenticated, current-UI assertions and durable server results, not fixed sleeps or local-state success.
- Delivery currently posts stock and then saves acceptance through a separate write. Restored acceptance columns remove schema errors, but an atomic delivery-plus-acceptance command is still required by the architecture plan.

## Operational residuals

The daily reconciliation scheduler and independent restore drill have not been verified. Auth leaked-password protection remains disabled in both Supabase advisors. SECURITY DEFINER authenticated-execute advisories require per-function authorization review; the preview function intentionally uses explicit auth/module guards and an empty search path.

Advisor references: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Release only when all mandatory CI suites pass on one identical commit, then verify that commit's successful deploy and served build. Pending, skipped and cancelled runs are not success.
