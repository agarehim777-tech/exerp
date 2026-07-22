-- Backfill active_tenant_id for provisioned admins who were created before the fix
UPDATE public.profiles p
SET active_tenant_id = tm.tenant_id, updated_at = now()
FROM public.tenant_members tm
WHERE tm.user_id = p.id
  AND p.active_tenant_id IS NULL
  AND tm.role IN ('owner','admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm2
    WHERE tm2.user_id = p.id AND tm2.tenant_id <> tm.tenant_id
  );