-- 1. goods_receipt_lines: explicit, defensive tenant scoping on reads and writes
DROP POLICY IF EXISTS grnl_tenant_all ON public.goods_receipt_lines;
DROP POLICY IF EXISTS grnl_tenant_select ON public.goods_receipt_lines;

CREATE POLICY grnl_tenant_select ON public.goods_receipt_lines
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_lines.grn_id
      AND private.is_tenant_member(g.tenant_id, auth.uid())
  )
);

CREATE POLICY grnl_tenant_insert ON public.goods_receipt_lines
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_lines.grn_id
      AND private.is_tenant_member(g.tenant_id, auth.uid())
  )
  AND (
    goods_receipt_lines.po_line_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.purchase_order_lines pol
      JOIN public.purchase_orders po ON po.id = pol.po_id
      JOIN public.goods_receipts g2 ON g2.id = goods_receipt_lines.grn_id
      WHERE pol.id = goods_receipt_lines.po_line_id
        AND po.tenant_id = g2.tenant_id
    )
  )
);

CREATE POLICY grnl_tenant_update ON public.goods_receipt_lines
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_lines.grn_id
      AND private.is_tenant_member(g.tenant_id, auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_lines.grn_id
      AND private.is_tenant_member(g.tenant_id, auth.uid())
  )
  AND (
    goods_receipt_lines.po_line_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.purchase_order_lines pol
      JOIN public.purchase_orders po ON po.id = pol.po_id
      JOIN public.goods_receipts g2 ON g2.id = goods_receipt_lines.grn_id
      WHERE pol.id = goods_receipt_lines.po_line_id
        AND po.tenant_id = g2.tenant_id
    )
  )
);

CREATE POLICY grnl_tenant_delete ON public.goods_receipt_lines
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goods_receipts g
    WHERE g.id = goods_receipt_lines.grn_id
      AND private.is_tenant_member(g.tenant_id, auth.uid())
  )
);

-- 2. order_items: replace redundant self-comparison with real tenant binding
DROP POLICY IF EXISTS order_items_owner_admin_insert ON public.order_items;
CREATE POLICY order_items_owner_admin_insert ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.tenant_id = order_items.tenant_id
      AND (
        o.created_by = auth.uid()
        OR private.is_tenant_admin(o.tenant_id, auth.uid())
        OR private.is_platform_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS order_items_owner_admin_update ON public.order_items;
CREATE POLICY order_items_owner_admin_update ON public.order_items
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.tenant_id = order_items.tenant_id
      AND (
        o.created_by = auth.uid()
        OR private.is_tenant_admin(o.tenant_id, auth.uid())
        OR private.is_platform_admin(auth.uid())
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.tenant_id = order_items.tenant_id
      AND (
        o.created_by = auth.uid()
        OR private.is_tenant_admin(o.tenant_id, auth.uid())
        OR private.is_platform_admin(auth.uid())
      )
  )
);

-- 3. role_permissions: read-only catalog, members see only their own role rows
DROP POLICY IF EXISTS role_perms_scoped_read ON public.role_permissions;
CREATE POLICY role_perms_scoped_read ON public.role_permissions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND (
        tm.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role])
        OR tm.role = role_permissions.role
      )
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM authenticated, anon;
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

COMMENT ON TABLE public.role_permissions IS 'Global (non tenant-scoped) role capability catalog. Read-only for authenticated users; managed by service_role/migrations only.';
COMMENT ON TABLE public.goods_receipt_lines IS 'Tenant scoping is derived from goods_receipts.tenant_id via join-based RLS on every command; there is intentionally no tenant_id column.';