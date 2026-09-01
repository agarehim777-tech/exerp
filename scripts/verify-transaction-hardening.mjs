import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationPath = "supabase/migrations/20260812090000_transaction_security_hardening.sql";
const migration = await readFile(resolve(root, migrationPath), "utf8");
const reversalMigrationPath = "supabase/migrations/20260901153000_complete_sales_reversal_lifecycle.sql";
const reversalMigration = await readFile(resolve(root, reversalMigrationPath), "utf8");
const service = await readFile(resolve(root, "src/services/coreOperations.js"), "utf8");
const failures = [];

const requiredMigrationSignals = [
  "CREATE TABLE IF NOT EXISTS public.operation_requests",
  "UNIQUE (tenant_id, request_key)",
  "CREATE OR REPLACE FUNCTION public.create_sales_order_atomic",
  "idempotency_key_payload_mismatch",
  "FOR UPDATE",
  "private.enforce_same_tenant_reference",
  "cross_tenant_reference_denied",
  "private.enforce_finance_period_lock",
  "accounting_period_locked",
  "CREATE OR REPLACE FUNCTION public.reopen_accounting_period",
  "period_reopen",
  "REVOKE DELETE ON public.%I FROM authenticated",
  "credit_installments_due_idx",
];

for (const signal of requiredMigrationSignals) {
  if (!migration.includes(signal)) failures.push(`${migrationPath}: missing ${signal}`);
}

const requiredReversalSignals = [
  "CREATE OR REPLACE FUNCTION public.reverse_sales_order",
  "payment.reversed_at",
  "public.credit_installments",
  "public.stock_reservations",
  "public.stock_balances",
  "public.sales_bonus_entries",
  "public.cash_transactions",
  "reversal_of",
  "paid_amount = 0",
  "payment_status = 'unpaid'",
  "status = 'cancelled'",
];

for (const signal of requiredReversalSignals) {
  if (!reversalMigration.includes(signal)) failures.push(`${reversalMigrationPath}: missing ${signal}`);
}

for (const signal of ["createSalesOrderAtomic", "createIdempotencyKey", "lockAccountingPeriod", "listAccountingPeriodLocks", "reopenAccountingPeriod"]) {
  if (!service.includes(signal)) failures.push(`src/services/coreOperations.js: missing ${signal}`);
}

if (migration.split(/\r?\n/).some((line) =>
  /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*operation_requests.*authenticated/i.test(line)
)) {
  failures.push(`${migrationPath}: operation_requests must not be directly mutable by authenticated clients`);
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, checks: requiredMigrationSignals.length + requiredReversalSignals.length + 4 }, null, 2));
}
