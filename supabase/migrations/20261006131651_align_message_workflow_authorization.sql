-- Only existing message thread record types use the messages permission boundary.
-- Other communications types retain their original (unconfigured) permission.
ALTER POLICY workflow_records_tenant_write ON public.workflow_records
  USING (private.has_module_access(tenant_id,
    CASE WHEN module='communications' AND record_type IN('direct_thread','group_thread')
      THEN 'messages' ELSE module END,'edit'))
  WITH CHECK (private.has_module_access(tenant_id,
    CASE WHEN module='communications' AND record_type IN('direct_thread','group_thread')
      THEN 'messages' ELSE module END,'edit'));

ALTER POLICY workflow_lines_tenant_write ON public.workflow_lines
  USING (EXISTS(SELECT 1 FROM public.workflow_records r
    WHERE r.id=workflow_lines.workflow_id AND r.tenant_id=workflow_lines.tenant_id
      AND private.has_module_access(r.tenant_id,
        CASE WHEN r.module='communications' AND r.record_type IN('direct_thread','group_thread')
          THEN 'messages' ELSE r.module END,'edit')))
  WITH CHECK (EXISTS(SELECT 1 FROM public.workflow_records r
    WHERE r.id=workflow_lines.workflow_id AND r.tenant_id=workflow_lines.tenant_id
      AND private.has_module_access(r.tenant_id,
        CASE WHEN r.module='communications' AND r.record_type IN('direct_thread','group_thread')
          THEN 'messages' ELSE r.module END,'edit')));

ALTER POLICY workflow_approvals_tenant_write ON public.workflow_approvals
  USING (EXISTS(SELECT 1 FROM public.workflow_records r
    WHERE r.id=workflow_approvals.workflow_id AND r.tenant_id=workflow_approvals.tenant_id
      AND private.has_module_access(r.tenant_id,
        CASE WHEN r.module='communications' AND r.record_type IN('direct_thread','group_thread')
          THEN 'messages' ELSE r.module END,'edit')))
  WITH CHECK (EXISTS(SELECT 1 FROM public.workflow_records r
    WHERE r.id=workflow_approvals.workflow_id AND r.tenant_id=workflow_approvals.tenant_id
      AND private.has_module_access(r.tenant_id,
        CASE WHEN r.module='communications' AND r.record_type IN('direct_thread','group_thread')
          THEN 'messages' ELSE r.module END,'edit')));
