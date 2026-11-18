-- RLS performance: tenant membership checked once per query instead of once per row.
--
-- 94 policies called private.is_tenant_member(tenant_id, (select auth.uid())) or
-- private.is_tenant_admin(...). Both are SECURITY DEFINER functions, which the planner cannot inline,
-- so they ran once for every row a query looked at. Each call is replaced by
--   COALESCE((tenant_id IN (SELECT private.member_tenant_ids())), false)
-- The subquery does not depend on the row, so Postgres runs it once and probes a hashed set.
-- COALESCE keeps the old result for a NULL tenant_id (false, not NULL). Policy names, commands,
-- roles and every other condition (has_module_access, platform admin, storage folders) are unchanged.
-- Generated from the replayed schema; src/test/rls-member-tenant-sets-sql.test.js checks the result.

CREATE OR REPLACE FUNCTION private.member_tenant_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION private.admin_tenant_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND role IN ('owner','admin');
$$;

REVOKE ALL ON FUNCTION private.member_tenant_ids(), private.admin_tenant_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.member_tenant_ids(), private.admin_tenant_ids() TO authenticated, service_role;

ALTER POLICY accounting_period_locks_select ON public.accounting_period_locks
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY ai_insight_feedback_tenant_select ON public.ai_insight_feedback
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY ai_insight_feedback_tenant_write ON public.ai_insight_feedback
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND (created_by = ( SELECT auth.uid() AS uid))));

ALTER POLICY logs_select ON public.app_logs
  USING ((((tenant_id IS NULL) AND (user_id = ( SELECT auth.uid() AS uid))) OR ((tenant_id IS NOT NULL) AND COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))));

ALTER POLICY "Tenant members can append their audit events" ON public.audit_events
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND (actor_id = ( SELECT auth.uid() AS uid))));

ALTER POLICY "Tenant members can read audit events" ON public.audit_events
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY cash_accounts_tenant_select ON public.cash_accounts
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY cash_transactions_tenant_select ON public.cash_transactions
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY coa_admin_write ON public.chart_of_accounts
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY coa_member_read ON public.chart_of_accounts
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY credit_adjustments_tenant_select ON public.credit_adjustments
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY credit_collection_events_tenant ON public.credit_collection_events
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY credit_installments_tenant_select ON public.credit_installments
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY credit_payment_allocations_tenant_select ON public.credit_payment_allocations
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY credit_payments_tenant_select ON public.credit_payments
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY credit_restructures_tenant_select ON public.credit_restructures
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_activities_read ON public.crm_activities
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_activities_write ON public.crm_activities
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_customer_tags_delete ON public.crm_customer_tags
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_customer_tags_insert ON public.crm_customer_tags
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND (EXISTS ( SELECT 1
   FROM crm_tags t
  WHERE ((t.id = crm_customer_tags.tag_id) AND (t.tenant_id = crm_customer_tags.tenant_id)))) AND (EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = crm_customer_tags.customer_id) AND (c.tenant_id = crm_customer_tags.tenant_id))))));

ALTER POLICY crm_customer_tags_read ON public.crm_customer_tags
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_deals_read ON public.crm_deals
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_deals_write ON public.crm_deals
  USING ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR private.has_module_access(tenant_id, 'crm'::text, 'edit'::text))))
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR private.has_module_access(tenant_id, 'crm'::text, 'edit'::text))));

ALTER POLICY crm_pipelines_read ON public.crm_pipelines
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_pipelines_write ON public.crm_pipelines
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY crm_stages_read ON public.crm_stages
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_stages_write ON public.crm_stages
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY crm_tags_admin_write ON public.crm_tags
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY crm_tags_read ON public.crm_tags
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_tasks_read ON public.crm_tasks
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY crm_tasks_write ON public.crm_tasks
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY customers_member_all ON public.customers
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY deliveries_tenant_select ON public.deliveries
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY delivery_items_tenant_select ON public.delivery_items
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY employee_events_tenant_select ON public.employee_events
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY employees_tenant_admin_write ON public.employees
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY employees_tenant_member_read ON public.employees
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY entity_timeline_tenant_select ON public.entity_timeline
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY erp_reconciliation_reports_insert ON public.erp_reconciliation_reports
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY erp_reconciliation_reports_read ON public.erp_reconciliation_reports
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY expenses_tenant_select ON public.expenses
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY finance_budgets_tenant_select ON public.finance_budgets
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY finance_cost_centers_tenant_select ON public.finance_cost_centers
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY financial_reconciliations_tenant_select ON public.financial_reconciliations
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY grnl_tenant_delete ON public.goods_receipt_lines
  USING ((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND COALESCE((g.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY grnl_tenant_insert ON public.goods_receipt_lines
  WITH CHECK (((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND COALESCE((g.tenant_id IN ( SELECT private.member_tenant_ids())), false)))) AND ((po_line_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((purchase_order_lines pol
     JOIN purchase_orders po ON ((po.id = pol.po_id)))
     JOIN goods_receipts g2 ON ((g2.id = goods_receipt_lines.grn_id)))
  WHERE ((pol.id = goods_receipt_lines.po_line_id) AND (po.tenant_id = g2.tenant_id)))))));

ALTER POLICY grnl_tenant_select ON public.goods_receipt_lines
  USING ((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND COALESCE((g.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY grnl_tenant_update ON public.goods_receipt_lines
  USING ((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND COALESCE((g.tenant_id IN ( SELECT private.member_tenant_ids())), false)))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_lines.grn_id) AND COALESCE((g.tenant_id IN ( SELECT private.member_tenant_ids())), false)))) AND ((po_line_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((purchase_order_lines pol
     JOIN purchase_orders po ON ((po.id = pol.po_id)))
     JOIN goods_receipts g2 ON ((g2.id = goods_receipt_lines.grn_id)))
  WHERE ((pol.id = goods_receipt_lines.po_line_id) AND (po.tenant_id = g2.tenant_id)))))));

ALTER POLICY grn_tenant_all ON public.goods_receipts
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY grn_tenant_select ON public.goods_receipts
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY inventory_units_tenant_select ON public.inventory_units
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY je_admin_write ON public.journal_entries
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY je_member_read ON public.journal_entries
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY jl_admin_write ON public.journal_lines
  USING ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.entry_id) AND COALESCE((je.tenant_id IN ( SELECT private.admin_tenant_ids())), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.entry_id) AND COALESCE((je.tenant_id IN ( SELECT private.admin_tenant_ids())), false)))));

ALTER POLICY jl_member_read ON public.journal_lines
  USING ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.entry_id) AND COALESCE((je.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY notification_deliveries_tenant_select ON public.notification_deliveries
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY operation_requests_tenant_select ON public.operation_requests
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY order_items_owner_admin_delete ON public.order_items
  USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((o.tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid)))))));

ALTER POLICY order_items_owner_admin_insert ON public.order_items
  WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.tenant_id = order_items.tenant_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((o.tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid)))))));

ALTER POLICY order_items_owner_admin_update ON public.order_items
  USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.tenant_id = order_items.tenant_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((o.tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid)))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.tenant_id = order_items.tenant_id) AND ((o.created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((o.tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid)))))));

ALTER POLICY orders_owner_admin_delete ON public.orders
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid))));

ALTER POLICY orders_owner_admin_update ON public.orders
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid))))
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) OR COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid))));

ALTER POLICY products_member_all ON public.products
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY projects_tenant_admin_write ON public.projects
  USING ((COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR (user_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR (user_id = ( SELECT auth.uid() AS uid))));

ALTER POLICY projects_tenant_member_read ON public.projects
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY pol_tenant_all ON public.purchase_order_lines
  USING ((EXISTS ( SELECT 1
   FROM purchase_orders p
  WHERE ((p.id = purchase_order_lines.po_id) AND COALESCE((p.tenant_id IN ( SELECT private.member_tenant_ids())), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_orders p
  WHERE ((p.id = purchase_order_lines.po_id) AND COALESCE((p.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY po_tenant_all ON public.purchase_orders
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY quote_items_tenant ON public.quote_items
  USING ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_items.quote_id) AND COALESCE((q.tenant_id IN ( SELECT private.member_tenant_ids())), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_items.quote_id) AND COALESCE((q.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY quotes_tenant ON public.quotes
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY reconciliation_lines_tenant_select ON public.reconciliation_lines
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY shipment_items_tenant ON public.sales_shipment_items
  USING ((EXISTS ( SELECT 1
   FROM sales_shipments s
  WHERE ((s.id = sales_shipment_items.shipment_id) AND COALESCE((s.tenant_id IN ( SELECT private.member_tenant_ids())), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_shipments s
  WHERE ((s.id = sales_shipment_items.shipment_id) AND COALESCE((s.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY shipments_tenant ON public.sales_shipments
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY stock_balances_tenant_select ON public.stock_balances
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY stock_movements_tenant_select ON public.stock_movements
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY stock_reservations_tenant_select ON public.stock_reservations
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY invites_admin_all ON public.tenant_invites
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false));

ALTER POLICY invites_deny_non_admin ON public.tenant_invites
  USING ((COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid))));

ALTER POLICY tenant_limits_tenant_select ON public.tenant_limits
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY tm_delete_admin ON public.tenant_members
  USING ((COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) OR (user_id = ( SELECT auth.uid() AS uid))));

ALTER POLICY tm_insert_admin ON public.tenant_members
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) AND ((role <> 'owner'::app_role) OR private.has_tenant_role(tenant_id, ( SELECT auth.uid() AS uid), 'owner'::app_role) OR private.is_platform_admin(( SELECT auth.uid() AS uid)))));

ALTER POLICY tm_select_same_tenant ON public.tenant_members
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY tm_update_admin ON public.tenant_members
  USING (COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false))
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.admin_tenant_ids())), false) AND ((role <> 'owner'::app_role) OR private.has_tenant_role(tenant_id, ( SELECT auth.uid() AS uid), 'owner'::app_role) OR private.is_platform_admin(( SELECT auth.uid() AS uid)))));

ALTER POLICY tmod_read ON public.tenant_modules
  USING ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) OR private.is_platform_admin(( SELECT auth.uid() AS uid))));

ALTER POLICY "Tenant editors can create ERP snapshot" ON public.tenant_state_snapshots
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND private.has_module_access(tenant_id, 'settings'::text, 'edit'::text)));

ALTER POLICY "Tenant editors can update ERP snapshot" ON public.tenant_state_snapshots
  USING ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND private.has_module_access(tenant_id, 'settings'::text, 'edit'::text)))
  WITH CHECK ((COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false) AND private.has_module_access(tenant_id, 'settings'::text, 'edit'::text)));

ALTER POLICY "Tenant members can read ERP snapshot" ON public.tenant_state_snapshots
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY tenants_member_select ON public.tenants
  USING (COALESCE((id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY vil_tenant_all ON public.vendor_invoice_lines
  USING ((EXISTS ( SELECT 1
   FROM vendor_invoices v
  WHERE ((v.id = vendor_invoice_lines.invoice_id) AND COALESCE((v.tenant_id IN ( SELECT private.member_tenant_ids())), false)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM vendor_invoices v
  WHERE ((v.id = vendor_invoice_lines.invoice_id) AND COALESCE((v.tenant_id IN ( SELECT private.member_tenant_ids())), false)))));

ALTER POLICY vi_tenant_all ON public.vendor_invoices
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY vendors_tenant_all ON public.vendors
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false))
  WITH CHECK (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY warehouses_tenant_select ON public.warehouses
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY workflow_approvals_tenant_select ON public.workflow_approvals
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY workflow_lines_tenant_select ON public.workflow_lines
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));

ALTER POLICY workflow_records_tenant_select ON public.workflow_records
  USING (COALESCE((tenant_id IN ( SELECT private.member_tenant_ids())), false));
