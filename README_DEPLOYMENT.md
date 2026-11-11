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
2. Run `Migrate Production Database` manually, type `MIGRATE`, and approve the
   protected `production` environment. Frontend deploys never mutate the database.
3. The workflow lints and applies every migration in `supabase/migrations` in timestamp order.
4. Deploy required functions from `supabase/functions`.
5. Run `platform_health_check()` and verify all expected RLS helpers exist.
6. Create the first tenant and owner through the authenticated bootstrap flow.
7. Never create production users with a password stored in source code.

## Backup and recovery

- `.github/workflows/backup-supabase.yml` creates role, schema and data dumps
  every day at 01:17 UTC, records SHA-256 checksums and retains the compressed
  GitHub artifact for 90 days.
- Configure `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`,
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SENTRY_DSN`,
  `E2E_TEST_USER`, `E2E_TEST_PASS` and the browser E2E session values in the
  protected GitHub `production` environment. GitHub encrypts secrets and
  workflow artifacts at rest.
- Configure `RESTORE_DATABASE_URL` only in the protected `disaster-recovery`
  environment. It points to the backup project `cvjctwgdyzhijhzhhjqd`, which
  holds a copy of production restored from the nightly backup, and must never
  contain the production project reference (`tcqdhwtnjrwpfdxoijmv`).
- CI does not connect to any Supabase project. The backup project is not a test
  database: no workflow other than the manual restore drill writes to it.
- Run `Supabase restore drill` at least monthly, enter `RESTORE`, and retain the
  successful workflow result as recovery evidence.
- Target **RPO: 24 hours** for scheduled logical backup and **RTO: 4 hours** for
  a verified restore. Enable Supabase PITR to reduce production RPO further.
- Take a verified backup before destructive migrations.
- A production restore requires approval by the platform owner and finance/data
  owner. The drill workflow restores only into the backup project.

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
# Backup və bərpa hədəfləri

- **RPO:** maksimum 24 saat. Supabase backup hər gecə işləyir və 90 gün saxlanılır.
- **RTO:** 2 saat. Son uğurlu artifact ehtiyat Supabase layihəsinə (`cvjctwgdyzhijhzhhjqd`) bərpa edilir.
- Ehtiyat layihə sınaq bazası deyil: CI heç bir Supabase layihəsinə qoşulmur, ehtiyat layihəyə yalnız `Supabase Restore Drill` yazır.
- Bərpa yalnız boş ehtiyat bazaya aparılır (workflow bunu yoxlayır). Hər bərpadan əvvəl **yalnız ehtiyat layihənin** SQL Editor-unda: `DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres, service_role; DELETE FROM auth.users;` (istifadəçilər production backup-ından bərpa olunur).
- Ayda ən azı bir dəfə `Supabase Restore Drill` workflow-u `RESTORE` təsdiqi ilə işlədilməlidir.
- Production backup GitHub runner-larında IPv4 uyğun Supabase session pooler üzərindən `SUPABASE_DB_PASSWORD` ilə işləyir. `SUPABASE_DB_URL` yalnız production hədəfini restore zamanı ayırd etmək, `RESTORE_DATABASE_URL` isə yalnız ehtiyat layihə üçün istifadə olunur.
- Deploy lifecycle gate üçün `E2E_TEST_USER` və `E2E_TEST_PASS` ayrıca, demo datası olan test tenantına aid olmalıdır; production administrator hesabı istifadə edilməməlidir.
