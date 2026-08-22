DROP POLICY IF EXISTS crm_tags_write ON public.crm_tags;
CREATE POLICY crm_tags_admin_write ON public.crm_tags FOR ALL TO authenticated
USING (private.is_tenant_admin(tenant_id, auth.uid()))
WITH CHECK (private.is_tenant_admin(tenant_id, auth.uid()));

DROP POLICY IF EXISTS crm_customer_tags_write ON public.crm_customer_tags;
CREATE POLICY crm_customer_tags_insert ON public.crm_customer_tags FOR INSERT TO authenticated
WITH CHECK (
  private.is_tenant_member(tenant_id, auth.uid())
  AND EXISTS (SELECT 1 FROM public.crm_tags t WHERE t.id = crm_customer_tags.tag_id AND t.tenant_id = crm_customer_tags.tenant_id)
  AND EXISTS (SELECT 1 FROM public.customers c WHERE c.id = crm_customer_tags.customer_id AND c.tenant_id = crm_customer_tags.tenant_id)
);
CREATE POLICY crm_customer_tags_delete ON public.crm_customer_tags FOR DELETE TO authenticated
USING (private.is_tenant_member(tenant_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_grnl_grn_id ON public.goods_receipt_lines (grn_id);