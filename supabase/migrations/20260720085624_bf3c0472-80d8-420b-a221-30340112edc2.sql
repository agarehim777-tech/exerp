
DROP POLICY IF EXISTS "projects_owner_all" ON public.projects;
CREATE POLICY "projects_owner_all" ON public.projects
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "quotes_tenant" ON public.quotes;
CREATE POLICY "quotes_tenant" ON public.quotes
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "quote_items_tenant" ON public.quote_items;
CREATE POLICY "quote_items_tenant" ON public.quote_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND public.is_tenant_member(q.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND public.is_tenant_member(q.tenant_id, auth.uid())));

DROP POLICY IF EXISTS "shipments_tenant" ON public.sales_shipments;
CREATE POLICY "shipments_tenant" ON public.sales_shipments
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "shipment_items_tenant" ON public.sales_shipment_items;
CREATE POLICY "shipment_items_tenant" ON public.sales_shipment_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales_shipments s WHERE s.id = sales_shipment_items.shipment_id AND public.is_tenant_member(s.tenant_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales_shipments s WHERE s.id = sales_shipment_items.shipment_id AND public.is_tenant_member(s.tenant_id, auth.uid())));

DROP POLICY IF EXISTS "Authenticated can read permissions" ON public.role_permissions;
CREATE POLICY "role_perms_scoped_read" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND (tm.role IN ('owner','admin') OR tm.role = role_permissions.role)
    )
  );

DROP POLICY IF EXISTS "invites_invitee_read" ON public.tenant_invites;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_customer_activity() FROM authenticated;

DO $$
DECLARE
  signature text;
  signatures text[] := ARRAY[
    'public.accept_tenant_invite(text)',
    'public.create_tenant(text,text)',
    'public.seed_default_coa(uuid)',
    'public.seed_default_crm_pipeline(uuid)',
    'public.sales_dashboard(uuid,date,date)',
    'public.customer_360(uuid)',
    'public.apply_invoice_match(uuid,numeric,numeric)',
    'public.evaluate_invoice_match(uuid,numeric,numeric)',
    'public.convert_quote_to_order(uuid)',
    'public.trial_balance(uuid,date,date)',
    'public.crm_pipeline_summary(uuid)',
    'public.generate_doc_number(uuid,text,text,text)',
    'public.is_tenant_member(uuid,uuid)',
    'public.is_tenant_admin(uuid,uuid)',
    'public.has_tenant_role(uuid,uuid,app_role)',
    'public.has_module_access(uuid,text,text)',
    'public.current_tenant_id()'
  ];
BEGIN
  FOREACH signature IN ARRAY signatures
  LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', to_regprocedure(signature));
    END IF;
  END LOOP;
END $$;
