ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS source text;
-- Missing module entries fail closed in the UI. Preserve any explicit denial.
INSERT INTO public.role_permissions(role,module,can_view,can_edit)
VALUES ('admin','insights',true,true),('owner','insights',true,true),
       ('admin','assistant',true,true),('owner','assistant',true,true)
ON CONFLICT (role,module) DO NOTHING;
NOTIFY pgrst, 'reload schema';
