import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migration = await readFile(
  resolve("supabase/migrations/20260730103000_tenant_rls_audit.sql"),
  "utf8",
);
const workflow = await readFile(resolve(".github/workflows/deploy-pages.yml"), "utf8");
const pwa = await readFile(resolve("src/lib/pwa.js"), "utf8");
const indexHtml = await readFile(resolve("index.html"), "utf8");

const requiredMigrationGuards = [
  "CREATE OR REPLACE FUNCTION public.audit_tenant_rls()",
  "SECURITY DEFINER",
  "auth.role() <> 'service_role'",
  "public.is_platform_admin(auth.uid())",
  "c.relrowsecurity",
  "REVOKE ALL ON FUNCTION public.audit_tenant_rls() FROM PUBLIC, anon",
];

const failures = [];
for (const guard of requiredMigrationGuards) {
  if (!migration.includes(guard)) failures.push(`RLS audit guard missing: ${guard}`);
}

if (!workflow.includes("npm run verify:security")) {
  failures.push("GitHub Pages workflow does not run the security verification gate");
}
if (!pwa.includes("github.io")) {
  failures.push("PWA registration is not disabled on GitHub Pages");
}
if (!indexHtml.includes("exerp-cache-reset-v1")) {
  failures.push("GitHub Pages bootstrap cache reset is missing");
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: requiredMigrationGuards.length + 3 }, null, 2));

