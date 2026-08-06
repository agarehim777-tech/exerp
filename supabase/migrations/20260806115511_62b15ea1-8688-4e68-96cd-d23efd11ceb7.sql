-- 1) tenant_invites: hide the secret token column from clients
REVOKE SELECT ON public.tenant_invites FROM authenticated;
REVOKE SELECT ON public.tenant_invites FROM anon;
GRANT SELECT (id, tenant_id, email, role, invited_by, expires_at, accepted_at, created_at)
  ON public.tenant_invites TO authenticated;
REVOKE UPDATE ON public.tenant_invites FROM authenticated;
GRANT UPDATE (email, role, expires_at) ON public.tenant_invites TO authenticated;
GRANT ALL ON public.tenant_invites TO service_role;

-- 2) goods_receipts / lines: explicit, tenant-scoped SELECT policies
DROP POLICY IF EXISTS grn_tenant_select ON public.goods_receipts;
CREATE POLICY grn_tenant_select ON public.goods_receipts
  FOR SELECT TO authenticated
  USING (private.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS grnl_tenant_select ON public.goods_receipt_lines;
CREATE POLICY grnl_tenant_select ON public.goods_receipt_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_lines.grn_id
      AND private.is_tenant_member(g.tenant_id, auth.uid())
  ));

-- 3) Revoke client EXECUTE on internal-only SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.customer_360_snapshot(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_exchange_rate(uuid, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_tenant_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_360_snapshot(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_exchange_rate(uuid, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_tenant_usage() TO service_role;