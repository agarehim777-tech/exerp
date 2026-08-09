-- Xərc yaradılması və ödənilməsi ayrı mərhələlərdir.
ALTER TABLE public.expenses ALTER COLUMN status SET DEFAULT 'pending';

-- Əvvəl avtomatik “approved” yaranmış, lakin kassadan çıxılmamış xərcləri
-- audit təsdiq növbəsinə qaytar.
UPDATE public.expenses e
SET status = 'pending'
WHERE e.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.cash_transactions ct
    WHERE ct.tenant_id = e.tenant_id
      AND ct.reference = 'EXPENSE:' || e.id::text
      AND ct.direction = 'out'
  );
