import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const [backup, restore, deployment] = await Promise.all([
  read(".github/workflows/backup-supabase.yml"),
  read(".github/workflows/restore-drill.yml"),
  read("README_DEPLOYMENT.md"),
]);

const checks = [
  [backup, "schedule:"],
  [backup, "--role-only"],
  [backup, "--data-only"],
  [backup, "SHA256SUMS"],
  [backup, "retention-days: 30"],
  [restore, "confirmation == 'RESTORE'"],
  [restore, "RESTORE_DATABASE_URL"],
  [restore, "Refuse production as restore target"],
  [restore, "ON_ERROR_STOP=1"],
  [restore, "RESTORE_OK"],
  [deployment, "RPO"],
  [deployment, "RTO"],
];

const failures = checks.filter(([content, token]) => !content.includes(token)).map(([, token]) => token);
if (failures.length) {
  console.error(JSON.stringify({ ok: false, missing: failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: checks.length }, null, 2));
}

