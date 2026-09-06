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
  [backup, "postgresql-client-17"],
  [backup, "SHA256SUMS"],
  [restore, "confirmation == 'RESTORE'"],
  [restore, "RESTORE_DATABASE_URL"],
  [restore, "Refuse production as restore target"],
  [restore, "Refuse production project ref as restore target"],
  [restore, "Unexpected restore target"],
  [restore, "aws-0-ap-northeast-1.pooler.supabase.com"],
  [restore, "Wait for staging database"],
  [restore, "attempt $attempt/15"],
  [restore, "ON_ERROR_STOP=1"],
  [restore, "postgresql-client-17"],
  [restore, "RESTORE_OK"],
  [deployment, "RPO"],
  [deployment, "RTO"],
];

const failures = checks.filter(([content, token]) => !content.includes(token)).map(([, token]) => token);
const retentionDays = Number(backup.match(/retention-days:\s*(\d+)/)?.[1] ?? 0);
if (retentionDays < 30) failures.push("backup retention of at least 30 days");
if (failures.length) {
  console.error(JSON.stringify({ ok: false, missing: failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: checks.length }, null, 2));
}


