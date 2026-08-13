# ExERP production deployment

ExERP is a Vite/React frontend backed by Supabase Auth, PostgreSQL, RLS, Realtime
and Edge Functions. The browser receives only the public Supabase URL and
publishable key. Database passwords, service-role keys and provider credentials
must never use a `VITE_` prefix.

## Required environment

```text
VITE_SUPABASE_URL=https://PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SUPABASE_PROJECT_ID=PROJECT
VITE_SENTRY_DSN=https://...
VITE_RELEASE_VERSION=git-sha-or-release
```

## Release gate

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
npm.cmd run verify:deploy
npm.cmd run smoke:prod
```

The Playwright browser must be installed once on the release runner:

```powershell
npx playwright install chromium
```

## Supabase release

1. Create a production Supabase project separate from development.
2. Apply every migration in `supabase/migrations` in timestamp order.
3. Deploy required functions from `supabase/functions`.
4. Run `platform_health_check()` and verify all expected RLS helpers exist.
5. Create the first tenant and owner through the authenticated bootstrap flow.
6. Never create production users with a password stored in source code.

## Backup and recovery

- `.github/workflows/backup-supabase.yml` creates role, schema and data dumps
  every day at 02:17 UTC, records SHA-256 checksums and retains the compressed
  GitHub artifact for 30 days.
- Configure `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in the GitHub
  `production` environment. GitHub encrypts workflow artifacts at rest.
- Configure `RESTORE_DATABASE_URL` only in the protected `disaster-recovery`
  environment. It must point to a disposable Supabase project and must never
  contain the production project reference.
- Run `Supabase restore drill` at least monthly, enter `RESTORE`, and retain the
  successful workflow result as recovery evidence.
- Target **RPO: 24 hours** for scheduled logical backup and **RTO: 4 hours** for
  a verified restore. Enable Supabase PITR to reduce production RPO further.
- Take a verified backup before destructive migrations.
- A production restore requires approval by the platform owner and finance/data
  owner. The drill workflow restores only into the disposable recovery project.

## Hosting

GitHub Pages uses `.github/workflows/deploy-pages.yml`. Render uses
`render.yaml` as a static site. Both deployments must point to the same
production Supabase project to see the same tenant data.

For Docker deployment:

```powershell
docker build -t exerp-web:1.0.0 .
docker run --rm -p 8080:80 exerp-web:1.0.0
Invoke-WebRequest http://127.0.0.1:8080/healthz
```

Terminate TLS before the container. Update `connect-src` in the Nginx CSP to
include the exact Supabase and Sentry origins used by the production build.

## Monitoring and rollback

- Configure Sentry alerting and an external uptime check.
- Alert on Supabase database, authentication and Edge Function failures.
- Keep immutable frontend releases identified by Git SHA.
- Roll back the frontend to the previous artifact when needed.
- Never roll back a database migration without a tested reverse migration or
  forward-fix plan.
# Transaction and security hardening

Migration `20260812090000_transaction_security_hardening.sql` adds the production safety layer for critical operations:

- `create_sales_order_atomic` creates the order, stock reservations and optional credit contract in one database transaction;
- `operation_requests` supplies tenant-scoped idempotency and prevents duplicate submissions;
- cross-tenant references are rejected by database triggers;
- locked accounting periods reject later finance mutations;
- critical ledger rows are not directly deletable by authenticated clients;
- portfolio, due-date, cash, expense and stock lookups have production indexes.

Before deployment, run:

```bash
npm ci
npm test
npm run verify:security
npm run verify:hardening
npm run verify:recovery
npm run build
```

GitHub Actions additionally runs `supabase db lint --linked --level error`, a post-deploy page health check and the scheduled production monitor. Configure `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VITE_SUPABASE_PUBLISHABLE_KEY` and the disaster-recovery database secret in the corresponding protected GitHub environments.
