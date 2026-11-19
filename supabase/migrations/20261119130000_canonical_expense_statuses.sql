-- Rewrite legacy Azerbaijani expense status labels to the canonical codes (ports the data part of
-- drizzle/migrations/0001_expense_status_canonical.sql; its functions are superseded by 20261002052217).
--
-- In databases built from this repo the column already has CHECK (status IN ('draft','pending','approved','paid',
-- 'rejected','cancelled')) since 20260729130000, so this matches no rows there; the labelled rows the drizzle file
-- fixes were in Lovable's own database. It is kept as a safety net for a drifted database: there, labelled rows
-- would be rejected by accept_expense/cancel_expense and missed by the cashbook summary and report RPCs, which only
-- count canonical codes. The app itself writes canonical codes (useExpensesSync.appExpenseToRow).
--
-- Same mapping as the app (useExpensesSync AZ_TO_CODE) and the drizzle file. Only rows that still hold a label
-- are touched. Expenses tied to a paid KPI period are skipped: guard_paid_kpi_expense locks their status, and
-- the KPI payout command creates them with canonical codes anyway.

UPDATE public.expenses e
SET status = CASE e.status
  WHEN 'Təsdiq gözləyir' THEN 'pending'
  WHEN 'Təsdiq edildi' THEN 'approved'
  WHEN 'Qəbul edildi' THEN 'paid'
  WHEN 'Ləğv edildi' THEN 'cancelled'
  WHEN 'İmtina edildi' THEN 'rejected'
END
WHERE e.status IN ('Təsdiq gözləyir', 'Təsdiq edildi', 'Qəbul edildi', 'Ləğv edildi', 'İmtina edildi')
  AND NOT EXISTS (
    SELECT 1 FROM public.kpi_periods p
    WHERE p.tenant_id = e.tenant_id AND p.expense_id = e.id AND p.status = 'paid'
  );
