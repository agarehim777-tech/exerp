# Report and collection consistency release

Apply `20261110134149_report_and_collection_consistency.sql` before deploying
the frontend that calls `apply_collection_changes`. The backend contract gate
rejects a missing RPC. There is intentionally no fallback to separate writes.

The collection command runs with invoker privileges and the existing table RLS.
It only accepts the eight dedicated collection tables; it cannot write the
posted cash ledger or inventory tables. A failed statement rolls back the entire
batch. Repeated requests upsert/delete the same record keys.

Prerequisite: the dedicated collection tables from the existing Drizzle
migrations must already be present with their tenant RLS policies. This release
does not create them or migrate legacy snapshot data.

Validate in staging before production:

- Posted journal lines inside the selected dates only affect trial balance.
- A late request cannot replace another tenant or date range's report.
- A failed report source shows an error, not zero totals.
- Reads finish at the actual end even with an API row cap below 500.
- A failure in a later collection change rolls back earlier changes.
- An authenticated reader cannot write; another tenant is inaccessible.
- Refresh reloads remote changes, and preserves unsaved edits on save failure.

PGlite and mocked UI tests cover these contracts locally. They do not prove
the live schema, actual role assignments, browser E2E flows, or deployment.
