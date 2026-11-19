# Readiness review - 2026-11-14

Base: `79bdf55` on `origin/main`. This is an incremental review, not a completed security audit or production acceptance certificate.

## Implemented

- Credit report exports preserve an authoritative zero balance rather than substituting the original principal. Invalid numeric balances fail the export instead of silently emitting an incorrect value. The boundary is typed and covered by tests.
- Queued report exports are invalidated when tenant, period, warehouse, module, or snapshot date changes. PDF downloads use the same invalidation guard. Failed initial loads and revoked export permission clear the pending request so it cannot run unexpectedly after recovery.
- Report totals, series and module RPCs hide stale results synchronously when their scope changes, reject responses from a previous tenant visit, and catch rejected network promises. Regression tests cover the first render and A -> B -> A transitions.
- Admin provisioning searches every auth-user page, rejects failed/incomplete pagination, and never interprets an API error as account absence.
- Provisioning preserves existing profiles and active tenants, checks profile write errors, and rejects non-POST requests. Existing-account passwords are not reset.
- Payroll arithmetic now lives in the typed `payroll2026.ts` module, with the existing JSX export preserved for compatibility. Tests pin existing thresholds, rounding, deductions and employer cost. Invalid/non-finite input fails explicitly. These tests preserve application behavior, not legal/tax certification.

## Verification update - 2026-11-17

- Final complete unit suite passed 730/730 on the current local changes (`test-results/readiness-nov17-final.json`); this is not a live E2E/deploy result.
- The November 14 complete suite passed 722/722 before payroll extraction.
- After payroll extraction, the six focused HR/report/admin-lookup test files passed 32/32 and TypeScript checking passed.
- Production build passed after payroll extraction. The local build had no production Supabase environment configured; compilation success is not a live smoke test.
- The first HR UI test attempt lacked the test Supabase URL; rerunning with local test-only parameters passed. No production credentials were used.
- The HR SQL migration has NOT been created/applied. CLI 3.1.0 failed while creating its local `.supabase` configuration directory, including after a scoped filesystem permission request. Do not mark the server aggregation item complete.

## Production advisor inventory (read-only)

Project: `tcqdhwtnjrwpfdxoijmv`. No production payments, users, privileges or schema were changed during this review.

| Advisor | Findings | Interpretation / next verification |
| --- | ---: | --- |
| authenticated_security_definer_function_executable | 96 | Invocation privilege is not proof of authorization. Audit each function's caller role, target tenant, referenced-object tenant, search path and grants. Do not revoke all 96: business RPCs and RLS helpers rely on them. |
| anon_security_definer_function_executable | 1 | `enforce_cancelled_order_module_links()` returns `trigger`. Direct invocation of a trigger function is not an ordinary RPC attack path. Its public execute grant should nevertheless be reviewed and removed through a tested migration if unnecessary. No exploit is established by this warning alone. |
| rls_enabled_no_policy | 2 | Private tables `legacy_snapshot_archive` and `webhook_signing_keys`. Policy absence denies normal RLS access; do not add permissive policies merely to silence the advisor. Verify owner/service access and schema exposure. |
| auth_leaked_password_protection | 1 | Leaked-password protection is not enabled. Review the project's Auth settings and enable the protection when available; this code patch does not change Auth configuration. |

Advisor references:
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Remaining acceptance gates

- Independently validate all 96 function authorization paths and two-tenant/readonly denials; the inventory above is not that validation.
- Admin provisioning still spans Auth and database writes, not one transaction. Test invalid tenant, invalid role, partial failure, retry, user quota, concurrent account creation and membership changes using a disposable tenant before deployment.
- Run real-browser CSV/PDF export checks with production-shaped data and confirm row totals match selected filters. Unit coverage does not constitute live acceptance.
- Run the latest KPI payout and credit schedule end-to-end tests in the disposable database; unit and PGlite tests are supporting evidence only.
- Move HR aggregation to a tenant-authorized report RPC and verify pagination, inactive employees, null salaries and period semantics before replacing the existing calculation.
- Incrementally type monetary and RPC boundaries; do not use file-count coverage as a substitute for runtime validation.
- Split application orchestration by responsibility and standardize remaining buttons/inputs without mixing broad presentation refactors with financial behavior changes.
- Telegram delivery remains explicitly deferred. Do not represent unsent messages as delivered.

## Release

The provisioning changes require an Edge Function deployment, not only a Pages deploy. Run all mandatory gates on the exact published commit before deployment. Preserve the existing migration history; do not manually mark migrations applied to bypass a failing gate.

## Upstream integration - 2026-11-17

Integrated onto `99f8cc4`. Upstream already moved payroll into `hrDomain.ts`, so the standalone `payroll2026.ts` extraction was dropped and finite-input validation and threshold tests now target that existing typed module. The legacy HR bridge remains unchanged. Earlier test counts above describe the pre-integration tree, not the final release gate.
