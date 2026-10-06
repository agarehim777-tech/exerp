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

## Release remains blocked

The last completed CI run, `37302929125` attempt 2 on `4d1504bb`, passed the restricted identity gate, signed HTTP/replay, browser tenant isolation, sales/expense, concurrency, deposit and delivery/reversal gates. Ephemeral identity cleanup succeeded. Its legacy 21-flow audit passed 6 scenarios and failed 15. These results precede this change and must not be attributed to the new commit.

The new commit must pass all 21 flows before production deployment. No production migrations or deployment have been performed in this continuation.

Unresolved work includes canonical debtor/creditor closure, KPI financial payout, atomic sales invoice creation/payment, project routing and canonical ROI sources, notification provider acknowledgement, and any failures still found by the updated staging audit. The AI live test is disabled in CI configuration; it has not been verified. Do not skip these business assertions or present simulated provider/financial state as live evidence.

