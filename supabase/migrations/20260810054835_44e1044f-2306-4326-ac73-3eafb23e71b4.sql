CREATE OR REPLACE FUNCTION public.customer_360(_customer uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer AND public.is_tenant_member(c.tenant_id, auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT jsonb_build_object(
    'customer', to_jsonb(c.*),
    'open_deals', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM public.crm_deals d WHERE d.customer_id = _customer AND d.status = 'open'), '[]'::jsonb),
    'won_amount', COALESCE((SELECT SUM(amount) FROM public.crm_deals WHERE customer_id = _customer AND status = 'won'), 0),
    'activities', COALESCE((SELECT jsonb_agg(to_jsonb(a.*)) FROM (SELECT * FROM public.crm_activities WHERE customer_id = _customer ORDER BY occurred_at DESC LIMIT 20) a), '[]'::jsonb),
    'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(t.*)) FROM public.crm_tasks t WHERE t.customer_id = _customer AND NOT t.done), '[]'::jsonb),
    'orders_total', COALESCE((SELECT SUM(total) FROM public.orders WHERE customer_id = _customer), 0),
    'orders_count', COALESCE((SELECT COUNT(*) FROM public.orders WHERE customer_id = _customer), 0),
    'tags', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', tg.id, 'name', tg.name, 'color', tg.color)) FROM public.crm_customer_tags ct JOIN public.crm_tags tg ON tg.id = ct.tag_id WHERE ct.customer_id = _customer), '[]'::jsonb)
  ) INTO result FROM public.customers c WHERE c.id = _customer;
  RETURN result;
END $$;

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