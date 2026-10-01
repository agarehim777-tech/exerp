import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const [backup, restore, deployment, guard] = await Promise.all([
  read(".github/workflows/backup-supabase.yml"),
  read(".github/workflows/restore-drill.yml"),
  read("README_DEPLOYMENT.md"),
  read("scripts/restore-target-guard.mjs"),
]);

const checks = [
  [backup, "schedule:"],
  [backup, "--role-only"],
  [backup, "--data-only"],
  [backup, "postgresql-client-17"],
  [backup, "SHA256SUMS"],
  [guard, "confirmation == 'RESTORE'"],
  [restore, "RESTORE_DATABASE_URL"],
  [guard, "Refuse production as restore target"],
  [guard, "cvjctwgdyzhijhzhhjqd"],
  [guard, "tcqdhwtnjrwpfdxoijmv"],
  [guard, "Unexpected restore target"],
  [restore, "Wait for disposable database"],
  [restore, "attempt $attempt/15"],
  [restore, "--single-transaction"],
  [restore, "--exit-on-error"],
  [backup, "backup/application.dump"],
  [restore, "postgresql-client-17"],
  [restore, "RESTORE_OK"],
  [deployment, "RPO"],
  [deployment, "RTO"],
];

const failures = checks.filter(([content, token]) => !content.includes(token)).map(([, token]) => token);
if (restore.includes('drop schema') || restore.includes('schedule:')) failures.push('unsafe automated destructive restore');
const retentionDays = Number(backup.match(/retention-days:\s*(\d+)/)?.[1] ?? 0);
if (retentionDays < 30) failures.push("backup retention of at least 30 days");
if (failures.length) {
  console.error(JSON.stringify({ ok: false, missing: failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: checks.length }, null, 2));
}


