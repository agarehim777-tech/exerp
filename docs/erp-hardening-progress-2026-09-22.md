# ERP hardening progress - 2026-09-22

## Update - 2026-09-23

- Expense synchronization follow-up: removed load-time backfill from stale local state, paginated reads, discarded old tenant responses, serialized writes with acknowledged baselines and explicit/online retry. Added visible expense-save errors. Currency and VAT survive mapping. This transitional writer still uses direct expense CRUD and is NOT yet a replacement for the remaining server lifecycle conversion.
- Latest local verification: 41 test files, 212 tests passed; production build and diff whitespace checks passed. No new remote validation or deployment was performed.

- Follow-up: transfer_cash_atomic and refund_cash_expense_atomic now replace client-side transfer/refund writes, including expense cancellation. Transfer accounts lock in ID order; request replay is idempotent. Refund locks the expense and original posting, rejects ambiguous duplicate postings and uses the original posted amount.
- Removed unused syncExpenseCashImpact/syncOrderPayments auto-repair code and the client cash-reversal fallback. Missing reversal RPC now reports a migration error.
- Latest verification: 209 tests across 40 files and production build passed. Nine SQL fixture tests now include transfer rollback and repeated refund. Multi-connection concurrency and live database compatibility remain unverified.

- Created migration 20260922070837_server_cashbook_ledger.sql with CLI 2.81.3 (current cached CLI fails on its global configuration directory).
- Added full server ledger summary grouped by currency and an idempotent atomic cash expense command. Expense, outgoing cash row, audit and request completion are one SQL transaction.
- Cashbook UI now consumes the server summary instead of summing the latest 300 transactions; missing backend RPC produces a migration-required error, not a fabricated balance. Deploy this frontend only after the migration is validated and applied.
- Added six executable SQL tests using pinned PGlite 0.5.8 with an isolated schema fixture. These cover 350 entries, reversals, exact-once replay, payload mismatch, foreign-tenant/account rejection, invalid amounts, insufficient funds, period locks and rollback after ledger failure. This does NOT test the full deployed schema/triggers or concurrent connections.
- Added client command tests for double clicks and network retry keys. Updated authenticated expense E2E to call the actual atomic command and verify the ledger summary. It has not been run live.
- Backend deployment gate now requires the two new RPCs to reject anonymous access; missing RPCs fail the gate.
- Latest local results: 40 files / 206 tests passed; build passed; 183 migration filenames passed.
- Migration has NOT been applied to staging or production. Other finance writes/refunds/transfers, debt settlement, purchase and production posting still require transactional conversion. The full seven-step program is not complete.

## Implemented locally

- Customer, product, order and stock reads reject late responses from previous tenant visits. Loaded empty results clear the compatibility read bridge.
- Browser UI cache uses an allowlist; cache fallback does not hydrate operational records. Server snapshots remain transitional and are NOT fully migrated.
- Collection synchronization serializes writes, acknowledges only successful writes, preserves failed edits in memory, and provides explicit retry plus online retry. Hydration is paginated and does not write back snapshot data.
- AI list/count tools explicitly filter the selected tenant. Membership is checked before model/tool execution using the user's JWT and RLS.
- Pages deployment waits for successful push CI on main in this repository and checks out the exact tested SHA. Manual/push deployment bypass removed.
- Lifecycle tests require a non-production project and two explicit test tenants. Membership selection no longer chooses the first tenant. HTTP errors and missing tables no longer pass tenant isolation tests.

## Verification

- Unit tests: 38 files, 198 tests passed.
- Production build passed.
- Static checks: hardening 54, security 9, recovery 18; migration filenames 182 passed.
- Static checks do not establish that production SQL is current or transactionally correct.
- No migrations, Edge Function deployment, commit, or push performed in this phase.
- Existing unrelated changes in supabase/functions/mcp/index.ts were left untouched.

## Blocking external checks

Staging project cvjctwgdyzhijhzhhjqd reports ACTIVE_HEALTHY, but the SQL endpoint still times out on a simple current_database()/now() query (2026-09-22). No destructive recovery or production schema change was attempted.

Create/configure the GitHub environment named staging with its own VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, E2E_TEST_USER and E2E_TEST_PASS secrets. Configure E2E_SUPABASE_PROJECT_REF, E2E_TENANT_ID and E2E_OTHER_TENANT_ID as environment variables. Use a restricted test user with membership only in the first test tenant, and seed test fixtures in both tenants (including at least one customer in the first tenant). Do not use production credentials.

Until these prerequisites and CI pass, deployment is intentionally blocked. Authenticated browser tests, live two-tenant tests and all 21 business flows have NOT passed in this phase.

## Remaining implementation

1. Restore staging SQL access; inventory actual schema and archive snapshots before reviewed import. No migration v4 is claimed or enabled.
2. Implement authoritative server ledger balances and atomic expense/payment/refund commands.
3. Implement receivable settlement, purchase payments and production posting as transactional server commands.
4. Finish canonical HR migration and expense synchronization. Generic collection retry is not a cross-record transaction or multi-client conflict resolution mechanism. Failed unsaved edits remain in memory only.
5. Complete removal of operational server snapshots and remaining browser storage paths; test mutation responses during tenant switching.
6. Replace legacy localStorage-based business-flow audit with real dedicated-tenant scenarios; verify exact-commit CI and scheduled reconciliation operationally.
7. Deploy and live-test AI tenant filtering; consolidate shared design components and verify authenticated desktop/mobile screens.

Reference for workflow_run gating: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run
