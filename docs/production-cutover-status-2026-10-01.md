# Production Cutover Status

Production project: `tcqdhwtnjrwpfdxoijmv`. Staging: `cvjctwgdyzhijhzhhjqd`.

## Verified

- Production initially had 74 migration history entries, latest `20260909121437`, and five orders.
- Production lacks `create_sales_order_complete`, `reverse_sales_order_v3`, and `process_sales_order_status`.
- Migration `20261001060540` preserved complete legacy snapshot rows in `private.legacy_snapshot_archive` without changing their source.
- Production has two source snapshots and two exact archive copies; staging has one source snapshot and one exact archive copy. Missing archive copies: zero.
- `authenticated` cannot SELECT the archive. RLS is enabled.
- The archive is an in-database preservation copy, not an independent disaster-recovery backup.
- The preservation regression test passed, including repeated migration and changed snapshot versions.

## Release Blockers

- CI run `36822784618` passed release gates but only 27 of 28 browser tests. The insights page heading was absent after a five-second wait. Its cause still needs diagnosis; tenant denial and anonymous denial tests passed.
- Concurrent lifecycle tests were skipped because the preceding browser step failed. They are not verified.
- The 21 legacy business scenarios still require migration to Supabase-backed assertions. The runner now fails closed and preserves evidence; this does not establish business-flow coverage.
- Production schema/data reconciliation and canonical RPC migration remain pending. Do not replay all historical migrations blindly or mark unapplied history as applied.
- Production deployment has not occurred. Only the additive snapshot archive migration was applied in production.
