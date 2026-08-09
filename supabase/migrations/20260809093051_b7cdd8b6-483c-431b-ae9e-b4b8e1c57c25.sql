-- Explicit tenant-scoped SELECT policies (defense in depth)
DROP POLICY IF EXISTS pol_tenant_select ON public.purchase_order_lines;
CREATE POLICY pol_tenant_select ON public.purchase_order_lines
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.purchase_orders po
  WHERE po.id = purchase_order_lines.po_id
    AND public.is_tenant_member(po.tenant_id, auth.uid())
));

DROP POLICY IF EXISTS quote_items_tenant_select ON public.quote_items;
CREATE POLICY quote_items_tenant_select ON public.quote_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.quotes q
  WHERE q.id = quote_items.quote_id
    AND public.is_tenant_member(q.tenant_id, auth.uid())
));

DROP POLICY IF EXISTS shipment_items_tenant_select ON public.sales_shipment_items;
CREATE POLICY shipment_items_tenant_select ON public.sales_shipment_items
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sales_shipments s
  WHERE s.id = sales_shipment_items.shipment_id
    AND public.is_tenant_member(s.tenant_id, auth.uid())
));

-- Ensure invite tokens remain unreadable by clients
REVOKE SELECT ON public.tenant_invites FROM authenticated, anon;
GRANT SELECT (id, tenant_id, email, role, invited_by, accepted_at, expires_at, created_at)
  ON public.tenant_invites TO authenticated;