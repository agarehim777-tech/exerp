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

- Enable daily Supabase database backups and point-in-time recovery where the
  selected plan supports it.
- Keep an encrypted offsite logical backup.
- Test restore into a separate project at least monthly.
- Take a verified backup before destructive migrations.
- Record RPO, RTO and the person authorized to approve a restore.

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
