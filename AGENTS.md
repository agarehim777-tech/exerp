# Architecture rules

- Extract application orchestration into focused hooks and domain modules rather than relocating it into shared monoliths; this keeps changes independently testable.
- Stabilize refresh callbacks and scope asynchronous reads to their current tenant before publishing results; late responses must not restore another tenant's data.
- Retain one authoritative persistence writer per collection during incremental migration; dual writers can resurrect deleted records.
- Keep shared UI implementations in TypeScript and retain explicit-extension legacy re-export bridges only during migration; extensionless self-imports can resolve to the bridge itself.
- Keep delivery calculations in the warehouse domain module and shared business dates independent of appDomain; this avoids cyclic module initialization during extraction.
- Compose application screens from shared typed UI primitives and semantic layout classes; configurable badge colors belong in the shared badge rather than page-local style objects.
- Persist collection records through dedicated domain adapters with one writer; the retired generic collection table must never be a reload fallback.
- Keep typecheck in the release and CI gates; migration bridges must re-export explicit TypeScript extensions to avoid self-imports.
- Static presentation styles live as semantic classes in src/styles/static-styles.css; keep inline style only for runtime-computed values so theming stays centralized.
- Format fixed-decimal money only through services/format.js formatAmount and compute sellable stock only through shared/lib/stockMath.js; local copies drifted and showed different numbers.
- appDomain.jsx is a barrel over appDomain<Area>.jsx modules; add new domain logic to the area module, not the barrel, so areas stay independently editable.
- appHelpers.jsx is being split into typed modules one area per PR (notifications: notificationHelpers.ts, receivables: receivableHelpers.ts, messaging: messagingHelpers.ts, serials/stock rows: serialStockHelpers.ts, permissions: permissionHelpers.ts); it re-exports moved functions so old imports keep working. Add or change logic in the area module, never re-add a moved function to appHelpers.jsx.
- Tenant-wide reads must page with readAllRows, never .limit(N); PostgREST silently caps at 1000 rows.
- Report totals, trend, risk register and module analytics come from report_* database functions; full rows load only for a warehouse filter or an export, so client sums are just the fallback.
