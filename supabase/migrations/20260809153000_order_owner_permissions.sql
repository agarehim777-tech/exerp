-- Sales order ownership: sellers can see all tenant orders, but only the creator
-- and tenant/platform administrators may edit or delete them.
ALTER TABLE public.orders ALTER COLUMN created_by SET DEFAULT auth.uid();

UPDATE public.orders o
SET created_by = COALESCE(
  (SELECT ae.actor_id FROM public.audit_events ae
   WHERE ae.tenant_id = o.tenant_id AND ae.payload->>'order_id' = o.id::text
   ORDER BY ae.created_at ASC LIMIT 1),
  (SELECT tm.user_id FROM public.tenant_members tm
   WHERE tm.tenant_id = o.tenant_id AND tm.role IN ('owner','admin')
   ORDER BY CASE tm.role WHEN 'owner' THEN 0 ELSE 1 END, tm.created_at ASC LIMIT 1)
)
WHERE o.created_by IS NULL;

DROP POLICY IF EXISTS "orders_member_all" ON public.orders;
DROP POLICY IF EXISTS "orders_member_select" ON public.orders;
DROP POLICY IF EXISTS "orders_creator_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_admin_update" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_admin_delete" ON public.orders;

CREATE POLICY "orders_member_select" ON public.orders FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "orders_creator_insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "orders_owner_admin_update" ON public.orders FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR private.is_tenant_admin(tenant_id, auth.uid()) OR private.is_platform_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR private.is_tenant_admin(tenant_id, auth.uid()) OR private.is_platform_admin(auth.uid()));
CREATE POLICY "orders_owner_admin_delete" ON public.orders FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR private.is_tenant_admin(tenant_id, auth.uid()) OR private.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "order_items_member_all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_member_select" ON public.order_items;
DROP POLICY IF EXISTS "order_items_owner_admin_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_owner_admin_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_owner_admin_delete" ON public.order_items;

CREATE POLICY "order_items_member_select" ON public.order_items FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "order_items_owner_admin_insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.tenant_id = tenant_id
    AND (o.created_by = auth.uid() OR private.is_tenant_admin(o.tenant_id, auth.uid()) OR private.is_platform_admin(auth.uid()))));
CREATE POLICY "order_items_owner_admin_update" ON public.order_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.created_by = auth.uid() OR private.is_tenant_admin(o.tenant_id, auth.uid()) OR private.is_platform_admin(auth.uid()))));
CREATE POLICY "order_items_owner_admin_delete" ON public.order_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
    AND (o.created_by = auth.uid() OR private.is_tenant_admin(o.tenant_id, auth.uid()) OR private.is_platform_admin(auth.uid()))));

CREATE OR REPLACE FUNCTION public.mark_sales_order_delivered(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE _tenant uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.orders WHERE id = _order_id;
  IF _tenant IS NULL OR NOT private.has_module_access(_tenant, 'delivery', 'edit') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;
  UPDATE public.orders SET status = 'delivered', updated_at = now() WHERE id = _order_id AND tenant_id = _tenant;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_sales_order_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sales_order_delivered(uuid) TO authenticated, service_role;
