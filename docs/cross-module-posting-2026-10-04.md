# Cross-Module Posting Status

## Implemented

- Vendor invoice payment uses one idempotent server transaction for three-way matching, posted inventory receipt coverage, cash debit, balanced payable settlement, audit and invoice status. Paid invoices and their lines are immutable.
- Material production consumes available warehouse stock, values FIFO or weighted-average material cost, receives finished stock, posts a balanced inventory conversion journal and persists BOM consumption. Replays return the original batch.
- Integration testing performs a real signed HTTP call between staging Edge Functions. Success requires a durable receiver receipt, not an assumed HTTP status. Signing keys remain private and rotate server-side.
- CI provisions a separate temporary Auth user with only the viewer role in the dedicated nonproduction tenant. Authorization checks cover RPC denial, direct table write denial and foreign-tenant isolation. Cleanup verifies run ownership before deleting that temporary account.
- Production and integration business audits now read canonical Supabase records rather than legacy browser snapshots.

## Verification

- Four migrations applied to staging, with migration history aligned to repository timestamps.
- Both staging Edge Functions deployed. Unauthenticated dispatch rejected with HTTP 401. Authenticated clients cannot execute the privileged dispatch claim or read private signing keys.
- Live staging production transaction verified raw consumption, finished receipt, unit cost and idempotency, then rolled back all fixtures.
- Live staging viewer checks verified direct customer insertion and integration RPC denial, then rolled back the temporary role change.
- PGlite tests cover invoice payment/replay, paid-line protection, posted-receipt requirement, both production valuation methods, reserved-stock denial, viewer child-row protection, webhook receipts and key rotation.

## Remaining Release Evidence And Scope

- CI run 37195585565 passed release gates but temporary Auth provisioning failed before user creation: the configured Management API token returned HTTP 401. Replace the staging SUPABASE_ACCESS_TOKEN, or configure an existing separate viewer account using E2E_READONLY_USER and E2E_READONLY_PASS. Never place credentials in source or chat.
- Successful signed HTTP delivery still requires authenticated CI verification. An early gate now requires a persisted receiver receipt and verifies that replay does not send another attempt.
- Production installation and the complete 21-flow release gate are not yet claimed complete.
- Invoice settlement currently requires AZN; cross-currency settlement fails explicitly rather than inventing an exchange posting.
- Production costs currently include consumed materials only. Labor/overhead allocation and reusable BOM master data are separate extensions.
- The HTTP integration is the internal ERP audit connection. External partner endpoints, credentials, event subscriptions and provider-specific business synchronization are not configured by this change.
