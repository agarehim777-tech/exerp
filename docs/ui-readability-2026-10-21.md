# UI readability and navigation changes

## Implemented

- Shared data-table implementation with explicit numeric columns, empty headers,
  keyboard row activation, scroll regions and mobile column priorities.
- Sales and credit record URLs support refresh, new tabs and browser history.
  Sales deep links outside the loaded registry page use the tenant-scoped reader.
- HR and cashbook tab state, sales filters and credit filters persist in the URL.
  Tenant changes clear record and filter parameters.
- Cashbook tables use shared rendering and account-currency formatting.
- Credit portfolio totals now use actual collected deposits, matching row balances.
- Shared font floor is 11px. Primary table text is 13px; supporting credit text is
  12px. Controls use 38px desktop / 44px mobile sizing.
- Operational panel radii are 8px. Dashboard density remains separate.
- Legacy CSS was split into ordered module files, preserving its cascade.
  Exact unconditional panel, metric-card and primary-button base rules were merged.
  Responsive widths are 640, 900, 1180 and 1440px.
- Audit navigation selectors were updated for links and semantic tabs.

## Verification

- `npm test -- --reporter=dot`: 124 files, 518 tests passed.
- `npm run build`: passed.
- `node scripts/ui-layout-audit.mjs`: 42 checks passed across six screens at
  1440, 1180, 900, 768, 640, 390 and 360px. No page overflow or visible text below
  11px was detected in these fixtures. Sales record opening/closing also passed.
- `node node_modules/@playwright/test/cli.js test --config tests/layout.playwright.config.ts`:
  four desktop/mobile HR-structure and sales-reversal layout tests passed.

Visual fixtures use actual components with synthetic data and blocked network
requests. They are not authenticated staging/production business-flow tests.
Screenshots and measurements are in `test-results/ui-layout/`.

## Publication status

On 2026-10-22, the UI changes were isolated in a clean checkout of main
(`57c175a7ecdb4140bc5863aedfb72dd8c1c90f26`). Only the UI files and their tests
are included in this release. No migrations or secrets are changed.
The GitHub CI workflow must pass for the published commit before the existing
GitHub Pages workflow can deploy it. Workflow results are the release authority;
the local checks below do not establish production deployment success.

The local preview startup was attempted, but HTTP responses could not be verified
in this environment. Do not treat a printed server URL as a successful smoke test.
Authenticated business-flow tests run in CI against staging. The external
notification provider remains deferred as previously agreed; the other 20 flows
remain mandatory. Warehouse action buttons and HR tabs retain distinct audit
selectors after the shared navigation update.
